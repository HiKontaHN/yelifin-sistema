"use client";

import { useState } from "react";
import Image from "next/image";
import { BriefcaseBusiness, ImageIcon, Package, Plus } from "lucide-react";

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
  const variants = item.variants.filter((variant) => stock[variant.id] !== undefined);
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
      <div className="relative aspect-[4/3] bg-muted">
        {image ? (
          <Image src={image} alt={item.name} fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="size-10 text-muted-foreground/30" />
          </div>
        )}
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur">
          {item.is_service ? <BriefcaseBusiness className="size-3.5" /> : <Package className="size-3.5" />}
          {item.is_service ? "Servicio" : "Producto"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h2 className="break-words font-semibold leading-tight">{item.name}</h2>
          {item.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2">
          <p className="text-lg font-bold text-primary">{formatter.format(selected?.price ?? item.price)}</p>
          {!item.is_service && (
            <p className={available ? "text-sm font-medium text-muted-foreground" : "text-sm font-medium text-destructive"}>
              {available ? `${available} disponible${available === 1 ? "" : "s"}` : "Sin existencias"}
            </p>
          )}
        </div>
        {showChoice && (
          <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
            <SelectTrigger aria-label={`Variante de ${item.name}`} className="w-full">
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
          className="w-full"
          disabled={!canAdd}
          onClick={() => { if (selected) add(selected.id); }}
        >
          <Plus className="size-4" />
          {inCart > 0 ? `Agregar al carrito (${inCart})` : "Agregar al carrito"}
        </Button>
      </div>
    </article>
  );
}
