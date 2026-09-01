// components/dashboard/stock-alerts-card.tsx
"use client";

import * as React from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Info, Package, TrendingDown, TrendingUp, Archive } from "lucide-react";
import { useStockAlerts } from "@/hooks/swr/use-stock-alerts";
import { cn } from "@/lib/utils";

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Más información"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 text-xs leading-relaxed"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}

function ProductRow({ image_url, name, sku, children }: { image_url: string | null; name: string; sku: string | null; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border">
      <div className="relative size-8 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
        {image_url
          ? <Image src={image_url} alt={name} fill className="object-cover" />
          : <Package className="size-4 text-muted-foreground/40" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        {sku && <p className="text-xs text-muted-foreground font-mono">{sku}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground text-center py-8">{text}</p>;
}

function RowSkeletons() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
    </div>
  );
}

const TABS = [
  {
    value: "critical",
    label: "Crítico",
    icon: AlertTriangle,
    info: "Productos más vendidos en los últimos 30 días cuyo stock actual se agotará en menos de 15 días al ritmo de venta actual. Se calcula como stock ÷ (unidades vendidas en 30 días ÷ 30). Ordenados de mayor a menor urgencia.",
  },
  {
    value: "rotation",
    label: "Tendencia",
    icon: TrendingUp,
    info: "Compara las unidades vendidas en los últimos 15 días contra los 15 días anteriores para detectar demanda que se acelera o se frena. Un porcentaje positivo indica que la venta está subiendo; uno negativo, que está cayendo.",
  },
  {
    value: "stale",
    label: "Sin movimiento",
    icon: Archive,
    info: "Productos con stock disponible que no han registrado ninguna venta en los últimos 30 días, o que nunca se han vendido. Útil para detectar inventario estancado o de lenta rotación.",
  },
] as const;

function coverageBadgeVariant(days: number): "destructive" | "secondary" {
  return days <= 7 ? "destructive" : "secondary";
}

export function StockAlertsCard() {
  const { data, isLoading } = useStockAlerts();

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="size-4 text-yellow-500" />
          Alertas de stock
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <Tabs defaultValue="critical">
          <TabsList className="w-full grid grid-cols-3 h-auto p-1">
            {TABS.map((tab) => (
              <div key={tab.value} className="relative flex items-center justify-center min-w-0">
                <TabsTrigger value={tab.value} className="w-full pr-4 text-xs">
                  <span className="truncate">{tab.label}</span>
                </TabsTrigger>
                <div className="absolute right-0.5 top-1/2 -translate-y-1/2">
                  <InfoTip text={tab.info} />
                </div>
              </div>
            ))}
          </TabsList>

          <TabsContent value="critical" className="mt-3">
            {isLoading ? <RowSkeletons /> : !data?.critical.length ? (
              <EmptyState text="Sin productos en riesgo de quiebre" />
            ) : (
              <div className="space-y-2">
                {data.critical.map((p) => (
                  <ProductRow key={p.id} image_url={p.image_url} name={p.name} sku={p.sku}>
                    <div className="text-right shrink-0">
                      <Badge variant={coverageBadgeVariant(p.days_coverage)}>
                        {p.days_coverage <= 0 ? "Agotado" : `${p.days_coverage}d de stock`}
                      </Badge>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.units_sold} uds / 30d</p>
                    </div>
                  </ProductRow>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rotation" className="mt-3">
            {isLoading ? <RowSkeletons /> : !data?.rotation.length ? (
              <EmptyState text="Sin cambios relevantes de rotación" />
            ) : (
              <div className="space-y-2">
                {data.rotation.map((p) => {
                  const up = p.trend_pct >= 0;
                  return (
                    <ProductRow key={p.id} image_url={p.image_url} name={p.name} sku={p.sku}>
                      <div className="text-right shrink-0">
                        <Badge variant="outline" className={cn("gap-1", up ? "text-emerald-600 border-emerald-200" : "text-red-600 border-red-200")}>
                          {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                          {up ? "+" : ""}{p.trend_pct}%
                        </Badge>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{p.stock} uds en stock</p>
                      </div>
                    </ProductRow>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="stale" className="mt-3">
            {isLoading ? <RowSkeletons /> : !data?.stale.length ? (
              <EmptyState text="Sin productos estancados" />
            ) : (
              <div className="space-y-2">
                {data.stale.map((p) => (
                  <ProductRow key={p.id} image_url={p.image_url} name={p.name} sku={p.sku}>
                    <div className="text-right shrink-0">
                      <Badge variant="secondary">
                        {p.days_since_sale !== null ? `${p.days_since_sale}d sin venta` : "Nunca vendido"}
                      </Badge>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.stock} uds en stock</p>
                    </div>
                  </ProductRow>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
