import { NextRequest } from "next/server";
import { neon } from "@neondatabase/serverless";
import { verifyAuth, createErrorResponse, isAuthSuccess, requireModule, requireFeature, getModulePermissions } from "@/lib/auth";
import { defaultMonthRange, getSalesSummary, getSalesByDay, getSalesByProduct, getSalesDetail } from "@/lib/reports/queries";

const sql = neon(process.env.DATABASE_URL!);

const PAYMENT_LABEL: Record<string, string> = {
  CASH:        "Efectivo",
  CARD:        "Tarjeta débito",
  TRANSFER:    "Transferencia",
  CREDIT:      "Crédito",
  CREDIT_CARD: "Tarjeta crédito",
};

function fmtN(v: number, dec = 2) {
  return Number(v).toFixed(dec);
}

function fmtHNL(v: number, symbol = "L") {
  return `${symbol} ${Number(v).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-HN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Colores corporativos (Excel hex) ──────────────────────────────────
const COLORS = {
  primary:     "1A56DB",
  primaryDark: "1E429F",
  secondary:   "0E9F6E",
  headerBg:    "1A56DB",
  headerText:  "FFFFFF",
  subheadBg:   "EBF5FB",
  subheadText: "1E429F",
  altRow:      "F8FAFC",
  white:       "FFFFFF",
  border:      "D1D5DB",
  green:       "065F46",
  greenBg:     "D1FAE5",
  amber:       "92400E",
  amberBg:     "FEF3C7",
  red:         "991B1B",
  redBg:       "FEE2E2",
  kpiBlue:     "DBEAFE",
  kpiGreen:    "D1FAE5",
  kpiAmber:    "FEF3C7",
  textDark:    "111827",
  textMid:     "4B5563",
  gold:        "FFF8E1",
  barBlue:     "DBEAFe",
};

// Placeholder neutro para costos/ganancias cuando el rol no tiene el
// permiso — mantiene la estructura de columnas/merges intacta (a
// diferencia de omitir la columna), evitando romper los rangos de celdas
// combinadas de este archivo, calculados a mano por índice de columna.
const REDACTED = "—";

function marginColor(pct: number) {
  if (pct >= 30) return { fg: COLORS.green,  bg: COLORS.greenBg };
  if (pct >= 10) return { fg: COLORS.amber,  bg: COLORS.amberBg };
  return              { fg: COLORS.red,    bg: COLORS.redBg   };
}

// ── Tipos de celda ─────────────────────────────────────────────────────
function cell(
  value: string | number,
  opts: {
    bold?:   boolean;
    italic?: boolean;
    sz?:     number;
    fg?:     string;
    bg?:     string;
    align?:  "left" | "center" | "right";
    border?: boolean;
    wrap?:   boolean;
    numFmt?: string;
  } = {}
) {
  const t = typeof value === "number" ? "n" : "s";
  return {
    v: value,
    t,
    s: {
      font: {
        bold:   opts.bold   ?? false,
        italic: opts.italic ?? false,
        sz:     opts.sz     ?? 10,
        color:  opts.fg ? { rgb: opts.fg } : { rgb: COLORS.textDark },
        name:   "Calibri",
      },
      fill: opts.bg
        ? { patternType: "solid", fgColor: { rgb: opts.bg } }
        : { patternType: "none" },
      alignment: {
        horizontal: opts.align ?? "left",
        vertical:   "center",
        wrapText:   opts.wrap ?? false,
      },
      border: opts.border ? {
        top:    { style: "thin", color: { rgb: COLORS.border } },
        bottom: { style: "thin", color: { rgb: COLORS.border } },
        left:   { style: "thin", color: { rgb: COLORS.border } },
        right:  { style: "thin", color: { rgb: COLORS.border } },
      } : {},
      numFmt: opts.numFmt,
    },
  };
}

function headerCell(value: string, align: "left" | "center" | "right" = "left") {
  return cell(value, {
    bold:   true,
    sz:     10,
    fg:     COLORS.headerText,
    bg:     COLORS.headerBg,
    align,
    border: true,
  });
}

function subHeaderCell(value: string, align: "left" | "center" | "right" = "left") {
  return cell(value, {
    bold:   true,
    sz:     10,
    fg:     COLORS.subheadText,
    bg:     COLORS.subheadBg,
    align,
    border: true,
  });
}

function sectionTitleCell(value: string) {
  return cell(value, {
    bold: true,
    sz:   12,
    fg:   COLORS.primaryDark,
    bg:   COLORS.white,
  });
}

// ── Asignar celda en hoja ──────────────────────────────────────────────
function setCell(ws: Record<string, any>, col: number, row: number, c: any) {
  const addr = colLetter(col) + row;
  ws[addr] = c;
  updateRange(ws, col, row);
}

function colLetter(n: number): string {
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function updateRange(ws: Record<string, any>, col: number, row: number) {
  if (!ws["!ref"]) {
    ws["!ref"] = `A1:${colLetter(col)}${row}`;
    return;
  }
  const { s, e } = parseRange(ws["!ref"]);
  const newS = { c: Math.min(s.c, col), r: Math.min(s.r, row - 1) };
  const newE = { c: Math.max(e.c, col), r: Math.max(e.r, row - 1) };
  ws["!ref"] = `${colLetter(newS.c)}${newS.r + 1}:${colLetter(newE.c)}${newE.r + 1}`;
}

function colIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function parseRange(ref: string) {
  const [start, end] = ref.split(":");
  return {
    s: { c: colIndex(start.replace(/\d+$/, "")), r: parseInt(start.replace(/\D/g, "")) - 1 },
    e: { c: colIndex(end.replace(/\d+$/, "")),   r: parseInt(end.replace(/\D/g, ""))   - 1 },
  };
}

function merge(ws: Record<string, any>, sc: number, sr: number, ec: number, er: number) {
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"].push({ s: { c: sc, r: sr }, e: { c: ec, r: er } });
}

// ── Valor corto para eje ────────────────────────────────────────────────
function shortVal(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

// ── Hoja 1: Dashboard ──────────────────────────────────────────────────
function buildDashboardSheet(
  summary: any,
  byDay: any[],
  symbol: string,
  from: string,
  to: string,
  periodLabel: string,
  showCosts: boolean,
  showProfit: boolean,
): Record<string, any> {
  const ws: Record<string, any> = {};
  let r = 1;

  // Título principal (filas 1-2)
  setCell(ws, 0, r, cell("REPORTE DE VENTAS — HIKONTA", { bold: true, sz: 16, fg: COLORS.primaryDark, bg: COLORS.white }));
  merge(ws, 0, r - 1, 9, r - 1);
  r++;

  setCell(ws, 0, r, cell(periodLabel, { italic: true, sz: 10, fg: COLORS.textMid, bg: COLORS.white }));
  merge(ws, 0, r - 1, 9, r - 1);
  r++;

  setCell(ws, 0, r, cell(`Generado: ${new Date().toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" } as any)}`, { italic: true, sz: 9, fg: COLORS.textMid }));
  merge(ws, 0, r - 1, 9, r - 1);
  r++;

  // Fila separadora
  r++;

  // ── KPIs en cajas (filas 4-7, cada KPI ocupa 2 cols × 2 filas) ──────
  const marginPct = summary.total_revenue > 0
    ? 100 * summary.gross_profit / summary.total_revenue
    : 0;

  const kpis = [
    { label: "Total ventas",    value: String(summary.total_sales),                bg: COLORS.kpiBlue,  col: 0 },
    { label: "Ingresos brutos", value: fmtHNL(summary.total_revenue, symbol),     bg: COLORS.kpiBlue,  col: 2 },
    { label: "Utilidad bruta",  value: showProfit ? fmtHNL(summary.gross_profit, symbol) : REDACTED,     bg: COLORS.kpiGreen, col: 4 },
    { label: "Margen bruto",    value: showProfit ? `${fmtN(marginPct, 1)}%` : REDACTED,                  bg: marginPct >= 20 ? COLORS.kpiGreen : COLORS.kpiAmber, col: 6 },
  ];

  for (const kpi of kpis) {
    setCell(ws, kpi.col, r, cell(kpi.label, { bold: true, sz: 9, fg: COLORS.textMid, bg: kpi.bg, align: "center" }));
    merge(ws, kpi.col, r - 1, kpi.col + 1, r - 1);
  }
  r++;

  for (const kpi of kpis) {
    setCell(ws, kpi.col, r, cell(kpi.value, { bold: true, sz: 14, fg: COLORS.primaryDark, bg: kpi.bg, align: "center" }));
    merge(ws, kpi.col, r - 1, kpi.col + 1, r - 1);
  }
  r++;

  // Fila separadora
  r++;

  // ── Métricas adicionales (filas 9-11) ────────────────────────────────
  const extras = [
    { label: "Descuentos otorgados", value: fmtHNL(summary.total_discount, symbol), col: 0 },
    { label: "Costo mercancía",      value: showCosts ? fmtHNL(summary.total_cogs, symbol) : REDACTED, col: 2 },
    { label: "Promedio x venta",     value: summary.total_sales > 0 ? fmtHNL(summary.total_revenue / summary.total_sales, symbol) : "—", col: 4 },
    { label: "Período",              value: `${from} → ${to}`, col: 6 },
  ];
  for (const e of extras) {
    setCell(ws, e.col, r, cell(e.label, { sz: 8, fg: COLORS.textMid, bg: COLORS.altRow }));
    merge(ws, e.col, r - 1, e.col + 1, r - 1);
  }
  r++;
  for (const e of extras) {
    setCell(ws, e.col, r, cell(e.value, { bold: true, sz: 10, fg: COLORS.textDark, bg: COLORS.white }));
    merge(ws, e.col, r - 1, e.col + 1, r - 1);
  }
  r++;

  // Fila separadora
  r++;

  // ── Tabla: ingresos por día ───────────────────────────────────────────
  setCell(ws, 0, r, sectionTitleCell("Ventas por día — detalle"));
  merge(ws, 0, r - 1, 5, r - 1);
  r++;

  const dayCols = ["Fecha", "N.° Ventas", `Ingresos (${symbol})`, `Utilidad (${symbol})`, "Margen %", "Acum. Ingresos"];
  dayCols.forEach((col, i) => setCell(ws, i, r, headerCell(col, i >= 1 ? "right" : "left")));
  r++;

  let acum = 0;
  byDay.forEach((d, idx) => {
    const isAlt = idx % 2 === 1;
    const bg    = isAlt ? COLORS.altRow : COLORS.white;
    const dPct  = d.revenue > 0 ? 100 * d.profit / d.revenue : 0;
    acum += d.revenue;

    setCell(ws, 0, r, cell(fmtDate(d.date),           { bg, border: true }));
    setCell(ws, 1, r, cell(d.sales_count,              { bg, border: true, align: "right" }));
    setCell(ws, 2, r, cell(fmtHNL(d.revenue, symbol), { bg, border: true, align: "right" }));
    setCell(ws, 3, r, cell(showProfit ? fmtHNL(d.profit, symbol) : REDACTED, { bg, border: true, align: "right" }));
    setCell(ws, 4, r, cell(showProfit ? `${fmtN(dPct, 1)}%` : REDACTED,     { bg, border: true, align: "right" }));
    setCell(ws, 5, r, cell(fmtHNL(acum,      symbol), { bg, border: true, align: "right", bold: true }));
    r++;
  });

  ws["!cols"] = [
    { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
  ];

  ws["!rows"] = [
    { hpt: 28 }, { hpt: 16 }, { hpt: 14 }, {},
    { hpt: 20 }, { hpt: 30 }, {}, { hpt: 18 }, { hpt: 26 },
  ];

  return ws;
}

// ── Hoja 2: Productos ──────────────────────────────────────────────────
function buildProductsSheet(byProduct: any[], symbol: string, showCosts: boolean, showProfit: boolean): Record<string, any> {
  const ws: Record<string, any> = {};
  let r = 1;

  setCell(ws, 0, r, cell("PRODUCTOS MÁS VENDIDOS", { bold: true, sz: 13, fg: COLORS.primaryDark }));
  merge(ws, 0, r - 1, 9, r - 1);
  r += 2;

  const totalRevenue = byProduct.reduce((s, p) => s + p.revenue, 0);
  const maxRevenue   = byProduct.length > 0 ? byProduct[0].revenue : 1; // ya viene ordenado por revenue DESC

  const cols = ["#", "Producto", "SKU", "Cant. vendida", `Ingresos (${symbol})`, `Costo (${symbol})`, `Utilidad (${symbol})`, "Margen %", "Part. %", "Barra"];
  cols.forEach((c, i) => setCell(ws, i, r, headerCell(c, i >= 3 ? "right" : "left")));
  r++;

  byProduct.forEach((p, idx) => {
    const isTop3 = idx < 3;
    const isAlt  = idx % 2 === 1;
    const bg     = isTop3 ? COLORS.gold : (isAlt ? COLORS.altRow : COLORS.white);
    const mc     = marginColor(p.margin_pct);
    const participacion = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
    // Barra visual: █ repetidos proporcional a la participación respecto al top producto
    const barLen = maxRevenue > 0 ? Math.round((p.revenue / maxRevenue) * 20) : 0;
    const barStr = "█".repeat(Math.max(1, barLen));

    setCell(ws, 0, r, cell(idx + 1,                       { bg, border: true, align: "right", bold: isTop3 }));
    setCell(ws, 1, r, cell(p.product_name,                 { bg, border: true, bold: true }));
    setCell(ws, 2, r, cell(p.sku || "—",                   { bg, border: true, fg: COLORS.textMid }));
    setCell(ws, 3, r, cell(p.qty_sold,                     { bg, border: true, align: "right" }));
    setCell(ws, 4, r, cell(fmtHNL(p.revenue, symbol),     { bg, border: true, align: "right" }));
    setCell(ws, 5, r, cell(showCosts  ? fmtHNL(p.cogs,   symbol) : REDACTED, { bg, border: true, align: "right", fg: COLORS.textMid }));
    setCell(ws, 6, r, cell(showProfit ? fmtHNL(p.profit, symbol) : REDACTED, { bg, border: true, align: "right", bold: true, fg: COLORS.secondary }));
    setCell(ws, 7, r, showProfit
      ? cell(`${fmtN(p.margin_pct, 1)}%`, { bg: mc.bg, border: true, align: "center", bold: true, fg: mc.fg })
      : cell(REDACTED,                    { bg,        border: true, align: "center" }));
    setCell(ws, 8, r, cell(`${fmtN(participacion, 1)}%`,  { bg, border: true, align: "right" }));
    setCell(ws, 9, r, cell(barStr,                         { bg: "DBEAFE", border: true, fg: "1A56DB", sz: 8 }));
    r++;
  });

  ws["!cols"] = [
    { wch: 5 }, { wch: 34 }, { wch: 14 }, { wch: 13 }, { wch: 18 },
    { wch: 18 }, { wch: 18 }, { wch: 11 }, { wch: 11 }, { wch: 22 },
  ];

  return ws;
}

// ── Hoja 3: Detalle ventas ─────────────────────────────────────────────
function buildDetailSheet(detail: any[], symbol: string, showProfit: boolean): Record<string, any> {
  const ws: Record<string, any> = {};
  let r = 1;

  setCell(ws, 0, r, cell("DETALLE DE VENTAS", { bold: true, sz: 13, fg: COLORS.primaryDark }));
  merge(ws, 0, r - 1, 8, r - 1);
  r += 2;

  const cols = ["#", "Fecha", "Cliente", "Método pago", "Cuenta", "Artículos", `Descuento (${symbol})`, `Total (${symbol})`, `Utilidad (${symbol})`];
  cols.forEach((c, i) => setCell(ws, i, r, headerCell(c, i >= 5 ? "right" : "left")));
  r++;

  detail.forEach((s, idx) => {
    const isAlt = idx % 2 === 1;
    const bg    = isAlt ? COLORS.altRow : COLORS.white;

    setCell(ws, 0, r, cell(s.sale_number,                              { bg, border: true }));
    setCell(ws, 1, r, cell(fmtDate(s.date),                           { bg, border: true }));
    setCell(ws, 2, r, cell(s.customer,                                 { bg, border: true }));
    setCell(ws, 3, r, cell(PAYMENT_LABEL[s.payment_method] ?? s.payment_method, { bg, border: true }));
    setCell(ws, 4, r, cell(s.account_name || "—",                     { bg, border: true, fg: COLORS.textMid }));
    setCell(ws, 5, r, cell(s.items_count,                              { bg, border: true, align: "right" }));
    setCell(ws, 6, r, cell(fmtHNL(s.discount, symbol),                { bg, border: true, align: "right", fg: COLORS.textMid }));
    setCell(ws, 7, r, cell(fmtHNL(s.total,    symbol),                { bg, border: true, align: "right", bold: true }));
    setCell(ws, 8, r, cell(showProfit ? fmtHNL(s.profit, symbol) : REDACTED, { bg, border: true, align: "right", fg: COLORS.secondary }));
    r++;
  });

  ws["!cols"] = [
    { wch: 12 }, { wch: 14 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];

  return ws;
}

// ── Hoja 4: Por día ────────────────────────────────────────────────────
function buildByDaySheet(byDay: any[], symbol: string, showProfit: boolean): Record<string, any> {
  const ws: Record<string, any> = {};
  let r = 1;

  setCell(ws, 0, r, cell("VENTAS POR DÍA", { bold: true, sz: 13, fg: COLORS.primaryDark }));
  merge(ws, 0, r - 1, 6, r - 1);
  r += 2;

  const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const cols    = ["Fecha", "Día semana", "N.° Ventas", `Ingresos (${symbol})`, `Utilidad (${symbol})`, "Margen %", "Acum. Ingresos"];
  cols.forEach((c, i) => setCell(ws, i, r, headerCell(c, i >= 2 ? "right" : "left")));
  r++;

  let acum = 0;
  let totalSales   = 0;
  let totalRevenue = 0;
  let totalProfit  = 0;

  byDay.forEach((d, idx) => {
    const isAlt  = idx % 2 === 1;
    const bg     = isAlt ? COLORS.altRow : COLORS.white;
    const dPct   = d.revenue > 0 ? 100 * d.profit / d.revenue : 0;
    const dt     = new Date(d.date + "T12:00:00");
    const dayStr = DAYS_ES[dt.getDay()];
    acum += d.revenue;
    totalSales   += d.sales_count;
    totalRevenue += d.revenue;
    totalProfit  += d.profit;

    setCell(ws, 0, r, cell(fmtDate(d.date),           { bg, border: true }));
    setCell(ws, 1, r, cell(dayStr,                     { bg, border: true, align: "center" }));
    setCell(ws, 2, r, cell(d.sales_count,              { bg, border: true, align: "right" }));
    setCell(ws, 3, r, cell(fmtHNL(d.revenue, symbol), { bg, border: true, align: "right" }));
    setCell(ws, 4, r, cell(showProfit ? fmtHNL(d.profit, symbol) : REDACTED, { bg, border: true, align: "right" }));
    setCell(ws, 5, r, cell(showProfit ? `${fmtN(dPct, 1)}%` : REDACTED,     { bg, border: true, align: "right" }));
    setCell(ws, 6, r, cell(fmtHNL(acum,      symbol), { bg, border: true, align: "right", bold: true }));
    r++;
  });

  // Fila de totales
  const totalPct = totalRevenue > 0 ? 100 * totalProfit / totalRevenue : 0;
  const totalBg  = "EBF5FB";
  setCell(ws, 0, r, cell("TOTAL",                        { bg: totalBg, border: true, bold: true }));
  setCell(ws, 1, r, cell("",                             { bg: totalBg, border: true }));
  setCell(ws, 2, r, cell(totalSales,                     { bg: totalBg, border: true, align: "right", bold: true }));
  setCell(ws, 3, r, cell(fmtHNL(totalRevenue, symbol),  { bg: totalBg, border: true, align: "right", bold: true }));
  setCell(ws, 4, r, cell(showProfit ? fmtHNL(totalProfit, symbol) : REDACTED, { bg: totalBg, border: true, align: "right", bold: true }));
  setCell(ws, 5, r, cell(showProfit ? `${fmtN(totalPct, 1)}%` : REDACTED,     { bg: totalBg, border: true, align: "right", bold: true }));
  setCell(ws, 6, r, cell(fmtHNL(totalRevenue, symbol),  { bg: totalBg, border: true, align: "right", bold: true }));

  ws["!cols"] = [
    { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 11 }, { wch: 20 },
  ];

  return ws;
}

// ── Canvas helpers ─────────────────────────────────────────────────────
const CP  = "#1a56db";   // primary blue
const CG  = "#059669";   // green
const CGR = "#e5e7eb";   // grid
const CTX = "#374151";   // text dark
const CTS = "#9ca3af";   // text secondary
const CBR = "#93c5fd";   // bar revenue (blue-300)
const CBP = "#6ee7b7";   // bar profit  (emerald-300)

function canvasShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return String(Math.round(v));
}

async function pngRevenueByDay(byDay: any[], symbol: string, showProfit: boolean): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const W = 960, H = 340;
  const ML = 72, MR = 20, MT = 48, MB = 52;
  const PW = W - ML - MR, PH = H - MT - MB;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Título
  ctx.fillStyle = CP;
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Ingresos y Utilidad por Día", ML, 28);

  const maxV = byDay.reduce((m, d) => Math.max(m, d.revenue), 0);
  if (maxV === 0) return canvas.encode("png");

  const TICKS = 5;
  for (let t = 0; t <= TICKS; t++) {
    const y = MT + PH - (t / TICKS) * PH;
    ctx.strokeStyle = t === 0 ? "#9ca3af" : CGR;
    ctx.lineWidth   = t === 0 ? 1.2 : 0.8;
    ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(ML + PW, y); ctx.stroke();
    ctx.fillStyle   = CTS;
    ctx.font        = "11px sans-serif";
    ctx.textAlign   = "right";
    ctx.fillText(canvasShort((t / TICKS) * maxV), ML - 6, y + 4);
  }

  const n  = byDay.length;
  const GW = PW / n;
  const BW = Math.min(GW * 0.38, 18);
  const GAP = 2;

  byDay.forEach((d, i) => {
    const cx   = ML + i * GW + GW / 2;
    const hRev = Math.max((d.revenue / maxV) * PH, 1);
    const hPrf = showProfit ? Math.max((d.profit / maxV) * PH, 0) : 0;

    ctx.fillStyle = CBR;
    ctx.fillRect(cx - (showProfit ? BW + GAP : BW / 2), MT + PH - hRev, BW, hRev);
    if (showProfit) {
      ctx.fillStyle = CBP;
      ctx.fillRect(cx + GAP, MT + PH - hPrf, BW, hPrf);
    }

    const step = n > 20 ? Math.ceil(n / 15) : n > 10 ? 2 : 1;
    if (i % step === 0) {
      const dt = new Date(d.date + "T12:00:00");
      ctx.fillStyle  = CTS;
      ctx.font       = "9px sans-serif";
      ctx.textAlign  = "center";
      ctx.fillText(`${dt.getDate()}/${dt.getMonth() + 1}`, cx, MT + PH + 16);
    }
  });

  // Leyenda
  const LY = H - 14;
  ctx.fillStyle = CBR; ctx.fillRect(ML, LY - 11, 14, 11);
  ctx.fillStyle = CTX; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("Ingresos", ML + 18, LY - 1);
  if (showProfit) {
    ctx.fillStyle = CBP; ctx.fillRect(ML + 100, LY - 11, 14, 11);
    ctx.fillStyle = CTX;
    ctx.fillText("Utilidad", ML + 118, LY - 1);
  }

  return canvas.encode("png");
}

async function pngProductsHorizontal(byProduct: any[], symbol: string, showProfit: boolean): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const top10 = byProduct.slice(0, 10);
  if (top10.length === 0) return (await import("@napi-rs/canvas")).createCanvas(1, 1).encode("png");

  const LBL_W = 210, VAL_W = 90, MT = 48, MB = 30, ML = 16, MR = 16;
  const ROW_H  = 38;
  const BAR_W  = 580;
  const W      = ML + LBL_W + BAR_W + VAL_W + MR;
  const H      = MT + top10.length * ROW_H + MB;
  const maxV   = top10[0].revenue;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = CP;
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Top 10 Productos — Ingresos y Utilidad", ML, 28);

  // Separador vertical entre etiquetas y barras
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(ML + LBL_W, MT - 6);
  ctx.lineTo(ML + LBL_W, MT + top10.length * ROW_H);
  ctx.stroke();

  top10.forEach((p, i) => {
    const y   = MT + i * ROW_H;
    const midY = y + ROW_H / 2;

    if (i % 2 === 1) {
      ctx.fillStyle = "#f9fafb";
      ctx.fillRect(ML, y, W - ML - MR, ROW_H);
    }

    // Nombre del producto
    const name = p.product_name.length > 24 ? p.product_name.slice(0, 24) + "…" : p.product_name;
    ctx.fillStyle  = CTX;
    ctx.font       = "12px sans-serif";
    ctx.textAlign  = "right";
    ctx.fillText(name, ML + LBL_W - 8, midY + 4);

    const wRev  = maxV > 0 ? (p.revenue / maxV) * BAR_W : 0;
    const wProf = showProfit && maxV > 0 ? (p.profit / maxV) * BAR_W : 0;
    const barX  = ML + LBL_W + 4;
    const BH    = ROW_H * 0.42;
    const barY  = midY - BH / 2;

    // Barra ingreso
    ctx.fillStyle = CBR;
    ctx.fillRect(barX, barY, Math.max(wRev, 2), BH);
    // Barra utilidad (más delgada, centrada) — requiere showProfit
    if (showProfit) {
      ctx.fillStyle = CBP;
      ctx.fillRect(barX, midY - BH * 0.28, Math.max(wProf, 1), BH * 0.55);
    }

    // Valor
    ctx.fillStyle  = CP;
    ctx.font       = "bold 11px sans-serif";
    ctx.textAlign  = "left";
    ctx.fillText(canvasShort(p.revenue), barX + wRev + 6, midY + 4);
  });

  // Leyenda
  const LY = H - 10;
  ctx.fillStyle = CBR; ctx.fillRect(ML, LY - 11, 14, 11);
  ctx.fillStyle = CTX; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("Ingresos", ML + 18, LY - 1);
  if (showProfit) {
    ctx.fillStyle = CBP; ctx.fillRect(ML + 100, LY - 11, 14, 11);
    ctx.fillStyle = CTX;
    ctx.fillText("Utilidad", ML + 118, LY - 1);
  }

  return canvas.encode("png");
}

