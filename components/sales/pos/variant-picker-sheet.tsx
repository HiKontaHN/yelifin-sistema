// components/sales/pos/variant-picker-sheet.tsx
"use client";

import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Layers, Box } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Product, ProductVariant } from "@/types";
import { VariantStock } from "@/hooks/swr/use-inventory";
import { useCurrency } from "@/hooks/swr/use-currency";

type Props = {
  open:            boolean;
  onOpenChange:    (v: boolean) => void;
  product:         Product | null;
  variantsStock?:  VariantStock[];
  baseStock?:      number | null;
  onSelect:        (product: Product, variant: ProductVariant | null) => void;
};

export function VariantPickerSheet({
  open, onOpenChange, product, variantsStock = [], baseStock = null, onSelect,
}: Props) {
  const { format } = useCurrency();

  if (!product) return null;

  const getVariantStock = (variantId: number): number | null => {
    const vs = variantsStock.find((s) => s.variant_id === variantId);
    return vs ? Number(vs.stock) : null;
  };

  const handleSelect = (variant: ProductVariant | null) => {
    onSelect(product, variant);
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Seleccionar variante"
      titleClassName="text-base"
      icon={Layers}
      subtitle={product.name}
      height="compact"
      bodyClassName="px-4 py-3 space-y-2"
      footer={
        <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
      }
    >
          {/* Opción base — oculta cuando el stock base ya se convirtió en
              variante (queda en 0): el producto es solo un "padre" */}
          {(baseStock === null || Number(baseStock) > 0) && (
            <VariantOption
              image={product.image_url}
              name={`${product.name} (base)`}
              sku={product.sku}
              attributes={null}
              price={product.price}
              stock={baseStock}
              isBase
              onSelect={() => handleSelect(null)}
              format={format}
            />
          )}

          {/* Variantes */}
          {product.variants.map((variant) => {
            const stock = getVariantStock(variant.id);
            const price = variant.price_override != null
              ? Number(variant.price_override)
              : product.price;

            return (
              <VariantOption
                key={variant.id}
                image={variant.image_url ?? product.image_url}
                name={variant.variant_name}
                sku={variant.sku}
                attributes={variant.attributes}
                price={price}
                hasPriceOverride={variant.price_override != null && variant.price_override !== product.price}
                stock={stock}
                onSelect={() => handleSelect(variant)}
                format={format}
              />
            );
          })}
    </ResponsiveModal>
  );
}

// ── VariantOption ──────────────────────────────────────────────────────

type VariantOptionProps = {
  image:            string | null;
  name:             string;
  sku:              string | null | undefined;
  attributes:       Record<string, string> | null | undefined;
  price:            number;
  hasPriceOverride?: boolean;
  stock:            number | null;
  isBase?:          boolean;
  onSelect:         () => void;
  format:           (v: number) => string;
};

function VariantOption({
  image, name, sku, attributes, price,
  hasPriceOverride, stock, isBase, onSelect, format,
}: VariantOptionProps) {
  const outOfStock = stock !== null && stock === 0;

  return (
    <button
      type="button"
      onClick={outOfStock ? undefined : onSelect}
      disabled={outOfStock}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
        outOfStock
          ? "opacity-40 cursor-not-allowed bg-muted/30"
          : "hover:bg-muted/50 active:bg-muted cursor-pointer"
      )}
    >
      {/* Imagen */}
      <div className="relative size-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
        {image ? (
          <Image src={image} alt={name} fill className="object-cover" />
        ) : isBase ? (
          <Box className="size-5 text-muted-foreground/40" />
        ) : (
          <Layers className="size-5 text-muted-foreground/40" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        {sku && (
          <p className="text-xs text-muted-foreground font-mono">{sku}</p>
        )}
        {attributes && Object.keys(attributes).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(attributes).map(([k, v]) => (
              <span
                key={k}
                className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md"
              >
                {k}: {v}
              </span>
            ))} 
          </div>
        )}
      </div>

      <div className="shrink-0 text-right space-y-1">
        <p className={cn(
          "text-sm font-bold",
          hasPriceOverride ? "text-primary" : "text-foreground"
        )}>
          {format(price)}
        </p>
        {stock !== null && (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              stock === 0
                ? "bg-red-100 text-red-700 border-red-200"
                : stock < 5
                ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                : "bg-green-100 text-green-700 border-green-200"
            )}
          >
            {stock === 0 ? "Agotado" : `${stock} uds`}
          </Badge>
        )}
      </div>
    </button>
  );
}