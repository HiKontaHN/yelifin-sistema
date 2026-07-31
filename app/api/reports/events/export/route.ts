import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions } from "@/lib/auth";

const sql = neon(process.env.DATABASE_URL!);

function fmtN(v: number, dec = 2) { return Number(v).toFixed(dec); }

function fmtHNL(v: number, symbol = "L") {
  return `${symbol} ${Number(v).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" });
}

function defaultRange() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to   = new Date(now.getFullYear(), 11, 31).toISOString().slice(0, 10);
  return { from, to };
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

      doc.setFillColor(...C_BAR_EXP);
      doc.rect(barX, midY - BAR_H2 / 2, Math.max(wExp, 0.5), BAR_H2, "F");

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

  // KPI boxes
  const kpiW = (CONTENT_W - 9) / 4;
  const kpis = [
    { label: "Eventos",         value: String(summary.total_events),             bg: C_KPI_BLUE,  tc: C_PRIMARY as [number,number,number] },
    { label: "Ingresos totales", value: fmtHNL(summary.total_revenue, symbol),   bg: C_KPI_BLUE,  tc: C_PRIMARY as [number,number,number] },
    { label: "Gastos totales",   value: fmtHNL(summary.total_expenses, symbol),  bg: C_KPI_AMBER, tc: C_AMBER   as [number,number,number] },
    {
      label: "Utilidad neta",
      value: fmtHNL(Math.abs(summary.net_profit), symbol),
      bg: summary.net_profit >= 0 ? C_KPI_GREEN : C_KPI_RED,
      tc: (summary.net_profit >= 0 ? C_GREEN : C_RED) as [number,number,number],
    },
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

  // Métricas secundarias
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`Total ventas: ${summary.total_sales}`, MARGIN, y);
  doc.text(`Costo mercancía: ${fmtHNL(summary.total_cogs, symbol)}`, MARGIN + CONTENT_W / 3, y);
  doc.text(`Utilidad bruta: ${fmtHNL(summary.gross_profit, symbol)}`, MARGIN + (CONTENT_W * 2) / 3, y);
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

  autoTable(doc, {
    startY: y,
    head:   [["Evento", "Lugar", "Fecha", "Ventas", `Ingresos (${symbol})`, `Gastos fijos (${symbol})`, `Gastos extra (${symbol})`, `Utilidad neta (${symbol})`, "Estado"]],
    body:   events.map(e => [
      e.name,
      e.location || "—",
      fmtDate(e.starts_at),
      e.sales_count,
      fmtHNL(e.total_revenue, symbol),
      fmtHNL(e.fixed_cost, symbol),
      fmtHNL(e.extra_expenses, symbol),
      fmtHNL(Math.abs(Number(e.net_profit)), symbol),
      STATUS_LABEL[e.status] ?? e.status,
    ]),
    styles:             { fontSize: 7.5, cellPadding: 2.2, font: "helvetica" },
    headStyles:         cleanHeadStyles,
    columnStyles: {
      0: { halign: "left"   },
      1: { halign: "left",   cellWidth: 28 },
      2: { halign: "left",   cellWidth: 22 },
      3: { halign: "right",  cellWidth: 14 },
      4: { halign: "right",  cellWidth: 28 },
      5: { halign: "right",  cellWidth: 28 },
      6: { halign: "right",  cellWidth: 28 },
      7: { halign: "right",  cellWidth: 28, fontStyle: "bold" },
      8: { halign: "center", cellWidth: 22 },
    },
    alternateRowStyles: { fillColor: C_BG_SUBTLE },
    margin:             { left: MARGIN, right: MARGIN },
    didParseCell: (data: any) => {
      if (data.section === "body") {
        if (data.column.index === 7) {
          const rawEvent = events[data.row.index];
          if (rawEvent && Number(rawEvent.net_profit) < 0) data.cell.styles.textColor = C_RED;
          else data.cell.styles.textColor = C_GREEN;
        }
        if (data.column.index === 8) {
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
  const deny = await requireModule(auth.data, 'REPORTS', 'canView');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.events');
  if (denyFeature) return denyFeature;

  // El documento exportado incluye costos y utilidades — requiere ambos permisos
  const perms = await getModulePermissions(auth.data, 'REPORTS');
  if (!perms.showCosts || !perms.showProfit) {
    return createErrorResponse("Tu rol no tiene permiso para exportar este reporte (incluye costos y ganancias)", 403);
  }

  try {
    const { userId, orgId } = auth.data;
    const body       = await request.json();
    const def        = defaultRange();
    const from       = (body.from   ?? def.from)  as string;
    const to         = (body.to     ?? def.to)    as string;
    const symbol     = (body.symbol ?? "L")       as string;

    const events = await sql`
      SELECT
        e.id,
        e.name,
        COALESCE(e.location, '')                                               AS location,
        e.starts_at::text,
        COALESCE(e.fixed_cost, 0)::float                                       AS fixed_cost,
        COUNT(DISTINCT s.id)::int                                              AS sales_count,
        COALESCE(SUM(s.total), 0)::float                                       AS total_revenue,
        COALESCE(SUM(si.unit_cost * si.quantity), 0)::float                   AS total_cogs,
        COALESCE((
          SELECT SUM(t.amount) FROM transactions t
          WHERE t.reference_type = 'EVENT' AND t.reference_id = e.id
            AND t.type = 'EXPENSE' AND t.org_id = e.org_id
        ), 0)::float AS extra_expenses,
        COALESCE(SUM(s.total), 0)
          - COALESCE(SUM(si.unit_cost * si.quantity), 0)
          - COALESCE(e.fixed_cost, 0)
          - COALESCE((
              SELECT SUM(t.amount) FROM transactions t
              WHERE t.reference_type = 'EVENT' AND t.reference_id = e.id
                AND t.type = 'EXPENSE' AND t.org_id = e.org_id
            ), 0) AS net_profit,
        CASE
          WHEN NOW() < e.starts_at                      THEN 'PLANNED'
          WHEN NOW() BETWEEN e.starts_at AND e.ends_at  THEN 'ONGOING'
          ELSE                                               'COMPLETED'
        END AS status
      FROM events e
      LEFT JOIN sales      s  ON s.event_id = e.id AND s.status = 'COMPLETED' AND s.org_id = e.org_id
      LEFT JOIN sale_items si ON si.sale_id = s.id AND si.org_id = e.org_id
      WHERE e.org_id     = ${orgId}
        AND e.starts_at >= ${from}::date
        AND e.starts_at <  (${to}::date + INTERVAL '1 day')
      GROUP BY e.id, e.name, e.location, e.starts_at, e.ends_at, e.fixed_cost, e.notes, e.org_id
      ORDER BY e.starts_at DESC
    `;

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

    const pdfBuf = await generatePDF(summary, events, symbol, from, to);

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
