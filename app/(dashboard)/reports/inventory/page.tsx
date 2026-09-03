// app/(dashboard)/reports/inventory/page.tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useInventoryReport } from "@/hooks/swr/use-reports";
import { useCurrency }        from "@/hooks/swr/use-currency";
import { useAuth }            from "@/hooks/use-auth";
import { fmtN } from "@/lib/export";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { ReportShell, StatCard } from "@/components/reports/report-shell";
import { FeatureGate } from "@/components/shared/feature-gate";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge }    from "@/components/ui/badge";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Package, Boxes, DollarSign, AlertTriangle, ArrowLeftRight, Search } from "lucide-react";

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
  const { summary, products, movements, isLoading } = useInventoryReport();
  const { show_costs: showCosts, show_profit: showProfit } = useModulePermissions("REPORTS");
  const [search,       setSearch]       = useState("");
  const [tab,          setTab]          = useState<"stock" | "movements">("stock");
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
      </div>

      {/* Search */}
      {tab === "stock" && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar producto o SKU..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      )}

      {/* Stock table */}
      {tab === "stock" && !isLoading && (
        <div className="space-y-2">
          <div className="rounded-xl border overflow-hidden">
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
          </div>
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
          <div className="rounded-xl border overflow-hidden">
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
          </div>
          <PaginationControls
            page={movementPage}
            totalPages={Math.ceil(movements.length / MOVEMENT_PAGE_SIZE)}
            total={movements.length}
            label="movimientos"
            onPageChange={setMovementPage}
          />
        </div>
      )}
    </ReportShell>
  );
}
