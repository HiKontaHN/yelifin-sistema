// components/products/product-card.tsx
"use client";

import { Product } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Pencil, Trash2, PackagePlus } from "lucide-react";
import Image from "next/image";

type Props = {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onAddInventory: (product: Product) => void;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-HN", {
    style: "currency",
    currency: "HNL",
    minimumFractionDigits: 0,
  }).format(value);

const getStockBadge = (stock: number = 0, is_service: boolean) => {
  if (is_service) {
    return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">Servicio</Badge>;
  }
  if (stock > 10)
    return <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">{stock} uds</Badge>;
  if (stock >= 5)
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px] px-1.5 py-0">{stock} uds</Badge>;
  if (stock === 0)
    return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Sin stock</Badge>;
  return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{stock} uds</Badge>;
};

const ActionBtn = ({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-colors cursor-pointer
      ${destructive
        ? "text-destructive border-destructive/20 hover:bg-destructive/10"
        : "text-muted-foreground border-border hover:bg-muted hover:text-foreground"
      }`}
  >
    <Icon className="size-3.5" />
    {label}
  </button>
);

export function ProductCard({ product, onEdit, onDelete, onAddInventory }: Props) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-stretch">
          {/* Imagen */}
          <div className="relative w-20 shrink-0 bg-muted flex items-center justify-center overflow-hidden">
            {product.image_url ? (
              <Image src={product.image_url} alt={product.name} fill className="object-cover" />
            ) : (
              <Package className="size-8 text-muted-foreground/20" />
            )}
          </div>

          {/* Info + acciones */}
          <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate leading-tight">{product.name}</p>
                {product.sku && (
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{product.sku}</p>
                )}
              </div>
              {getStockBadge(product.stock, product.is_service)}
            </div>

            <div className="flex items-center justify-between mt-2">
              <p className="text-base font-bold text-primary">{formatCurrency(product.price)}</p>
              <div className="flex gap-1.5">
                {!product.is_service && (
                  <ActionBtn icon={PackagePlus} label="Stock"  onClick={() => onAddInventory(product)} />
                )}
                <ActionBtn icon={Pencil}     label="Editar"  onClick={() => onEdit(product)} />
                <ActionBtn icon={Trash2}     label="Borrar"  onClick={() => onDelete(product)} destructive />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}