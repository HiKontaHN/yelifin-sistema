// app/(dashboard)/reports/inventory/page.tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useInventoryReport, type InventoryVelocityItem } from "@/hooks/swr/use-reports";
import { useCurrency }        from "@/hooks/swr/use-currency";
import { useAuth }            from "@/hooks/use-auth";
import { fmtN } from "@/lib/export";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { ReportShell, StatCard, ReportSection, ReportTableSection } from "@/components/reports/report-shell";
import { FeatureGate } from "@/components/shared/feature-gate";
import { DataTableTimeSection, DEFAULT_DATA_TABLE_PAGE_SIZE, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
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
  const [productPageSize, setProductPageSize] = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);
  const [movementPage, setMovementPage] = useState(1);
  const [movementPageSize, setMovementPageSize] = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);

  useEffect(() => { setProductPage(1); }, [search]);

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const productColumns: DataTableTimeSectionColumn<(typeof products)[number]>[] = [
    { id: "product", header: "Producto", width: `${63 - (showCosts ? 26 : 0) - (showProfit ? 10 : 0)}%`, cell: (p) => <span className="block truncate font-medium" title={p.name}>{p.name}</span> },
    { id: "sku", header: "SKU", width: "15%", className: "text-muted-foreground", cell: (p) => p.sku || "—" },
    { id: "stock", header: "Stock", width: "10%", align: "right", cell: (p) => <span className={p.stock === 0 ? "font-medium text-destructive" : p.stock <= 5 ? "font-medium text-amber-600" : ""}>{p.stock}</span> },
    { id: "price", header: "Precio", width: "12%", align: "right", cell: (p) => format(p.price) },
    ...(showCosts ? [
      { id: "avg-cost", header: "Costo prom.", width: "13%", align: "right" as const, cell: (p: (typeof products)[number]) => <span className="text-muted-foreground">{format(p.avg_cost)}</span> },
      { id: "stock-value", header: "Valor inv.", width: "13%", align: "right" as const, cell: (p: (typeof products)[number]) => <span className="font-medium">{format(p.stock_value)}</span> },
    ] : []),
    ...(showProfit ? [{ id: "margin", header: "Margen", width: "10%", align: "right" as const, cell: (p: (typeof products)[number]) => p.margin_pct != null ? <Badge variant="outline" className={`text-xs ${p.margin_pct >= 30 ? "border-green-200 text-green-700" : p.margin_pct >= 10 ? "border-amber-200 text-amber-700" : "border-red-200 text-red-700"}`}>{fmtN(p.margin_pct, 1)}%</Badge> : "—" }] : []),
  ];
  const productRows = filtered.slice((productPage - 1) * productPageSize, productPage * productPageSize);

  const movementColumns: DataTableTimeSectionColumn<(typeof movements)[number]>[] = [
    { id: "date", header: "Fecha", width: "16%", className: "whitespace-nowrap text-muted-foreground", cell: (m) => <span suppressHydrationWarning>{new Date(m.created_at).toLocaleDateString("es-HN", { day: "numeric", month: "short" })}</span> },
    { id: "type", header: "Tipo", width: "16%", cell: (m) => <Badge className={`${MOVE_COLOR[m.movement_type] ?? ""} border text-xs`}>{MOVE_LABEL[m.movement_type] ?? m.movement_type}</Badge> },
    { id: "product", header: "Producto", width: "30%", cell: (m) => <span className="block truncate font-medium" title={m.product_name}>{m.product_name}</span> },
    { id: "quantity", header: "Cantidad", width: "14%", align: "right", cell: (m) => <span className="font-medium">{m.quantity}</span> },
    { id: "reference", header: "Referencia", width: "24%", className: "text-muted-foreground", cell: (m) => m.reference_type || "—" },
  ];
  const movementRows = movements.slice((movementPage - 1) * movementPageSize, movementPage * movementPageSize);

  const topMoverColumns: DataTableTimeSectionColumn<InventoryVelocityItem>[] = [
    { id: "product", header: "Producto", width: "40%", cell: (p) => <span className="block truncate font-medium" title={p.name}>{p.name}</span> },
    { id: "sku", header: "SKU", width: "20%", className: "text-muted-foreground", cell: (p) => p.sku || "—" },
    { id: "qty", header: "Vendidos", width: "16%", align: "right", cell: (p) => <span className="font-medium text-green-700 dark:text-green-400">{p.qty_sold}</span> },
    { id: "revenue", header: "Ingresos", width: "24%", align: "right", cell: (p) => format(p.revenue) },
  ];
  const slowMoverColumns: DataTableTimeSectionColumn<InventoryVelocityItem>[] = [
    { id: "product", header: "Producto", width: "45%", cell: (p) => <span className="block truncate font-medium" title={p.name}>{p.name}</span> },
    { id: "sku", header: "SKU", width: "22%", className: "text-muted-foreground", cell: (p) => p.sku || "—" },
    { id: "stock", header: "Stock", width: showCosts ? "13%" : "33%", align: "right", cell: (p) => p.stock },
    ...(showCosts ? [{ id: "value", header: "Valor en stock", width: "20%", align: "right" as const, cell: (p: InventoryVelocityItem) => <span className="font-medium text-amber-700 dark:text-amber-400">{format(p.stock_value)}</span> }] : []),
  ];

  // ── Exportación via servidor ──────────────────────────────────────
  const handlePDFExport = async () => {
    try {
      const res = await fetch("/api/reports/inventory/export", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
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
          <ReportTableSection title="Stock por producto" icon={Package}>
            <DataTableTimeSection
              columns={productColumns} data={productRows} getRowKey={(product) => product.id}
              pagination={{ page: productPage, pageSize: productPageSize, total: filtered.length, onPageChange: setProductPage, onPageSizeChange: setProductPageSize }}
              recordLabel="productos" minWidth="100%" ariaLabel="Stock por producto"
              emptyState="Sin resultados" showFooterPagination={false}
            />
          </ReportTableSection>
        </div>
      )}

      {/* Movements table */}
      {tab === "movements" && !isLoading && (
        <div className="space-y-2">
          <ReportTableSection title="Movimientos (30 días)" icon={ArrowLeftRight}>
            <DataTableTimeSection
              columns={movementColumns} data={movementRows} getRowKey={(movement) => `${movement.product_name}-${movement.created_at}-${movement.movement_type}`}
              pagination={{ page: movementPage, pageSize: movementPageSize, total: movements.length, onPageChange: setMovementPage, onPageSizeChange: setMovementPageSize }}
              recordLabel="movimientos" minWidth="100%" ariaLabel="Movimientos de inventario"
              emptyState="Sin movimientos en los últimos 30 días" showFooterPagination={false}
            />
          </ReportTableSection>
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
            <ReportTableSection title="Productos más vendidos" icon={TrendingUp}>
              <DataTableTimeSection
                columns={topMoverColumns} data={velocity.top_movers} getRowKey={(product) => product.id}
                recordLabel="productos" minWidth="100%" ariaLabel="Productos más vendidos"
                emptyState={`Sin ventas en los últimos ${velocity.window_days} días`} showFooterPagination={false}
              />
            </ReportTableSection>

            <ReportTableSection title="Productos sin movimiento" icon={TrendingDown}>
              <DataTableTimeSection
                columns={slowMoverColumns} data={velocity.slow_movers} getRowKey={(product) => product.id}
                recordLabel="productos" minWidth="100%" ariaLabel="Productos sin movimiento"
                emptyState={`Todo el stock tuvo ventas en los últimos ${velocity.window_days} días`} showFooterPagination={false}
              />
            </ReportTableSection>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