// ── Hoja "Gráfico": PNG reales incrustados ─────────────────────────────
async function buildChartSheet(byDay: any[], byProduct: any[], symbol: string, showProfit: boolean): Promise<Record<string, any>> {
  const ws: Record<string, any> = {};

  const [imgRevenue, imgProducts] = await Promise.all([
    pngRevenueByDay(byDay, symbol, showProfit),
    pngProductsHorizontal(byProduct, symbol, showProfit),
  ]);

  // Posiciones en pixels: cada fila ~15px, cada col ~64px aprox.
  // Gráfico ingresos: desde A1, 960x340px
  // Gráfico productos: desde A26 (salto de ~25 filas ≈ 375px), 960x420px
  (ws as any)["!images"] = [
    {
      "!pos": { r: 1,  c: 0, x: 0, y: 0, w: 960, h: 340 },
      "!datatype": "base64",
      "!content": imgRevenue.toString("base64"),
    },
    {
      "!pos": { r: 26, c: 0, x: 0, y: 0, w: 960, h: byProduct.slice(0, 10).length * 38 + 80 },
      "!datatype": "base64",
      "!content": imgProducts.toString("base64"),
    },
  ];

  // !ref necesario para que xlsx incluya la hoja
  ws["!ref"] = "A1:P60";
  ws["!cols"] = Array.from({ length: 16 }, () => ({ wch: 12 }));

  return ws;
}

