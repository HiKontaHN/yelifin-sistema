// app/(dashboard)/inventory/[id]/page.tsx
"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Package,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  Layers,
  ShoppingCart,
  LineChart as LineChartIcon,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useTimezone, formatInTZ } from "@/hooks/swr/use-timezone";
import { InfoTooltip } from "@/components/shared/info-tooltip";

// ── Types ─────────────────────────────────────────────────────────────

type ProductVariantDetail = {
  id: number;
  variant_name: string;
  sku: string | null;
  price_override: number | null;
  image_url: string | null;
  is_active: boolean;
  stock: number;
  avg_cost: number;
};

type BatchRow = {
  id: number;
  qty_in: number;
  qty_available: number;
  unit_cost: number;
  received_at: string;
  variant_id: number | null;
  variant_name: string | null;
};

type MovementRow = {
  id: number;
  movement_type: string;
  quantity: number;
  reference_type: string | null;
  reference_id: number | null;
  sale_number: string | null;
  variant_id: number | null;
  variant_name: string | null;
  created_at: string;
};

type PurchaseHistoryRow = {
  purchased_at: string;
  supplier_name: string | null;
  unit_cost: number;
  unit_cost_usd: number | null;
  quantity: number;
  currency: string;
  variant_name: string | null;
};

type CostHistoryRow = {
  id: number;
  qty_in: number;
  unit_cost: number;
  received_at: string;
  variant_id: number | null;
  variant_name: string | null;
};

type ProductDetail = {
  id: number;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  price: number;
  image_url: string | null;
  is_active: boolean;
  is_service: boolean;
  created_at: string;
  total_stock: number;
  avg_cost: number;
  last_cost: number;
  variants: ProductVariantDetail[];
  batches: BatchRow[];
  sales_stats: {
    total_units_sold: number;
    total_revenue: number;
    total_profit: number;
    avg_unit_price: number;
    avg_unit_cost: number;
    sales_count: number;
    last_sold_at: string | null;
  };
  purchase_history: PurchaseHistoryRow[];
  movements: MovementRow[];
  cost_history: CostHistoryRow[];
};

// ── Hook ──────────────────────────────────────────────────────────────

