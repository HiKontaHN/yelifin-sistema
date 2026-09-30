// components/dashboard/product-sales-today.tsx
"use client";

import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, ShoppingBag } from "lucide-react";
import { useCurrency } from "@/hooks/swr/use-currency";

type ProductSale = {
  id: number;
  name: string;
  image_url: string | null;
  units_sold: number;
  revenue: number;
  profit: number | null;
};

type Props = { products: ProductSale[]; isLoading: boolean; showProfit: boolean };

// "Ventas por producto" — reemplaza el ranking "Top productos" cuando el
// período seleccionado es "Hoy": ahí no tiene sentido un top acotado, se
// quiere ver TODO lo que se vendió en el día.
export function ProductSalesToday({ products, isLoading, showProfit }: Props) {
  const { format } = useCurrency();

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base flex items-center gap-1.5">
          <ShoppingBag className="size-4" />
          Ventas por producto
        </CardTitle>
        <CardDescription>Todos los productos vendidos hoy</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sin ventas hoy</p>
        ) : (
          <div className="divide-y max-h-[420px] overflow-y-auto">
            {products.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="relative size-9 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                  {p.image_url
                    ? <Image src={p.image_url} alt={p.name} fill className="object-cover" />
                    : <Package className="size-4 text-muted-foreground/40" />
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.units_sold} unidad{p.units_sold !== 1 ? "es" : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{format(p.revenue)}</p>
                  {showProfit && p.profit != null && (
                    <p className="text-xs text-green-600">+{format(p.profit)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