// ── Generar Excel en servidor ──────────────────────────────────────────
async function generateExcel(
  summary: any, byDay: any[], byProduct: any[], detail: any[],
  symbol: string, from: string, to: string, showCosts: boolean, showProfit: boolean
): Promise<Uint8Array> {
  const XLSX = await import("xlsx");

  const periodLabel = `${fmtDate(from)} — ${fmtDate(to)}`;

  const wb = XLSX.utils.book_new();
  (wb as any).Props = { Title: "Reporte de Ventas — HiKonta", Author: "HiKonta SaaS" };

  const wsDashboard  = buildDashboardSheet(summary, byDay, symbol, from, to, periodLabel, showCosts, showProfit);
  const wsGrafico    = await buildChartSheet(byDay, byProduct, symbol, showProfit);
  const wsProductos  = buildProductsSheet(byProduct, symbol, showCosts, showProfit);
  const wsDetalle    = buildDetailSheet(detail, symbol, showProfit);
  const wsByDay      = buildByDaySheet(byDay, symbol, showProfit);

  XLSX.utils.book_append_sheet(wb, wsDashboard,  "Dashboard");
  XLSX.utils.book_append_sheet(wb, wsGrafico,    "Gráfico");
  XLSX.utils.book_append_sheet(wb, wsProductos,  "Productos");
  XLSX.utils.book_append_sheet(wb, wsDetalle,    "Detalle");
  XLSX.utils.book_append_sheet(wb, wsByDay,      "Por día");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true });
  return new Uint8Array(buf);
}

