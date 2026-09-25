import * as XLSX from 'xlsx';

export interface ExcelColumn<T = any> {
  header: string;
  key: keyof T | string;
  width?: number;
  formatter?: (value: any, item: T) => any;
}

/**
 * Exports data to an Excel (.xlsx) file and triggers download in the browser.
 */
export function exportToExcel<T extends Record<string, any>>({
  filename,
  sheetName = 'Report',
  columns,
  data,
}: {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn<T>[];
  data: T[];
}) {
  if (!data || data.length === 0) {
    alert('No data available to export for the selected criteria.');
    return;
  }

  // Format rows based on specified column definitions
  const rows = data.map((item, index) => {
    const row: Record<string, any> = {};
    columns.forEach((col) => {
      if (col.key === 'serial_no' || col.key === 's_no') {
        row[col.header] = index + 1;
      } else {
        const rawVal = item[col.key];
        row[col.header] = col.formatter ? col.formatter(rawVal, item) : (rawVal ?? '');
      }
    });
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

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
