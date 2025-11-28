/**
 * @fileoverview Report export utilities for JSON, CSV, Excel, and PDF formats.
 * 
 * Provides functions to export report data in various formats:
 * - JSON: Raw data export
 * - CSV: Spreadsheet-compatible format
 * - Excel (XLSX): Advanced analysis with formatting and multiple sheets
 * - PDF: Print-ready document with professional tables and metadata
 * 
 * @module utils/reportExport
 */

import ExcelJS from 'exceljs';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// Set up pdfMake fonts - handle different module export formats
if (pdfFonts && (pdfFonts as any).pdfMake) {
  (pdfMake as any).vfs = (pdfFonts as any).pdfMake.vfs;
} else if (pdfFonts) {
  (pdfMake as any).vfs = pdfFonts;
}

export interface ExportMetadata {
  headline: string;
  description: string;
  footer: string;
  reportType?: string;
  generatedBy?: string;
  companyName?: string;
  currency?: string;
  period?: { start_date: string; end_date: string; quarter?: number; year?: number };
}

/**
 * Format report period for display
 */
function formatReportPeriod(data: any): string {
  if (data && data.period) {
    if (data.period.quarter && data.period.year) {
      return `Q${data.period.quarter} ${String(data.period.year)}`;
    }
    if (data.period.year && !data.period.quarter) {
      return `Year ${String(data.period.year)}`;
    }
    if (data.period.start_date && data.period.end_date) {
      const start = new Date(data.period.start_date);
      const end = new Date(data.period.end_date);
      return `${start.toLocaleDateString('de-DE')} - ${end.toLocaleDateString('de-DE')}`;
    }
  }
  return 'Unknown period';
}

/**
 * Download a file with the given content and filename
 */
function downloadFile(content: string | Blob | ArrayBuffer, filename: string, type: string) {
  const blob = content instanceof Blob 
    ? content 
    : content instanceof ArrayBuffer
    ? new Blob([content], { type })
    : new Blob([content], { type });
    
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate unique report ID
 */
function generateReportId(): string {
  return `RPT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
}

/**
 * Format key for display (convert snake_case to Title Case)
 */
function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Format value for display
 */
function formatValue(value: any, isCurrency: boolean = false, key?: string): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    // Don't format years and quarters with thousands separators
    if (key && (key.toLowerCase().includes('year') || key.toLowerCase().includes('quarter'))) {
      return String(value);
    }
    if (isCurrency) {
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    }
    return value.toLocaleString('de-DE');
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('de-DE');
      }
    } catch {
      // Fall through
    }
  }
  return String(value);
}

/**
 * Extract table data from objects
 */
function extractTableData(data: any): { headers: string[], rows: any[][] } {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return { headers: [], rows: [] };
  }

  if (!Array.isArray(data)) {
    data = [data];
  }

  const headers = Array.from(
    new Set(data.flatMap((obj: any) => typeof obj === 'object' && obj !== null ? Object.keys(obj) : []))
  ) as string[];

  const rows = data.map((item: any) => 
    headers.map(header => item[header] ?? null)
  );

  return { headers, rows };
}

/**
 * Detect if a field contains currency values
 */
function isCurrencyField(key: string): boolean {
  const currencyKeywords = ['amount', 'price', 'total', 'cost', 'value', 'revenue', 'expense', 
                            'payment', 'gross', 'net', 'vat', 'tax', 'paid', 'outstanding', 
                            'payable', 'rate', 'salary', 'wage'];
  const lowerKey = key.toLowerCase();
  return currencyKeywords.some(keyword => lowerKey.includes(keyword));
}

/**
 * Export report data as JSON
 */
export function exportAsJSON(data: any, filename: string, metadata: ExportMetadata) {
  const reportId = generateReportId();
  
  const exportData = {
    metadata: {
      reportId,
      headline: metadata.headline,
      description: metadata.description,
      reportType: metadata.reportType || 'General Report',
      generatedBy: metadata.generatedBy || 'ProjectTrack System',
      companyName: metadata.companyName || 'ProjectTrack',
      currency: metadata.currency || 'EUR',
      exportedAt: new Date().toISOString(),
      exportFormat: 'JSON',
    },
    data,
  };

  const json = JSON.stringify(exportData, null, 2);
  downloadFile(json, `${filename}.json`, 'application/json');
}

/**
 * Convert object array to CSV format
 */
function objectsToCSV(objects: any[]): string {
  if (!objects || objects.length === 0) return '';

  // Get all unique headers
  const headers = Array.from(
    new Set(objects.flatMap(obj => Object.keys(obj)))
  );

  // Create CSV header row
  const csvHeader = headers.join(',');

  // Create CSV data rows
  const csvRows = objects.map(obj =>
    headers.map(header => {
      const value = obj[header];
      if (value === null || value === undefined) return '';
      
      let stringValue = String(value);
      
      // Format dates
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            stringValue = date.toLocaleDateString('de-DE', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            });
          }
        } catch {
          // Keep original string value
        }
      }
      
      // Format objects as readable text
      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          stringValue = value.map(v => String(v)).join('; ');
        } else {
          stringValue = Object.entries(value)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; ');
        }
      }
      
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',')
  );

  return [csvHeader, ...csvRows].join('\n');
}

/**
 * Export report data as CSV
 */
export function exportAsCSV(data: any, filename: string, metadata: ExportMetadata) {
  const reportId = generateReportId();
  let csv = '';

  // Add metadata as comments
  csv += `# ${metadata.headline}\n`;
  csv += `# Report ID: ${reportId}\n`;
  if (metadata.description) {
    csv += `# ${metadata.description}\n`;
  }
  csv += `# Generated: ${new Date().toLocaleString('de-DE')}\n`;
  if (metadata.period) {
    csv += `# Period: ${formatReportPeriod({ period: metadata.period })}\n`;
  }
  csv += `# Currency: ${metadata.currency || 'EUR'}\n`;
  csv += '\n';

  // Handle different data structures
  if (Array.isArray(data)) {
    csv += objectsToCSV(data);
  } else if (typeof data === 'object' && data !== null) {
    // For nested objects (like VAT report with breakdown), convert each section
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0) {
        csv += `\n# ${formatKey(key)}\n`;
        csv += objectsToCSV(value);
        csv += '\n';
      } else if (typeof value === 'object' && value !== null) {
        csv += `\n# ${formatKey(key)}\n`;
        csv += objectsToCSV([value]);
        csv += '\n';
      }
    }
  }

  downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8');
}

