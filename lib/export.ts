// lib/export.ts — client-side export utilities (Excel + PDF)
// Uses dynamic imports so libraries only load when the user triggers an export.

export type ExcelSheet = {
  name:    string;
  columns: string[];
  rows:    (string | number | null)[][];
};

export type PDFTable = {
  title?:   string;
  columns:  string[];
  rows:     (string | number | null)[][];
};

export async function exportToExcel(filename: string, sheets: ExcelSheet[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    ws.addRow(sheet.columns);
    sheet.rows.forEach((row) => ws.addRow(row));

    // Auto-width columns
    ws.columns = sheet.columns.map((col, i) => ({
      header: col,
      key: `column-${i}`,
      width: Math.min(
        Math.max(col.length, ...sheet.rows.map(r => String(r[i] ?? "").length)) + 2,
        40
      ),
    }));
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportToPDF(options: {
  title:       string;
  subtitle?:   string;
  filename:    string;
  tables:      PDFTable[];
  landscape?:  boolean;
}) {
  const { default: jsPDF }     = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: options.landscape ? "landscape" : "portrait" });

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(options.title, 14, 18);

  let y = 26;

  if (options.subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(options.subtitle, 14, y);
    y += 6;
  }

  doc.setFontSize(8);
  doc.setTextColor(160);
  doc.text(
    `Generado el ${new Date().toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" })}`,
    14, y
  );
  y += 8;
  doc.setTextColor(0);

  for (const table of options.tables) {
    if (table.title) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(table.title, 14, y + 4);
      y += 10;
    }

    autoTable(doc, {
      startY:  y,
      head:    [table.columns],
      body:    table.rows.map(r => r.map(v => v ?? "")),
      styles:  { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  doc.save(`${options.filename}.pdf`);
}

// Helper: format number for export (plain number, not currency string)
export const fmtN = (v: number | null | undefined, decimals = 2) =>
  v == null ? "—" : Number(v).toFixed(decimals);

export const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${Number(v).toFixed(1)}%`;
