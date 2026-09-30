import * as XLSX from 'xlsx';

export interface ExcelColumn<T = any> {
  header: string;
  key: keyof T | string;
  width?: number;
  formatter?: (value: any, item: T) => any;
}

const SERIAL_KEYS = new Set(['serial_no', 's_no', 'serialno', 'sno', 'serial', 's.no.', 's.no']);

/**
 * Exports data to an Excel (.xlsx) file and triggers download in the browser.
 */
export function exportToExcel<T extends Record<string, any>>({
  filename,
  sheetName = 'Report',
  columns,
  data,
  totalRow,
}: {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn<T>[];
  data: T[];
  totalRow?: Record<string, any>;
}) {
  if (!data || data.length === 0) {
    alert('No data available to export for the selected criteria.');
    return;
  }

  // Format rows based on specified column definitions
  const rows = data.map((item, index) => {
    const row: Record<string, any> = {};
    columns.forEach((col) => {
      const colKey = String(col.key).toLowerCase().trim();
      if (SERIAL_KEYS.has(colKey)) {
        row[col.header] = index + 1;
      } else {
        const rawVal = item[col.key];
        row[col.header] = col.formatter ? col.formatter(rawVal, item) : (rawVal ?? '');
      }
    });
    return row;
  });

  // If a summary/total row is provided, append it to the exported rows
  if (totalRow) {
    const formattedTotalRow: Record<string, any> = {};
    columns.forEach((col) => {
      const colKey = String(col.key);
      const val = totalRow[col.header] ?? totalRow[colKey] ?? '';
      formattedTotalRow[col.header] = val;
    });
    rows.push(formattedTotalRow);
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Preserve text format for barcodes, product codes, phones to avoid scientific notation or leading 0 loss
  for (const cellRef in worksheet) {
    if (cellRef.startsWith('!')) continue;
    const cell = worksheet[cellRef];
    if (cell && cell.t === 's') {
      cell.z = '@';
    }
  }

  // Auto-calculate column widths
  const colWidths = columns.map((col) => {
    if (col.width) return { wch: col.width };
    const maxLen = Math.max(
      col.header.length,
      ...rows.map((r) => String(r[col.header] ?? '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 3, 10), 40) };
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));

  const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, cleanFilename);
}
