/**
 * @fileoverview ZUGFeRD/Factur-X e-invoice generation service.
 * 
 * Generates ZUGFeRD-compliant XML for invoices according to EN 16931 standard.
 * ZUGFeRD is mandatory for B2B invoicing in Germany as of 2025.
 * 
 * @see https://www.ferd-net.de/
 * @see https://www.ihk.de/darmstadt/produktmarken/recht-und-fair-play/steuerinfo/bmf-plant-verpflichtende-erechnung-und-meldesystem-5784882
 * 
 * @module services/external/zugferd
 */

import { PDFDocument } from 'pdf-lib';
import { InvoiceWithItems } from '../../models/financial/invoice.model';

/**
 * Client information for ZUGFeRD generation
 */
interface ClientInfo {
  name: string;
  street?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  tax_id?: string;
  email?: string;
}

/**
 * Company information for ZUGFeRD generation
 */
interface CompanyInfo {
  name: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  tax_id: string;
  email: string;
  phone?: string;
  iban?: string;
  bic?: string;
}

/**
 * ZUGFeRD Service for generating e-invoice XML according to EN 16931
 */
export class ZugferdService {
  /**
   * Helper to safely format numeric values from database (handles string/number types)
   */
  private static formatAmount(value: any, decimals: number = 2): string {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (isNaN(num)) {
      console.error('ZUGFeRD formatAmount received NaN:', value);
      return '0.00';
    }
    return num.toFixed(decimals);
  }

  /**
   * Helper to safely convert tax rate to percentage (from decimal 0.19 to 19.00)
   */
  private static formatTaxRate(value: any): string {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (isNaN(num)) {
      console.error('ZUGFeRD formatTaxRate received NaN:', value);
      return '0.00';
    }
    return (num * 100).toFixed(2);
  }

  /**
   * Generate ZUGFeRD XML for an invoice
   * 
   * @param invoice - Invoice with items
   * @param clientInfo - Client information
   * @param companyInfo - Company/seller information
   * @returns ZUGFeRD XML string
   */
  static generateZugferdXML(
    invoice: InvoiceWithItems,
    clientInfo: ClientInfo,
    companyInfo: CompanyInfo
  ): string {
    const issueDate = new Date(invoice.issue_date).toISOString().split('T')[0];
    const dueDate = new Date(invoice.due_date).toISOString().split('T')[0];
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice 
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:xs="http://www.w3.org/2001/XMLSchema"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  
  <!-- Context Parameter -->
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  
  <!-- Document Header -->
  <rsm:ExchangedDocument>
    <ram:ID>${this.escapeXml(invoice.invoice_number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate.replace(/-/g, '')}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  
  <!-- Supply Chain Trade Transaction -->
  <rsm:SupplyChainTradeTransaction>
    
    <!-- Line Items -->
    ${this.generateLineItems(invoice.items || [])}
    
    <!-- Header Agreement -->
    <ram:ApplicableHeaderTradeAgreement>
      <!-- Seller (Company) -->
      <ram:SellerTradeParty>
        <ram:Name>${this.escapeXml(companyInfo.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${this.escapeXml(companyInfo.postal_code)}</ram:PostcodeCode>
          <ram:LineOne>${this.escapeXml(companyInfo.street)}</ram:LineOne>
          <ram:CityName>${this.escapeXml(companyInfo.city)}</ram:CityName>
          <ram:CountryID>${this.escapeXml(companyInfo.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${companyInfo.tax_id ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${this.escapeXml(companyInfo.tax_id)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      
      <!-- Buyer (Client) -->
      <ram:BuyerTradeParty>
        <ram:Name>${this.escapeXml(clientInfo.name)}</ram:Name>
        ${clientInfo.street || clientInfo.postal_code || clientInfo.city ? `<ram:PostalTradeAddress>
          ${clientInfo.postal_code ? `<ram:PostcodeCode>${this.escapeXml(clientInfo.postal_code)}</ram:PostcodeCode>` : ''}
          ${clientInfo.street ? `<ram:LineOne>${this.escapeXml(clientInfo.street)}</ram:LineOne>` : ''}
          ${clientInfo.city ? `<ram:CityName>${this.escapeXml(clientInfo.city)}</ram:CityName>` : ''}
          ${clientInfo.country ? `<ram:CountryID>${this.escapeXml(clientInfo.country)}</ram:CountryID>` : ''}
        </ram:PostalTradeAddress>` : ''}
        ${clientInfo.tax_id ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${this.escapeXml(clientInfo.tax_id)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    
    <!-- Header Delivery -->
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${issueDate.replace(/-/g, '')}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    
    <!-- Header Settlement -->
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${this.escapeXml(invoice.currency)}</ram:InvoiceCurrencyCode>
      
      ${companyInfo.iban ? `<!-- Payment Means -->
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${this.escapeXml(companyInfo.iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
        ${companyInfo.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${this.escapeXml(companyInfo.bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>` : ''}
      
      <!-- Tax Totals -->
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${this.formatAmount(invoice.tax_amount)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${this.formatAmount(invoice.sub_total)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${this.formatTaxRate(invoice.tax_rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      
      <!-- Payment Terms -->
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dueDate.replace(/-/g, '')}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      
      <!-- Monetary Summation -->
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${this.formatAmount(invoice.sub_total)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${this.formatAmount(invoice.sub_total)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${this.escapeXml(invoice.currency)}">${this.formatAmount(invoice.tax_amount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${this.formatAmount(invoice.total_amount)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${this.formatAmount(invoice.total_amount)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
    
  </rsm:SupplyChainTradeTransaction>
  
</rsm:CrossIndustryInvoice>`;

    return xml;
  }

  /**
   * Generate line items XML section
   */
  private static generateLineItems(items: any[]): string {
    return items.map((item, index) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${index + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${this.escapeXml(item.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:GrossPriceProductTradePrice>
          <ram:ChargeAmount>${item.unit_price.toFixed(2)}</ram:ChargeAmount>
        </ram:GrossPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="HUR">${item.quantity.toFixed(2)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${item.total_price.toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('\n');
  }

  /**
   * Escape XML special characters
   */
  private static escapeXml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Embed ZUGFeRD XML into a PDF file
   * 
   * @param pdfBytes - Original PDF as Buffer or Uint8Array
   * @param zugferdXml - ZUGFeRD XML string
   * @returns Modified PDF with embedded XML as Buffer
   */
  static async embedZugferdInPDF(
    pdfBytes: Buffer | Uint8Array,
    zugferdXml: string
  ): Promise<Buffer> {
    try {
      // Load the PDF
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Embed the ZUGFeRD XML as an attachment
      const xmlBytes = Buffer.from(zugferdXml, 'utf-8');
      
      await pdfDoc.attach(xmlBytes, 'factur-x.xml', {
        mimeType: 'text/xml',
        description: 'Factur-X/ZUGFeRD Invoice',
        creationDate: new Date(),
        modificationDate: new Date(),
      });

      // Mark the PDF as PDF/A-3 compliant (required for ZUGFeRD)
      const metadataXml = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>BASIC</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

      // Note: pdf-lib doesn't support XMP metadata directly
      // For production, consider using a library like 'pdf-lib' with custom XMP or 'factur-x' npm package
      
      // Save the modified PDF
      const modifiedPdfBytes = await pdfDoc.save();
      
      return Buffer.from(modifiedPdfBytes);
    } catch (error) {
      console.error('Error embedding ZUGFeRD XML in PDF:', error);
      throw new Error('Failed to embed ZUGFeRD XML in PDF');
    }
  }
}

export default ZugferdService;