/**
 * Export report data as Excel (XLSX) with professional formatting
 */
export async function exportAsExcel(data: any, filename: string, metadata: ExportMetadata) {
  const reportId = generateReportId();
  const workbook = new ExcelJS.Workbook();
  
  workbook.creator = metadata.generatedBy || 'ProjectTrack System';
  workbook.lastModifiedBy = metadata.generatedBy || 'ProjectTrack System';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.company = metadata.companyName || 'ProjectTrack';

  // Create Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary', {
    properties: { tabColor: { argb: 'FF3B82F6' } }
  });

  // Add header with styling
  summarySheet.mergeCells('A1:D1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = metadata.headline;
  titleCell.font = { size: 18, bold: true, color: { argb: 'FF1F2937' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  summarySheet.getRow(1).height = 30;

  // Add metadata table
  let row = 3;
  const metadataItems = [
    ['Report ID', reportId],
    ['Report Type', metadata.reportType || 'General Report'],
    ['Description', metadata.description],
    ['Period', metadata.period ? formatReportPeriod({ period: metadata.period }) : 'N/A'],
    ['Currency', metadata.currency || 'EUR'],
    ['Generated', new Date().toLocaleString('de-DE')],
    ['Generated By', metadata.generatedBy || 'ProjectTrack System'],
  ];

  metadataItems.forEach(([key, value]) => {
    summarySheet.getCell(`A${row}`).value = key;
    summarySheet.getCell(`A${row}`).font = { bold: true, color: { argb: 'FF4B5563' } };
    summarySheet.getCell(`B${row}`).value = value;
    row++;
  });

  summarySheet.getColumn(1).width = 20;
  summarySheet.getColumn(2).width = 50;

  // Process data and create data sheets
  if (typeof data === 'object' && data !== null) {
    for (const [sectionKey, sectionValue] of Object.entries(data)) {
      if (Array.isArray(sectionValue) && sectionValue.length > 0) {
        // Create a sheet for array data
        const sheetName = formatKey(sectionKey).substring(0, 31); // Excel sheet name limit
        const sheet = workbook.addWorksheet(sheetName);
        
        const { headers, rows } = extractTableData(sectionValue);
        
        if (headers.length > 0) {
          // Add headers with styling
          const headerRow = sheet.addRow(headers.map(formatKey));
          headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF3B82F6' }
          };
          headerRow.height = 20;
          headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

          // Add data rows
          rows.forEach((rowData: any[]) => {
            const dataRow = sheet.addRow(
              rowData.map((cell, idx) => {
                const header = headers[idx];
                if (typeof cell === 'number' && isCurrencyField(header)) {
                  return cell;
                }
                return cell;
              })
            );

            // Format currency cells
            rowData.forEach((cell, idx) => {
              const header = headers[idx];
              if (typeof cell === 'number' && isCurrencyField(header)) {
                dataRow.getCell(idx + 1).numFmt = '#,##0.00 "€"';
              } else if (typeof cell === 'number') {
                dataRow.getCell(idx + 1).numFmt = '#,##0.00';
              }
            });
          });

          // Auto-fit columns
          sheet.columns.forEach((column: any, idx: number) => {
            let maxLength = headers[idx]?.length || 10;
            rows.forEach(row => {
              const cellValue = String(row[idx] || '');
              maxLength = Math.max(maxLength, cellValue.length);
            });
            column.width = Math.min(maxLength + 5, 50);
          });

          // Add filters
          sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: headers.length }
          };

          // Freeze header row
          sheet.views = [{ state: 'frozen', ySplit: 1 }];

          // Add alternating row colors
          for (let i = 2; i <= rows.length + 1; i++) {
            if (i % 2 === 0) {
              sheet.getRow(i).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF9FAFB' }
              };
            }
          }
        }
      } else if (typeof sectionValue === 'object' && sectionValue !== null && !Array.isArray(sectionValue)) {
        // Add summary data to main summary sheet
        row += 2;
        summarySheet.getCell(`A${row}`).value = formatKey(sectionKey);
        summarySheet.getCell(`A${row}`).font = { size: 14, bold: true, color: { argb: 'FF1F2937' } };
        row++;

        const entries = Object.entries(sectionValue);
        entries.forEach(([key, value]) => {
          summarySheet.getCell(`A${row}`).value = formatKey(key);
          summarySheet.getCell(`A${row}`).font = { bold: true };
          
          const cell = summarySheet.getCell(`B${row}`);
          
          // Special handling for year and quarter - convert to string to prevent number formatting
          if (key.toLowerCase().includes('year') || key.toLowerCase().includes('quarter')) {
            cell.value = String(value);
          } else if (typeof value === 'number') {
            cell.value = value;
            if (isCurrencyField(key)) {
              cell.numFmt = '#,##0.00 "€"';
            } else {
              cell.numFmt = '#,##0.00';
            }
          } else {
            cell.value = formatValue(value);
          }
          row++;
        });
      }
    }
  }

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  downloadFile(buffer, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/**
 * Export report data as PDF using pdfmake
 */
export async function exportAsPDF(data: any, filename: string, metadata: ExportMetadata) {
  const reportId = generateReportId();
  const content: any[] = [];

  // Header
  content.push({
    text: metadata.headline,
    style: 'header',
    margin: [0, 0, 0, 20]
  });

  // Metadata table
  const metadataTable: any[][] = [
    [
      { text: 'Report ID:', bold: true, fillColor: '#F3F4F6' },
      { text: reportId, fillColor: '#F3F4F6' }
    ],
    [
      { text: 'Report Type:', bold: true },
      { text: metadata.reportType || 'General Report' }
    ],
  ];

  if (metadata.description) {
    metadataTable.push([
      { text: 'Description:', bold: true, fillColor: '#F3F4F6' },
      { text: metadata.description, fillColor: '#F3F4F6' }
    ]);
  }

  if (metadata.period) {
    metadataTable.push([
      { text: 'Period:', bold: true },
      { text: formatReportPeriod({ period: metadata.period }) }
    ]);
  }

  metadataTable.push(
    [
      { text: 'Currency:', bold: true, fillColor: '#F3F4F6' },
      { text: metadata.currency || 'EUR', fillColor: '#F3F4F6' }
    ],
    [
      { text: 'Generated:', bold: true },
      { text: new Date().toLocaleString('de-DE') }
    ],
    [
      { text: 'Generated By:', bold: true, fillColor: '#F3F4F6' },
      { text: metadata.generatedBy || 'ProjectTrack System', fillColor: '#F3F4F6' }
    ]
  );

  content.push({
    table: {
      widths: ['25%', '75%'],
      body: metadataTable
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#E5E7EB',
      vLineColor: () => '#E5E7EB',
    },
    margin: [0, 0, 0, 30]
  });

  // Process data sections
  if (typeof data === 'object' && data !== null) {
    for (const [sectionKey, sectionValue] of Object.entries(data)) {
      // Section title
      content.push({
        text: formatKey(sectionKey),
        style: 'sectionHeader',
        margin: [0, 20, 0, 10]
      });

      if (Array.isArray(sectionValue) && sectionValue.length > 0) {
        // Create table from array data
        const { headers, rows } = extractTableData(sectionValue);
        
        if (headers.length > 0) {
          const tableBody: any[][] = [];
          
          // Header row
          tableBody.push(
            headers.map(h => ({
              text: formatKey(h),
              style: 'tableHeader',
              fillColor: '#3B82F6',
              color: '#FFFFFF'
            }))
          );

          // Data rows
          rows.forEach((row: any[], idx: number) => {
            tableBody.push(
              row.map((cell, colIdx) => {
                const header = headers[colIdx];
                const isCurrency = isCurrencyField(header);
                return {
                  text: formatValue(cell, isCurrency),
                  fillColor: idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB',
                  alignment: (typeof cell === 'number' || isCurrency) ? 'right' as const : 'left' as const
                };
              })
            );
          });

          content.push({
            table: {
              headerRows: 1,
              widths: Array(headers.length).fill('*'),
              body: tableBody
            },
            layout: {
              hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => '#E5E7EB',
              vLineColor: () => '#E5E7EB',
              paddingLeft: () => 8,
              paddingRight: () => 8,
              paddingTop: () => 6,
              paddingBottom: () => 6
            },
            margin: [0, 0, 0, 15]
          });
        }
      } else if (typeof sectionValue === 'object' && sectionValue !== null) {
        // Create key-value table
        const kvBody: any[][] = [];
        
        Object.entries(sectionValue).forEach(([key, value], idx) => {
          const isCurrency = isCurrencyField(key);
          kvBody.push([
            {
              text: formatKey(key),
              bold: true,
              fillColor: idx % 2 === 0 ? '#F9FAFB' : '#FFFFFF'
            },
            {
              text: formatValue(value, isCurrency, key),
              alignment: (typeof value === 'number' || isCurrency) ? 'right' as const : 'left' as const,
              fillColor: idx % 2 === 0 ? '#F9FAFB' : '#FFFFFF'
            }
          ]);
        });

        content.push({
          table: {
            widths: ['50%', '50%'],
            body: kvBody
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => '#E5E7EB',
            vLineColor: () => '#E5E7EB',
            paddingLeft: () => 8,
            paddingRight: () => 8,
            paddingTop: () => 6,
            paddingBottom: () => 6
          },
          margin: [0, 0, 0, 15]
        });
      }
    }
  }

  // Footer
  if (metadata.footer) {
    content.push({
      text: metadata.footer,
      style: 'footer',
      margin: [0, 30, 0, 0]
    });
  }

  const docDefinition: any = {
    content,
    styles: {
      header: {
        fontSize: 22,
        bold: true,
        color: '#1F2937'
      },
      sectionHeader: {
        fontSize: 16,
        bold: true,
        color: '#374151'
      },
      tableHeader: {
        fontSize: 11,
        bold: true
      },
      footer: {
        fontSize: 9,
        color: '#6B7280',
        alignment: 'center'
      }
    },
    defaultStyle: {
      fontSize: 10,
      font: 'Roboto'
    },
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [40, 60, 40, 60],
    footer: (currentPage: number, pageCount: number) => ({
      text: `Page ${currentPage} of ${pageCount}`,
      alignment: 'center',
      fontSize: 9,
      color: '#9CA3AF',
      margin: [0, 20, 0, 0]
    })
  };

  pdfMake.createPdf(docDefinition).download(`${filename}.pdf`);
}
