/**
 * Invoice PDF rendering — extracted verbatim from InvoiceController to keep that
 * controller focused on HTTP/CRUD concerns. Behaviour is unchanged: the methods
 * below were moved as-is. InvoiceController instantiates this class and delegates
 * to it, so routes and external callers of generatePDFBuffer are unaffected.
 */

import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { ZugferdService } from '../../services/external/zugferd.service';
import { BillingValidationService } from '../../services/financial/billing-validation.service';
import { processPlaceholders, PlaceholderContext } from '../../utils/placeholder';

export class InvoicePdfController {
  private billingValidationService: BillingValidationService;

  constructor() {
    this.billingValidationService = new BillingValidationService();
  }

  /** Database pool for complex queries. */
  private get db() {
    return getDbClient();
  }

  /**
   * Generates and downloads a PDF for an invoice.
   * Creates a professional invoice PDF with company branding, line items, and payment details.
   * 
   * @async
   * @param {Request} req - Express request with params.id (invoice ID) and optional query.zugferd (boolean)
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends PDF file as download or 404/500 on error
   * 
   * @example
   * GET /api/invoices/:id/pdf?zugferd=true
   * Response: 200 (PDF file download)
   * Response: 404 { message: "Invoice not found" }
   */
  async generatePDF(req: Request, res: Response) {
    const { id } = req.params;
    const { zugferd } = req.query;
    const userId = (req as any).user?.id;

    try {
      // Locale for number/date formatting in the PDF. Driven by the user's
      // invoice_language setting; defaults to German to preserve existing behaviour.
      // Set after settings are fetched; the helpers below are closures invoked
      // later during PDF drawing, by which point pdfLocale is finalised.
      let pdfLocale = 'de-DE';
      let pdfLanguage = 'de';

      // Helper function to format currency using the configured locale
      const formatCurrency = (amount: number, currency: string = 'EUR'): string => {
        return new Intl.NumberFormat(pdfLocale, {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(amount);
      };

      // Helper function to format dates using the configured locale
      const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleDateString(pdfLocale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      };

      // Helper function to format month/year using the configured locale
      const formatMonthYear = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleDateString(pdfLocale, {
          month: '2-digit',
          year: 'numeric'
        });
      };

      // Fetch user settings for company information
      const settingsResult = await this.db.query(
        'SELECT * FROM settings WHERE user_id = $1',
        [userId]
      );
      const settings = settingsResult.rows[0] || {};

      // Resolve PDF locale from the user's invoice_language preference
      pdfLanguage = (settings.invoice_language || 'de').toString().toLowerCase();
      const localeMap: Record<string, string> = {
        de: 'de-DE',
        en: 'en-US',
        fr: 'fr-FR',
        es: 'es-ES',
        it: 'it-IT',
        nl: 'nl-NL',
      };
      pdfLocale = localeMap[pdfLanguage] || 'de-DE';

      // Fetch invoice with all details
      const queryText = `
        SELECT i.*, 
               c.name as client_name, c.email as client_email, c.phone as client_phone,
               c.address as client_address, c.city as client_city, c.postal_code as client_postal_code,
               c.use_separate_billing_address, c.billing_contact_person, c.billing_email, c.billing_phone,
               c.billing_address, c.billing_city, c.billing_state, c.billing_postal_code, c.billing_country,
               p.name as project_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN projects p ON i.project_id = p.id
        WHERE i.id = $1 AND i.user_id = $2
      `;
      
      const invoiceResult = await this.db.query(queryText, [id, userId]);
      
      if (invoiceResult.rows.length === 0) {
        res.status(404).json({ message: 'Invoice not found' });
        return;
      }

      const invoice = invoiceResult.rows[0];

      // Prepare placeholder context for template processing
      const placeholderContext: PlaceholderContext = {
        invoice_number: invoice.invoice_number,
        issue_date: new Date(invoice.issue_date),
        due_date: new Date(invoice.due_date),
        total: parseFloat(invoice.total_amount),
        currency: invoice.currency,
        client_name: invoice.client_name,
        client_email: invoice.client_email,
        client_phone: invoice.client_phone,
        project_name: invoice.project_name,
        language: pdfLanguage,
        referenceDate: new Date(invoice.issue_date),
      };

      // Fetch template contents with priority: invoice-assigned > default template > first available
      let headerText = null;
      let footerText = null;
      let termsText = null;
      let taxExemptionText = null;
      let bankDetailsText = null;
      let paymentTermsText = null;
      
      // Header template: invoice-assigned > default > first available
      if (invoice.header_template_id) {
        const headerResult = await this.db.query(
          'SELECT content FROM invoice_text_templates WHERE id = $1 AND user_id = $2',
          [invoice.header_template_id, userId]
        );
        if (headerResult.rows[0]) {
          headerText = processPlaceholders(headerResult.rows[0].content, placeholderContext);
        }
      }
      if (!headerText) {
        const defaultHeaderResult = await this.db.query(
          `SELECT content FROM invoice_text_templates 
           WHERE user_id = $1 AND category = 'header' AND is_active = true
           ORDER BY is_default DESC, created_at ASC
           LIMIT 1`,
          [userId]
        );
        if (defaultHeaderResult.rows[0]) {
          headerText = processPlaceholders(defaultHeaderResult.rows[0].content, placeholderContext);
        }
      }
      
      // Footer template: invoice-assigned > default > first available
      if (invoice.footer_template_id) {
        const footerResult = await this.db.query(
          'SELECT content FROM invoice_text_templates WHERE id = $1 AND user_id = $2',
          [invoice.footer_template_id, userId]
        );
        if (footerResult.rows[0]) {
          footerText = processPlaceholders(footerResult.rows[0].content, placeholderContext);
        }
      }
      if (!footerText) {
        const defaultFooterResult = await this.db.query(
          `SELECT content FROM invoice_text_templates 
           WHERE user_id = $1 AND category = 'footer' AND is_active = true
           ORDER BY is_default DESC, created_at ASC
           LIMIT 1`,
          [userId]
        );
        if (defaultFooterResult.rows[0]) {
          bankDetailsText = processPlaceholders(defaultFooterResult.rows[0].content, placeholderContext);
        }
      } else {
        // If invoice has footer template assigned, use it for bank details
        bankDetailsText = footerText;
      }
      
      // Terms template: invoice-assigned > default payment_terms > first available
      if (invoice.terms_template_id) {
        const termsResult = await this.db.query(
          'SELECT content FROM invoice_text_templates WHERE id = $1 AND user_id = $2',
          [invoice.terms_template_id, userId]
        );
        if (termsResult.rows[0]) {
          termsText = processPlaceholders(termsResult.rows[0].content, placeholderContext);
        }
      }
      if (!termsText) {
        const defaultTermsResult = await this.db.query(
          `SELECT content FROM invoice_text_templates 
           WHERE user_id = $1 AND category = 'payment_terms' AND is_active = true
           ORDER BY is_default DESC, created_at ASC
           LIMIT 1`,
          [userId]
        );
        if (defaultTermsResult.rows[0]) {
          paymentTermsText = processPlaceholders(defaultTermsResult.rows[0].content, placeholderContext);
        }
      }
      
      // Tax exemption: default > first available
      const taxExemptionResult = await this.db.query(
        `SELECT content FROM invoice_text_templates 
         WHERE user_id = $1 AND category = 'tax_exemption' AND is_active = true
         ORDER BY is_default DESC, created_at ASC
         LIMIT 1`,
        [userId]
      );
      if (taxExemptionResult.rows[0]) {
        taxExemptionText = processPlaceholders(taxExemptionResult.rows[0].content, placeholderContext);
      }

    // Fetch line items - group by project/description for cleaner invoices
    const itemsQuery = `
      SELECT 
        COALESCE(p.name, ii.description) as description,
        SUM(ii.quantity) as quantity,
        ii.unit_price,
        SUM(ii.quantity * ii.unit_price) as line_total,
        COALESCE(ii.rate_type, 'hourly') as rate_type
      FROM invoice_items ii
      LEFT JOIN time_entries te ON ii.time_entry_id = te.id
      LEFT JOIN projects p ON te.project_id = p.id
      WHERE ii.invoice_id = $1
      GROUP BY COALESCE(p.name, ii.description), ii.unit_price, ii.rate_type
      ORDER BY MIN(ii.created_at)
    `;      const itemsResult = await this.db.query(itemsQuery, [id]);
      const lineItems = itemsResult.rows;

      // Fetch payments
      const paymentsQuery = `
        SELECT amount, payment_method, payment_date, transaction_id
        FROM payments
        WHERE invoice_id = $1
        ORDER BY payment_date
      `;
      
      const paymentsResult = await this.db.query(paymentsQuery, [id]);
      const payments = paymentsResult.rows;

      // Create PDF document with A4 size
      const doc = new PDFDocument({ 
        margin: 50, 
        size: 'A4',
        bufferPages: true
      });

      // Define footer function to be drawn on every page
      const drawFooter = () => {
        const pageHeight = doc.page.height;
        const footerY = pageHeight - 80; // Increased from 60 to 80 to accommodate both footer lines
        
        doc.fontSize(7)
           .fillColor('#666666')
           .font('Helvetica');
        
        // Use bank details template if available, otherwise construct from settings
        if (bankDetailsText) {
          // Replace all newlines with " | " for single-line rendering
          const bankDetailsOneLine = bankDetailsText
            .replace(/\r?\n/g, ' | ')
            .replace(/\s+/g, ' ')
            .trim();
          
          try {
            doc.text(bankDetailsOneLine, 50, footerY, { 
              width: 495, 
              align: 'center',
              lineBreak: false
            });
          } catch (footerError: any) {
            logger.error('Footer text error, using fallback:', footerError);
            doc.text('Bank Details Available', 50, footerY, { width: 495, align: 'center', lineBreak: false });
          }
        } else if (settings.bank_iban) {
          // Compact footer with bank details
          const footerText = `${settings.company_name || 'Company'} | ${settings.bank_name ? `Bank: ${settings.bank_name} | ` : ''}IBAN: ${settings.bank_iban}${settings.bank_bic ? ` | BIC: ${settings.bank_bic}` : ''}`;
          try {
            doc.text(footerText, 50, footerY, { 
              width: 495, 
              align: 'center',
              lineBreak: false
            });
          } catch (footerError: any) {
            logger.error('Footer text error:', footerError);
          }
        }
        
        // Company address below
        if (settings.company_address) {
          const companyInfo = `${settings.company_name || 'Company'} | ${settings.company_address}`;
          try {
            doc.fontSize(6)
               .fillColor('#999999')
               .text(companyInfo, 50, footerY + 12, { 
                 width: 495, 
                 align: 'center',
                 lineBreak: false
               });
          } catch (addressError: any) {
            logger.error('Footer address error:', addressError);
          }
        }
      };

      // DON'T register pageAdded event - it can cause infinite page creation
      // We'll draw footer manually only at the end
      // doc.on('pageAdded', drawFooter);

      // Always buffer the PDF to prevent sending corrupted data on error
      const pdfBuffers: Buffer[] = [];
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- lazy require keeps stream setup local
      const bufferStream = new (require('stream').PassThrough)();
      bufferStream.on('data', (chunk: Buffer) => pdfBuffers.push(chunk));
      
      // Handle PDF document errors
      doc.on('error', (docError: any) => {
        logger.error('PDFDocument error:', docError);
        bufferStream.destroy(docError);
      });
      
      // Pipe PDF to buffer stream
      doc.pipe(bufferStream);

      // ==================== HEADER SECTION ====================
      // Right side - Company Info Header
      const safeCompanyName = (settings.company_name || 'Company Name').toString().substring(0, 100);
      doc.fontSize(16)
         .fillColor('#6B8EAF')
         .font('Helvetica-Bold')
         .text(safeCompanyName, 350, 50, { align: 'right', width: 195, lineBreak: false });
      
      if (settings.company_subline) {
        const safeSubline = settings.company_subline.toString().substring(0, 100);
        doc.fontSize(10)
           .fillColor('#666666')
           .font('Helvetica')
           .text(safeSubline, 350, 72, { align: 'right', width: 195, lineBreak: false });
      }

      // Contact details (right side)
      const contactY = settings.company_subline ? 100 : 80;
      doc.fontSize(8)
         .fillColor('#333333');
      
      if (settings.company_phone) {
        doc.text(`Tel.: ${settings.company_phone}`, 350, contactY, { align: 'right', width: 195, lineBreak: false });
      }
      if (settings.company_email) {
        doc.text(`E-Mail: ${settings.company_email}`, 350, contactY + 12, { align: 'right', width: 195, lineBreak: false });
      }
      if (settings.company_tax_id) {
        doc.text(`USt-IdNr.: ${settings.company_tax_id}`, 350, contactY + 24, { align: 'right', width: 195, lineBreak: false });
      }

      // Delivery/Invoice dates (right side)
      const datesY = contactY + 48;
      const deliveryDateDisplay = invoice.delivery_date || formatMonthYear(invoice.issue_date);
      doc.fontSize(8)
         .fillColor('#333333')
         .font('Helvetica-Bold')
         .text('Lieferdatum: ', 350, datesY, { continued: true })
         .font('Helvetica')
         .text(deliveryDateDisplay, { align: 'right', width: 195, lineBreak: false });
      
      doc.font('Helvetica-Bold')
         .text('Rechnungsdatum: ', 350, datesY + 12, { continued: true })
         .font('Helvetica')
         .text(formatDate(invoice.issue_date), { align: 'right', width: 195, lineBreak: false });
      
      doc.font('Helvetica-Bold')
         .text('Rechnungsnummer: ', 350, datesY + 24, { continued: true })
         .font('Helvetica')
         .text(invoice.invoice_number, { align: 'right', width: 195, lineBreak: false });

      // ==================== LEFT SIDE - SENDER & RECIPIENT ====================
      // Sender address (small, above recipient)
      const senderAddress = settings.company_address || 'Company Address';
      doc.fontSize(7)
         .fillColor('#999999')
         .font('Helvetica')
         .text(`${settings.company_name || 'Company'}, ${senderAddress}`, 50, 50);

      // Recipient address
      const recipientY = 75;
      
      // Use billing address if separate billing is enabled, otherwise use main address
      const useBilling = invoice.use_separate_billing_address;
      const recipientName = useBilling && invoice.billing_contact_person 
        ? invoice.billing_contact_person 
        : invoice.client_name || 'N/A';
      const recipientAddress = useBilling && invoice.billing_address 
        ? invoice.billing_address 
        : invoice.client_address;
      const recipientPostalCode = useBilling && invoice.billing_postal_code 
        ? invoice.billing_postal_code 
        : invoice.client_postal_code;
      const recipientCity = useBilling && invoice.billing_city 
        ? invoice.billing_city 
        : invoice.client_city;
      
      doc.fontSize(11)
         .fillColor('#000000')
         .font('Helvetica-Bold')
         .text(recipientName, 50, recipientY);
      
      let currentY = recipientY + 15;
      if (recipientAddress) {
        doc.fontSize(10)
           .font('Helvetica')
           .text(recipientAddress, 50, currentY);
        currentY += 12;
      }
      if (recipientPostalCode && recipientCity) {
        doc.text(`${recipientPostalCode} ${recipientCity}`, 50, currentY);
        currentY += 12;
      }
      // Email removed from recipient address - it was overlapping with billing address

      // ==================== INVOICE TITLE ====================
      const invoiceTitleY = 240;
      
      // Use invoice_headline if available, otherwise default to project name or "Leistungszeitraum"
      const invoiceTitle = invoice.invoice_headline 
        ? invoice.invoice_headline 
        : `Rechnung: ${invoice.project_name || 'Leistungszeitraum'}`;
      
      doc.fontSize(16)
         .fillColor('#6B8EAF')
         .font('Helvetica-Bold')
         .text(invoiceTitle, 50, invoiceTitleY);

      // ==================== INVOICE TEXT (GREETING) ====================
      let contentY = invoiceTitleY + 35;
      
      // Use header template if available, otherwise use invoice_text or default
      const greetingText = headerText || invoice.invoice_text;
      
      if (greetingText) {
        // Sanitize text to prevent infinite loop issues
        const sanitizedGreeting = greetingText.trim();
        doc.fontSize(10)
           .fillColor('#000000')
           .font('Helvetica')
           .text(sanitizedGreeting, 50, contentY, { 
             width: 495,
             align: 'left',
             lineGap: 4
           });
        // Use approximate height calculation instead of heightOfString
        const lineCount = sanitizedGreeting.split('\n').length;
        contentY += (lineCount * 14) + 20; // Approximate: 14px per line + 20px spacing
      } else {
        // Default greeting
        doc.fontSize(10)
           .fillColor('#000000')
           .font('Helvetica')
           .text('Sehr geehrte Damen und Herren,', 50, contentY);
        contentY += 25;
        doc.text('vielen Dank für Ihren Auftrag und das in mir gesetzte Vertrauen. Hiermit erlaube ich mir,', 50, contentY);
        contentY += 12;
        doc.text('folgenden Betrag für meine Leistungen in Rechnung zu stellen.', 50, contentY);
        contentY += 25;
      }

      // ==================== LINE ITEMS TABLE ====================
      const tableStartY = contentY;
      const colPositions = {
        nr: 50,
        description: 90,
        quantity: 330,
        unitPrice: 410,
        total: 480
      };
      
      const colWidths = {
        nr: 30,
        description: 230,
        quantity: 70,
        unitPrice: 65,
        total: 65
      };

      // Determine rate type for column headers (use daily if all items are daily, otherwise hourly)
      const allDaily = lineItems.length > 0 && lineItems.every((item: any) => item.rate_type === 'daily');
      const quantityHeader = allDaily ? 'Menge (Tage)' : 'Menge (Std.)';
      const rateHeader = allDaily ? '€/Tag' : '€/Std.';

      // Table header with gray background - full width
      doc.rect(45, tableStartY - 5, 505, 20)
         .fillAndStroke('#F0F0F0', '#CCCCCC');

      doc.fontSize(8)
         .fillColor('#000000')
         .font('Helvetica-Bold')
         .text('Nr.', colPositions.nr, tableStartY, { width: colWidths.nr, align: 'left', lineBreak: false })
         .text('Bezeichnung', colPositions.description, tableStartY, { width: colWidths.description, align: 'left', lineBreak: false })
         .text(quantityHeader, colPositions.quantity, tableStartY, { width: colWidths.quantity, align: 'center', lineBreak: false })
         .text(rateHeader, colPositions.unitPrice, tableStartY, { width: colWidths.unitPrice, align: 'right', lineBreak: false })
         .text('Gesamt €', colPositions.total, tableStartY, { width: colWidths.total, align: 'right', lineBreak: false });

      // Table rows
      let tableY = tableStartY + 25;
      doc.font('Helvetica')
         .fontSize(9);

      lineItems.forEach((item: any, index: number) => {
        // Check if we need a new page (reserve 200px for footer and totals section)
        const pageHeight = doc.page.height;
        const rowHeight = 20;
        
        // Only add page if we truly need it - check if current row + potential next content fits
        if (tableY + rowHeight > pageHeight - 200) {
          // Draw footer on current page before adding new page
          drawFooter();
          
          doc.addPage();
          tableY = 50; // Reset Y position and redraw ONLY table column headers (no company header)
          
          // Redraw table column header on new page
          doc.rect(45, tableY - 5, 505, 20)
             .fillAndStroke('#F0F0F0', '#CCCCCC');
          
          doc.fontSize(8)
             .fillColor('#000000')
             .font('Helvetica-Bold')
             .text('Nr.', colPositions.nr, tableY, { width: colWidths.nr, align: 'left', lineBreak: false })
             .text('Bezeichnung', colPositions.description, tableY, { width: colWidths.description, align: 'left', lineBreak: false })
             .text(quantityHeader, colPositions.quantity, tableY, { width: colWidths.quantity, align: 'center', lineBreak: false })
             .text(rateHeader, colPositions.unitPrice, tableY, { width: colWidths.unitPrice, align: 'right', lineBreak: false })
             .text('Gesamt €', colPositions.total, tableY, { width: colWidths.total, align: 'right', lineBreak: false });
          
          tableY += 25;
        }
        
        // Sanitize description to prevent PDFKit infinite loop
        const safeDescription = (item.description || '')
          .toString()
          // eslint-disable-next-line no-control-regex -- intentionally strips control chars for PDF text
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim()
          .substring(0, 80); // Max 80 chars to fit in one line

        // Alternate row background - match the actual row height
        if (index % 2 === 0) {
          doc.rect(45, tableY - 2, 505, 20)
             .fill('#FAFAFA');
        }

        // Format quantity to 2 decimal places for hours
        const quantityFormatted = parseFloat(item.quantity).toFixed(2);
        
        // Format currency without symbol (will be in header)
        const unitPriceFormatted = parseFloat(item.unit_price).toFixed(2).replace('.', ',');
        const lineTotalFormatted = parseFloat(item.line_total).toFixed(2).replace('.', ',');

        doc.fillColor('#000000')
           .text((index + 1).toString(), colPositions.nr, tableY, { width: colWidths.nr, align: 'left', lineBreak: false })
           .text(safeDescription, colPositions.description, tableY, { width: colWidths.description, align: 'left', ellipsis: true, lineBreak: false })
           .text(quantityFormatted, colPositions.quantity, tableY, { width: colWidths.quantity, align: 'center', lineBreak: false })
           .text(unitPriceFormatted, colPositions.unitPrice, tableY, { width: colWidths.unitPrice, align: 'right', lineBreak: false })
           .text(lineTotalFormatted, colPositions.total, tableY, { width: colWidths.total, align: 'right', lineBreak: false });

        tableY += 20;
      });

      // Bottom border line
      doc.moveTo(45, tableY)
         .lineTo(550, tableY)
         .strokeColor('#CCCCCC')
         .stroke();

      // ==================== TOTALS SECTION ====================
      tableY += 15;
      const totalsStartX = 330;
      const totalsValueX = 480;
      const totalsWidth = 65;
      
      // Subtotal (Net)
      doc.fontSize(9)
         .fillColor('#000000')
         .font('Helvetica')
         .text('Summe Netto', totalsStartX, tableY, { width: 140, align: 'right' })
         .font('Helvetica-Bold')
         .text(formatCurrency(parseFloat(invoice.sub_total), invoice.currency).replace(/[€$£¥]/g, '').trim(), 
               totalsValueX, tableY, { width: totalsWidth, align: 'right' });

      // Tax line (always show, even if 0%)
      tableY += 15;
      const taxRateDecimal = parseFloat(invoice.tax_rate || '0');
      const taxRatePercent = taxRateDecimal * 100; // Convert 0.19 to 19 for display
      const taxAmount = parseFloat(invoice.tax_amount || '0');
      doc.font('Helvetica')
         .text(`zzgl. ${taxRatePercent.toFixed(0)}% MwSt.`, totalsStartX, tableY, { width: 140, align: 'right' })
         .font('Helvetica-Bold')
         .text(formatCurrency(taxAmount, invoice.currency).replace(/[€$£¥]/g, '').trim(), 
               totalsValueX, tableY, { width: totalsWidth, align: 'right' });

      // Tax exemption notice (if applicable)
      if (taxRateDecimal === 0) {
        tableY += 20;
        // Use tax exemption template, invoice-specific text, or default
        const exemptionNotice = invoice.tax_exemption_text || taxExemptionText;
        
        if (exemptionNotice) {
          // Sanitize text to prevent infinite loop
          const sanitizedNotice = exemptionNotice.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#333333')
             .text(sanitizedNotice, 50, tableY, { width: 495 });
        } else {
          doc.fontSize(8)
             .font('Helvetica')
             .fillColor('#333333')
             .text('Rechnung enthält keine Umsatzsteuer, da die Steuerschuld beim Leistungsempfänger liegt (Reverse-Charge-Verfahren)', 
                   50, tableY, { width: 495 });
        }
        tableY += 5; // Less spacing after notice
      }

      // Final total with background
      tableY += 25;
      doc.rect(330, tableY - 5, 215, 20)
         .fillAndStroke('#6B8EAF', '#6B8EAF');
      
      doc.fontSize(11)
         .fillColor('#FFFFFF')
         .font('Helvetica-Bold')
         .text('Zu zahlender Betrag:', 335, tableY)
         .text(formatCurrency(parseFloat(invoice.total_amount), invoice.currency), 
               totalsValueX, tableY, { width: totalsWidth, align: 'right' });

      // ==================== PAYMENT INSTRUCTIONS ====================
      tableY += 40;
      
      // Priority: invoice footer_text > invoice terms template > default payment terms template
      const paymentInstructions = invoice.footer_text || termsText || paymentTermsText;
      
      if (paymentInstructions) {
        // Sanitize text to prevent infinite loop
        const sanitizedInstructions = paymentInstructions.trim();
        
        doc.fontSize(9)
           .fillColor('#000000')
           .font('Helvetica')
           .text(sanitizedInstructions, 50, tableY, { width: 495, lineGap: 3 });
      } else {
        // Default payment instructions
        doc.fontSize(9)
           .fillColor('#000000')
           .font('Helvetica')
           .text('Bitte überweisen Sie den offenen Rechnungsbetrag innerhalb eines Monats, bis zum', 50, tableY);
        tableY += 12;
        doc.text(`${formatDate(invoice.due_date)}, auf unten genanntes Bankkonto.`, 50, tableY);
      }

      // ==================== DRAW FOOTER ON FIRST PAGE ====================
      drawFooter();

      // ==================== APPEND STORNO PAGE IF INVOICE IS CANCELLED ====================
      if (invoice.status === 'cancelled') {
        doc.addPage();
        
        // Storno Header
        doc.fontSize(18)
           .fillColor('#DC2626')
           .font('Helvetica-Bold')
           .text('STORNORECHNUNG', 50, 50);

        doc.fontSize(10)
           .fillColor('#000000')
           .font('Helvetica')
           .text(`Stornierung der Rechnung Nr. ${invoice.invoice_number} vom ${formatDate(invoice.issue_date)}`, 50, 80);

        // Storno date
        const stornoDate = new Date().toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        doc.fontSize(9)
           .text(`Stornodatum: ${stornoDate}`, 50, 110);

        // Storno explanation
        doc.fontSize(10)
           .text('Sehr geehrte Damen und Herren,', 50, 150);
        doc.text('hiermit stornieren wir die oben genannte Rechnung vollständig.', 50, 170, { width: 495 });

        // Original invoice reference box
        doc.rect(45, 210, 505, 80).stroke('#DC2626');
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#DC2626')
           .text('Stornierte Rechnung:', 55, 220);
        doc.fontSize(9).font('Helvetica').fillColor('#000000')
           .text(`Rechnungsnummer: ${invoice.invoice_number}`, 65, 240)
           .text(`Rechnungsdatum: ${formatDate(invoice.issue_date)}`, 65, 255)
           .text(`Ursprünglicher Betrag: ${formatCurrency(parseFloat(invoice.total_amount), invoice.currency)}`, 65, 270);

        // Storno amount (negative)
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#DC2626')
           .text('Stornobetrag:', 50, 320)
           .text(`-${formatCurrency(parseFloat(invoice.total_amount), invoice.currency)}`, 400, 320, { width: 145, align: 'right' });

        // Net effect
        doc.fontSize(10).font('Helvetica').fillColor('#000000')
           .text('Nettowirkung: 0,00 €', 50, 350);

        // Footer text
        doc.fontSize(10)
           .text('Diese Stornorechnung ist zusammen mit der Originalrechnung aufzubewahren.', 50, 400, { width: 495 })
           .text('Mit freundlichen Grüßen', 50, 440);

        if (settings.company_name) {
          doc.text(settings.company_name, 50, 460);
        }
      }

      // ==================== APPEND CORRECTION PAGE IF INVOICE HAS CORRECTIONS ====================
      if (invoice.original_data) {
        let originalData: any = null;
        try {
          originalData = typeof invoice.original_data === 'string' 
            ? JSON.parse(invoice.original_data) 
            : invoice.original_data;
        } catch (e) {
          logger.error('Failed to parse original_data:', e);
        }

        if (originalData) {
          doc.addPage();
          
          // Correction Header
          doc.fontSize(18)
             .fillColor('#D97706')
             .font('Helvetica-Bold')
             .text('RECHNUNGSKORREKTUR', 50, 50);

          doc.fontSize(10)
             .fillColor('#000000')
             .font('Helvetica')
             .text(`Korrektur zur Rechnung Nr. ${invoice.invoice_number} vom ${formatDate(invoice.issue_date)}`, 50, 80);

          // Correction date
          const correctionDate = invoice.correction_date 
            ? formatDate(invoice.correction_date)
            : new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
          doc.fontSize(9)
             .text(`Korrekturdatum: ${correctionDate}`, 50, 110);

          // Greeting
          let corrY = 140;
          doc.fontSize(10)
             .text('Sehr geehrte Damen und Herren,', 50, corrY);
          corrY += 20;
          doc.text('hiermit korrigieren wir die oben genannte Rechnung wie folgt:', 50, corrY, { width: 495 });
          corrY += 30;

          // Correction reason
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
             .text('Korrektur:', 50, corrY);
          corrY += 18;
          const correctionReason = invoice.correction_reason || 'Korrektur der Rechnung';
          doc.fontSize(9).font('Helvetica').fillColor('#000000')
             .text(correctionReason, 60, corrY, { width: 480 });
          corrY += 30;

          // Detect what changed - use helper to normalize dates for comparison
          const normalizeDate = (d: any): string => {
            if (!d) return '';
            const date = new Date(d);
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0]; // YYYY-MM-DD
          };
          
          const normalizeString = (s: any): string => {
            if (s === null || s === undefined) return '';
            return String(s).trim();
          };

          const changes: { field: string; oldValue: string; newValue: string }[] = [];
          
          // Compare dates by normalized date string
          if (originalData.due_date && normalizeDate(originalData.due_date) !== normalizeDate(invoice.due_date)) {
            changes.push({
              field: 'Fälligkeitsdatum',
              oldValue: formatDate(originalData.due_date),
              newValue: formatDate(invoice.due_date)
            });
          }
          if (originalData.issue_date && normalizeDate(originalData.issue_date) !== normalizeDate(invoice.issue_date)) {
            changes.push({
              field: 'Rechnungsdatum',
              oldValue: formatDate(originalData.issue_date),
              newValue: formatDate(invoice.issue_date)
            });
          }
          if (originalData.total_amount && parseFloat(originalData.total_amount) !== parseFloat(invoice.total_amount)) {
            changes.push({
              field: 'Rechnungsbetrag',
              oldValue: formatCurrency(parseFloat(originalData.total_amount), invoice.currency),
              newValue: formatCurrency(parseFloat(invoice.total_amount), invoice.currency)
            });
          }
          // Compare notes with normalization (null, undefined, empty string all equal)
          if (normalizeString(originalData.notes) !== normalizeString(invoice.notes)) {
            changes.push({
              field: 'Anmerkungen',
              oldValue: originalData.notes || '(keine)',
              newValue: invoice.notes || '(keine)'
            });
          }

          // Display field changes table
          if (changes.length > 0) {
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
               .text('Geänderte Felder:', 50, corrY);
            corrY += 18;

            // Table header
            doc.rect(45, corrY - 5, 505, 20).fillAndStroke('#FFF3E0', '#FF9800');
            doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold')
               .text('Feld', 55, corrY)
               .text('Ursprünglicher Wert', 180, corrY, { width: 150 })
               .text('Neuer Wert', 380, corrY, { width: 150 });
            corrY += 22;

            changes.forEach((change) => {
              doc.fontSize(9).font('Helvetica')
                 .fillColor('#333333').text(change.field, 55, corrY)
                 .fillColor('#999999').text(change.oldValue, 180, corrY, { width: 150 })
                 .fillColor('#2E7D32').text(change.newValue, 380, corrY, { width: 150 });
              corrY += 18;
            });
            corrY += 15;
          }

          // Check if items changed
          let itemsChanged = false;
          if (originalData.items && lineItems) {
            if (originalData.items.length !== lineItems.length) {
              itemsChanged = true;
            } else {
              for (let i = 0; i < lineItems.length; i++) {
                const origItem = originalData.items[i];
                const currItem = lineItems[i];
                if (
                  parseFloat(origItem.quantity) !== parseFloat(currItem.quantity) ||
                  parseFloat(origItem.unit_price) !== parseFloat(currItem.unit_price) ||
                  origItem.description !== currItem.description
                ) {
                  itemsChanged = true;
                  break;
                }
              }
            }
          }

          // Show position tables only if items changed
          if (itemsChanged) {
            const colPos = { nr: 50, desc: 90, qty: 330, price: 410, total: 480 };

            // New positions
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
               .text('Korrigierte Positionen:', 50, corrY);
            corrY += 18;

            doc.rect(45, corrY - 5, 505, 20).fillAndStroke('#E8F5E9', '#4CAF50');
            doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold')
               .text('Pos.', colPos.nr, corrY)
               .text('Beschreibung', colPos.desc, corrY)
               .text('Menge', colPos.qty, corrY, { width: 70, align: 'right' })
               .text('Einzelpreis', colPos.price, corrY, { width: 65, align: 'right' })
               .text('Gesamt', colPos.total, corrY, { width: 65, align: 'right' });
            corrY += 22;

            lineItems.forEach((item: any, idx: number) => {
              doc.fontSize(9).font('Helvetica').fillColor('#2E7D32')
                 .text((idx + 1).toString(), colPos.nr, corrY)
                 .text(item.description || 'Leistung', colPos.desc, corrY, { width: 230 })
                 .text(parseFloat(item.quantity).toFixed(2), colPos.qty, corrY, { width: 70, align: 'right' })
                 .text(formatCurrency(parseFloat(item.unit_price), invoice.currency), colPos.price, corrY, { width: 65, align: 'right' })
                 .text(formatCurrency(parseFloat(item.line_total), invoice.currency), colPos.total, corrY, { width: 65, align: 'right' });
              corrY += 18;
            });

            doc.moveTo(45, corrY + 5).lineTo(550, corrY + 5).stroke('#4CAF50');
            corrY += 15;
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#2E7D32')
               .text('Korrigierter Betrag:', 380, corrY)
               .text(formatCurrency(parseFloat(invoice.total_amount), invoice.currency), 480, corrY, { width: 65, align: 'right' });
            corrY += 30;

            // Original positions
            if (originalData.items && originalData.items.length > 0) {
              doc.fontSize(10).font('Helvetica-Bold').fillColor('#666666')
                 .text('Ursprüngliche Positionen (zum Vergleich):', 50, corrY);
              corrY += 18;

              doc.rect(45, corrY - 5, 505, 20).fillAndStroke('#F5F5F5', '#CCCCCC');
              doc.fontSize(8).fillColor('#666666').font('Helvetica-Bold')
                 .text('Pos.', colPos.nr, corrY)
                 .text('Beschreibung', colPos.desc, corrY)
                 .text('Menge', colPos.qty, corrY, { width: 70, align: 'right' })
                 .text('Einzelpreis', colPos.price, corrY, { width: 65, align: 'right' })
                 .text('Gesamt', colPos.total, corrY, { width: 65, align: 'right' });
              corrY += 22;

              originalData.items.forEach((item: any, idx: number) => {
                const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
                doc.fontSize(9).font('Helvetica').fillColor('#999999')
                   .text((idx + 1).toString(), colPos.nr, corrY)
                   .text(item.description || 'Leistung', colPos.desc, corrY, { width: 230 })
                   .text(parseFloat(item.quantity).toFixed(2), colPos.qty, corrY, { width: 70, align: 'right' })
                   .text(formatCurrency(parseFloat(item.unit_price), invoice.currency), colPos.price, corrY, { width: 65, align: 'right' })
                   .text(formatCurrency(itemTotal, invoice.currency), colPos.total, corrY, { width: 65, align: 'right' });
                corrY += 18;
              });

              doc.moveTo(45, corrY + 5).lineTo(550, corrY + 5).stroke('#CCCCCC');
              corrY += 15;
              doc.fontSize(9).font('Helvetica').fillColor('#999999')
                 .text('Ursprünglicher Betrag:', 380, corrY)
                 .text(formatCurrency(parseFloat(originalData.total_amount), invoice.currency), 480, corrY, { width: 65, align: 'right' });

              // Difference
              const diff = parseFloat(invoice.total_amount) - parseFloat(originalData.total_amount);
              if (diff !== 0) {
                corrY += 15;
                const diffColor = diff > 0 ? '#D32F2F' : '#2E7D32';
                const diffSign = diff > 0 ? '+' : '';
                doc.fontSize(9).font('Helvetica-Bold').fillColor(diffColor)
                   .text('Differenz:', 380, corrY)
                   .text(diffSign + formatCurrency(diff, invoice.currency), 480, corrY, { width: 65, align: 'right' });
              }
              corrY += 30;
            }
          }

          // Footer
          doc.fontSize(10).font('Helvetica').fillColor('#000000')
             .text('Diese Rechnungskorrektur ist zusammen mit der Originalrechnung aufzubewahren.', 50, corrY, { width: 495 });
          corrY += 30;
          doc.text('Mit freundlichen Grüßen', 50, corrY);
          if (settings.company_name) {
            doc.text(settings.company_name, 50, corrY + 15);
          }
        }
      }

      // Finalize PDF and send when complete
      doc.end();
      
      bufferStream.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(pdfBuffers);
          
          // Use query parameter if provided, otherwise use invoice setting
          const enableZugferd = zugferd !== undefined 
            ? (zugferd === 'true' || zugferd === '1')
            : invoice.enable_zugferd;
          
          logger.debug('ZUGFeRD debug - zugferd param:', zugferd);
          logger.debug('ZUGFeRD debug - invoice.enable_zugferd:', invoice.enable_zugferd);
          logger.debug('ZUGFeRD debug - enableZugferd:', enableZugferd);
          
          if (enableZugferd) {
            logger.debug('ZUGFeRD: Generating XML...');
            logger.debug('ZUGFeRD debug - invoice values:', {
              sub_total: invoice.sub_total,
              tax_rate: invoice.tax_rate,
              tax_amount: invoice.tax_amount,
              total_amount: invoice.total_amount,
              currency: invoice.currency
            });
            
            // Generate ZUGFeRD XML
            const zugferdXml = ZugferdService.generateZugferdXML(
              {
                ...invoice,
                items: lineItems.map((item: any) => ({
                  description: item.description,
                  quantity: parseFloat(item.quantity),
                  unit_price: parseFloat(item.unit_price),
                  total_price: parseFloat(item.line_total),
                })),
              },
              {
                name: invoice.client_name || 'Client',
                email: invoice.client_email,
              },
              {
                name: settings.company_name || 'Company',
                street: settings.company_address || '',
                postal_code: '', // Extract from address if needed
                city: '', // Extract from address if needed
                country: 'DE',
                tax_id: settings.company_tax_id || '',
                email: settings.company_email || '',
              }
            );
            
            logger.debug('ZUGFeRD: Embedding XML in PDF...');
            // Embed ZUGFeRD XML in PDF
            const zugferdPdf = await ZugferdService.embedZugferdInPDF(pdfBuffer, zugferdXml);
            logger.debug('ZUGFeRD: Successfully embedded, sending PDF');
            
            // Send ZUGFeRD-compliant PDF
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=rechnung-${invoice.invoice_number}.pdf`);
            res.send(zugferdPdf);
          } else {
            logger.debug('ZUGFeRD: Disabled, sending regular PDF');
            // Send regular PDF
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=rechnung-${invoice.invoice_number}.pdf`);
            res.send(pdfBuffer);
          }
        } catch (sendError: any) {
          logger.error('PDF send error:', sendError);
          if (!res.headersSent) {
            res.status(500).json({ message: sendError.message || 'Failed to send PDF' });
          }
        }
      });
      
      // Handle PDF generation errors
      bufferStream.on('error', (streamError: any) => {
        logger.error('PDF stream error:', streamError);
        if (!res.headersSent) {
          res.status(500).json({ message: streamError.message || 'PDF generation stream error' });
        }
      });

    } catch (err: any) {
      logger.error('Generate PDF error:', err);
      
      // Check if response headers have already been sent
      if (!res.headersSent) {
        res.status(500).json({ message: err.message || 'Failed to generate PDF' });
      } else {
        // Headers already sent - destroy the response to prevent hanging
        logger.error('PDF generation failed after headers sent - destroying response');
        res.destroy();
      }
    }
  }

  /**
   * Generates an invoice PDF and returns it as a Buffer.
   * This method is used for programmatic PDF generation (e.g., tax packages).
   * Uses the same logic as generatePDF but returns a buffer instead of streaming to response.
   * 
   * @async
   * @param {string} invoiceId - The ID of the invoice
   * @param {string} userId - The ID of the user
   * @param {boolean} enableZugferd - Whether to embed ZUGFeRD XML (default: false)
   * @returns {Promise<Buffer | null>} PDF buffer or null if invoice not found
   */
  async generatePDFBuffer(invoiceId: string, userId: string, enableZugferd: boolean = false): Promise<Buffer | null> {
    // Create a mock request and response to reuse the existing generatePDF logic
    const mockReq = {
      params: { id: invoiceId },
      query: { zugferd: enableZugferd ? 'true' : 'false' },
      user: { id: userId }
    } as any;

    return new Promise((resolve, reject) => {
      let pdfBuffer: Buffer | null = null;
      
      const mockRes = {
        headersSent: false,
        statusCode: 200,
        setHeader: () => {},
        status: function(code: number) { 
          this.statusCode = code; 
          return this; 
        },
        json: (data: any) => {
          if (data.message === 'Invoice not found') {
            resolve(null);
          } else {
            reject(new Error(data.message || 'PDF generation failed'));
          }
        },
        send: (buffer: Buffer) => {
          pdfBuffer = buffer;
          resolve(pdfBuffer);
        },
        destroy: () => {
          reject(new Error('PDF generation failed - response destroyed'));
        }
      } as any;

      // Call the existing generatePDF method with mock request/response
      this.generatePDF(mockReq, mockRes).catch(reject);
    });
  }

  /**
   * Generates a Storno (cancellation/credit note) PDF for an invoice.
   * Creates a document that cancels the original invoice with negative amounts.
   * 
   * @async
   * @param {Request} req - Express request object with invoice ID in params
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends PDF file as download or error response
   * 
   * @example
   * GET /api/invoices/:id/storno-pdf
   * Response: 200 (PDF file download)
   */
  async generateStornoPDF(req: Request, res: Response) {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    try {
      // Helper function to format currency in German style
      const formatCurrency = (amount: number, currency: string = 'EUR'): string => {
        return new Intl.NumberFormat('de-DE', {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(amount);
      };

      // Helper function to format dates in German style
      const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      };

      // Fetch user settings for company information
      const settingsResult = await this.db.query(
        'SELECT * FROM settings WHERE user_id = $1',
        [userId]
      );
      const settings = settingsResult.rows[0] || {};

      // Fetch invoice with all details
      const queryText = `
        SELECT i.*, 
               c.name as client_name, c.email as client_email, c.phone as client_phone,
               c.address as client_address, c.city as client_city, c.postal_code as client_postal_code,
               c.use_separate_billing_address, c.billing_contact_person, c.billing_email, c.billing_phone,
               c.billing_address, c.billing_city, c.billing_state, c.billing_postal_code, c.billing_country,
               p.name as project_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN projects p ON i.project_id = p.id
        WHERE i.id = $1 AND i.user_id = $2
      `;
      
      const invoiceResult = await this.db.query(queryText, [id, userId]);
      
      if (invoiceResult.rows.length === 0) {
        res.status(404).json({ message: 'Invoice not found' });
        return;
      }

      const invoice = invoiceResult.rows[0];

      // Fetch line items
      const itemsQuery = `
        SELECT 
          COALESCE(p.name, ii.description) as description,
          SUM(ii.quantity) as quantity,
          ii.unit_price,
          SUM(ii.quantity * ii.unit_price) as line_total,
          COALESCE(ii.rate_type, 'hourly') as rate_type
        FROM invoice_items ii
        LEFT JOIN time_entries te ON ii.time_entry_id = te.id
        LEFT JOIN projects p ON te.project_id = p.id
        WHERE ii.invoice_id = $1
        GROUP BY COALESCE(p.name, ii.description), ii.unit_price, ii.rate_type
        ORDER BY MIN(ii.created_at)
      `;
      const itemsResult = await this.db.query(itemsQuery, [id]);
      const lineItems = itemsResult.rows;

      // Create PDF document
      const doc = new PDFDocument({ 
        margin: 50, 
        size: 'A4',
        bufferPages: true
      });

      const pdfBuffers: Buffer[] = [];
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- lazy require keeps stream setup local
      const bufferStream = new (require('stream').PassThrough)();
      bufferStream.on('data', (chunk: Buffer) => pdfBuffers.push(chunk));
      
      doc.on('error', (docError: any) => {
        logger.error('PDFDocument error:', docError);
        bufferStream.destroy(docError);
      });
      
      doc.pipe(bufferStream);

      // ==================== HEADER SECTION ====================
      // Right side - Company Info
      const safeCompanyName = (settings.company_name || 'Company Name').toString().substring(0, 100);
      doc.fontSize(16)
         .fillColor('#6B8EAF')
         .font('Helvetica-Bold')
         .text(safeCompanyName, 350, 50, { align: 'right', width: 195, lineBreak: false });
      
      if (settings.company_subline) {
        doc.fontSize(10)
           .fillColor('#666666')
           .font('Helvetica')
           .text(settings.company_subline.toString().substring(0, 100), 350, 72, { align: 'right', width: 195, lineBreak: false });
      }

      // Contact details (right side)
      const contactY = settings.company_subline ? 100 : 80;
      doc.fontSize(8).fillColor('#333333');
      
      if (settings.company_phone) {
        doc.text(`Tel.: ${settings.company_phone}`, 350, contactY, { align: 'right', width: 195, lineBreak: false });
      }
      if (settings.company_email) {
        doc.text(`E-Mail: ${settings.company_email}`, 350, contactY + 12, { align: 'right', width: 195, lineBreak: false });
      }
      if (settings.company_tax_id) {
        doc.text(`USt-IdNr.: ${settings.company_tax_id}`, 350, contactY + 24, { align: 'right', width: 195, lineBreak: false });
      }

      // Storno date and reference (right side)
      const datesY = contactY + 48;
      const stornoDate = new Date().toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      doc.fontSize(8)
         .fillColor('#333333')
         .font('Helvetica-Bold')
         .text('Stornodatum: ', 350, datesY, { continued: true })
         .font('Helvetica')
         .text(stornoDate, { align: 'right', width: 195, lineBreak: false });
      
      doc.font('Helvetica-Bold')
         .text('Bezug auf Rechnung: ', 350, datesY + 12, { continued: true })
         .font('Helvetica')
         .text(invoice.invoice_number, { align: 'right', width: 195, lineBreak: false });
      
      doc.font('Helvetica-Bold')
         .text('Rechnungsdatum: ', 350, datesY + 24, { continued: true })
         .font('Helvetica')
         .text(formatDate(invoice.issue_date), { align: 'right', width: 195, lineBreak: false });

      // ==================== LEFT SIDE - SENDER & RECIPIENT ====================
      const senderAddress = settings.company_address || 'Company Address';
      doc.fontSize(7)
         .fillColor('#999999')
         .font('Helvetica')
         .text(`${settings.company_name || 'Company'}, ${senderAddress}`, 50, 50);

      // Recipient address
      const recipientY = 75;
      const useBilling = invoice.use_separate_billing_address;
      const recipientName = useBilling && invoice.billing_contact_person 
        ? invoice.billing_contact_person : invoice.client_name || 'N/A';
      const recipientAddress = useBilling && invoice.billing_address 
        ? invoice.billing_address : invoice.client_address;
      const recipientPostalCode = useBilling && invoice.billing_postal_code 
        ? invoice.billing_postal_code : invoice.client_postal_code;
      const recipientCity = useBilling && invoice.billing_city 
        ? invoice.billing_city : invoice.client_city;
      
      doc.fontSize(11)
         .fillColor('#000000')
         .font('Helvetica-Bold')
         .text(recipientName, 50, recipientY);
      
      let currentY = recipientY + 15;
      if (recipientAddress) {
        doc.fontSize(10).font('Helvetica').text(recipientAddress, 50, currentY);
        currentY += 12;
      }
      if (recipientPostalCode && recipientCity) {
        doc.text(`${recipientPostalCode} ${recipientCity}`, 50, currentY);
        currentY += 12;
      }

      // ==================== STORNO TITLE ====================
      const titleY = 240;
      doc.fontSize(18)
         .fillColor('#C53030') // Red color for Storno
         .font('Helvetica-Bold')
         .text('STORNORECHNUNG / GUTSCHRIFT', 50, titleY);

      doc.fontSize(10)
         .fillColor('#000000')
         .font('Helvetica')
         .text(`Stornierung der Rechnung Nr. ${invoice.invoice_number} vom ${formatDate(invoice.issue_date)}`, 50, titleY + 30);

      // ==================== GREETING TEXT ====================
      let contentY = titleY + 60;
      doc.fontSize(10)
         .fillColor('#000000')
         .font('Helvetica')
         .text('Sehr geehrte Damen und Herren,', 50, contentY);
      contentY += 20;
      doc.text('hiermit stornieren wir die oben genannte Rechnung vollständig und erstatten Ihnen den folgenden Betrag:', 50, contentY, { width: 495 });
      contentY += 35;

      // ==================== LINE ITEMS TABLE (with negative amounts) ====================
      const tableStartY = contentY;
      const colPositions = { nr: 50, description: 90, quantity: 330, unitPrice: 410, total: 480 };

      // Table header
      doc.rect(45, tableStartY - 5, 505, 20).fillAndStroke('#F0F0F0', '#CCCCCC');

      doc.fontSize(8)
         .fillColor('#000000')
         .font('Helvetica-Bold')
         .text('Pos.', colPositions.nr, tableStartY)
         .text('Beschreibung', colPositions.description, tableStartY)
         .text('Menge', colPositions.quantity, tableStartY, { width: 70, align: 'right' })
         .text('Einzelpreis', colPositions.unitPrice, tableStartY, { width: 65, align: 'right' })
         .text('Gesamt', colPositions.total, tableStartY, { width: 65, align: 'right' });

      // Table rows (negative amounts)
      let rowY = tableStartY + 25;
      doc.font('Helvetica').fontSize(9);

      lineItems.forEach((item: any, index: number) => {
        const negativeTotal = -parseFloat(item.line_total);
        
        doc.fillColor('#000000')
           .text((index + 1).toString(), colPositions.nr, rowY)
           .text(item.description || 'Leistung', colPositions.description, rowY, { width: 230 })
           .text(parseFloat(item.quantity).toFixed(2), colPositions.quantity, rowY, { width: 70, align: 'right' })
           .text(formatCurrency(-parseFloat(item.unit_price), invoice.currency), colPositions.unitPrice, rowY, { width: 65, align: 'right' })
           .fillColor('#C53030') // Red for negative
           .text(formatCurrency(negativeTotal, invoice.currency), colPositions.total, rowY, { width: 65, align: 'right' });
        
        rowY += 20;
      });

      // Separator line
      doc.moveTo(45, rowY + 5).lineTo(550, rowY + 5).stroke('#CCCCCC');

      // ==================== TOTALS (negative) ====================
      const totalsY = rowY + 20;
      const negativeSubTotal = -parseFloat(invoice.sub_total || '0');
      const negativeTaxAmount = -parseFloat(invoice.tax_amount || '0');
      const negativeTotal = -parseFloat(invoice.total_amount || '0');

      doc.fontSize(9).font('Helvetica').fillColor('#000000')
         .text('Zwischensumme:', 380, totalsY)
         .fillColor('#C53030')
         .text(formatCurrency(negativeSubTotal, invoice.currency), 480, totalsY, { width: 65, align: 'right' });

      if (invoice.tax_rate > 0) {
        doc.fillColor('#000000')
           .text(`MwSt. (${invoice.tax_rate}%):`, 380, totalsY + 15)
           .fillColor('#C53030')
           .text(formatCurrency(negativeTaxAmount, invoice.currency), 480, totalsY + 15, { width: 65, align: 'right' });
      }

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
         .text('Gutschriftbetrag:', 380, totalsY + 35)
         .fillColor('#C53030')
         .text(formatCurrency(negativeTotal, invoice.currency), 480, totalsY + 35, { width: 65, align: 'right' });

      // ==================== FOOTER TEXT ====================
      const footerTextY = totalsY + 70;
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text('Der Gutschriftbetrag wird Ihnen entsprechend erstattet bzw. mit offenen Forderungen verrechnet.', 50, footerTextY, { width: 495 });

      doc.fontSize(10)
         .text('Mit freundlichen Grüßen', 50, footerTextY + 40);

      if (settings.company_name) {
        doc.text(settings.company_name, 50, footerTextY + 55);
      }

      // ==================== FINALIZE ====================
      doc.end();

      bufferStream.on('finish', async () => {
        try {
          const pdfBuffer = Buffer.concat(pdfBuffers);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename=storno-${invoice.invoice_number}.pdf`);
          res.send(pdfBuffer);
        } catch (sendError: any) {
          logger.error('Storno PDF send error:', sendError);
          if (!res.headersSent) {
            res.status(500).json({ message: sendError.message || 'Failed to send Storno PDF' });
          }
        }
      });

    } catch (err: any) {
      logger.error('Generate Storno PDF error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: err.message || 'Failed to generate Storno PDF' });
      }
    }
  }

  /**
   * Generates a Correction Invoice (Rechnungskorrektur) PDF for an invoice.
   * Creates a document that references the original invoice for corrections.
   * 
   * @async
   * @param {Request} req - Express request object with invoice ID in params
   * @param {Response} res - Express response object
   * @returns {Promise<void>} Sends PDF file as download or error response
   * 
   * @example
   * GET /api/invoices/:id/correction-pdf
   * Response: 200 (PDF file download)
   */
  async generateCorrectionPDF(req: Request, res: Response) {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    try {
      // Helper function to format currency in German style
      const formatCurrency = (amount: number, currency: string = 'EUR'): string => {
        return new Intl.NumberFormat('de-DE', {
          style: 'currency',
          currency: currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(amount);
      };

      // Helper function to format dates in German style
      const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleDateString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      };

      // Fetch user settings for company information
      const settingsResult = await this.db.query(
        'SELECT * FROM settings WHERE user_id = $1',
        [userId]
      );
      const settings = settingsResult.rows[0] || {};

      // Fetch invoice with all details
      const queryText = `
        SELECT i.*, 
               c.name as client_name, c.email as client_email, c.phone as client_phone,
               c.address as client_address, c.city as client_city, c.postal_code as client_postal_code,
               c.use_separate_billing_address, c.billing_contact_person, c.billing_email, c.billing_phone,
               c.billing_address, c.billing_city, c.billing_state, c.billing_postal_code, c.billing_country,
               p.name as project_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        LEFT JOIN projects p ON i.project_id = p.id
        WHERE i.id = $1 AND i.user_id = $2
      `;
      
      const invoiceResult = await this.db.query(queryText, [id, userId]);
      
      if (invoiceResult.rows.length === 0) {
        res.status(404).json({ message: 'Invoice not found' });
        return;
      }

      const invoice = invoiceResult.rows[0];

      // Fetch line items
      const itemsQuery = `
        SELECT 
          COALESCE(p.name, ii.description) as description,
          SUM(ii.quantity) as quantity,
          ii.unit_price,
          SUM(ii.quantity * ii.unit_price) as line_total,
          COALESCE(ii.rate_type, 'hourly') as rate_type
        FROM invoice_items ii
        LEFT JOIN time_entries te ON ii.time_entry_id = te.id
        LEFT JOIN projects p ON te.project_id = p.id
        WHERE ii.invoice_id = $1
        GROUP BY COALESCE(p.name, ii.description), ii.unit_price, ii.rate_type
        ORDER BY MIN(ii.created_at)
      `;
      const itemsResult = await this.db.query(itemsQuery, [id]);
      const lineItems = itemsResult.rows;

      // Create PDF document
      const doc = new PDFDocument({ 
        margin: 50, 
        size: 'A4',
        bufferPages: true
      });

      const pdfBuffers: Buffer[] = [];
      // eslint-disable-next-line @typescript-eslint/no-var-requires -- lazy require keeps stream setup local
      const bufferStream = new (require('stream').PassThrough)();
      bufferStream.on('data', (chunk: Buffer) => pdfBuffers.push(chunk));
      
      doc.on('error', (docError: any) => {
        logger.error('PDFDocument error:', docError);
        bufferStream.destroy(docError);
      });
      
      doc.pipe(bufferStream);

      // ==================== HEADER SECTION ====================
      // Right side - Company Info
      const safeCompanyName = (settings.company_name || 'Company Name').toString().substring(0, 100);
      doc.fontSize(16)
         .fillColor('#6B8EAF')
         .font('Helvetica-Bold')
         .text(safeCompanyName, 350, 50, { align: 'right', width: 195, lineBreak: false });
      
      if (settings.company_subline) {
        doc.fontSize(10)
           .fillColor('#666666')
           .font('Helvetica')
           .text(settings.company_subline.toString().substring(0, 100), 350, 72, { align: 'right', width: 195, lineBreak: false });
      }

      // Contact details (right side)
      const contactY = settings.company_subline ? 100 : 80;
      doc.fontSize(8).fillColor('#333333');
      
      if (settings.company_phone) {
        doc.text(`Tel.: ${settings.company_phone}`, 350, contactY, { align: 'right', width: 195, lineBreak: false });
      }
      if (settings.company_email) {
        doc.text(`E-Mail: ${settings.company_email}`, 350, contactY + 12, { align: 'right', width: 195, lineBreak: false });
      }
      if (settings.company_tax_id) {
        doc.text(`USt-IdNr.: ${settings.company_tax_id}`, 350, contactY + 24, { align: 'right', width: 195, lineBreak: false });
      }

      // Correction date and reference (right side)
      const datesY = contactY + 48;
      const correctionDate = new Date().toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      doc.fontSize(8)
         .fillColor('#333333')
         .font('Helvetica-Bold')
         .text('Korrekturdatum: ', 350, datesY, { continued: true })
         .font('Helvetica')
         .text(correctionDate, { align: 'right', width: 195, lineBreak: false });
      
      doc.font('Helvetica-Bold')
         .text('Bezug auf Rechnung: ', 350, datesY + 12, { continued: true })
         .font('Helvetica')
         .text(invoice.invoice_number, { align: 'right', width: 195, lineBreak: false });
      
      doc.font('Helvetica-Bold')
         .text('Rechnungsdatum: ', 350, datesY + 24, { continued: true })
         .font('Helvetica')
         .text(formatDate(invoice.issue_date), { align: 'right', width: 195, lineBreak: false });

      // ==================== LEFT SIDE - SENDER & RECIPIENT ====================
      const senderAddress = settings.company_address || 'Company Address';
      doc.fontSize(7)
         .fillColor('#999999')
         .font('Helvetica')
         .text(`${settings.company_name || 'Company'}, ${senderAddress}`, 50, 50);

      // Recipient address
      const recipientY = 75;
      const useBilling = invoice.use_separate_billing_address;
      const recipientName = useBilling && invoice.billing_contact_person 
        ? invoice.billing_contact_person : invoice.client_name || 'N/A';
      const recipientAddress = useBilling && invoice.billing_address 
        ? invoice.billing_address : invoice.client_address;
      const recipientPostalCode = useBilling && invoice.billing_postal_code 
        ? invoice.billing_postal_code : invoice.client_postal_code;
      const recipientCity = useBilling && invoice.billing_city 
        ? invoice.billing_city : invoice.client_city;
      
      doc.fontSize(11)
         .fillColor('#000000')
         .font('Helvetica-Bold')
         .text(recipientName, 50, recipientY);
      
      let currentY = recipientY + 15;
      if (recipientAddress) {
        doc.fontSize(10).font('Helvetica').text(recipientAddress, 50, currentY);
        currentY += 12;
      }
      if (recipientPostalCode && recipientCity) {
        doc.text(`${recipientPostalCode} ${recipientCity}`, 50, currentY);
        currentY += 12;
      }

      // ==================== CORRECTION TITLE ====================
      const titleY = 240;
      doc.fontSize(18)
         .fillColor('#D97706') // Orange/amber color for Correction
         .font('Helvetica-Bold')
         .text('RECHNUNGSKORREKTUR', 50, titleY);

      doc.fontSize(10)
         .fillColor('#000000')
         .font('Helvetica')
         .text(`Korrektur zur Rechnung Nr. ${invoice.invoice_number} vom ${formatDate(invoice.issue_date)}`, 50, titleY + 30);

      // ==================== GREETING TEXT ====================
      let contentY = titleY + 60;
      doc.fontSize(10)
         .fillColor('#000000')
         .font('Helvetica')
         .text('Sehr geehrte Damen und Herren,', 50, contentY);
      contentY += 20;
      doc.text('hiermit korrigieren wir die oben genannte Rechnung wie folgt:', 50, contentY, { width: 495 });
      contentY += 35;

      // ==================== ORIGINAL INVOICE REFERENCE ====================
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
         .text('Ursprüngliche Rechnung:', 50, contentY);
      contentY += 18;

      doc.fontSize(9).font('Helvetica').fillColor('#000000')
         .text(`Rechnungsnummer: ${invoice.invoice_number}`, 60, contentY);
      contentY += 14;
      doc.text(`Rechnungsdatum: ${formatDate(invoice.issue_date)}`, 60, contentY);
      contentY += 14;
      doc.text(`Fälligkeitsdatum: ${formatDate(invoice.due_date)}`, 60, contentY);
      contentY += 14;
      doc.text(`Rechnungsbetrag: ${formatCurrency(parseFloat(invoice.total_amount), invoice.currency)}`, 60, contentY);
      contentY += 30;

      // ==================== CORRECTION DETAILS SECTION ====================
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
         .text('Korrektur:', 50, contentY);
      contentY += 18;

      // Use the correction_reason from database or fallback message
      const correctionReason = invoice.correction_reason || 'Korrektur der Rechnung';
      doc.fontSize(9).font('Helvetica').fillColor('#000000')
         .text(correctionReason, 60, contentY, { width: 480 });
      contentY += 30;

      // Parse original data if available
      let originalData: any = null;
      if (invoice.original_data) {
        try {
          originalData = typeof invoice.original_data === 'string' 
            ? JSON.parse(invoice.original_data) 
            : invoice.original_data;
        } catch (e) {
          logger.error('Failed to parse original_data:', e);
        }
      }

      // ==================== SHOW FIELD-BY-FIELD CHANGES ====================
      if (originalData) {
        const changes: { field: string; oldValue: string; newValue: string }[] = [];
        
        // Check for due_date change
        if (originalData.due_date && originalData.due_date !== invoice.due_date) {
          changes.push({
            field: 'Fälligkeitsdatum',
            oldValue: formatDate(originalData.due_date),
            newValue: formatDate(invoice.due_date)
          });
        }
        
        // Check for issue_date change
        if (originalData.issue_date && originalData.issue_date !== invoice.issue_date) {
          changes.push({
            field: 'Rechnungsdatum',
            oldValue: formatDate(originalData.issue_date),
            newValue: formatDate(invoice.issue_date)
          });
        }
        
        // Check for total_amount change
        if (originalData.total_amount && parseFloat(originalData.total_amount) !== parseFloat(invoice.total_amount)) {
          changes.push({
            field: 'Rechnungsbetrag',
            oldValue: formatCurrency(parseFloat(originalData.total_amount), invoice.currency),
            newValue: formatCurrency(parseFloat(invoice.total_amount), invoice.currency)
          });
        }
        
        // Check for notes/description change
        if (originalData.notes !== undefined && originalData.notes !== invoice.notes) {
          changes.push({
            field: 'Anmerkungen',
            oldValue: originalData.notes || '(keine)',
            newValue: invoice.notes || '(keine)'
          });
        }

        // Display field changes if any
        if (changes.length > 0) {
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
             .text('Geänderte Felder:', 50, contentY);
          contentY += 18;

          // Changes table header
          doc.rect(45, contentY - 5, 505, 20).fillAndStroke('#FFF3E0', '#FF9800');
          doc.fontSize(8)
             .fillColor('#000000')
             .font('Helvetica-Bold')
             .text('Feld', 55, contentY)
             .text('Ursprünglicher Wert', 180, contentY, { width: 150 })
             .text('Neuer Wert', 380, contentY, { width: 150 });
          
          contentY += 22;

          changes.forEach((change) => {
            doc.fontSize(9).font('Helvetica')
               .fillColor('#333333')
               .text(change.field, 55, contentY)
               .fillColor('#999999')
               .text(change.oldValue, 180, contentY, { width: 150 })
               .fillColor('#2E7D32')
               .text(change.newValue, 380, contentY, { width: 150 });
            contentY += 18;
          });

          contentY += 15;
        }
      }

      // ==================== CHECK IF LINE ITEMS CHANGED ====================
      let itemsChanged = false;
      if (originalData && originalData.items && lineItems) {
        // Check if number of items changed
        if (originalData.items.length !== lineItems.length) {
          itemsChanged = true;
        } else {
          // Check if any item details changed
          for (let i = 0; i < lineItems.length; i++) {
            const origItem = originalData.items[i];
            const currItem = lineItems[i];
            if (
              parseFloat(origItem.quantity) !== parseFloat(currItem.quantity) ||
              parseFloat(origItem.unit_price) !== parseFloat(currItem.unit_price) ||
              origItem.description !== currItem.description
            ) {
              itemsChanged = true;
              break;
            }
          }
        }
      }

      let totalsY = contentY;
      const colPositions = { nr: 50, description: 90, quantity: 330, unitPrice: 410, total: 480 };

      // Only show position tables if items actually changed
      if (itemsChanged) {
        // ==================== CORRECTED LINE ITEMS (CURRENT) ====================
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
           .text('Korrigierte Positionen:', 50, contentY);
        contentY += 18;

        const tableStartY = contentY;

        // Table header
        doc.rect(45, tableStartY - 5, 505, 20).fillAndStroke('#E8F5E9', '#4CAF50');

        doc.fontSize(8)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text('Pos.', colPositions.nr, tableStartY)
           .text('Beschreibung', colPositions.description, tableStartY)
           .text('Menge', colPositions.quantity, tableStartY, { width: 70, align: 'right' })
           .text('Einzelpreis', colPositions.unitPrice, tableStartY, { width: 65, align: 'right' })
           .text('Gesamt', colPositions.total, tableStartY, { width: 65, align: 'right' });

        // Table rows - CURRENT/CORRECTED items
        let rowY = tableStartY + 25;
        doc.font('Helvetica').fontSize(9);

        lineItems.forEach((item: any, index: number) => {
          doc.fillColor('#2E7D32') // Green for corrected values
             .text((index + 1).toString(), colPositions.nr, rowY)
             .text(item.description || 'Leistung', colPositions.description, rowY, { width: 230 })
             .text(parseFloat(item.quantity).toFixed(2), colPositions.quantity, rowY, { width: 70, align: 'right' })
             .text(formatCurrency(parseFloat(item.unit_price), invoice.currency), colPositions.unitPrice, rowY, { width: 65, align: 'right' })
             .text(formatCurrency(parseFloat(item.line_total), invoice.currency), colPositions.total, rowY, { width: 65, align: 'right' });
          
          rowY += 20;
        });

        // Separator line
        doc.moveTo(45, rowY + 5).lineTo(550, rowY + 5).stroke('#4CAF50');

        // Corrected totals
        totalsY = rowY + 15;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#2E7D32')
           .text('Korrigierter Betrag:', 380, totalsY)
           .text(formatCurrency(parseFloat(invoice.total_amount), invoice.currency), 480, totalsY, { width: 65, align: 'right' });
      }

      totalsY += 30;

      // ==================== ORIGINAL LINE ITEMS REFERENCE (only if items changed) ====================
      if (itemsChanged && originalData && originalData.items && originalData.items.length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#666666')
           .text('Ursprüngliche Positionen (zum Vergleich):', 50, totalsY);
        totalsY += 18;

        const origTableStartY = totalsY;

        // Table header for original
        doc.rect(45, origTableStartY - 5, 505, 20).fillAndStroke('#F5F5F5', '#CCCCCC');

        doc.fontSize(8)
           .fillColor('#666666')
           .font('Helvetica-Bold')
           .text('Pos.', colPositions.nr, origTableStartY)
           .text('Beschreibung', colPositions.description, origTableStartY)
           .text('Menge', colPositions.quantity, origTableStartY, { width: 70, align: 'right' })
           .text('Einzelpreis', colPositions.unitPrice, origTableStartY, { width: 65, align: 'right' })
           .text('Gesamt', colPositions.total, origTableStartY, { width: 65, align: 'right' });

        // Original items
        let origRowY = origTableStartY + 25;
        doc.font('Helvetica').fontSize(9);

        originalData.items.forEach((item: any, index: number) => {
          const itemTotal = parseFloat(item.quantity) * parseFloat(item.unit_price);
          doc.fillColor('#999999')
             .text((index + 1).toString(), colPositions.nr, origRowY)
             .text(item.description || 'Leistung', colPositions.description, origRowY, { width: 230 })
             .text(parseFloat(item.quantity).toFixed(2), colPositions.quantity, origRowY, { width: 70, align: 'right' })
             .text(formatCurrency(parseFloat(item.unit_price), invoice.currency), colPositions.unitPrice, origRowY, { width: 65, align: 'right' })
             .text(formatCurrency(itemTotal, invoice.currency), colPositions.total, origRowY, { width: 65, align: 'right' });
          
          origRowY += 20;
        });

        // Separator line
        doc.moveTo(45, origRowY + 5).lineTo(550, origRowY + 5).stroke('#CCCCCC');

        // Original totals
        totalsY = origRowY + 15;
        doc.fontSize(9).font('Helvetica').fillColor('#999999')
           .text('Ursprünglicher Betrag:', 380, totalsY)
           .text(formatCurrency(parseFloat(originalData.total_amount), invoice.currency), 480, totalsY, { width: 65, align: 'right' });

        // Difference
        const difference = parseFloat(invoice.total_amount) - parseFloat(originalData.total_amount);
        if (difference !== 0) {
          totalsY += 15;
          const diffColor = difference > 0 ? '#D32F2F' : '#2E7D32';
          const diffSign = difference > 0 ? '+' : '';
          doc.fontSize(9).font('Helvetica-Bold').fillColor(diffColor)
             .text('Differenz:', 380, totalsY)
             .text(diffSign + formatCurrency(difference, invoice.currency), 480, totalsY, { width: 65, align: 'right' });
        }

        totalsY += 30;
      }

      // ==================== FOOTER TEXT ====================
      const footerTextY = totalsY + 20;
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text('Diese Rechnungskorrektur ist zusammen mit der Originalrechnung aufzubewahren.', 50, footerTextY, { width: 495 });

      doc.fontSize(10)
         .text('Mit freundlichen Grüßen', 50, footerTextY + 40);

      if (settings.company_name) {
        doc.text(settings.company_name, 50, footerTextY + 55);
      }

      // ==================== FINALIZE ====================
      doc.end();

      bufferStream.on('finish', async () => {
        try {
          const pdfBuffer = Buffer.concat(pdfBuffers);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename=korrektur-${invoice.invoice_number}.pdf`);
          res.send(pdfBuffer);
        } catch (sendError: any) {
          logger.error('Correction PDF send error:', sendError);
          if (!res.headersSent) {
            res.status(500).json({ message: sendError.message || 'Failed to send Correction PDF' });
          }
        }
      });

    } catch (err: any) {
      logger.error('Generate Correction PDF error:', err);
      if (!res.headersSent) {
        res.status(500).json({ message: err.message || 'Failed to generate Correction PDF' });
      }
    }
  }
}
