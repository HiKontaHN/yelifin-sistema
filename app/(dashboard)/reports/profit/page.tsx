// app/(dashboard)/reports/profit/page.tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useProfitReport } from "@/hooks/swr/use-reports";
import { useCurrency }     from "@/hooks/swr/use-currency";
import { useAuth }         from "@/hooks/use-auth";
import { fmtN, fmtPct } from "@/lib/export";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { ReportShell, StatCard, ReportSection, ReportEmptyState, useDateRange } from "@/components/reports/report-shell";
import { FeatureGate } from "@/components/shared/feature-gate";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge }    from "@/components/ui/badge";
import { DollarSign, Package, TrendingUp, Percent, BarChart3, Receipt } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const PRODUCT_PAGE_SIZE = 10;

export default function ProfitReportPage() {
  return (
    <FeatureGate feature="reports.profit">
      <ProfitReportPageInner />
    </FeatureGate>
  );
}

function ProfitReportPageInner() {
  const { from, to, setFrom, setTo } = useDateRange("year");
  const { format, symbol }           = useCurrency();
  const { firebaseUser }             = useAuth();
  const { summary, byMonth, byProduct, expenses, isLoading } = useProfitReport(from, to);
  const [productPage, setProductPage] = useState(1);
  const { show_profit: showProfit, show_costs: showCosts } = useModulePermissions("REPORTS");

  useEffect(() => { setProductPage(1); }, [from, to]);

  const periodLabel = `${new Date(from + "T12:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })} — ${new Date(to + "T12:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })}`;

  // ── Exportación via servidor ──────────────────────────────────────
  const handlePDFExport = async () => {
    const token = await firebaseUser?.getIdToken();
    if (!token) return;

    try {
      const res = await fetch("/api/reports/profit/export", {
        method:  "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ from, to, symbol }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al exportar el reporte");
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `Rentabilidad_${from}_${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      toast.error(err.message || "Error al exportar el reporte");
    }
  };

  return (
    <ReportShell
      title="Rentabilidad"
      subtitle={periodLabel}
      from={from} to={to}
      onFromChange={setFrom} onToChange={setTo}
      onExportPDF={handlePDFExport}
      isLoading={isLoading}
    >
      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}{/* skeleton - index key ok */}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Ingresos brutos"   value={format(summary.revenue)}        accent="blue" icon={DollarSign} />
          {showCosts  && <StatCard label="Costo mercancía"   value={format(summary.cogs)}           accent="red" icon={Package} />}
          {showProfit && <StatCard label="Utilidad bruta"    value={format(summary.gross_profit)}   accent="green" icon={TrendingUp} />}
          {showProfit && (
            <StatCard label="Margen bruto"      value={fmtPct(summary.margin_pct)}
              accent={summary.margin_pct >= 20 ? "green" : summary.margin_pct >= 10 ? "amber" : "red"}
              icon={Percent}
              sub={`${summary.total_sales} ventas`}
            />
          )}
        </div>
      )}

      {/* Expenses note */}
      {!isLoading && expenses && expenses.total_expenses > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Receipt className="size-3.5 shrink-0" />
            Otros gastos operativos del período
          </span>
          <span className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums">{format(expenses.total_expenses)}</span>
        </div>
      )}

      {/* Monthly chart */}
      {!isLoading && byMonth.length > 0 && (
        <ReportSection title="Ingresos vs. utilidad por mes" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMonth} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month_label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={65}
                tickFormatter={v => `${symbol}${Number(v).toLocaleString("es-HN", { maximumFractionDigits: 0 })}`}
              />
              <Tooltip
                formatter={(v: any, name: string) => [format(Number(v)), name === "revenue" ? "Ingresos" : name === "cogs" ? "Costo" : "Utilidad"]}
              />
              <Legend formatter={(v) => v === "revenue" ? "Ingresos" : v === "cogs" ? "Costo" : "Utilidad"} />
              <Bar dataKey="revenue" fill="var(--primary)" radius={[4,4,0,0]} />
              <Bar dataKey="cogs"    fill="hsl(0 84% 60%)"      radius={[4,4,0,0]} />
              <Bar dataKey="profit"  fill="hsl(142 76% 36%)"    radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ReportSection>
      )}

      {/* By product */}
      {!isLoading && byProduct.length > 0 && (
        <div className="space-y-2">
          <ReportSection title="Rentabilidad por producto" icon={Package} noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Producto</th>
                    <th className="text-right px-4 py-2">Cant.</th>
                    <th className="text-right px-4 py-2">Ingresos</th>
                    {showCosts  && <th className="text-right px-4 py-2 hidden md:table-cell">Costo</th>}
                    {showProfit && <th className="text-right px-4 py-2">Utilidad</th>}
                    {showProfit && <th className="text-right px-4 py-2">Margen</th>}
                  </tr>
                </thead>
                <tbody>
                  {byProduct
                    .slice((productPage - 1) * PRODUCT_PAGE_SIZE, productPage * PRODUCT_PAGE_SIZE)
                    .map((p) => (
                      <tr key={`${p.product_name}-${p.sku}`} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">
                          {p.product_name}
                          {p.sku && <span className="ml-1 text-xs text-muted-foreground">· {p.sku}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{p.qty_sold}</td>
                        <td className="px-4 py-2.5 text-right">{format(p.revenue)}</td>
                        {showCosts  && <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell">{format(p.cogs)}</td>}
                        {showProfit && <td className="px-4 py-2.5 text-right font-medium text-green-700 dark:text-green-400">{format(p.profit)}</td>}
                        {showProfit && (
                          <td className="px-4 py-2.5 text-right">
                            <Badge variant="outline" className={`text-xs ${p.margin_pct >= 30 ? "border-green-200 text-green-700" : p.margin_pct >= 10 ? "border-amber-200 text-amber-700" : "border-red-200 text-red-700"}`}>
                              {fmtPct(p.margin_pct)}
                            </Badge>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </ReportSection>
          <PaginationControls
            page={productPage}
            totalPages={Math.ceil(byProduct.length / PRODUCT_PAGE_SIZE)}
            total={byProduct.length}
            label="productos"
            onPageChange={setProductPage}
          />
        </div>
      )}

      {!isLoading && !summary && (
        <ReportEmptyState icon={TrendingUp} message="Sin datos de ventas en el período seleccionado." />
      )}
    </ReportShell>
  );
}
