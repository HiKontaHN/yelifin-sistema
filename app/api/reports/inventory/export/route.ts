import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

function fmtN(v: number, dec = 2) { return Number(v).toFixed(dec); }

function fmtHNL(v: number, symbol = "L") {
  return `${symbol} ${Number(v).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
}

const MOVE_LABEL: Record<string, string> = { IN: "Entrada", OUT: "Salida", ADJUST: "Ajuste" };

async function generatePDF(
  summary: any,
  products: any[],
  movements: any[],
  symbol: string,
): Promise<Uint8Array> {
  const { default: jsPDF }     = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const PAGE_W    = 297;
  const MARGIN    = 14;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const C_PRIMARY  : [number, number, number] = [26,  86, 219];
  const C_GREEN    : [number, number, number] = [5,  150, 105];
  const C_AMBER    : [number, number, number] = [180,  83,   9];
  const C_RED      : [number, number, number] = [185,  28,  28];
  const C_BG_SUBTLE: [number, number, number] = [248, 250, 252];
  const C_GRAY_SEC : [number, number, number] = [107, 114, 128];
  const C_KPI_BLUE : [number, number, number] = [219, 234, 254];
  const C_KPI_GREEN: [number, number, number] = [209, 250, 229];
  const C_KPI_AMBER: [number, number, number] = [254, 243, 199];
  const C_KPI_RED  : [number, number, number] = [254, 226, 226];

  const today = new Date().toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" });

  const cleanHeadStyles = {
    fillColor:  false as unknown as [number, number, number],
    textColor:  C_PRIMARY,
    fontStyle:  "bold" as const,
    fontSize:   8,
    lineColor:  C_PRIMARY,
    lineWidth:  { bottom: 0.3, top: 0, left: 0, right: 0 },
  };

  function drawPageHeader(pageNum: number) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_PRIMARY);
    doc.text("REPORTE DE INVENTARIO", MARGIN, 10);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C_GRAY_SEC);
    doc.text(`HiKonta SaaS  ·  Snapshot al ${today}`, MARGIN, 16);
    doc.text(`Pág. ${pageNum}`, PAGE_W - MARGIN, 16, { align: "right" });
    doc.setDrawColor(...C_PRIMARY);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, 19, PAGE_W - MARGIN, 19);
    doc.setTextColor(0, 0, 0);
  }

  function drawPageFooter() {
    const pY = doc.internal.pageSize.getHeight() - 6;
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN, pY - 2, PAGE_W - MARGIN, pY - 2);
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(`Generado el ${today} · HiKonta SaaS`, MARGIN, pY);
    doc.text("Confidencial — solo para uso interno", PAGE_W - MARGIN, pY, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  // ── Página 1: KPIs + tabla de stock ──────────────────────────────────
  let page = 1;
  drawPageHeader(page);
  drawPageFooter();
  let y = 24;

  // KPI boxes
  const alertCount = summary.low_stock_count + summary.zero_stock_count;
  const kpiW = (CONTENT_W - 9) / 4;
  const kpis = [
    { label: "Productos activos",     value: String(summary.total_products),            bg: C_KPI_BLUE,  tc: C_PRIMARY as [number,number,number] },
    { label: "Unidades en stock",     value: summary.total_stock.toLocaleString("es-HN"), bg: C_KPI_BLUE,  tc: C_PRIMARY as [number,number,number] },
    { label: "Valor en inventario",   value: fmtHNL(summary.total_stock_value, symbol), bg: C_KPI_GREEN, tc: C_GREEN   as [number,number,number] },
    { label: "Stock bajo / agotado",  value: `${summary.low_stock_count} / ${summary.zero_stock_count}`, bg: alertCount > 0 ? C_KPI_RED : C_KPI_GREEN, tc: (alertCount > 0 ? C_RED : C_GREEN) as [number,number,number] },
  ];
  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * (kpiW + 3);
    doc.setFillColor(...kpi.bg);
    doc.roundedRect(x, y, kpiW, 22, 2, 2, "F");
    doc.setTextColor(...C_GRAY_SEC);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(kpi.label.toUpperCase(), x + kpiW / 2, y + 7, { align: "center" });
    doc.setTextColor(...kpi.tc);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(kpi.value, x + kpiW / 2, y + 16, { align: "center" });
  });
  y += 28;

  // Barra visual de stock por valor (top 10)
  const top10 = products.slice(0, 10);
  if (top10.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_PRIMARY);
    doc.text("Top 10 por valor en inventario", MARGIN, y);
    y += 5;

    const LABEL_W = 52;
    const VAL_W   = 28;
    const barAreaW = CONTENT_W - LABEL_W - VAL_W;
    const maxVal  = top10.reduce((m, p) => Math.max(m, Number(p.stock_value)), 0);
    const ROW_H   = 6.5;
    const BAR_H   = ROW_H * 0.55;

    top10.forEach((p, i) => {
      const rowY  = y + i * ROW_H;
      const midY  = rowY + ROW_H / 2;
      const barX  = MARGIN + LABEL_W;
      const wBar  = maxVal > 0 ? (Number(p.stock_value) / maxVal) * barAreaW : 0;

      if (i % 2 === 1) {
        doc.setFillColor(...C_BG_SUBTLE);
        doc.rect(MARGIN, rowY, CONTENT_W, ROW_H, "F");
      }
      const name = p.name.length > 22 ? p.name.slice(0, 22) + "…" : p.name;
      doc.setFontSize(7);
      doc.setTextColor(50, 50, 50);
      doc.text(name, MARGIN + LABEL_W - 2, midY + 1.5, { align: "right" });

      doc.setFillColor(173, 198, 244);
      doc.rect(barX, midY - BAR_H / 2, Math.max(wBar, 0.5), BAR_H, "F");

      doc.setFontSize(6.5);
      doc.setTextColor(...C_PRIMARY);
      doc.text(fmtHNL(p.stock_value, symbol), barX + wBar + 1.5, midY + 1.5);
    });
    y += top10.length * ROW_H + 6;
  }

  // Tabla stock completa
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_PRIMARY);
  doc.text("Stock por producto", MARGIN, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head:   [["Producto", "SKU", "Stock", `Precio (${symbol})`, `Costo prom. (${symbol})`, `Valor inv. (${symbol})`, "Margen %"]],
    body:   products.map(p => [
      p.name,
      p.sku || "—",
      p.stock,
      fmtHNL(p.price, symbol),
      fmtHNL(p.avg_cost, symbol),
      fmtHNL(p.stock_value, symbol),
      p.margin_pct != null ? `${fmtN(p.margin_pct, 1)}%` : "—",
    ]),
    styles:             { fontSize: 7.5, cellPadding: 2.2, font: "helvetica" },
    headStyles:         cleanHeadStyles,
    columnStyles: {
      0: { halign: "left"   },
      1: { halign: "left",   cellWidth: 22 },
      2: { halign: "right",  cellWidth: 14 },
      3: { halign: "right",  cellWidth: 28 },
      4: { halign: "right",  cellWidth: 28 },
      5: { halign: "right",  cellWidth: 30, fontStyle: "bold" },
      6: { halign: "center", cellWidth: 18 },
    },
    alternateRowStyles: { fillColor: C_BG_SUBTLE },
    margin:             { left: MARGIN, right: MARGIN },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 2) {
        const stock = Number(data.cell.raw);
        if (stock === 0)      data.cell.styles.textColor = C_RED;
        else if (stock <= 5)  data.cell.styles.textColor = C_AMBER;
        if (stock <= 5) data.cell.styles.fontStyle = "bold";
      }
      if (data.section === "body" && data.column.index === 6 && data.cell.raw !== "—") {
        const pct = parseFloat(String(data.cell.raw));
        if (pct >= 30)      data.cell.styles.textColor = C_GREEN;
        else if (pct >= 10) data.cell.styles.textColor = C_AMBER;
        else                data.cell.styles.textColor = C_RED;
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) {
        page++;
        drawPageHeader(page);
        drawPageFooter();
      }
    },
  });

  // ── Página: Movimientos ───────────────────────────────────────────────
  if (movements.length > 0) {
    doc.addPage();
    page++;
    drawPageHeader(page);
    drawPageFooter();
    y = 28;

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_PRIMARY);
    doc.text("Movimientos de inventario — últimos 30 días", MARGIN, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head:   [["Fecha", "Tipo", "Producto", "SKU", "Cantidad", "Referencia", "Notas"]],
      body:   movements.map(m => [
        fmtDate(m.created_at),
        MOVE_LABEL[m.movement_type] ?? m.movement_type,
        m.product_name,
        m.sku || "—",
        m.quantity,
        m.reference_type,
        m.notes || "—",
      ]),
      styles:             { fontSize: 7.5, cellPadding: 2, font: "helvetica" },
      headStyles:         cleanHeadStyles,
      columnStyles: {
        0: { halign: "left",  cellWidth: 22 },
        1: { halign: "center", cellWidth: 18 },
        2: { halign: "left"  },
        3: { halign: "left",  cellWidth: 22 },
        4: { halign: "right", cellWidth: 18 },
        5: { halign: "left",  cellWidth: 30 },
        6: { halign: "left"  },
      },
      alternateRowStyles: { fillColor: C_BG_SUBTLE },
      margin:             { left: MARGIN, right: MARGIN },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === 1) {
          const t = String(data.cell.raw);
          if (t === "Entrada") data.cell.styles.textColor = C_GREEN;
          else if (t === "Salida") data.cell.styles.textColor = C_RED;
          else data.cell.styles.textColor = C_AMBER;
          data.cell.styles.fontStyle = "bold";
        }
        if (data.section === "body" && data.column.index === 4) {
          data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawPage: (data: any) => {
        if (data.pageNumber > 1) {
          page++;
          drawPageHeader(page);
          drawPageFooter();
        }
      },
    });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

// ── Route handler ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'REPORTS', 'canView');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.inventory');
  if (denyFeature) return denyFeature;

  // El documento exportado incluye costos y márgenes — requiere ambos permisos
  const perms = await getModulePermissions(auth.data, 'REPORTS');
  if (!perms.showCosts || !perms.showProfit) {
    return createErrorResponse("Tu rol no tiene permiso para exportar este reporte (incluye costos y márgenes)", 403);
  }

  try {
    const { userId, orgId } = auth.data;
    const body       = await request.json();
    const symbol     = (body.symbol ?? "L") as string;

    const products = await sql`
      SELECT
        p.id,
        p.name,
        COALESCE(p.sku, '')                                                    AS sku,
        p.price::float,
        COALESCE(SUM(ib.qty_available), 0)::int                               AS stock,
        CASE
          WHEN COALESCE(SUM(ib.qty_available), 0) > 0
          THEN (SUM(ib.qty_available * ib.unit_cost) / SUM(ib.qty_available))::float
          ELSE 0
        END                                                                    AS avg_cost,
        COALESCE(SUM(ib.qty_available * ib.unit_cost), 0)::float             AS stock_value,
        CASE
          WHEN p.price > 0 AND COALESCE(SUM(ib.qty_available), 0) > 0
          THEN ROUND(100.0 * (p.price - SUM(ib.qty_available * ib.unit_cost) / SUM(ib.qty_available)) / p.price, 1)::float
          ELSE null
        END                                                                    AS margin_pct
      FROM products p
      LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.org_id = p.org_id
      WHERE p.org_id    = ${orgId}
        AND p.is_active   = TRUE
        AND p.is_service  = FALSE
      GROUP BY p.id, p.name, p.sku, p.price
      ORDER BY stock_value DESC
    `;

    const movements = await sql`
      SELECT
        im.created_at::text,
        im.movement_type,
        p.name                    AS product_name,
        COALESCE(p.sku, '')       AS sku,
        im.quantity::int,
        im.reference_type,
        im.notes
      FROM inventory_movements im
      JOIN products p ON p.id = im.product_id
      WHERE im.org_id     = ${orgId}
        AND im.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY im.created_at DESC
      LIMIT 200
    `;

    const totalStockValue = products.reduce((a: number, p: any) => a + Number(p.stock_value), 0);
    const totalStock      = products.reduce((a: number, p: any) => a + Number(p.stock), 0);
    const lowStockCount   = products.filter((p: any) => Number(p.stock) > 0 && Number(p.stock) <= 5).length;
    const zeroStockCount  = products.filter((p: any) => Number(p.stock) === 0).length;

    const summary = {
      total_products:    products.length,
      total_stock:       totalStock,
      total_stock_value: totalStockValue,
      low_stock_count:   lowStockCount,
      zero_stock_count:  zeroStockCount,
    };

    const pdfBuf = await generatePDF(summary, products, movements, symbol);
    const today  = new Date().toISOString().slice(0, 10);

    return new Response(pdfBuf.buffer as ArrayBuffer, {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="Inventario_${today}.pdf"`,
      },
    });
  } catch (error) {
    console.error("POST /api/reports/inventory/export:", error);
    return createErrorResponse("Error al generar exportación de inventario", 500);
  }
}
