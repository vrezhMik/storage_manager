// Builds and downloads .xlsx files for the reports. ExcelJS is loaded only
// when a file is actually requested, so report pages stay light.

export type XlsxCell = string | number | null | undefined;

export type XlsxRow = {
  cells: XlsxCell[];
  // 0 = group row (bold), 1 = row inside a group (indented).
  level?: 0 | 1;
  bold?: boolean;
};

export type XlsxSheet = {
  name: string;
  // Lines above the table, e.g. report name and period.
  title?: string[];
  columns: { header: string; width?: number; numeric?: boolean }[];
  rows: XlsxRow[];
  // Bold total line at the bottom.
  total?: XlsxCell[];
};

const BRAND = "FF00613C"; // --primary (hsl 156 100% 19%)
const HEADER_FILL = "FFE8F3EE";
const GROUP_FILL = "FFF3F4F6";
const NUMBER_FORMAT = "#,##0.##";

// Excel sheet names: max 31 chars, no : \ / ? * [ ]
const sheetName = (name: string, used: Set<string>) => {
  let base = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 28) || "Sheet";
  let candidate = base;
  for (let i = 2; used.has(candidate); i++) candidate = `${base} ${i}`;
  used.add(candidate);
  return candidate;
};

export const safeFileName = (name: string) =>
  name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "report";

export async function downloadXlsx(fileName: string, sheets: XlsxSheet[]): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Flexit";
  workbook.created = new Date();
  const used = new Set<string>();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheetName(sheet.name, used), {
      views: [{ state: "frozen", ySplit: (sheet.title?.length ?? 0) + 1 }],
    });
    const width = sheet.columns.length;

    (sheet.title ?? []).forEach((line, idx) => {
      const row = ws.addRow([line]);
      row.font = idx === 0 ? { bold: true, size: 14, color: { argb: BRAND } } : { italic: true, color: { argb: "FF6B7280" } };
      if (width > 1) ws.mergeCells(row.number, 1, row.number, width);
    });

    const header = ws.addRow(sheet.columns.map((c) => c.header));
    header.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: BRAND } } };
    });

    for (const data of sheet.rows) {
      const row = ws.addRow(data.cells.map((v) => (v === undefined ? null : v)));
      if (data.level === 0 || data.bold) row.font = { bold: true };
      if (data.level === 0) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GROUP_FILL } };
        });
      }
      if (data.level === 1) row.getCell(1).alignment = { indent: 2 };
    }

    if (sheet.total) {
      const row = ws.addRow(sheet.total.map((v) => (v === undefined ? null : v)));
      row.font = { bold: true };
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { top: { style: "thin" } };
      });
    }

    sheet.columns.forEach((column, idx) => {
      const col = ws.getColumn(idx + 1);
      col.width = column.width ?? (idx === 0 ? 40 : 16);
      if (column.numeric) col.numFmt = NUMBER_FORMAT;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(fileName)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
