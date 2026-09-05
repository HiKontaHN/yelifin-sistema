import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions } from "@/lib/auth";
import { defaultYearRange, getEventRows } from "@/lib/reports/queries";

const sql = neon(process.env.DATABASE_URL!);

function fmtN(v: number, dec = 2) { return Number(v).toFixed(dec); }

function fmtHNL(v: number, symbol = "L") {
  return `${symbol} ${Number(v).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_LABEL: Record<string, string> = {
  PLANNED:   "Planificado",
  ONGOING:   "En curso",
  COMPLETED: "Completado",
};

async function generatePDF(
  summary: any,
  events: any[],
  symbol: string,
  from: string,
  to: string,
  showCosts: boolean,
  showProfit: boolean,
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
  const C_BAR_PROF : [number, number, number] = [167, 220, 201];
  const C_BAR_EXP  : [number, number, number] = [252, 165, 165];

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

  function shortVal(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
    return String(Math.round(v));
  }

  function drawPageHeader(pageNum: number) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_PRIMARY);
    doc.text("REPORTE DE EVENTOS", MARGIN, 10);
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

  // ── Gráfico horizontal: Ingresos vs. Gastos por evento ───────────────
  function drawEventsChart(startY: number): number {
    const completed = events.filter(e => e.sales_count > 0 || e.status === "COMPLETED").slice(0, 12);
    if (completed.length === 0) return startY;

    const CHART_H  = 58;
    const LABEL_W  = 52;
    const VAL_W    = 22;
    const barAreaW = CONTENT_W - LABEL_W - VAL_W;
    const maxVal   = completed.reduce((m, e) => Math.max(m, Number(e.total_revenue)), 0);
    if (maxVal === 0) return startY;

    const ROW_H  = CHART_H / completed.length;
    const BAR_H  = ROW_H * 0.38;
    const BAR_H2 = ROW_H * 0.2;

    completed.forEach((e, i) => {
      const rowY = startY + i * ROW_H;
      const midY = rowY + ROW_H / 2;
      const barX = MARGIN + LABEL_W;
      const totalGastos = Number(e.fixed_cost) + Number(e.extra_expenses) + Number(e.total_cogs);

      const wRev  = maxVal > 0 ? (Number(e.total_revenue) / maxVal) * barAreaW : 0;
      const wExp  = maxVal > 0 ? (totalGastos / maxVal) * barAreaW : 0;

      if (i % 2 === 1) {
        doc.setFillColor(...C_BG_SUBTLE);
        doc.rect(MARGIN, rowY, CONTENT_W, ROW_H, "F");
      }

      const name = e.name.length > 20 ? e.name.slice(0, 20) + "…" : e.name;
      doc.setFontSize(7);
      doc.setTextColor(50, 50, 50);
      doc.text(name, MARGIN + LABEL_W - 2, midY + 1.5, { align: "right" });

      doc.setFillColor(...C_BAR_REV);
      doc.rect(barX, midY - BAR_H / 2, Math.max(wRev, 0.5), BAR_H, "F");

      if (showProfit) {
        doc.setFillColor(...C_BAR_EXP);
        doc.rect(barX, midY - BAR_H2 / 2, Math.max(wExp, 0.5), BAR_H2, "F");
      }

      doc.setFontSize(6.5);
      doc.setTextColor(...C_PRIMARY);
      doc.text(shortVal(Number(e.total_revenue)), barX + wRev + 1.5, midY + 1.5);
    });

    // Línea divisoria entre etiquetas y barras
    doc.setDrawColor(...C_GRAY_SEC);
    doc.setLineWidth(0.2);
    doc.line(MARGIN + LABEL_W, startY, MARGIN + LABEL_W, startY + CHART_H);

    // Leyenda
    const legY = startY + CHART_H + 3;
    doc.setFontSize(6.5);
    doc.setTextColor(...C_GRAY_SEC);
    doc.setFillColor(...C_BAR_REV);
    doc.rect(MARGIN, legY - 2.5, 5, 2.5, "F");
    doc.text("Ingresos", MARGIN + 6.5, legY);
    doc.setFillColor(...C_BAR_EXP);
    doc.rect(MARGIN + 30, legY - 2.5, 5, 2.5, "F");
    doc.text("Gastos totales", MARGIN + 36.5, legY);

    doc.setTextColor(0, 0, 0);
    return startY + CHART_H + 8;
  }

  // ── Página 1 ──────────────────────────────────────────────────────────
  let page = 1;
  drawPageHeader(page);
  drawPageFooter();
  let y = 24;

  // KPI boxes — gastos/utilidad requieren showProfit, igual que en pantalla
  const kpis = [
    { label: "Eventos",         value: String(summary.total_events),             bg: C_KPI_BLUE,  tc: C_PRIMARY as [number,number,number] },
    { label: "Ingresos totales", value: fmtHNL(summary.total_revenue, symbol),   bg: C_KPI_BLUE,  tc: C_PRIMARY as [number,number,number] },
    ...(showProfit ? [
      { label: "Gastos totales",   value: fmtHNL(summary.total_expenses, symbol),  bg: C_KPI_AMBER, tc: C_AMBER   as [number,number,number] },
      {
        label: "Utilidad neta",
        value: fmtHNL(Math.abs(summary.net_profit), symbol),
        bg: summary.net_profit >= 0 ? C_KPI_GREEN : C_KPI_RED,
        tc: (summary.net_profit >= 0 ? C_GREEN : C_RED) as [number,number,number],
      },
    ] : []),
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

  // Métricas secundarias — costo mercancía requiere showCosts, utilidad bruta requiere showProfit
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Total ventas: ${summary.total_sales}`, MARGIN, y);
  if (showCosts)  doc.text(`Costo mercancía: ${fmtHNL(summary.total_cogs, symbol)}`, MARGIN + CONTENT_W / 3, y);
  if (showProfit) doc.text(`Utilidad bruta: ${fmtHNL(summary.gross_profit, symbol)}`, MARGIN + (CONTENT_W * 2) / 3, y);
  y += 8;

  // Gráfico
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_PRIMARY);
  doc.text("Ingresos vs. gastos por evento", MARGIN, y);
  y += 5;
  y = drawEventsChart(y);

  // Tabla eventos
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_PRIMARY);
  doc.text("Detalle por evento", MARGIN, y);
  y += 5;

  // Columnas de gastos/utilidad requieren showProfit — igual que en pantalla
  const eventCols: { key: string; header: string; align: "left" | "right" | "center"; width?: number; get: (e: any) => any }[] = [
    { key: "name",     header: "Evento",  align: "left",  get: e => e.name },
    { key: "location", header: "Lugar",   align: "left",  width: 28, get: e => e.location || "—" },
    { key: "date",     header: "Fecha",   align: "left",  width: 22, get: e => fmtDate(e.starts_at) },
    { key: "sales",    header: "Ventas",  align: "right", width: 14, get: e => e.sales_count },
    { key: "revenue",  header: `Ingresos (${symbol})`, align: "right", width: 28, get: e => fmtHNL(e.total_revenue, symbol) },
    ...(showProfit ? [
      { key: "fixed_cost",     header: `Gastos fijos (${symbol})`, align: "right" as const, width: 28, get: (e: any) => fmtHNL(e.fixed_cost, symbol) },
      { key: "extra_expenses", header: `Gastos extra (${symbol})`, align: "right" as const, width: 28, get: (e: any) => fmtHNL(e.extra_expenses, symbol) },
      { key: "net_profit",     header: `Utilidad neta (${symbol})`, align: "right" as const, width: 28, get: (e: any) => fmtHNL(Math.abs(Number(e.net_profit)), symbol) },
    ] : []),
    { key: "status", header: "Estado", align: "center", width: 22, get: e => STATUS_LABEL[e.status] ?? e.status },
  ];
  const netProfitColIdx = eventCols.findIndex(c => c.key === "net_profit");
  const statusColIdx    = eventCols.findIndex(c => c.key === "status");

  autoTable(doc, {
    startY: y,
    head:   [eventCols.map(c => c.header)],
    body:   events.map(e => eventCols.map(c => c.get(e))),
    styles:             { fontSize: 7.5, cellPadding: 2.2, font: "helvetica" },
    headStyles:         cleanHeadStyles,
    columnStyles: Object.fromEntries(
      eventCols.map((c, i) => [i, { halign: c.align, ...(c.width ? { cellWidth: c.width } : {}), ...(c.key === "net_profit" ? { fontStyle: "bold" as const } : {}) }])
    ),
    alternateRowStyles: { fillColor: C_BG_SUBTLE },
    margin:             { left: MARGIN, right: MARGIN },
    didParseCell: (data: any) => {
      if (data.section === "body") {
        if (data.column.index === netProfitColIdx) {
          const rawEvent = events[data.row.index];
          if (rawEvent && Number(rawEvent.net_profit) < 0) data.cell.styles.textColor = C_RED;
          else data.cell.styles.textColor = C_GREEN;
        }
        if (data.column.index === statusColIdx) {
          const status = String(data.cell.raw);
          if (status === "Completado")    data.cell.styles.textColor = C_GREEN;
          else if (status === "En curso") data.cell.styles.textColor = C_AMBER;
          else                            data.cell.styles.textColor = C_PRIMARY;
          data.cell.styles.fontStyle = "bold";
        }
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
  const deny = await requireModule(auth.data, 'REPORTS', 'canView', 'EVENTS');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.events');
  if (denyFeature) return denyFeature;

  // Costos/utilidades se redactan del documento igual que en pantalla —
  // no se bloquea la exportación completa por no tener uno de los dos.
  const perms = await getModulePermissions(auth.data, 'REPORTS', 'EVENTS');

  try {
    const { orgId } = auth.data;
    const body       = await request.json();
    const def        = defaultYearRange();
    const from       = (body.from   ?? def.from)  as string;
    const to         = (body.to     ?? def.to)    as string;
    const symbol     = (body.symbol ?? "L")       as string;

    const events = await getEventRows(sql, orgId, from, to);

    const totalRevenue  = events.reduce((a: number, e: any) => a + Number(e.total_revenue), 0);
    const totalCogs     = events.reduce((a: number, e: any) => a + Number(e.total_cogs), 0);
    const totalExpenses = events.reduce((a: number, e: any) => a + Number(e.fixed_cost) + Number(e.extra_expenses), 0);
    const totalProfit   = events.reduce((a: number, e: any) => a + Number(e.net_profit), 0);
    const totalSales    = events.reduce((a: number, e: any) => a + Number(e.sales_count), 0);

    const summary = {
      total_events:   events.length,
      total_revenue:  totalRevenue,
      total_cogs:     totalCogs,
      total_expenses: totalExpenses,
      gross_profit:   totalRevenue - totalCogs,
      net_profit:     totalProfit,
      total_sales:    totalSales,
    };

    const pdfBuf = await generatePDF(summary, events, symbol, from, to, perms.showCosts, perms.showProfit);

    return new Response(pdfBuf.buffer as ArrayBuffer, {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="Eventos_${from}_${to}.pdf"`,
      },
    });
  } catch (error) {
    console.error("POST /api/reports/events/export:", error);
    return createErrorResponse("Error al generar exportación de eventos", 500);
  }
}
