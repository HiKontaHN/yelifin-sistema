// app/(dashboard)/reports/sales/page.tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useSalesReport } from "@/hooks/swr/use-reports";
import { useCurrency }    from "@/hooks/swr/use-currency";
import { useAuth }        from "@/hooks/use-auth";
import { fmtN }           from "@/lib/export";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { ReportShell, StatCard, ReportSection, ReportEmptyState, useDateRange } from "@/components/reports/report-shell";
import { FeatureGate } from "@/components/shared/feature-gate";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge }    from "@/components/ui/badge";
import { ShoppingCart, DollarSign, TrendingUp, Percent, BarChart3, Package } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const PRODUCT_PAGE_SIZE = 10;

export default function SalesReportPage() {
  return (
    <FeatureGate feature="reports.sales">
      <SalesReportPageInner />
    </FeatureGate>
  );
}

function SalesReportPageInner() {
  const { from, to, setFrom, setTo } = useDateRange("month");
  const { format, symbol }           = useCurrency();
  const { firebaseUser }             = useAuth();
  const { summary, byDay, byProduct, isLoading } = useSalesReport(from, to);
  const [productPage, setProductPage] = useState(1);
  const { show_profit: showProfit, show_costs: showCosts } = useModulePermissions("REPORTS");

  useEffect(() => { setProductPage(1); }, [from, to]);

  const periodLabel = `${new Date(from + "T12:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })} — ${new Date(to + "T12:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })}`;

  // ── Exportación via servidor ──────────────────────────────────────
  async function triggerExport(fmt: "xlsx" | "pdf") {
    const token = await firebaseUser?.getIdToken();
    if (!token) return;

    try {
      const res = await fetch("/api/reports/sales/export", {
        method:  "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ from, to, format: fmt, symbol }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al exportar el reporte");
      }

      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement("a");
      a.href         = url;
      a.download     = `Ventas_${from}_${to}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      toast.error(err.message || "Error al exportar el reporte");
    }
  }

  const handlePDFExport = () => triggerExport("pdf");

  const marginPct = summary && summary.total_revenue > 0
    ? 100 * summary.gross_profit / summary.total_revenue
    : 0;

  return (
    <ReportShell
      title="Reporte de ventas"
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
          <StatCard label="Ventas"           value={String(summary.total_sales)}          icon={ShoppingCart} />
          <StatCard label="Ingresos"         value={format(summary.total_revenue)}        accent="blue"  icon={DollarSign} />
          {showProfit && <StatCard label="Utilidad bruta"   value={format(summary.gross_profit)}         accent="green" icon={TrendingUp} />}
          {showProfit && <StatCard label="Margen"           value={`${fmtN(marginPct, 1)}%`}             accent={marginPct >= 20 ? "green" : "amber"} icon={Percent} sub={`Descuentos: ${format(summary.total_discount)}`} />}
        </div>
      )}

      {/* Chart */}
      {!isLoading && byDay.length > 0 && (
        <ReportSection title="Ingresos y utilidad por día" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byDay} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }}
                tickFormatter={d => new Date(d + "T12:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "short" })}
              />
              <YAxis tick={{ fontSize: 10 }} width={60}
                tickFormatter={v => `${symbol}${Number(v).toLocaleString("es-HN", { maximumFractionDigits: 0 })}`}
              />
              <Tooltip
                formatter={(v: any, name: string) => [format(Number(v)), name === "revenue" ? "Ingresos" : "Utilidad"]}
                labelFormatter={l => new Date(l + "T12:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "long" })}
              />
              <Bar dataKey="revenue" fill="var(--primary)"    radius={[4,4,0,0]} name="revenue" />
              {showProfit && <Bar dataKey="profit"  fill="hsl(142 76% 36%)"       radius={[4,4,0,0]} name="profit"  />}
            </BarChart>
          </ResponsiveContainer>
        </ReportSection>
      )}

      {/* Top products */}
      {!isLoading && byProduct.length > 0 && (
        <div className="space-y-2">
          <ReportSection title="Productos más vendidos" icon={Package} noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Producto</th>
                    <th className="text-left px-4 py-2 hidden sm:table-cell">SKU</th>
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
                        <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">{p.product_name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{p.sku || "—"}</td>
                        <td className="px-4 py-2.5 text-right">{p.qty_sold}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{format(p.revenue)}</td>
                        {showCosts  && <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell">{format(p.cogs)}</td>}
                        {showProfit && <td className="px-4 py-2.5 text-right text-green-700 dark:text-green-400 font-medium">{format(p.profit)}</td>}
                        {showProfit && (
                          <td className="px-4 py-2.5 text-right">
                            <Badge variant="outline" className={`text-xs ${p.margin_pct >= 30 ? "border-green-200 text-green-700" : p.margin_pct >= 10 ? "border-amber-200 text-amber-700" : "border-red-200 text-red-700"}`}>
                              {fmtN(p.margin_pct, 1)}%
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
        <ReportEmptyState icon={ShoppingCart} message="Sin ventas en el período seleccionado." />
      )}
    </ReportShell>
  );
}