function useProductDetail(id: number | null) {
  const { firebaseUser } = useAuth();

  const fetcher = async (url: string) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Error al cargar el producto");
    }

    return res.json();
  };

  const { data, error, isLoading } = useSWR(
    firebaseUser && id ? `/api/products/${id}/detail` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  return {
    product:   (data?.data ?? null) as ProductDetail | null,
    isLoading,
    error:     error?.message ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function calcMargin(price: number, cost: number): number {
  if (price <= 0) return 0;
  return ((price - cost) / price) * 100;
}

function MarginBadge({ margin }: { margin: number }) {
  if (margin > 20)
    return <Badge className="bg-green-100 text-green-700 border-green-200">{margin.toFixed(1)}%</Badge>;
  if (margin > 0)
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200">{margin.toFixed(1)}%</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200">{margin.toFixed(1)}%</Badge>;
}

function movementBadge(type: string) {
  if (type === "IN")
    return <Badge className="bg-green-100 text-green-700 border-green-200">Entrada</Badge>;
  if (type === "OUT")
    return <Badge className="bg-red-100 text-red-700 border-red-200">Salida</Badge>;
  return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Ajuste</Badge>;
}

function referenceLabel(
  type: string | null,
  id: number | null,
  saleNumber: string | null
): string {
  if (!type || type === "ADJUSTMENT" || type === "INITIAL") return "Ajuste";
  if (type === "SALE") return `Venta ${saleNumber ?? `#${id ?? ""}`}`;
  if (type === "PURCHASE") return `Compra #${id ?? ""}`;
  return type;
}

// ── Skeleton ──────────────────────────────────────────────────────────

function ProductDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

// ── Purchase price chart ──────────────────────────────────────────────

function formatAxisCost(v: number) {
  if (v >= 1_000_000) return `L${Math.round(v / 1_000_000)}M`;
  if (v >= 1_000)     return `L${Math.round(v / 1_000)}k`;
  return `L${v}`;
}

function PurchasePriceChart({
  data,
  format,
  tz,
}: {
  data: CostHistoryRow[];
  format: (n: number) => string;
  tz: string;
}) {
  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-HN", {
      day: "numeric", month: "short", timeZone: tz,
    });

  const chartData = data.map((b) => ({
    label:   shortDate(b.received_at),
    costo:   b.unit_cost,
    qty:     b.qty_in,
    variant: b.variant_name ?? null,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fontWeight: 500 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fontWeight: 500 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAxisCost}
        />
        <Tooltip
          formatter={(v: number) => format(v)}
          contentStyle={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            fontWeight: 500,
          }}
        />
        <Line
          type="monotone"
          dataKey="costo"
          stroke="#3B82F6"
          strokeWidth={2.5}
          dot={false}
          name="Costo"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

type Props = { params: Promise<{ id: string }> };

export default function ProductDetailPage({ params }: Props) {
  const { id }             = use(params);
  const numericId          = Number(id);
  const { product, isLoading, error } = useProductDetail(numericId);
  const { format }         = useCurrency();
  const tz                 = useTimezone();
  const { push }           = useRouter();

  if (isLoading) return <ProductDetailSkeleton />;

  if (error || !product) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Package className="size-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">{error ?? "Producto no encontrado"}</p>
        <Button variant="outline" asChild>
          <Link href="/inventory">Volver al inventario</Link>
        </Button>
      </div>
    );
  }

  const margin        = calcMargin(product.price, product.avg_cost);
  const hasVariants   = product.variants.length > 0;
  const hasSales      = product.sales_stats.sales_count > 0;
  const profitMarginP = product.sales_stats.total_revenue > 0
    ? (product.sales_stats.total_profit / product.sales_stats.total_revenue) * 100
    : 0;

  const dateOpts: Intl.DateTimeFormatOptions = {
    day: "numeric", month: "short", year: "numeric",
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto mb-8">

      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => push("/inventory")}>
          <ArrowLeft className="size-4" />
        </Button>

        {/* Image */}
        <div className="relative size-16 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0">
          {product.image_url
            ? <Image src={product.image_url} alt={product.name} fill className="object-cover" />
            : <Package className="size-7 text-muted-foreground/40" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight leading-tight">{product.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {product.sku && (
              <Badge variant="outline" className="font-mono text-xs">{product.sku}</Badge>
            )}
            {product.barcode && (
              <Badge variant="outline" className="font-mono text-xs">{product.barcode}</Badge>
            )}
            {product.is_service && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">Servicio</Badge>
            )}
            {product.is_active
              ? <Badge className="bg-green-100 text-green-700 border-green-200">Activo</Badge>
              : <Badge className="bg-red-100 text-red-700 border-red-200">Inactivo</Badge>
            }
          </div>
          {product.description && (
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{product.description}</p>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {/* Stock */}
        <Card>
          <CardContent className="pl-3">
            <p className="text-xs text-muted-foreground mb-1">Stock actual</p>
            <p className={`text-xl font-bold ${
              product.is_service
                ? "text-blue-600"
                : product.total_stock === 0
                ? "text-destructive"
                : product.total_stock < 5
                ? "text-amber-600"
                : "text-green-600"
            }`}>
              {product.is_service ? "—" : product.total_stock}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {product.is_service ? "servicio" : "unidades"}
            </p>
          </CardContent>
        </Card>

        {/* Precio */}
        <Card>
          <CardContent className="pl-3">
            <p className="text-xs text-muted-foreground mb-1">Precio de venta</p>
            <p className="text-xl font-bold">{format(product.price)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">precio base</p>
          </CardContent>
        </Card>

        {/* Costo promedio */}
        <Card>
          <CardContent className="pl-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              Costo promedio
              <InfoTooltip
                content={
                  <div className="space-y-1">
                    <p className="font-semibold">Costo promedio del stock actual</p>
                    <p>Promedio ponderado de lo que costaron las unidades que tienes en bodega.</p>
                    <p className="opacity-80">
                      Cada compra entra como un lote con su propio costo; el promedio pondera
                      cada lote por las unidades que le quedan. Por eso cambia cuando compras
                      a un precio distinto, y puede diferir del último costo.
                    </p>
                  </div>
                }
              />
            </p>
            <p className="text-xl font-bold">
              {product.is_service ? "—" : format(product.avg_cost)}
            </p>
            {!product.is_service && product.last_cost > 0 && product.last_cost !== product.avg_cost && (
              <p className="text-xs text-muted-foreground mt-0.5">
                último: {format(product.last_cost)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Margen */}
        <Card>
          <CardContent className="pl-3">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              Margen
              <InfoTooltip
                content={
                  <div className="space-y-1">
                    <p className="font-semibold">Margen sobre el precio de venta</p>
                    <p>(Precio de venta − Costo promedio) ÷ Precio de venta × 100</p>
                    {!product.is_service && product.price > 0 && (
                      <p className="opacity-80">
                        ({format(product.price)} − {format(product.avg_cost)}) ÷ {format(product.price)} = {margin.toFixed(1)}%
                      </p>
                    )}
                    <p className="opacity-80">
                      De cada venta a este precio, ese porcentaje queda como ganancia (antes de otros gastos).
                    </p>
                  </div>
                }
              />
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {margin > 20
                ? <TrendingUp className="size-4 text-green-600 shrink-0" />
                : margin > 0
                ? <Minus className="size-4 text-amber-600 shrink-0" />
                : <TrendingDown className="size-4 text-destructive shrink-0" />
              }
              <span className={`text-xl font-bold ${
                margin > 20 ? "text-green-600" : margin > 0 ? "text-amber-600" : "text-destructive"
              }`}>
                {product.is_service ? "—" : `${margin.toFixed(1)}%`}
              </span>
            </div>
            {!product.is_service && (
              <p className="text-xs text-muted-foreground mt-0.5">sobre precio</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Variantes */}
      {hasVariants && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="size-4" />
              Variantes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variante</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Costo prom.</TableHead>
                  <TableHead>Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map((v) => {
                  const vPrice  = v.price_override ?? product.price;
                  const vMargin = calcMargin(vPrice, v.avg_cost);
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {v.image_url && (
                            <div className="relative size-7 rounded overflow-hidden bg-muted shrink-0">
                              <Image src={v.image_url} alt={v.variant_name} fill className="object-cover" />
                            </div>
                          )}
                          {v.variant_name}
                          {!v.is_active && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Inactiva</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {v.sku ?? "—"}
                      </TableCell>
                      <TableCell>
                        {v.price_override != null
                          ? format(v.price_override)
                          : <span className="text-muted-foreground text-xs">Base: {format(product.price)}</span>
                        }
                      </TableCell>
                      <TableCell>
                        <span className={v.stock === 0 ? "text-destructive font-medium" : ""}>{v.stock}</span>
                      </TableCell>
                      <TableCell>{v.stock > 0 ? format(v.avg_cost) : "—"}</TableCell>
                      <TableCell>
                        {v.stock > 0 ? <MarginBadge margin={vMargin} /> : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Análisis de rentabilidad */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="size-4" />
            Análisis de rentabilidad
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {hasSales ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Total vendido</p>
                <p className="text-lg font-bold mt-0.5">{product.sales_stats.total_units_sold} uds</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ingresos totales</p>
                <p className="text-lg font-bold mt-0.5">{format(product.sales_stats.total_revenue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Ganancia total
                  <InfoTooltip
                    content={
                      <div className="space-y-1">
                        <p className="font-semibold">Ganancia acumulada de este producto</p>
                        <p>Ingresos totales − costo de las unidades vendidas</p>
                        <p className="opacity-80">
                          {format(product.sales_stats.total_revenue)} de ingresos menos lo que
                          te costaron esas unidades = {format(product.sales_stats.total_profit)}
                        </p>
                        <p className="opacity-80">
                          Cada venta usa el costo real del lote del que salió la unidad (FIFO)
                          y el precio realmente cobrado, con descuentos incluidos.
                        </p>
                      </div>
                    }
                  />
                </p>
                <p className={`text-lg font-bold mt-0.5 ${product.sales_stats.total_profit >= 0 ? "text-green-600" : "text-destructive"}`}>
                  {format(product.sales_stats.total_profit)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Margen promedio
                  <InfoTooltip
                    content={
                      <div className="space-y-1">
                        <p className="font-semibold">Margen real según tus ventas</p>
                        <p>Ganancia total ÷ Ingresos totales × 100</p>
                        <p className="opacity-80">
                          {format(product.sales_stats.total_profit)} ÷ {format(product.sales_stats.total_revenue)} = {profitMarginP.toFixed(1)}%
                        </p>
                        <p className="opacity-80">
                          A diferencia del margen sobre precio, este usa lo realmente cobrado
                          en cada venta (con descuentos incluidos), por eso puede diferir.
                        </p>
                      </div>
                    }
                  />
                </p>
                <p className="text-lg font-bold mt-0.5">
                  <span className={profitMarginP > 20 ? "text-green-600" : profitMarginP > 0 ? "text-amber-600" : "text-destructive"}>
                    {profitMarginP.toFixed(1)}%
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Número de ventas</p>
                <p className="text-lg font-bold mt-0.5">{product.sales_stats.sales_count}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Última venta</p>
                <p className="text-sm font-medium mt-0.5">
                  {product.sales_stats.last_sold_at
                    ? formatInTZ(product.sales_stats.last_sold_at, tz, dateOpts)
                    : "—"
                  }
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <ShoppingCart className="size-8 text-muted-foreground/40" />
              <p className="text-sm">Sin ventas registradas</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Batches FIFO */}
      {!product.is_service && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="size-4" />
              Batches de inventario (capas FIFO)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {product.batches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin entradas de inventario</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      {hasVariants && <TableHead>Variante</TableHead>}
                      <TableHead>Costo unitario</TableHead>
                      <TableHead className="text-right">Compradas</TableHead>
                      <TableHead className="text-right">Disponibles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-sm">
                          {formatInTZ(b.received_at, tz, dateOpts)}
                        </TableCell>
                        {hasVariants && (
                          <TableCell className="text-sm text-muted-foreground">
                            {b.variant_name ?? "Base"}
                          </TableCell>
                        )}
                        <TableCell className="text-sm">{format(Number(b.unit_cost))}</TableCell>
                        <TableCell className="text-right text-sm">{b.qty_in}</TableCell>
                        <TableCell className="text-right text-sm">
                          <span className={b.qty_available === 0 ? "text-muted-foreground" : "font-medium"}>
                            {b.qty_available}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gráfico de evolución del precio de entrada */}
      {product.cost_history.length > 1 && (
        <Card>
          <CardHeader className="pb-3 pt-5 px-5">
            <CardTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
              <LineChartIcon className="size-4" />
              Evolución del precio de entrada
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-1">
            <PurchasePriceChart
              data={product.cost_history}
              format={format}
              tz={tz}
            />
          </CardContent>
        </Card>
      )}

      {/* Historial de compras */}
      {product.purchase_history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4" />
              Historial de compras
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Costo USD</TableHead>
                  <TableHead>Costo local</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.purchase_history.map((ph, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">
                      {formatInTZ(ph.purchased_at, tz, dateOpts)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ph.supplier_name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ph.unit_cost_usd != null && ph.unit_cost_usd > 0
                        ? `$${ph.unit_cost_usd.toFixed(4)}`
                        : <span className="text-muted-foreground">—</span>
                      }
                    </TableCell>
                    <TableCell className="text-sm">{format(ph.unit_cost)}</TableCell>
                    <TableCell className="text-right text-sm">{ph.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Movimientos recientes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4" />
            Movimientos recientes
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {product.movements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin movimientos registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Referencia</TableHead>
                    {hasVariants && <TableHead>Variante</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {product.movements.map((m) => (
                    <TableRow
                      key={m.id}
                      onClick={() => m.reference_type === "SALE" && m.reference_id && push(`/sales/${m.reference_id}`)}
                      className={m.reference_type === "SALE" ? "cursor-pointer" : undefined}
                    >
                      <TableCell className="text-sm">
                        {formatInTZ(m.created_at, tz, dateOpts)}
                      </TableCell>
                      <TableCell>{movementBadge(m.movement_type)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{m.quantity}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {referenceLabel(m.reference_type, m.reference_id, m.sale_number)}
                      </TableCell>
                      {hasVariants && (
                        <TableCell className="text-sm text-muted-foreground">
                          {m.variant_name ?? "Base"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <p className="text-xs text-muted-foreground text-center">
        Registrado el {formatInTZ(product.created_at, tz, dateOpts)}
      </p>
    </div>
  );
}
