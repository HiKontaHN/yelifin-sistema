// app/(dashboard)/reports/inventory/page.tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useInventoryReport } from "@/hooks/swr/use-reports";
import { useCurrency }        from "@/hooks/swr/use-currency";
import { useAuth }            from "@/hooks/use-auth";
import { fmtN } from "@/lib/export";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { ReportShell, StatCard, ReportSection } from "@/components/reports/report-shell";
import { FeatureGate } from "@/components/shared/feature-gate";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge }    from "@/components/ui/badge";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Package, Boxes, DollarSign, AlertTriangle, ArrowLeftRight, Search, TrendingUp, TrendingDown } from "lucide-react";

const MOVE_LABEL: Record<string, string> = { IN: "Entrada", OUT: "Salida", ADJUST: "Ajuste" };
const MOVE_COLOR: Record<string, string> = {
  IN:     "bg-green-100 text-green-700 border-green-200",
  OUT:    "bg-red-100   text-red-700   border-red-200",
  ADJUST: "bg-amber-100 text-amber-700 border-amber-200",
};

const PRODUCT_PAGE_SIZE  = 10;
const MOVEMENT_PAGE_SIZE = 10;

export default function InventoryReportPage() {
  return (
    <FeatureGate feature="reports.inventory">
      <InventoryReportPageInner />
    </FeatureGate>
  );
}

