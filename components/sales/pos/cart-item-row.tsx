// components/sales/pos/cart-item-row.tsx
"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, Minus, Plus, Trash2, Tag } from "lucide-react";
import { CartItem } from "@/hooks/swr/use-sales";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    minimumFractionDigits: 0,
  }).format(v);

type Props = {
  item: CartItem;
  discountType: "none" | "global" | "per_item";
  onQuantity: (id: number, delta: number, variantId?: number | null) => void;
  onRemove: (id: number, variantId?: number | null) => void;
  onPriceChange: (id: number, value: number, variantId?: number | null) => void;
  onDiscountChange: (id: number, value: number, variantId?: number | null) => void;
};

export function CartItemRow({
  item,
  discountType,
  onQuantity,
  onRemove,
  onPriceChange,
  onDiscountChange,
}: Props) {
  // En CartItemRow, el lineTotal:
  const itemDiscountAmount =
    item.unit_price * item.quantity * (item.discount / 100);
  const lineTotal =
    item.unit_price * item.quantity -
    (discountType === "per_item" ? itemDiscountAmount : 0);

  return (
    <div className="space-y-2 p-2.5 rounded-lg border bg-card">
      <div className="flex items-start gap-2">
        <div className="relative size-9 rounded-md overflow-hidden bg-muted shrink-0">
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.product_name}
              fill
              className="object-cover"
            />
          ) : (
            <Package className="size-4 m-auto mt-2.5 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate leading-tight">
            {item.product_name}
          </p>
          {item.variant_name && (
            <p className="text-xs text-muted-foreground truncate leading-tight">
              {item.variant_name}
            </p>
          )}
          <Input
            type="number"
            value={item.unit_price === 0 ? "" : item.unit_price}
            onChange={(e) => {
              const raw = e.target.value.replace(/^0+(\d)/, "$1");
              const n = parseFloat(raw);
              onPriceChange(item.product_id, isNaN(n) ? 0 : Math.max(0, n), item.variant_id);
            }}
            className="h-6 text-xs px-1.5 w-24 mt-0.5"
            min="0"
            step="0.01"
            placeholder="0.00"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-destructive shrink-0"
          onClick={() => onRemove(item.product_id, item.variant_id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        {/* Cantidad - Ahora editable */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-6"
            onClick={() => onQuantity(item.product_id, -1, item.variant_id)}
          >
            <Minus className="size-3" />
          </Button>
          <Input
            type="number"
            value={item.quantity}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              const n = parseInt(raw, 10);
              if (!isNaN(n) && n > 0) {
                const delta = n - item.quantity;
                onQuantity(item.product_id, delta, item.variant_id);
              }
            }}
            onBlur={(e) => {
              const n = parseInt(e.target.value, 10);
              if (isNaN(n) || n < 1) {
                onQuantity(item.product_id, 1 - item.quantity, item.variant_id);
              }
            }}
            className="h-6 w-12 text-sm font-medium text-center px-1"
            min="1"
            step="1"
          />
          <Button
            variant="outline"
            size="icon"
            className="size-6"
            onClick={() => onQuantity(item.product_id, 1, item.variant_id)}
          >
            <Plus className="size-3" />
          </Button>
        </div>

        {discountType === "per_item" && (
          <div className="flex items-center gap-1">
            <Tag className="size-3 text-muted-foreground" />
            <div className="relative">
              <Input
                type="number"
                value={item.discount === 0 ? "" : item.discount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/^0+(\d)/, "$1");
                  const n = parseFloat(raw);
                  onDiscountChange(
                    item.product_id,
                    isNaN(n) ? 0 : Math.min(100, Math.max(0, n)),
                    item.variant_id,
                  );
                }}
                className="h-6 text-xs px-1.5 w-20 pr-5"
                min="0"
                max="100"
                placeholder="0"
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium">
                %
              </span>
            </div>
          </div>
        )}

        <span className="text-sm font-bold shrink-0">
          {formatCurrency(lineTotal)}
        </span>
      </div>
    </div>
  );
}