// ── Generar PDF en servidor ────────────────────────────────────────────
async function generatePDF(
  summary: any, byDay: any[], byProduct: any[], detail: any[],
  symbol: string, from: string, to: string, showCosts: boolean, showProfit: boolean
): Promise<Uint8Array> {
  const { default: jsPDF }     = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const PAGE_W     = 297;
  const MARGIN     = 14;
  const CONTENT_W  = PAGE_W - MARGIN * 2;
  const periodLabel = `${fmtDate(from)} — ${fmtDate(to)}`;

  // Colores PDF
  const C_PRIMARY  : [number, number, number] = [26,  86, 219];
  const C_GREEN    : [number, number, number] = [5,  150, 105];
  const C_AMBER    : [number, number, number] = [180,  83,   9];
  const C_RED      : [number, number, number] = [185,  28,  28];
  const C_BG_SUBTLE: [number, number, number] = [248, 250, 252];
  const C_GRAY_SEC : [number, number, number] = [107, 114, 128];

  const C_KPI_BLUE : [number, number, number] = [219, 234, 254];
  const C_KPI_GREEN: [number, number, number] = [209, 250, 229];
  const C_KPI_AMBER: [number, number, number] = [254, 243, 199];

  // Colores de barra de gráfico (suavizados)
  const C_BAR_REV  : [number, number, number] = [173, 198, 244]; // azul 70% opac
  const C_BAR_PROF : [number, number, number] = [167, 220, 201]; // verde suave

  const marginPct = summary.total_revenue > 0
    ? 100 * summary.gross_profit / summary.total_revenue
    : 0;

  // ── Encabezado de página ─────────────────────────────────────────────
  function drawPageHeader(pageNum: number) {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...C_PRIMARY);
    doc.text("REPORTE DE VENTAS", MARGIN, 10);

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

  // ── Pie de página ────────────────────────────────────────────────────
  function drawPageFooter() {
    const pY = doc.internal.pageSize.getHeight() - 6;
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN, pY - 2, PAGE_W - MARGIN, pY - 2);
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `Generado el ${new Date().toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" })} · HiKonta SaaS`,
      MARGIN, pY
    );
    doc.text("Confidencial — solo para uso interno", PAGE_W - MARGIN, pY, { align: "right" });
    doc.setTextColor(0, 0, 0);
  }

  // ── headStyles sin fondo (solo texto azul + línea inferior) ──────────
  const cleanHeadStyles = {
    fillColor:  false as unknown as [number, number, number],
    textColor:  C_PRIMARY,
    fontStyle:  "bold" as const,
    fontSize:   8,
    lineColor:  C_PRIMARY,
    lineWidth:  { bottom: 0.3, top: 0, left: 0, right: 0 },
  };

  // ── Gráfico de barras: Ingresos y utilidad por día ───────────────────
  function drawBarChartByDay(startY: number): number {
    if (byDay.length === 0) return startY;

    const CHART_H  = 45;  // mm
    const AXIS_W   = 18;  // mm espacio eje Y izquierdo
    const plotW    = CONTENT_W - AXIS_W;
    const plotH    = CHART_H - 8;  // reservar 8mm para eje X

    const maxVal   = byDay.reduce((m, d) => Math.max(m, d.revenue, showProfit ? d.profit : 0), 0);
    if (maxVal === 0) return startY;

    const TICKS    = 4;
    const tickStep = maxVal / TICKS;

    const n        = byDay.length;
    const groupW   = plotW / n;
    const BAR_W    = Math.min(groupW * 0.38, 5);
    const GAP      = groupW * 0.06;

    const plotX    = MARGIN + AXIS_W;
    const plotY    = startY;
    const baseY    = plotY + plotH;

    // Líneas de guía horizontales
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    for (let t = 0; t <= TICKS; t++) {
      const yG = baseY - (t / TICKS) * plotH;
      doc.line(plotX, yG, plotX + plotW, yG);
      // Etiqueta eje Y
      doc.setFontSize(6);
      doc.setTextColor(...C_GRAY_SEC);
      doc.text(shortVal(t * tickStep), plotX - 1, yG + 1, { align: "right" });
    }

    // Barras
    doc.setLineWidth(0);
    byDay.forEach((d, i) => {
      const cx = plotX + i * groupW + groupW / 2;

      const hRev  = maxVal > 0 ? (d.revenue / maxVal) * plotH : 0;
      const hProf = showProfit && maxVal > 0 ? (d.profit / maxVal) * plotH : 0;

      // Barra ingresos (izquierda)
      doc.setFillColor(...C_BAR_REV);
      doc.rect(cx - (showProfit ? BAR_W + GAP / 2 : BAR_W / 2), baseY - hRev, BAR_W, Math.max(hRev, 0.3), "F");

      // Barra utilidad (derecha) — requiere showProfit
      if (showProfit) {
        doc.setFillColor(...C_BAR_PROF);
        doc.rect(cx + GAP / 2, baseY - hProf, BAR_W, Math.max(hProf, 0.3), "F");
      }
    });

    // Eje X: fechas abreviadas
    const step = n > 15 ? Math.ceil(n / 15) : 1;
    doc.setFontSize(5.5);
    doc.setTextColor(...C_GRAY_SEC);
    byDay.forEach((d, i) => {
      if (i % step !== 0) return;
      const cx  = plotX + i * groupW + groupW / 2;
      const dt  = new Date(d.date + "T12:00:00");
      const lbl = `${dt.getDate()}/${dt.getMonth() + 1}`;
      doc.text(lbl, cx, baseY + 4, { align: "center" });
    });

    // Eje base
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(plotX, baseY, plotX + plotW, baseY);

    // Leyenda debajo
    const legY  = plotY + CHART_H - 1;
    const legX  = plotX;
    doc.setFontSize(6.5);
    doc.setTextColor(...C_GRAY_SEC);
    doc.setFillColor(...C_BAR_REV);
    doc.rect(legX, legY - 2.5, 5, 2.5, "F");
    doc.text("Ingresos", legX + 6.5, legY);

    if (showProfit) {
      doc.setFillColor(...C_BAR_PROF);
      doc.rect(legX + 30, legY - 2.5, 5, 2.5, "F");
      doc.text("Utilidad", legX + 36.5, legY);
    }

    doc.setTextColor(0, 0, 0);
    return startY + CHART_H + 4;
  }

  // ── Gráfico de barras horizontales: Top 10 productos ─────────────────
  function drawHorizontalBarProducts(startY: number): number {
    const top10   = byProduct.slice(0, 10);
    if (top10.length === 0) return startY;

    const CHART_H  = 60; // mm total
    const LABEL_W  = 52; // mm para el nombre del producto
    const VAL_W    = 22; // mm para el valor a la derecha
    const barAreaW = CONTENT_W - LABEL_W - VAL_W;

    const maxVal   = top10.reduce((m, p) => Math.max(m, p.revenue), 0);
    if (maxVal === 0) return startY;

    const ROW_H    = CHART_H / top10.length;
    const BAR_H    = ROW_H * 0.45;
    const BAR_H2   = ROW_H * 0.22; // utilidad más delgada

    top10.forEach((p, i) => {
      const rowY   = startY + i * ROW_H;
      const barY   = rowY + (ROW_H - BAR_H) / 2;
      const barY2  = rowY + (ROW_H - BAR_H2) / 2;
      const barX   = MARGIN + LABEL_W;

      const wRev  = maxVal > 0 ? (p.revenue / maxVal) * barAreaW : 0;
      const wProf = showProfit && maxVal > 0 ? (p.profit / maxVal) * barAreaW : 0;

      // Fondo alternado muy sutil
      if (i % 2 === 1) {
        doc.setFillColor(...C_BG_SUBTLE);
        doc.rect(MARGIN, rowY, CONTENT_W, ROW_H, "F");
      }

      // Label izquierdo (truncado a 20 chars)
      const name = p.product_name.length > 20 ? p.product_name.slice(0, 20) + "…" : p.product_name;
      doc.setFontSize(7);
      doc.setTextColor(50, 50, 50);
      doc.text(name, MARGIN + LABEL_W - 2, barY + BAR_H / 2 + 1, { align: "right" });

      // Barra ingresos
      doc.setFillColor(...C_BAR_REV);
      doc.rect(barX, barY, Math.max(wRev, 0.5), BAR_H, "F");

      // Barra utilidad superpuesta (más delgada, centrada verticalmente) — requiere showProfit
      if (showProfit) {
        doc.setFillColor(...C_BAR_PROF);
        doc.rect(barX, barY2, Math.max(wProf, 0.5), BAR_H2, "F");
      }

      // Valor a la derecha
      doc.setFontSize(6.5);
      doc.setTextColor(...C_PRIMARY);
      doc.text(shortVal(p.revenue), barX + wRev + 1.5, barY + BAR_H / 2 + 1);
    });

    // Eje base
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.25);
    doc.line(MARGIN + LABEL_W, startY, MARGIN + LABEL_W, startY + CHART_H);

    // Leyenda debajo
    const legY = startY + CHART_H + 3;
    doc.setFontSize(6.5);
    doc.setTextColor(...C_GRAY_SEC);
    doc.setFillColor(...C_BAR_REV);
    doc.rect(MARGIN, legY - 2.5, 5, 2.5, "F");
    doc.text("Ingresos", MARGIN + 6.5, legY);
    if (showProfit) {
      doc.setFillColor(...C_BAR_PROF);
      doc.rect(MARGIN + 30, legY - 2.5, 5, 2.5, "F");
      doc.text("Utilidad", MARGIN + 36.5, legY);
    }

    doc.setTextColor(0, 0, 0);
    return startY + CHART_H + 8;
  }

  // ── Página 1: KPIs + gráfico días + tabla días ───────────────────────
  let page = 1;
  drawPageHeader(page);
  drawPageFooter();

  let y = 24;

  // Cajas de KPI
  const kpiW = (CONTENT_W - 9) / 4;
  const kpis = [
    { label: "Total ventas",    value: String(summary.total_sales),              bg: C_KPI_BLUE,  textColor: C_PRIMARY as [number,number,number] },
    { label: "Ingresos brutos", value: fmtHNL(summary.total_revenue, symbol),   bg: C_KPI_BLUE,  textColor: C_PRIMARY as [number,number,number] },
    { label: "Utilidad bruta",  value: showProfit ? fmtHNL(summary.gross_profit, symbol) : REDACTED,   bg: C_KPI_GREEN, textColor: C_GREEN   as [number,number,number] },
    {
      label: "Margen bruto",
      value: showProfit ? `${fmtN(marginPct, 1)}%` : REDACTED,
      bg: marginPct >= 20 ? C_KPI_GREEN : C_KPI_AMBER,
      textColor: (marginPct >= 20 ? C_GREEN : C_AMBER) as [number,number,number],
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
    doc.setTextColor(...kpi.textColor);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(kpi.value, x + kpiW / 2, y + 16, { align: "center" });
  });
  y += 28;

  // Métricas secundarias
  const metas = [
    `Descuentos: ${fmtHNL(summary.total_discount, symbol)}`,
    `Costo mercancía: ${showCosts ? fmtHNL(summary.total_cogs, symbol) : REDACTED}`,
    `Ventas: ${summary.total_sales > 0 ? fmtHNL(summary.total_revenue / summary.total_sales, symbol) + " promedio" : "—"}`,
  ];
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  metas.forEach((m, i) => doc.text(m, MARGIN + i * (CONTENT_W / 3), y));
  y += 8;

  // Gráfico de barras por día (antes de la tabla)
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_PRIMARY);
  doc.text("Ingresos y utilidad por día", MARGIN, y);
  y += 5;
  y = drawBarChartByDay(y);

  // Tabla ventas por día
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_PRIMARY);
  doc.text("Ventas por día", MARGIN, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head:   [["Fecha", "Ventas", `Ingresos (${symbol})`, `Utilidad (${symbol})`, "Margen %"]],
    body:   byDay.map(d => {
      const dp = d.revenue > 0 ? 100 * d.profit / d.revenue : 0;
      return [
        fmtDate(d.date), d.sales_count, fmtHNL(d.revenue, symbol),
        showProfit ? fmtHNL(d.profit, symbol) : REDACTED,
        showProfit ? `${fmtN(dp, 1)}%` : REDACTED,
      ];
    }),
    styles:             { fontSize: 8, cellPadding: 2.5, font: "helvetica" },
    headStyles:         cleanHeadStyles,
    columnStyles: {
      0: { halign: "left"  },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
    alternateRowStyles: { fillColor: C_BG_SUBTLE },
    margin:             { left: MARGIN, right: MARGIN },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 4 && data.cell.raw !== REDACTED) {
        const pct = parseFloat(String(data.cell.raw));
        if (pct >= 30)      data.cell.styles.textColor = C_GREEN;
        else if (pct >= 10) data.cell.styles.textColor = C_AMBER;
        else                data.cell.styles.textColor = C_RED;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ── Página 2: Top productos (gráfico horizontal + tabla) ─────────────
  doc.addPage();
  page++;
  drawPageHeader(page);
  drawPageFooter();
  y = 28;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_PRIMARY);
  doc.text("Top 10 productos por ingresos", MARGIN, y);
  y += 5;

  y = drawHorizontalBarProducts(y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_PRIMARY);
  doc.text("Productos más vendidos", MARGIN, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head:   [["#", "Producto", "SKU", "Cant.", `Ingresos (${symbol})`, `Costo (${symbol})`, `Utilidad (${symbol})`, "Margen %"]],
    body:   byProduct.slice(0, 50).map((p, i) => [
      i + 1,
      p.product_name,
      p.sku || "—",
      p.qty_sold,
      fmtHNL(p.revenue, symbol),
      showCosts  ? fmtHNL(p.cogs,   symbol) : REDACTED,
      showProfit ? fmtHNL(p.profit, symbol) : REDACTED,
      showProfit ? `${fmtN(p.margin_pct, 1)}%` : REDACTED,
    ]),
    styles:             { fontSize: 7.5, cellPadding: 2.2, font: "helvetica" },
    headStyles:         cleanHeadStyles,
    columnStyles: {
      0: { halign: "center", cellWidth: 8  },
      1: { halign: "left",   cellWidth: 65 },
      2: { halign: "left",   cellWidth: 22 },
      3: { halign: "right",  cellWidth: 16 },
      4: { halign: "right"  },
      5: { halign: "right"  },
      6: { halign: "right",  fontStyle: "bold", textColor: C_GREEN },
      7: { halign: "center", cellWidth: 18 },
    },
    alternateRowStyles: { fillColor: C_BG_SUBTLE },
    margin:             { left: MARGIN, right: MARGIN },
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 7 && data.cell.raw !== REDACTED) {
        const pct = parseFloat(String(data.cell.raw));
        if (pct >= 30) {
          data.cell.styles.textColor = C_GREEN;
          data.cell.styles.fillColor = C_KPI_GREEN;
        } else if (pct >= 10) {
          data.cell.styles.textColor = C_AMBER;
          data.cell.styles.fillColor = C_KPI_AMBER;
        } else {
          data.cell.styles.textColor = C_RED;
          data.cell.styles.fillColor = [254, 226, 226];
        }
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ── Página 3: Detalle ventas ──────────────────────────────────────────
  doc.addPage();
  page++;
  drawPageHeader(page);
  drawPageFooter();
  y = 28;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C_PRIMARY);
  doc.text("Detalle de ventas", MARGIN, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head:   [["#Venta", "Fecha", "Cliente", "Método pago", "Arts.", `Desc. (${symbol})`, `Total (${symbol})`, `Utilidad (${symbol})`]],
    body:   detail.slice(0, 500).map(s => [
      s.sale_number,
      fmtDate(s.date),
      s.customer,
      PAYMENT_LABEL[s.payment_method] ?? s.payment_method,
      s.items_count,
      fmtHNL(s.discount, symbol),
      fmtHNL(s.total,    symbol),
      showProfit ? fmtHNL(s.profit, symbol) : REDACTED,
    ]),
    styles:             { fontSize: 7.5, cellPadding: 2, font: "helvetica" },
    headStyles:         cleanHeadStyles,
    columnStyles: {
      0: { halign: "left",  cellWidth: 22 },
      1: { halign: "left",  cellWidth: 22 },
      2: { halign: "left"  },
      3: { halign: "left",  cellWidth: 30 },
      4: { halign: "right", cellWidth: 12 },
      5: { halign: "right", cellWidth: 24 },
      6: { halign: "right", cellWidth: 26, fontStyle: "bold" },
      7: { halign: "right", cellWidth: 26, textColor: C_GREEN },
    },
    alternateRowStyles: { fillColor: C_BG_SUBTLE },
    margin:             { left: MARGIN, right: MARGIN },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) {
        page++;
        drawPageHeader(page);
        drawPageFooter();
      }
    },
  });

  const pdfOutput = doc.output("arraybuffer");
  return new Uint8Array(pdfOutput);
}

