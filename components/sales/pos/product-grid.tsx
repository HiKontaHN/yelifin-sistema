// components/sales/pos/product-grid.tsx
"use client";

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Minus, Package, Plus } from "lucide-react";
import type { CartItem } from "@/hooks/swr/use-sales";
import type { Product } from "@/types";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    minimumFractionDigits: 0,
  }).format(v);

type Props = {
  products: Product[];
  cart: CartItem[];
  onAdd: (product: Product) => void;
  onDecrease: (productId: number) => void;
  search: string;
};

export function PosProductGrid({ products, cart, onAdd, onDecrease, search }: Props) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Package className="size-10 mb-3 opacity-40" />
        <p className="text-sm">
          {search ? "No se encontraron productos" : "No hay productos con stock"}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-20">
      {products.map((product) => {
        const hasVariants = product.variants.length > 0;
        const cartQty = cart.find((item) => item.product_id === product.id && item.variant_id == null)?.quantity ?? 0;
        const totalCartQty = cart.reduce(
          (total, item) => item.product_id === product.id ? total + item.quantity : total,
          0,
        );
        return (
          <Card
            key={product.id}
            className="overflow-hidden cursor-pointer hover:shadow-md active:scale-[0.98] transition-all pb-0 pt-2"
            onClick={() => onAdd(product)}
          >
            <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <Package className="size-8 text-muted-foreground/20" />
              )}
              {totalCartQty > 0 && (
                <div className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground shadow">
                  {totalCartQty}
                </div>
              )}
              <div className="absolute bottom-1.5 left-1.5">
                {
                  product.is_service ? (
                    <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                      Servicio
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-700 border-green-200 text-xs" variant="outline">
                      Stock: {product.stock ?? 0}
                    </Badge>
                  )
                }
               
              </div>
            </div>
            <CardContent
              className="flex cursor-default items-center justify-between gap-1.5 p-2.5 pt-0"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium line-clamp-2 break-words leading-tight">
                  {product.name}
                </p>
                <p className="text-sm font-bold text-primary mt-0.5">
                  {formatCurrency(product.price)}
                </p>
              </div>
              {!hasVariants && (
                <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="size-6 rounded-full sm:size-7"
                    aria-label={`Restar una unidad de ${product.name}`}
                    disabled={cartQty === 0}
                    onClick={() => onDecrease(product.id)}
                  >
                    <Minus aria-hidden="true" />
                  </Button>
                  <span className="min-w-4 text-center text-xs font-medium tabular-nums" aria-live="polite">
                    {cartQty}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="size-6 rounded-full sm:size-7"
                    aria-label={`Agregar una unidad de ${product.name}`}
                    onClick={() => onAdd(product)}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
