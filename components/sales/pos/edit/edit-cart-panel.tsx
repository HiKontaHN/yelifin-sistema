// components/sales/pos/edit/edit-cart-panel.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingCart,
  ShoppingBag,
  Minus,
  Plus,
  X,
} from "lucide-react";

import { CartItem } from "@/hooks/swr/use-sales";
import { SupplyUsed } from "../supplies-used-modal";
import { useCurrency } from "@/hooks/swr/use-currency";
import { EditCartItemRow } from "./edit-cart-item-row";

export type EditDiscountType = "none" | "global" | "per_item";

// solo 0, 15 y 18 — tax-inclusive
const TAX_PRESETS = [0, 15, 18];

type Props = {
  cart: CartItem[];
  discountType: EditDiscountType;
  globalDiscount: number;
  subtotal: number;
  totalDiscount: number;
  total: number;
  shippingCost: number;
  taxRate: number;
  taxAmount: number;
  suppliesUsed: SupplyUsed[];
  onQuantity: (id: number, delta: number, variantId?: number | null) => void;
  onRemove: (id: number, variantId?: number | null) => void;
  onPriceChange: (id: number, value: number, variantId?: number | null) => void;
  onDiscountChange: (id: number, value: number, variantId?: number | null) => void;
  onDiscountTypeChange: (type: EditDiscountType) => void;
  onGlobalDiscountChange: (value: number) => void;
  onTaxRateChange: (value: number) => void;
  onSupplyQtyChange: (id: number, qty: number) => void;
  onSupplyRemove: (id: number) => void;
};

const cleanPercentInput = (raw: string): number => {
  const cleaned = raw.replace(/^0+(\d)/, "$1");
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
};

export function EditCartPanel({
  cart,
  discountType,
  globalDiscount,
  subtotal,
  totalDiscount,
  total,
  shippingCost,
  taxRate,
  taxAmount,
  suppliesUsed,
  onQuantity,
  onRemove,
  onPriceChange,
  onDiscountChange,
  onDiscountTypeChange,
  onGlobalDiscountChange,
  onTaxRateChange,
  onSupplyQtyChange,
  onSupplyRemove,
}: Props) {
  const { format } = useCurrency();

  const globalDiscountAmount = subtotal * (globalDiscount / 100);
  const suppliesCost = suppliesUsed.reduce(
    (acc, s) => acc + s.quantity * s.unit_cost,
    0
  );
  const grandTotal = total + shippingCost;

  return (
    <Card>
      <CardHeader className="pl-4 px-4 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="size-4" />
          Carrito
          {cart.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {cart.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 space-y-3">
        {/* Items */}
        {cart.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Toca un producto para agregarlo
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
            {cart.map((item) => (
              <EditCartItemRow
                key={`${item.product_id}-${item.variant_id ?? "base"}`}
                item={item}
                discountType={discountType}
                onQuantity={onQuantity}
                onRemove={onRemove}
                onPriceChange={onPriceChange}
                onDiscountChange={onDiscountChange}
              />
            ))}
          </div>
        )}

        {/* Descuento */}
        {cart.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 rounded-lg border overflow-hidden">
              {(["none", "global", "per_item"] as EditDiscountType[]).map(
                (type, i) => (
                  <button
                    key={type}
                    onClick={() => onDiscountTypeChange(type)}
                    className={`py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      i > 0 ? "border-l" : ""
                    } ${
                      discountType === type
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {type === "none"
                      ? "Sin desc."
                      : type === "global"
                      ? "Global"
                      : "Por prod."}
                  </button>
                )
              )}
            </div>
            {discountType === "global" && (
              <div className="space-y-1">
                <div className="relative">
                  <Input
                    type="number"
                    value={
                      globalDiscount === 0 ? "" : globalDiscount
                    }
                    onChange={(e) =>
                      onGlobalDiscountChange(
                        cleanPercentInput(e.target.value)
                      )
                    }
                    placeholder="0"
                    min="0"
                    max="100"
                    className="h-8 text-sm pr-8"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                    %
                  </span>
                </div>
                {globalDiscount > 0 && (
                  <p className="text-xs text-green-600 text-right">
                    -{format(globalDiscountAmount)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ISV */}
        {cart.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">
              ISV (incluido en el precio)
            </p>
            <div className="flex items-center gap-1.5">
              {TAX_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onTaxRateChange(p)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    taxRate === p
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {p === 0 ? "Sin ISV" : `${p}%`}
                </button>
              ))}
            </div>
            {taxAmount > 0 && (
              <p className="text-xs text-amber-600 text-right">
                ISV incluido:{" "}
                <span className="font-medium">
                  {format(taxAmount)}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Suministros usados */}
        {suppliesUsed.length > 0 && (
          <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-800/40 p-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <ShoppingBag className="size-3.5 text-orange-500 shrink-0" />
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-400 flex-1">
                Suministros
              </span>
              <Badge className="bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 text-[10px] px-1.5 py-0">
                {suppliesUsed.length}
              </Badge>
            </div>
            <div className="space-y-1.5">
              {suppliesUsed.map((s) => (
                <div
                  key={s.supply_id}
                  className="relative rounded-lg border bg-background p-2 text-xs"
                >
                  <button
                    className="absolute top-1 right-1 size-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                    onClick={() => onSupplyRemove(s.supply_id)}
                  >
                    <X className="size-3.5" />
                  </button>

                  <p className="font-medium truncate pr-7">{s.name}</p>

                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span className="text-[10px] font-semibold text-orange-600">
                      {format(s.quantity * s.unit_cost)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="flex items-center gap-0.5 rounded-full border bg-muted/30 p-0.5">
                        <button
                          className="size-6 rounded-full flex items-center justify-center hover:bg-muted transition-colors cursor-pointer"
                          onClick={() =>
                            onSupplyQtyChange(
                              s.supply_id,
                              Math.max(1, s.quantity - 1)
                            )
                          }
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <Input
                          type="number"
                          value={s.quantity}
                          onChange={(e) => {
                            const n = Math.round(parseFloat(e.target.value));
                            if (!isNaN(n) && n > 0)
                              onSupplyQtyChange(s.supply_id, n);
                          }}
                          className="h-6 w-8 border-0 bg-transparent text-xs text-center px-0 shadow-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          min="1"
                          step="1"
                        />
                        <button
                          className="size-6 rounded-full flex items-center justify-center hover:bg-muted transition-colors cursor-pointer"
                          onClick={() =>
                            onSupplyQtyChange(s.supply_id, s.quantity + 1)
                          }
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <span className="text-[9px] text-muted-foreground w-5 truncate">
                        {s.unit ?? "ud"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-0.5 border-t border-orange-200/60">
              <span className="text-[10px] text-orange-600">
                Costo suministros
              </span>
              <span className="text-[10px] font-bold text-orange-700">
                -{format(suppliesCost)}
              </span>
            </div>
          </div>
        )}

        {/* Totales */}
        {cart.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{format(subtotal)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>
                  Descuento
                  {discountType === "global" &&
                    globalDiscount > 0 && (
                      <span className="ml-1 text-xs opacity-70">
                        ({globalDiscount}%)
                      </span>
                    )}
                </span>
                <span>-{format(totalDiscount)}</span>
              </div>
            )}
            {shippingCost > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Envío</span>
                <span>+{format(shippingCost)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold text-base">
              <span>Total</span>
              <span>{format(grandTotal)}</span>
            </div>
            {taxAmount > 0 && (
              <p className="text-[11px] text-amber-600 text-right">
                Incluye ISV {taxRate}%: {format(taxAmount)}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}