import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions } from "@/lib/auth";
import { defaultYearRange, getProfitSummary, getProfitByMonth, getProfitByProduct, getOperatingExpenses } from "@/lib/reports/queries";

const sql = neon(process.env.DATABASE_URL!);

function fmtN(v: number, dec = 2) { return Number(v).toFixed(dec); }

function fmtHNL(v: number, symbol = "L") {
  return `${symbol} ${Number(v).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
}

function shortVal(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

async function generatePDF(
  summary: any,
  byMonth: any[],
  byProduct: any[],
  expenses: any,
  symbol: string,
  from: string,
  to: string,
  showCosts: boolean,
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
  const C_KPI_RED  : [number, number, number] = [254, 226, 226];
  const C_KPI_AMBER: [number, number, number] = [254, 243, 199];
  const C_BAR_REV  : [number, number, number] = [173, 198, 244];
  const C_BAR_COGS : [number, number, number] = [252, 165, 165];
  const C_BAR_PROF : [number, number, number] = [167, 220, 201];

  const periodLabel = `${fmtDate(from)} — ${fmtDate(to)}`;
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
    doc.text("REPORTE DE RENTABILIDAD", MARGIN, 10);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C_GRAY_SEC);
    doc.text(`HiKonta SaaS  ·  ${periodLabel}`, MARGIN, 16);
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

  // ── Gráfico mensual ───────────────────────────────────────────────────
  function drawMonthlyChart(startY: number): number {
    if (byMonth.length === 0) return startY;

    const CHART_H = 46;
    const AXIS_W  = 18;
    const plotW   = CONTENT_W - AXIS_W;
    const plotH   = CHART_H - 8;
    const maxVal  = byMonth.reduce((m, d) => Math.max(m, d.revenue, showCosts ? d.cogs : 0, d.profit), 0);
    if (maxVal === 0) return startY;

    const TICKS   = 4;
    const n       = byMonth.length;
    const groupW  = plotW / n;
    const BAR_W   = Math.min(groupW * 0.26, 6);
    const GAP     = groupW * 0.04;
    const plotX   = MARGIN + AXIS_W;
    const plotY   = startY;
    const baseY   = plotY + plotH;

    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    for (let t = 0; t <= TICKS; t++) {
      const yG = baseY - (t / TICKS) * plotH;
      doc.line(plotX, yG, plotX + plotW, yG);
      doc.setFontSize(6);
      doc.setTextColor(...C_GRAY_SEC);
      doc.text(shortVal((t / TICKS) * maxVal), plotX - 1, yG + 1, { align: "right" });
    }

    doc.setLineWidth(0);
    byMonth.forEach((d, i) => {
      const cx    = plotX + i * groupW + groupW / 2;
      const hRev  = (d.revenue / maxVal) * plotH;
      const hCogs = showCosts ? (d.cogs / maxVal) * plotH : 0;
      const hProf = Math.max((d.profit / maxVal) * plotH, 0);

      doc.setFillColor(...C_BAR_REV);
      doc.rect(cx - BAR_W - GAP, baseY - hRev, BAR_W, Math.max(hRev, 0.3), "F");
      if (showCosts) {
        doc.setFillColor(...C_BAR_COGS);
        doc.rect(cx,               baseY - hCogs, BAR_W, Math.max(hCogs, 0.3), "F");
      }
      doc.setFillColor(...C_BAR_PROF);
      doc.rect(cx + BAR_W + GAP, baseY - hProf, BAR_W, Math.max(hProf, 0.3), "F");

      const step = n > 10 ? Math.ceil(n / 10) : 1;
      if (i % step === 0) {
        doc.setFontSize(6);
        doc.setTextColor(...C_GRAY_SEC);
        doc.text(d.month_label.slice(0, 6), cx, baseY + 4, { align: "center" });
      }
    });

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(plotX, baseY, plotX + plotW, baseY);

    const legY = plotY + CHART_H - 1;
    doc.setFontSize(6.5);
    doc.setTextColor(...C_GRAY_SEC);
    doc.setFillColor(...C_BAR_REV);  doc.rect(plotX, legY - 2.5, 5, 2.5, "F");
    doc.text("Ingresos", plotX + 6.5, legY);
    if (showCosts) {
      doc.setFillColor(...C_BAR_COGS); doc.rect(plotX + 34, legY - 2.5, 5, 2.5, "F");
      doc.text("Costo", plotX + 40.5, legY);
    }
    doc.setFillColor(...C_BAR_PROF); doc.rect(plotX + (showCosts ? 68 : 34), legY - 2.5, 5, 2.5, "F");
    doc.text("Utilidad", plotX + (showCosts ? 74.5 : 40.5), legY);

    doc.setTextColor(0, 0, 0);
    return startY + CHART_H + 4;
  }

  // ── Página 1: KPIs + gráfico mensual + productos ──────────────────────
  let page = 1;
  drawPageHeader(page);
  drawPageFooter();
  let y = 24;

  // KPI boxes — "Costo mercancía" requiere showCosts, igual que en pantalla
  const kpis = [
    { label: "Ingresos brutos",  value: fmtHNL(summary.revenue, symbol),       bg: C_KPI_BLUE,  tc: C_PRIMARY as [number,number,number] },
    ...(showCosts ? [{ label: "Costo mercancía",  value: fmtHNL(summary.cogs, symbol),           bg: C_KPI_RED,   tc: C_RED     as [number,number,number] }] : []),
    { label: "Utilidad bruta",   value: fmtHNL(summary.gross_profit, symbol),   bg: C_KPI_GREEN, tc: C_GREEN   as [number,number,number] },
    {
      label: "Margen bruto",
      value: `${fmtN(summary.margin_pct, 1)}%`,
      bg: summary.margin_pct >= 20 ? C_KPI_GREEN : summary.margin_pct >= 10 ? C_KPI_AMBER : C_KPI_RED,
      tc: (summary.margin_pct >= 20 ? C_GREEN : summary.margin_pct >= 10 ? C_AMBER : C_RED) as [number,number,number],
    },
  ];
  const kpiW = (CONTENT_W - (kpis.length - 1) * 3) / kpis.length;
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

  // Métricas secundarias
  const totalExpenses = expenses?.total_expenses ?? 0;
  const netProfit     = summary.gross_profit - totalExpenses;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Ventas: ${summary.total_sales}`, MARGIN, y);
  doc.text(`Descuentos: ${fmtHNL(summary.total_discount, symbol)}`, MARGIN + CONTENT_W / 3, y);
  if (totalExpenses > 0)
    doc.text(`Otros gastos operativos: ${fmtHNL(totalExpenses, symbol)}`, MARGIN + (CONTENT_W * 2) / 3, y);
  y += 8;

  // Gráfico mensual
  if (byMonth.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_PRIMARY);
    doc.text("Ingresos, costo y utilidad por mes", MARGIN, y);
    y += 5;
    y = drawMonthlyChart(y);
  }

  // Tabla por mes
  if (byMonth.length > 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_PRIMARY);
    doc.text("Rentabilidad mensual", MARGIN, y);
    y += 5;

    const monthCols: { key: string; header: string; align: "left" | "right" | "center"; width?: number; get: (m: any) => any }[] = [
      { key: "month",   header: "Mes",    align: "left",  get: m => m.month_label },
      { key: "sales",   header: "Ventas", align: "right", width: 18, get: m => m.sales_count },
      { key: "revenue", header: `Ingresos (${symbol})`, align: "right", get: m => fmtHNL(m.revenue, symbol) },
      ...(showCosts ? [{ key: "cogs", header: `Costo (${symbol})`, align: "right" as const, get: (m: any) => fmtHNL(m.cogs, symbol) }] : []),
      { key: "profit",  header: `Utilidad (${symbol})`, align: "right", get: m => fmtHNL(m.profit, symbol) },
      { key: "margin",  header: "Margen %", align: "right", width: 18, get: m => {
        const pct = m.revenue > 0 ? 100 * m.profit / m.revenue : 0;
        return `${fmtN(pct, 1)}%`;
      } },
    ];
    const monthMarginColIdx = monthCols.findIndex(c => c.key === "margin");

    autoTable(doc, {
      startY: y,
      head:   [monthCols.map(c => c.header)],
      body:   byMonth.map(m => monthCols.map(c => c.get(m))),
      styles:             { fontSize: 8, cellPadding: 2.5, font: "helvetica" },
      headStyles:         cleanHeadStyles,
      columnStyles: Object.fromEntries(
        monthCols.map((c, i) => [i, { halign: c.align, ...(c.width ? { cellWidth: c.width } : {}), ...(c.key === "profit" ? { fontStyle: "bold" as const } : {}) }])
      ),
      alternateRowStyles: { fillColor: C_BG_SUBTLE },
      margin:             { left: MARGIN, right: MARGIN },
      didParseCell: (data: any) => {
        if (data.section === "body" && data.column.index === monthMarginColIdx) {
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
  }

  // ── Página siguiente: por producto ────────────────────────────────────
  doc.addPage();
  page++;
  drawPageHeader(page);
  drawPageFooter();
  y = 28;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_PRIMARY);
  doc.text("Rentabilidad por producto", MARGIN, y);
  y += 5;

  const productCols: { key: string; header: string; align: "left" | "right" | "center"; width?: number; get: (p: any) => any }[] = [
    { key: "name", header: "Producto", align: "left",  get: p => p.product_name },
    { key: "sku",  header: "SKU",      align: "left",  width: 22, get: p => p.sku || "—" },
    { key: "qty",  header: "Cant.",    align: "right", width: 14, get: p => p.qty_sold },
    { key: "revenue", header: `Ingresos (${symbol})`, align: "right", get: p => fmtHNL(p.revenue, symbol) },
    ...(showCosts ? [{ key: "cogs", header: `Costo (${symbol})`, align: "right" as const, get: (p: any) => fmtHNL(p.cogs, symbol) }] : []),
    { key: "profit", header: `Utilidad (${symbol})`, align: "right", get: p => fmtHNL(p.profit, symbol) },
    { key: "margin", header: "Margen %", align: "center", width: 18, get: p => `${fmtN(p.margin_pct, 1)}%` },
  ];
  const productProfitColIdx = productCols.findIndex(c => c.key === "profit");
  const productMarginColIdx = productCols.findIndex(c => c.key === "margin");

  autoTable(doc, {
    startY: y,
    head:   [productCols.map(c => c.header)],
    body:   byProduct.map(p => productCols.map(c => c.get(p))),
    styles:             { fontSize: 7.5, cellPadding: 2.2, font: "helvetica" },
    headStyles:         cleanHeadStyles,
    columnStyles: Object.fromEntries(
      productCols.map((c, i) => [i, { halign: c.align, ...(c.width ? { cellWidth: c.width } : {}), ...(i === productProfitColIdx ? { fontStyle: "bold" as const, textColor: C_GREEN } : {}) }])
    ),
    alternateRowStyles: { fillColor: C_BG_SUBTLE },
    margin:             { left: MARGIN, right: MARGIN },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === productMarginColIdx) {
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

  return new Uint8Array(doc.output("arraybuffer"));
}

// ── Route handler ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'REPORTS', 'canView', 'PROFIT');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.profit');
  if (denyFeature) return denyFeature;

  // Este reporte es 100% costos/ganancias — igual que el GET, requiere
  // showProfit para exportar en absoluto; showCosts solo redacta el costo
  // (cogs) dentro del documento, igual que en pantalla.
  const perms = await getModulePermissions(auth.data, 'REPORTS', 'PROFIT');
  if (!perms.showProfit) {
    return createErrorResponse("Tu rol no tiene permiso para exportar este reporte (incluye ganancias)", 403);
  }

  try {
    const { orgId } = auth.data;
    const body       = await request.json();
    const def        = defaultYearRange();
    const from       = (body.from   ?? def.from)  as string;
    const to         = (body.to     ?? def.to)    as string;
    const symbol     = (body.symbol ?? "L")       as string;

    const [summary, byMonth, byProduct, expenses] = await Promise.all([
      getProfitSummary(sql, orgId, from, to),
      getProfitByMonth(sql, orgId, from, to),
      getProfitByProduct(sql, orgId, from, to),
      getOperatingExpenses(sql, orgId, from, to),
    ]);

    const pdfBuf = await generatePDF(summary, byMonth, byProduct, expenses, symbol, from, to, perms.showCosts);

    return new Response(pdfBuf.buffer as ArrayBuffer, {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="Rentabilidad_${from}_${to}.pdf"`,
      },
    });
  } catch (error) {
    console.error("POST /api/reports/profit/export:", error);
    return createErrorResponse("Error al generar exportación de rentabilidad", 500);
  }
}
