"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CatalogCart } from "@/lib/catalog-cart";
import { getCatalogItemAvailability, type CatalogStock } from "@/lib/catalog-stock";
import type { PublicCatalogItem } from "@/lib/public-catalog";

export function CatalogItemCard({ item, formatter, stock, cart, add }: {
  item: PublicCatalogItem;
  formatter: Intl.NumberFormat;
  stock: CatalogStock;
  cart: CatalogCart;
  add: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const variants = item.variants.filter((variant) => {
    const quantity = stock[variant.id];
    return quantity === null || (quantity ?? 0) > 0;
  });
  const base = { id: item.id, name: "Presentación base", price: item.price, image: item.image_url };
  const choices = variants.map((variant) => ({
    id: variant.id,
    name: variant.variant_name || "Opción",
    price: variant.price,
    image: variant.image_url ?? item.image_url,
  }));
  if (choices.length === 0 || (stock[item.id] ?? 0) > 0) choices.unshift(base);
  const selected = choices.find((choice) => choice.id === selectedId) ?? (choices.length === 1 ? choices[0] : undefined);
  const available = selected
    ? stock[selected.id]
    : getCatalogItemAvailability(item, stock);
  const image = selected?.image ?? item.image_url;
  const inCart = selected ? (cart[selected.id] ?? 0) : 0;
  const canAdd = Boolean(selected) && (available === null || (available ?? 0) > inCart);
  const showChoice = variants.length > 0;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="relative aspect-square bg-muted">
        {image ? (
          <Image src={image} alt={item.name} fill className="object-cover" sizes="(min-width: 1280px) 16vw, (min-width: 1024px) 20vw, 50vw" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="size-10 text-muted-foreground/30" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5 sm:gap-3 sm:p-4">
        <div>
          <h2 className="break-words text-sm font-semibold leading-tight sm:text-base">{item.name}</h2>
          {item.description && <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground sm:text-sm">{item.description}</p>}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2">
          <p className="break-words text-base font-bold text-primary sm:text-lg">{formatter.format(selected?.price ?? item.price)}</p>
          {!item.is_service && (
            <p className={available ? "text-xs font-medium text-muted-foreground sm:text-sm" : "text-xs font-medium text-destructive sm:text-sm"}>
              {available ? `${available} disponible${available === 1 ? "" : "s"}` : "Sin existencias"}
            </p>
          )}
        </div>
        {showChoice && (
          <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
            <SelectTrigger aria-label={`Variante de ${item.name}`} className="w-full gap-1 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm">
              <SelectValue placeholder="Elige una variante" />
            </SelectTrigger>
            <SelectContent>
              {choices.map((choice) => (
                <SelectItem key={choice.id} value={choice.id}>
                  {choice.name}{!item.is_service && ` · ${stock[choice.id] ?? 0} disp.`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-9 w-full gap-1 whitespace-normal px-2 py-2 text-xs sm:gap-2 sm:text-sm"
          aria-label={inCart > 0 ? `Agregar al carrito (${inCart})` : "Agregar al carrito"}
          disabled={!canAdd}
          onClick={() => { if (selected) add(selected.id); }}
        >
          <Plus className="size-4" />
          <span className="sm:hidden">{inCart > 0 ? `Agregar (${inCart})` : "Agregar"}</span>
          <span className="hidden sm:inline">{inCart > 0 ? `Agregar al carrito (${inCart})` : "Agregar al carrito"}</span>
        </Button>
      </div>
    </article>
  );
}
