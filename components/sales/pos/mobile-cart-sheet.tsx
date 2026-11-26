// components/sales/pos/mobile-cart-sheet.tsx
"use client";

import { useEffect, useRef } from "react";
import { ShoppingCart, ChevronDown } from "lucide-react";
import { CartPanel } from "./cart-panel";
import { SaleOptionsPanel } from "./sale-options-panel";
import { CartItem } from "@/hooks/swr/use-sales";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    minimumFractionDigits: 0,
  }).format(v);

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cart: CartItem[];
  total: number;
  cartProps: any;
  optionsProps: any;
};

export function MobileCartSheet({
  open,
  onOpenChange,
  cart,
  total,
  cartProps,
  optionsProps,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Cierra al tocar el overlay — ignora portales de shadcn (Select, Dialog, etc.)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;

      // Ignorar clicks en portales de Radix/shadcn que se montan en body
      // SelectContent, DialogContent, etc. se montan en [data-radix-portal]
      const inPortal = (target as Element).closest?.("[data-radix-popper-content-wrapper], [data-radix-portal], [role='listbox'], [role='dialog']");
      if (inPortal) return;

      if (sheetRef.current && !sheetRef.current.contains(target)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onOpenChange]);

  // Bloquea scroll del body cuando está abierto
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const itemCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 lg:hidden transition-opacity duration-300 ${
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`
          fixed bottom-0 left-0 right-0 z-50 lg:hidden
          flex flex-col bg-background rounded-t-xl
          border-t-2 border-border
          shadow-[0_-12px_40px_rgba(0,0,0,0.25)]
          transition-transform duration-300 ease-in-out
          ${open ? "translate-y-0" : "translate-y-[calc(100%-4rem)]"}
        `}
        style={{ height: "88dvh" }}
      >
        {/* Handle + barra resumen — siempre visible, altura fija */}
        <button
          className="shrink-0 w-full flex flex-col items-center pt-2.5 pb-0 cursor-pointer focus:outline-none"
          onClick={() => onOpenChange(!open)}
        >
          {/* Pill */}
          <div className="w-10 h-1 rounded-full bg-muted-foreground/25 mb-3" />

          {/* Resumen */}
          <div className="w-full flex items-center justify-between px-4 pb-3 border-b">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <ShoppingCart className="size-5 text-muted-foreground" />
                {itemCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full size-4 flex items-center justify-center">
                    {itemCount > 9 ? "9+" : itemCount}
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold">
                {cart.length === 0
                  ? "Carrito vacío"
                  : `${cart.length} producto${cart.length !== 1 ? "s" : ""}`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <span className="text-base font-bold text-primary">
                  {formatCurrency(total)}
                </span>
              )}
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform duration-300 ${
                  open ? "rotate-180" : "rotate-0"
                }`}
              />
            </div>
          </div>
        </button>

        {/* Contenido — ocupa el resto y scrollea nativamente sin barra visible */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          } as React.CSSProperties}
        >
          <div className="px-4 py-3 space-y-3 pb-10">
            <CartPanel {...cartProps} />
            {cart.length > 0 && <SaleOptionsPanel {...optionsProps} />}
          </div>
        </div>
      </div>
    </>
  );
}
