// app/(dashboard)/inventory/movements/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownCircle, ArrowUpCircle, Package, Layers,
  SlidersHorizontal, X, TrendingUp, TrendingDown, BoxIcon,
  Plus, ShoppingCart, PackagePlus, RotateCcw, FilePen,
} from "lucide-react";
import { useMovements, Movement } from "@/hooks/swr/use-movements";
import { useProducts } from "@/hooks/swr/use-products";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { Fab } from "@/components/ui/fab";
import { SearchBar } from "@/components/shared/search-bar";
import { DataTableTimeSection, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
import { useTimezone } from "@/hooks/swr/use-timezone";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import {
  DateRangePicker,
  type DateRangeValue,
} from "@/components/shared/date-range-picker";
import { useDebounce } from "@/hooks/use-debounce";
import { toLocalDateInput } from "@/lib/date-utils";

// ── Helpers ────────────────────────────────────────────────────────────

const formatUSD = (value: number | null | undefined) => {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(Number(value));
};

const formatDateOnly = (dateString: string) =>
  new Date(dateString).toLocaleDateString("es-HN", {
    day: "numeric", month: "short", year: "numeric",
  });

const currentMonthRange = (): DateRangeValue => {
  const now = new Date();
  return {
    from: toLocalDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toLocalDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

const formatRangeDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString("es-HN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

type FormatFn = (v: number | null | undefined) => string;

// ── TypeBadge ──────────────────────────────────────────────────────────

function TypeBadge({ m }: { m: Movement }) {
  if (m.reference_type === "ADJUSTMENT") {
    return m.movement_type === "IN" ? (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1" variant="outline">
        <TrendingUp className="size-3" /> Ajuste +
      </Badge>
    ) : (
      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1" variant="outline">
        <TrendingDown className="size-3" /> Ajuste −
      </Badge>
    );
  }
  if (m.reference_type === "INITIAL") {
    return (
      <Badge className="bg-purple-100 text-purple-700 border-purple-200 gap-1" variant="outline">
        <BoxIcon className="size-3" /> Inicial
      </Badge>
    );
  }
  if (m.reference_type === "SALE_CANCELLED") {
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-200 gap-1" variant="outline">
        <RotateCcw className="size-3" /> Cancelación
      </Badge>
    );
  }
  if (m.reference_type === "SALE_EDITED") {
    return m.movement_type === "OUT" ? (
      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 gap-1" variant="outline">
        <FilePen className="size-3" /> Edición +
      </Badge>
    ) : (
      <Badge className="bg-orange-100 text-orange-700 border-orange-200 gap-1" variant="outline">
        <FilePen className="size-3" /> Edición −
      </Badge>
    );
  }
  if (m.movement_type === "IN") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200 gap-1" variant="outline">
        <ArrowDownCircle className="size-3" /> Entrada
      </Badge>
    );
  }
  return (
    <Badge className="bg-orange-100 text-orange-700 border-orange-200 gap-1" variant="outline">
      <ArrowUpCircle className="size-3" /> Salida
    </Badge>
  );
}

// ── ProductCell — producto + variante ──────────────────────────────────

function ProductCell({ m }: { m: Movement }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative size-8 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
        {m.image_url ? (
          <img
            src={m.image_url}
            alt={m.product_name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <Package className="size-4 text-muted-foreground/40" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate max-w-36">{m.product_name}</p>
        {/* Variante */}
        {m.variant_name && (
          <div className="flex items-center gap-1 mt-0.5">
            <Layers className="size-2.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">{m.variant_name}</span>
          </div>
        )}
        {/* SKU — muestra variant_sku si existe, si no el del producto */}
        {(m.variant_sku ?? m.sku) && (
          <p className="text-xs text-muted-foreground font-mono">
            {m.variant_sku ?? m.sku}
          </p>
        )}
      </div>
    </div>
  );
}

// ── MovementDetail (tabla desktop) ────────────────────────────────────

function MovementDetail({ m, format, showCosts }: { m: Movement; format: FormatFn; showCosts: boolean }) {
  if (m.reference_type === "ADJUSTMENT" || m.reference_type === "INITIAL") {
    return (
      <p className="text-xs text-muted-foreground italic">
        {m.notes ?? "Sin comentario"}
      </p>
    );
  }
  if (m.reference_type === "SALE_CANCELLED" || m.reference_type === "SALE_EDITED") {
    return (
      <p className="text-xs text-muted-foreground italic">
        {m.sale_number ?? m.notes ?? "—"}
      </p>
    );
  }
  if (m.movement_type === "IN") {
    if (!showCosts) return <span className="text-muted-foreground text-xs">—</span>;
    const isUSD = m.purchase_currency === "USD";
    return (
      <div className="text-xs space-y-0.5">
        {/* Solo mostrar USD si la compra fue en dólares */}
        {isUSD && (
          <p className="text-muted-foreground">
            USD: <span className="text-foreground font-medium">{formatUSD(m.unit_cost_usd)}</span>
            {m.exchange_rate && (
              <span className="text-muted-foreground ml-1">@ {m.exchange_rate}</span>
            )}
          </p>
        )}
        <p className="text-muted-foreground">
          {isUSD ? "HNL" : (m.purchase_currency ?? "Local")}:{" "}
          <span className="text-foreground font-medium">
            {isUSD ? format(m.unit_cost_hnl) : format(m.unit_cost_purchase)}
          </span>
        </p>
        {Number(m.shipping_per_unit) > 0 && (
          <p className="text-muted-foreground">
            Envío/u: <span className="text-foreground font-medium">{format(m.shipping_per_unit)}</span>
          </p>
        )}
      </div>
    );
  }
  // OUT — venta
  return (
    <div className="text-xs space-y-0.5">
      <p className="text-muted-foreground">
        Precio: <span className="text-foreground font-medium">{format(m.unit_price)}</span>
      </p>
      {showCosts && (
        <p className="text-muted-foreground">
          Costo: <span className="text-foreground font-medium">{format(m.unit_cost)}</span>
        </p>
      )}
      {m.customer_name && (
        <p className="text-muted-foreground">
          Cliente: <span className="text-foreground font-medium">{m.customer_name}</span>
        </p>
      )}
      {m.sale_number && (
        <p className="text-muted-foreground font-mono">{m.sale_number}</p>
      )}
    </div>
  );
}

// ── MovementTotal / MovementProfit ─────────────────────────────────────

function MovementTotal({ m, format }: { m: Movement; format: FormatFn }) {
  if (
    m.reference_type === "ADJUSTMENT" ||
    m.reference_type === "INITIAL"    ||
    m.reference_type === "SALE_CANCELLED" ||
    m.reference_type === "SALE_EDITED"
  ) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  if (m.movement_type === "IN")  return <span className="font-medium">{format(m.total_cost)}</span>;
  return <span className="font-medium">{format(m.line_total)}</span>;
}

function MovementProfit({ m, format }: { m: Movement; format: FormatFn }) {
  if (m.reference_type === "SALE") {
    const profit = Number(m.profit);
    return (
      <span className={profit >= 0 ? "text-green-600 font-medium" : "text-destructive font-medium"}>
        {format(m.profit)}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

// ── MobileDetail ───────────────────────────────────────────────────────

function MobileDetail({ m, format, showCosts, showProfit }: { m: Movement; format: FormatFn; showCosts: boolean; showProfit: boolean }) {
  if (m.reference_type === "ADJUSTMENT" || m.reference_type === "INITIAL") {
    return (
      <div className="pt-3 border-t">
        <p className="text-xs text-muted-foreground italic">{m.notes ?? "Sin comentario"}</p>
      </div>
    );
  }
  if (m.reference_type === "SALE_CANCELLED" || m.reference_type === "SALE_EDITED") {
    return (
      <div className="pt-3 border-t">
        <p className="text-xs text-muted-foreground italic">{m.sale_number ?? m.notes ?? "—"}</p>
      </div>
    );
  }
  if (m.movement_type === "IN") {
    const isUSD = m.purchase_currency === "USD";
    if (!showCosts) {
      return (
        <div className="pt-3 border-t text-center text-xs text-muted-foreground">—</div>
      );
    }
    return (
      <div className="pt-3 border-t">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {isUSD ? (
            <>
              <div>
                <p className="text-muted-foreground">Costo USD</p>
                <p className="font-medium">{formatUSD(m.unit_cost_usd)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Costo HNL</p>
                <p className="font-medium">{format(m.unit_cost_hnl)}</p>
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <p className="text-muted-foreground">Costo ({m.purchase_currency ?? "Local"})</p>
              <p className="font-medium">{format(m.unit_cost_purchase)}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Total</p>
            <p className="font-bold text-primary">{format(m.total_cost)}</p>
          </div>
        </div>
        {Number(m.shipping_per_unit) > 0 && (
          <div className="col-span-3 pt-1.5 border-t text-xs mt-1.5">
            <span className="text-muted-foreground">Envío/u: </span>
            <span className="font-medium">{format(m.shipping_per_unit)}</span>
          </div>
        )}
      </div>
    );
  }
  // OUT — venta
  const colCount = showCosts && showProfit ? 3 : showCosts || showProfit ? 2 : 1;
  return (
    <div className="pt-3 border-t space-y-2">
      <div className={`grid grid-cols-${colCount} gap-2 text-center text-xs`}>
        <div>
          <p className="text-muted-foreground">Precio</p>
          <p className="font-medium">{format(m.unit_price)}</p>
        </div>
        {showCosts && (
          <div>
            <p className="text-muted-foreground">Costo</p>
            <p className="font-medium">{format(m.unit_cost)}</p>
          </div>
        )}
        {showProfit && (
          <div>
            <p className="text-muted-foreground">Ganancia</p>
            <p className={`font-bold ${Number(m.profit) >= 0 ? "text-green-600" : "text-destructive"}`}>
              {format(m.profit)}
            </p>
          </div>
        )}
      </div>
      {(m.customer_name || m.sale_number) && (
        <div className="flex justify-between text-xs pt-1.5 border-t text-muted-foreground">
          {m.customer_name && (
            <span>Cliente: <span className="text-foreground">{m.customer_name}</span></span>
          )}
          {m.sale_number && <span className="font-mono">{m.sale_number}</span>}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function MovementsPage() {
  const { push } = useRouter();
  const timezone = useTimezone();
  const dateKeyFormatter = useMemo(() => new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }), [timezone]);
  const dateTitleFormatter = useMemo(() => new Intl.DateTimeFormat("es-HN", {
    timeZone: timezone, weekday: "long", year: "numeric", month: "long", day: "2-digit",
  }), [timezone]);

  const [search,        setSearch]        = useState("");
  const [dateRange,     setDateRange]     = useState<DateRangeValue>(currentMonthRange);
  const [productId,     setProductId]     = useState<number | undefined>();
  const [typeFilter,    setTypeFilter]    = useState("all");
  const [page,          setPage]          = useState(1);
  const [pageSize,      setPageSize]      = useState(10);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => { setPage(1); }, [
    debouncedSearch, typeFilter, productId,
    dateRange.from, dateRange.to,
  ]);

  const { movements, isLoading, total } = useMovements({
    from:       dateRange.from,
    to:         dateRange.to,
    product_id: productId,
    search:     debouncedSearch || undefined,
    type:       typeFilter !== "all" ? typeFilter : undefined,
    page,
    limit:      pageSize,
  });

  const { products }              = useProducts();
  const { format: formatCurrency } = useCurrency();
  const { show_costs: showCosts, show_profit: showProfit } = useModulePermissions("INVENTORY");

  const format = (v: number | null | undefined): string => {
    if (v == null) return "—";
    return formatCurrency(Number(v));
  };

  const columns: DataTableTimeSectionColumn<Movement>[] = [
    { id: "product", header: "Producto", width: "clamp(12rem, 20vw, 16rem)", cell: (m) => <ProductCell m={m} /> },
    { id: "type", header: "Tipo", width: "clamp(7rem, 12vw, 9rem)", cell: (m) => <TypeBadge m={m} /> },
    { id: "quantity", header: "Cant.", width: 72, className: "font-medium tabular-nums", cell: (m) => m.quantity },
    { id: "detail", header: "Detalle", cell: (m) => <MovementDetail m={m} format={format} showCosts={showCosts} /> },
    ...(showCosts ? [{ id: "total", header: "Total", width: 110, align: "right" as const, cell: (m: Movement) => <MovementTotal m={m} format={format} /> }] : []),
    ...(showProfit ? [{ id: "profit", header: "Ganancia", width: 110, align: "right" as const, cell: (m: Movement) => <MovementProfit m={m} format={format} /> }] : []),
  ];
  const renderMovementDate = (_key: string, rows: readonly Movement[]) => {
    const parts = dateTitleFormatter.formatToParts(new Date(rows[0].created_at));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
    const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("es-HN") + value.slice(1);
    return `${capitalize(part("weekday"))} ${part("day")} de ${capitalize(part("month"))} del ${part("year")}`;
  };

  const defaultRange = currentMonthRange();
  const hasFilters =
    search ||
    productId !== undefined ||
    typeFilter !== "all" ||
    dateRange.from !== defaultRange.from ||
    dateRange.to !== defaultRange.to;

  const clearAll = () => {
    setSearch("");
    setDateRange(currentMonthRange());
    setProductId(undefined);
    setTypeFilter("all");
    setPage(1);
  };

  const periodLabel = dateRange.from === dateRange.to
    ? formatRangeDate(dateRange.from)
    : `${formatRangeDate(dateRange.from)} — ${formatRangeDate(dateRange.to)}`;

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Movimientos</h1>
        <p className="text-muted-foreground text-sm">Entradas y salidas · {periodLabel}</p>
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        <div>
          <SearchBar
            value={search}
            onChange={setSearch}
            size="full"
            placeholder="Buscar producto, variante, SKU, cliente..."
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            className="sm:w-auto"
          />

          <SearchableSelect
            value={productId?.toString() ?? "all"}
            onValueChange={(v) => setProductId(v === "all" ? undefined : Number(v))}
            items={products.map((p) => ({ value: p.id.toString(), label: p.name }))}
            defaultOption={{ value: "all", label: "Todos los productos" }}
            className="w-full sm:w-64"
          />

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="IN">Entradas (compras)</SelectItem>
              <SelectItem value="OUT">Salidas (ventas)</SelectItem>
              <SelectItem value="ADJUSTMENT">Ajustes</SelectItem>
              <SelectItem value="INITIAL">Inventario inicial</SelectItem>
              <SelectItem value="CANCELLED">Cancelaciones</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost" size="sm"
              className="gap-1.5 text-muted-foreground shrink-0"
              onClick={clearAll}
            >
              <X className="size-3.5" /> Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabla — desktop ──────────────────────────────────────── */}
      <DataTableTimeSection
          columns={columns}
          data={movements}
          getRowKey={(movement) => movement.id}
          getGroupKey={(movement) => dateKeyFormatter.format(new Date(movement.created_at))}
          renderGroupHeader={renderMovementDate}
          renderMobileRow={(m) => (
            <Card key={m.id}>
              <CardContent className="pl-3.5">
                <div className="mb-3 flex items-center gap-3">
                  <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {m.image_url ? (
                      <img src={m.image_url} alt={m.product_name} className="absolute inset-0 size-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    ) : <Package className="size-5 text-muted-foreground/40" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.product_name}</p>
                    {m.variant_name && <div className="flex items-center gap-1"><Layers className="size-2.5 shrink-0 text-muted-foreground" /><span className="truncate text-xs text-muted-foreground">{m.variant_name}</span></div>}
                    <p className="text-xs text-muted-foreground">{formatDateOnly(m.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1"><TypeBadge m={m} /><span className="text-xs text-muted-foreground">{m.quantity} uds</span></div>
                </div>
                <MobileDetail m={m} format={format} showCosts={showCosts} showProfit={showProfit} />
              </CardContent>
            </Card>
          )}
          isLoading={isLoading}
          emptyState="No hay movimientos en este período"
          recordLabel={total === 1 ? "movimiento" : "movimientos"}
          ariaLabel="Movimientos de inventario"
          minWidth={showCosts && showProfit ? 860 : showCosts || showProfit ? 750 : 640}
          stickyOffset="var(--data-table-sticky-offset)"
          className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]"
          showFooterPagination={false}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: (size) => { setPage(1); setPageSize(size); },
          }}
        />

      {/* FAB */}
      <Fab
        actions={[
          { label: "Nuevo producto",  icon: Plus,        onClick: () => push("/inventory") },
          { label: "Registrar venta", icon: ShoppingCart, onClick: () => push("/sales/new") },
          { label: "Agregar stock",   icon: PackagePlus,  onClick: () => push("/inventory") },
        ]}
      />
    </div>
  );
}