function InventoryReportPageInner() {
  const { format, symbol }                          = useCurrency();
  const { firebaseUser }                            = useAuth();
  const { summary, products, movements, velocity, turnover, isLoading } = useInventoryReport();
  const { show_costs: showCosts, show_profit: showProfit } = useModulePermissions("REPORTS", "INVENTORY");
  const [search,       setSearch]       = useState("");
  const [tab,          setTab]          = useState<"stock" | "movements" | "velocity">("stock");
  const [productPage,  setProductPage]  = useState(1);
  const [movementPage, setMovementPage] = useState(1);

  useEffect(() => { setProductPage(1); }, [search]);

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  // ── Exportación via servidor ──────────────────────────────────────
  const handlePDFExport = async () => {
    const token = await firebaseUser?.getIdToken();
    if (!token) return;

    try {
      const res = await fetch("/api/reports/inventory/export", {
        method:  "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al exportar el reporte");
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `Inventario_${new Date().toISOString().slice(0, 10)}.pdf`;
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
      title="Reporte de inventario"
      subtitle="Snapshot actual del inventario"
      from="" to=""
      onFromChange={() => {}} onToChange={() => {}}
      showDateRange={false}
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
          <StatCard label="Productos activos"  value={String(summary.total_products)} icon={Package} />
          <StatCard label="Unidades totales"   value={summary.total_stock.toLocaleString("es-HN")} accent="blue" icon={Boxes} />
          {showCosts && <StatCard label="Valor en inventario" value={format(summary.total_stock_value)} accent="green" icon={DollarSign} />}
          <StatCard label="Stock bajo / agotado"
            value={`${summary.low_stock_count} / ${summary.zero_stock_count}`}
            accent={summary.low_stock_count + summary.zero_stock_count > 0 ? "red" : "green"}
            icon={AlertTriangle}
          />
          {showCosts && velocity && (
            <StatCard label="Valor sin movimiento"
              value={format(velocity.dead_stock_value)}
              sub={`${velocity.slow_movers_count} producto${velocity.slow_movers_count === 1 ? "" : "s"} sin ventas en ${velocity.window_days}d`}
              accent={velocity.dead_stock_value > 0 ? "amber" : "green"}
              icon={TrendingDown}
            />
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <Button variant={tab === "stock" ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setTab("stock")}>
          <Package className="size-3.5" />
          Stock por producto
        </Button>
        <Button variant={tab === "movements" ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setTab("movements")}>
          <ArrowLeftRight className="size-3.5" />
          Movimientos (30 días)
        </Button>
        <Button variant={tab === "velocity" ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setTab("velocity")}>
          <TrendingUp className="size-3.5" />
          Rotación (30 días)
        </Button>
      </div>

      {/* Search */}
      {tab === "stock" && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar producto o SKU..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs pl-8"
          />
        </div>
      )}

      {/* Stock table */}
      {tab === "stock" && !isLoading && (
        <div className="space-y-2">
          <ReportSection title="Stock por producto" icon={Package} noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Producto</th>
                    <th className="text-left px-4 py-2 hidden sm:table-cell">SKU</th>
                    <th className="text-right px-4 py-2">Stock</th>
                    <th className="text-right px-4 py-2 hidden md:table-cell">Precio</th>
                    {showCosts  && <th className="text-right px-4 py-2 hidden md:table-cell">Costo prom.</th>}
                    {showCosts  && <th className="text-right px-4 py-2">Valor inv.</th>}
                    {showProfit && <th className="text-right px-4 py-2 hidden lg:table-cell">Margen</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice((productPage - 1) * PRODUCT_PAGE_SIZE, productPage * PRODUCT_PAGE_SIZE)
                    .map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-medium max-w-[180px] truncate">{p.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{p.sku || "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={p.stock === 0 ? "text-destructive font-medium" : p.stock <= 5 ? "text-amber-600 font-medium" : ""}>
                            {p.stock}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right hidden md:table-cell">{format(p.price)}</td>
                        {showCosts  && <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell">{format(p.avg_cost)}</td>}
                        {showCosts  && <td className="px-4 py-2.5 text-right font-medium">{format(p.stock_value)}</td>}
                        {showProfit && (
                          <td className="px-4 py-2.5 text-right hidden lg:table-cell">
                            {p.margin_pct != null ? (
                              <Badge variant="outline" className={`text-xs ${p.margin_pct >= 30 ? "border-green-200 text-green-700" : p.margin_pct >= 10 ? "border-amber-200 text-amber-700" : "border-red-200 text-red-700"}`}>
                                {fmtN(p.margin_pct, 1)}%
                              </Badge>
                            ) : "—"}
                          </td>
                        )}
                      </tr>
                    ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={showCosts && showProfit ? 7 : showCosts ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground">Sin resultados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </ReportSection>
          <PaginationControls
            page={productPage}
            totalPages={Math.ceil(filtered.length / PRODUCT_PAGE_SIZE)}
            total={filtered.length}
            label="productos"
            onPageChange={setProductPage}
          />
        </div>
      )}

      {/* Movements table */}
      {tab === "movements" && !isLoading && (
        <div className="space-y-2">
          <ReportSection title="Movimientos (30 días)" icon={ArrowLeftRight} noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Fecha</th>
                    <th className="text-left px-4 py-2">Tipo</th>
                    <th className="text-left px-4 py-2">Producto</th>
                    <th className="text-right px-4 py-2">Cantidad</th>
                    <th className="text-left px-4 py-2 hidden md:table-cell">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {movements
                    .slice((movementPage - 1) * MOVEMENT_PAGE_SIZE, movementPage * MOVEMENT_PAGE_SIZE)
                    .map((m) => (
                      <tr key={`${m.product_name}-${m.created_at}-${m.movement_type}`} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-muted-foreground text-xs" suppressHydrationWarning>
                          {new Date(m.created_at).toLocaleDateString("es-HN", { day: "numeric", month: "short" })}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge className={`${MOVE_COLOR[m.movement_type] ?? ""} border text-xs`}>
                            {MOVE_LABEL[m.movement_type] ?? m.movement_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 font-medium max-w-[160px] truncate">{m.product_name}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{m.quantity}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{m.reference_type}</td>
                      </tr>
                    ))}
                  {movements.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Sin movimientos en los últimos 30 días</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </ReportSection>
          <PaginationControls
            page={movementPage}
            totalPages={Math.ceil(movements.length / MOVEMENT_PAGE_SIZE)}
            total={movements.length}
            label="movimientos"
            onPageChange={setMovementPage}
          />
        </div>
      )}

      {/* Rotación: turnover + más vendidos y sin movimiento */}
      {tab === "velocity" && !isLoading && velocity && (
        <div className="space-y-4">
          {showCosts && turnover && (
            turnover.status === "collecting" ? (
              <ReportSection title="Rotación de inventario" icon={TrendingUp}>
                <div className="space-y-2 py-1">
                  <p className="text-sm text-muted-foreground">
                    Recopilando datos — disponible en {turnover.days_until_preliminary} día{turnover.days_until_preliminary === 1 ? "" : "s"} más.
                  </p>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, (turnover.days_available / (turnover.days_available + turnover.days_until_preliminary)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {turnover.days_available} / {turnover.days_available + turnover.days_until_preliminary} días de historial
                  </p>
                </div>
              </ReportSection>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Rotación de inventario"
                  value={`${fmtN(turnover.turnover_ratio ?? 0, 1)}x`}
                  sub={turnover.status === "preliminary" ? `Preliminar · ${turnover.days_available}/${turnover.days_available + turnover.days_until_stable} días` : `Últimos ${turnover.days_available} días`}
                  accent="blue"
                  icon={TrendingUp}
                />
                <StatCard
                  label="Días de inventario"
                  value={turnover.days_of_inventory != null ? `${fmtN(turnover.days_of_inventory, 0)} días` : "—"}
                  sub={turnover.status === "preliminary" ? "Cifra preliminar" : "Promedio para vender el stock actual"}
                  accent="amber"
                  icon={Boxes}
                />
              </div>
            )
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportSection title="Productos más vendidos" icon={TrendingUp} noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Producto</th>
                    <th className="text-left px-4 py-2 hidden sm:table-cell">SKU</th>
                    <th className="text-right px-4 py-2">Vendidos</th>
                    <th className="text-right px-4 py-2">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {velocity.top_movers.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium max-w-[180px] truncate">{p.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{p.sku || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-green-700 dark:text-green-400">{p.qty_sold}</td>
                      <td className="px-4 py-2.5 text-right">{format(p.revenue)}</td>
                    </tr>
                  ))}
                  {velocity.top_movers.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Sin ventas en los últimos {velocity.window_days} días</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </ReportSection>

          <ReportSection title="Productos sin movimiento" icon={TrendingDown} noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Producto</th>
                    <th className="text-left px-4 py-2 hidden sm:table-cell">SKU</th>
                    <th className="text-right px-4 py-2">Stock</th>
                    {showCosts && <th className="text-right px-4 py-2">Valor en stock</th>}
                  </tr>
                </thead>
                <tbody>
                  {velocity.slow_movers.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium max-w-[180px] truncate">{p.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{p.sku || "—"}</td>
                      <td className="px-4 py-2.5 text-right">{p.stock}</td>
                      {showCosts && <td className="px-4 py-2.5 text-right font-medium text-amber-700 dark:text-amber-400">{format(p.stock_value)}</td>}
                    </tr>
                  ))}
                  {velocity.slow_movers.length === 0 && (
                    <tr><td colSpan={showCosts ? 4 : 3} className="px-4 py-10 text-center text-muted-foreground">Todo el stock tuvo ventas en los últimos {velocity.window_days} días</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </ReportSection>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