// ── Route handler ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
  const deny = await requireModule(auth.data, 'REPORTS', 'canView');
  if (deny) return deny;
  const denyFeature = await requireFeature(auth.data.orgId, 'reports.sales');
  if (denyFeature) return denyFeature;

  // Costos/utilidades se redactan del documento igual que en pantalla —
  // no se bloquea la exportación completa por no tener uno de los dos.
  const perms = await getModulePermissions(auth.data, 'REPORTS', 'SALES');

  try {
    const { orgId } = auth.data;
    const body       = await request.json();
    const def        = defaultMonthRange();
    const from       = (body.from   ?? def.from)   as string;
    const to         = (body.to     ?? def.to)     as string;
    const format     = (body.format ?? "pdf")      as "xlsx" | "pdf";
    const symbol     = (body.symbol ?? "L")        as string;

    const [summary, byDay, byProduct, detail] = await Promise.all([
      getSalesSummary(sql, orgId, from, to),
      getSalesByDay(sql, orgId, from, to),
      getSalesByProduct(sql, orgId, from, to),
      getSalesDetail(sql, orgId, from, to),
    ]);

    if (format === "pdf") {
      const pdfBuf = await generatePDF(summary, byDay, byProduct, detail, symbol, from, to, perms.showCosts, perms.showProfit);
      return new Response(pdfBuf.buffer as ArrayBuffer, {
        headers: {
          "Content-Type":        "application/pdf",
          "Content-Disposition": `attachment; filename="Ventas_${from}_${to}.pdf"`,
        },
      });
    }

    const xlsBuf = await generateExcel(summary, byDay, byProduct, detail, symbol, from, to, perms.showCosts, perms.showProfit);
    return new Response(xlsBuf.buffer as ArrayBuffer, {
      headers: {
        "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Ventas_${from}_${to}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("POST /api/reports/sales/export:", error);
    return createErrorResponse("Error al generar exportación", 500);
  }
}
