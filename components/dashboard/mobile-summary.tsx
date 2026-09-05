// components/dashboard/mobile-summary.tsx
"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useTimezone, formatInTZ } from "@/hooks/swr/use-timezone";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, AlertTriangle } from "lucide-react";

type Props = { lowStock: any[]; recentSales: any[]; isLoading: boolean; showProfit?: boolean };

export function MobileSummary({ lowStock, recentSales, isLoading, showProfit = true }: Props) {
  const { push } = useRouter();
  const { format } = useCurrency();
  const tz = useTimezone();
  const formatDateFull = (d: string) =>
    formatInTZ(d, tz, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-3 lg:hidden">
      {(isLoading || lowStock.length > 0) && (
        <Card>
          <CardContent className="pl-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="size-4 text-yellow-500" />
              <span className="text-sm font-medium">Alertas de stock</span>
            </div>
            <div className="space-y-2">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
                : lowStock.slice(0, 4).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="relative size-7 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                      {p.image_url
                        ? <Image src={p.image_url} alt={p.name} fill className="object-cover" />
                        : <Package className="size-3.5 text-muted-foreground/40" />
                      }
                    </div>
                    <p className="text-sm flex-1 truncate">{p.name}</p>
                    <Badge variant={Number(p.stock) === 0 ? "destructive" : "secondary"} className="shrink-0 text-xs">
                      {Number(p.stock) === 0 ? "Agotado" : `${p.stock} uds`}
                    </Badge>
                  </div>
                ))
              }
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pl-4">
          <p className="text-sm font-medium mb-3">Últimas ventas</p>
          <div className="space-y-2">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
              : !recentSales.length
                ? <p className="text-sm text-muted-foreground text-center py-8">Sin ventas en este período</p>
                : recentSales.slice(0, 4).map((sale: any) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border cursor-pointer active:scale-[0.99] transition-transform"
                    onClick={() => push(`/sales/${sale.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-medium">{sale.sale_number}</p>
                      <p className="text-xs text-muted-foreground truncate" suppressHydrationWarning>
                        {sale.customer_name ?? "Anónimo"} · {formatDateFull(sale.sold_at)}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="font-bold text-sm">{format(Number(sale.total))}</p>
                      {showProfit && (
                        <p className="text-xs text-green-600">{format(Number(sale.profit))}</p>
                      )}
                    </div>
                  </div>
                ))
            }
          </div>
        </CardContent>
      </Card>
    </div>
  );
}