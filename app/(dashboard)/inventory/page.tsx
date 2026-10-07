// app/(dashboard)/inventory/page.tsx
"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Package, Warehouse, AlertTriangle, OctagonX, createLucideIcon,
  Plus, MoreVertical, Pencil, Trash2, PackagePlus,
  SlidersHorizontal, ChevronDown, Layers, Box,
  X, Eye, FileSpreadsheet,
} from "lucide-react";
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import Image from "next/image";
import { toast } from "sonner";
import { SearchBar } from "@/components/shared/search-bar"
import { cn } from "@/lib/utils";

import { useInventory, VariantStock } from "@/hooks/swr/use-inventory";
import { useDebounce } from "@/hooks/use-debounce";
import { useProducts, useDeleteVariant } from "@/hooks/swr/use-products";
import { Fab } from "@/components/ui/fab";
import { Product, ProductVariant } from "@/types";

import { CreateProductDialog } from "@/components/products/create-product-dialog";
import { CreateProductVariantDialog } from "@/components/products/create-product-variant-dialog";
import { EditProductDialog } from "@/components/products/edit-product-dialog";
import { EditProductVariantDialog } from "@/components/products/edit-product-variant-dialog";
import { DeleteProductDialog } from "@/components/products/delete-product-dialog";
import { AddInventoryDialog } from "@/components/products/add-inventory-dialog";
import { AdjustInventoryDialog } from "@/components/products/adjust-inventory-dialog";
import { ImportExcelModal } from "@/components/inventory/import-excel-modal";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCreditCards } from "@/hooks/swr/use-credit-cards";
import { useModulePermissions } from "@/hooks/use-module-permissions";

// ── Helpers ────────────────────────────────────────────────────────────

const BanknoteArrowUp = createLucideIcon("BanknoteArrowUp", [
  ["path", { d: "M12 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5", key: "banknote" }],
  ["path", { d: "M18 12h.01", key: "right-dot" }],
  ["path", { d: "M19 22v-6", key: "arrow-line" }],
  ["path", { d: "m22 19-3-3-3 3", key: "arrow-head" }],
  ["path", { d: "M6 12h.01", key: "left-dot" }],
  ["circle", { cx: "12", cy: "12", r: "2", key: "coin" }],
]);

const getStockBadge = (stock: number, is_service?: boolean) => {
  if (is_service) return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Servicio</Badge>;
  if (stock === 0) return <Badge variant="destructive">Agotado</Badge>;
  if (stock < 5) return <Badge className="bg-orange-100 text-orange-700 border-orange-200">{stock} uds</Badge>;
  if (stock < 10) return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">{stock} uds</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200">{stock} uds</Badge>;
};

// ── Module-level action menu components ────────────────────────────────

type InventoryItem = ReturnType<typeof useInventory>["inventory"][0];

function ProductActionsMenu({
  item,
  findProduct,
  setInventoryProduct,
  setAdjustProduct,
  setVariantProduct,
  setEditProduct,
  setDeleteProduct,
  onViewDetail,
  canEdit,
  canDelete,
}: {
  item: InventoryItem;
  findProduct: (id: number) => Product | null;
  setInventoryProduct: (p: Product | null) => void;
  setAdjustProduct: (p: Product | null) => void;
  setVariantProduct: (p: Product | null) => void;
  setEditProduct: (p: Product | null) => void;
  setDeleteProduct: (p: Product | null) => void;
  onViewDetail: (id: number) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 shrink-0">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => onViewDetail(item.product_id)}>
          <Eye className="size-4 mr-2 text-muted-foreground" />
          Ver detalle
        </DropdownMenuItem>
        {canEdit && !item.is_service && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { const p = findProduct(item.product_id); if (p) setInventoryProduct(p); }}>
              <PackagePlus className="size-4 mr-2 text-primary" />
              Agregar stock
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { const p = findProduct(item.product_id); if (p) setAdjustProduct(p); }}>
              <SlidersHorizontal className="size-4 mr-2 text-muted-foreground" />
              Ajuste de inventario
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { const p = findProduct(item.product_id); if (p) setVariantProduct(p); }}>
              <Layers className="size-4 mr-2 text-muted-foreground" />
              Agregar variante
            </DropdownMenuItem>
          </>
        )}
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { const p = findProduct(item.product_id); if (p) setEditProduct(p); }}>
              <Pencil className="size-4 mr-2" />
              {item.is_service ? "Editar servicio" : "Editar producto"}
            </DropdownMenuItem>
          </>
        )}
        {canDelete && (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => { const p = findProduct(item.product_id); if (p) setDeleteProduct(p); }}
          >
            <Trash2 className="size-4 mr-2" />
            Eliminar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VariantActionsMenu({
  product,
  variant,
  setAdjustVariant,
  setEditVariant,
  setDeleteVariantTarget,
  canEdit,
  canDelete,
}: {
  product: Product;
  variant: ProductVariant;
  setAdjustVariant: (v: { product: Product; variant: ProductVariant } | null) => void;
  setEditVariant: (v: { product: Product; variant: ProductVariant } | null) => void;
  setDeleteVariantTarget: (v: { product: Product; variant: ProductVariant } | null) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  if (!canEdit && !canDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 shrink-0">
          <MoreVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <>
            <DropdownMenuItem onClick={() => setAdjustVariant({ product, variant })}>
              <SlidersHorizontal className="size-4 mr-2 text-muted-foreground" />
              Ajuste de inventario
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setEditVariant({ product, variant })}>
              <Pencil className="size-4 mr-2" />
              Editar variante
            </DropdownMenuItem>
          </>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleteVariantTarget({ product, variant })}
            >
              <Trash2 className="size-4 mr-2" />
              Eliminar variante
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BaseTableRow({
  item,
  format,
  showCosts,
  onClick,
}: {
  item: InventoryItem;
  format: (v: number) => string;
  showCosts: boolean;
  onClick: () => void;
}) {
  return (
    <TableRow className="bg-muted/20 hover:bg-muted/30 cursor-pointer" onClick={onClick}>
      <TableCell>
        <div className="flex items-center gap-3 pl-10">
          <div className="relative size-8 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
            {item.image_url
              ? <Image src={item.image_url} alt={item.product_name} fill className="object-cover" />
              : <Box className="size-3.5 text-muted-foreground/40" />
            }
          </div>
          <div>
            <p className="text-sm font-medium">{item.product_name}</p>
            <p className="text-xs text-muted-foreground">Producto base</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {item.sku ?? "—"}
      </TableCell>
      <TableCell className="text-center">{getStockBadge(Number(item.base_stock))}</TableCell>
      {showCosts && (
        <TableCell className="text-right text-sm">
          {Number(item.base_stock) > 0 ? format(Number(item.base_avg_unit_cost ?? 0)) : "—"}
        </TableCell>
      )}
      <TableCell className="text-right text-sm">{format(item.price)}</TableCell>
      {showCosts && (
        <TableCell className="text-right text-sm font-medium">
          {Number(item.base_stock) > 0 ? format(Number(item.base_total_value ?? 0)) : "—"}
        </TableCell>
      )}
      <TableCell />
    </TableRow>
  );
}

function VariantTableRow({
  variantStock,
  product,
  format,
  showCosts,
  canEdit,
  canDelete,
  findVariant,
  setAdjustVariant,
  setEditVariant,
  setDeleteVariantTarget,
  onClick,
}: {
  variantStock: VariantStock;
  product: Product | null;
  format: (v: number) => string;
  showCosts: boolean;
  canEdit: boolean;
  canDelete: boolean;
  findVariant: (product: Product, variantId: number) => ProductVariant | null;
  setAdjustVariant: (v: { product: Product; variant: ProductVariant } | null) => void;
  setEditVariant: (v: { product: Product; variant: ProductVariant } | null) => void;
  setDeleteVariantTarget: (v: { product: Product; variant: ProductVariant } | null) => void;
  onClick: () => void;
}) {
  const pv = product ? findVariant(product, variantStock.variant_id) : null;

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/50 cursor-pointer" onClick={onClick}>
      <TableCell>
        <div className="flex items-center gap-3 pl-10">
          <div className="relative size-8 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
            {(variantStock.image_url ?? product?.image_url)
              ? <Image
                src={(variantStock.image_url ?? product?.image_url)!}
                alt={variantStock.variant_name}
                fill
                className="object-cover"
              />
              : <Layers className="size-3.5 text-muted-foreground/40" />
            }
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{variantStock.variant_name}</p>
            {variantStock.attributes && Object.keys(variantStock.attributes).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {Object.entries(variantStock.attributes).map(([k, v]) => (
                  <span key={k} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-md">
                    {k}: {v}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {variantStock.sku || "—"}
      </TableCell>
      <TableCell className="text-center">{getStockBadge(Number(variantStock.stock))}</TableCell>
      {showCosts && (
        <TableCell className="text-right text-sm">
          {Number(variantStock.stock) > 0 ? format(Number(variantStock.avg_unit_cost ?? 0)) : "—"}
        </TableCell>
      )}
      <TableCell className="text-right text-sm">
        {variantStock.price_override != null
          ? format(variantStock.price_override)
          : product
            ? <span className="text-xs text-muted-foreground">Base: {format(product.price)}</span>
            : "—"
        }
      </TableCell>
      {showCosts && (
        <TableCell className="text-right text-sm font-medium">
          {Number(variantStock.stock) > 0 ? format(Number(variantStock.total_value ?? 0)) : "—"}
        </TableCell>
      )}
      <TableCell onClick={(e) => e.stopPropagation()}>
        {pv && product && (
          <VariantActionsMenu
            product={product}
            variant={pv}
            setAdjustVariant={setAdjustVariant}
            setEditVariant={setEditVariant}
            setDeleteVariantTarget={setDeleteVariantTarget}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

function BaseCard({
  item,
  format,
  showCosts,
  onClick,
}: {
  item: InventoryItem;
  format: (v: number) => string;
  showCosts: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 overflow-hidden cursor-pointer" onClick={onClick}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="relative size-9 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
          {item.image_url
            ? <Image src={item.image_url} alt={item.product_name} fill className="object-cover" />
            : <Box className="size-3.5 text-muted-foreground/40" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{item.product_name}</p>
              <p className="text-xs text-muted-foreground">Producto base</p>
            </div>
            {getStockBadge(Number(item.base_stock))}
          </div>
        </div>
      </div>
      <div className={`grid gap-2 px-3 pb-2.5 text-center border-t ${showCosts ? "grid-cols-3" : "grid-cols-1"}`}>
        {showCosts && (
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">Costo prom.</p>
            <p className="text-sm font-medium">
              {Number(item.base_stock) > 0 ? format(Number(item.base_avg_unit_cost ?? 0)) : "—"}
            </p>
          </div>
        )}
        <div className="pt-2">
          <p className="text-xs text-muted-foreground">Precio venta</p>
          <p className="text-sm font-medium">{format(item.price)}</p>
        </div>
        {showCosts && (
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">Valor total</p>
            <p className="text-sm font-bold text-primary">
              {Number(item.base_stock) > 0 ? format(Number(item.base_total_value ?? 0)) : "—"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function VariantCard({
  variantStock,
  product,
  format,
  showCosts,
  canEdit,
  canDelete,
  findVariant,
  setAdjustVariant,
  setEditVariant,
  setDeleteVariantTarget,
  onClick,
}: {
  variantStock: VariantStock;
  product: Product | null;
  format: (v: number) => string;
  showCosts: boolean;
  canEdit: boolean;
  canDelete: boolean;
  findVariant: (product: Product, variantId: number) => ProductVariant | null;
  setAdjustVariant: (v: { product: Product; variant: ProductVariant } | null) => void;
  setEditVariant: (v: { product: Product; variant: ProductVariant } | null) => void;
  setDeleteVariantTarget: (v: { product: Product; variant: ProductVariant } | null) => void;
  onClick: () => void;
}) {
  const pv = product ? findVariant(product, variantStock.variant_id) : null;
  const salePrice = variantStock.price_override != null
    ? variantStock.price_override
    : product?.price ?? 0;

  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden cursor-pointer" onClick={onClick}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="relative size-9 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
          {(variantStock.image_url ?? product?.image_url)
            ? <Image
              src={(variantStock.image_url ?? product?.image_url)!}
              alt={variantStock.variant_name}
              fill
              className="object-cover"
            />
            : <Layers className="size-3.5 text-muted-foreground/40" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{variantStock.variant_name}</p>
              {variantStock.sku && (
                <p className="text-xs text-muted-foreground font-mono">{variantStock.sku}</p>
              )}
              {variantStock.attributes && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {Object.entries(variantStock.attributes).map(([k, v]) => (
                    <span key={k} className="text-xs bg-background text-muted-foreground px-1.5 py-0.5 rounded border">
                      {k}: {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {getStockBadge(Number(variantStock.stock))}
              {pv && product && (
                <VariantActionsMenu
                  product={product}
                  variant={pv}
                  setAdjustVariant={setAdjustVariant}
                  setEditVariant={setEditVariant}
                  setDeleteVariantTarget={setDeleteVariantTarget}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={`grid gap-2 px-3 pb-2.5 text-center border-t ${showCosts ? "grid-cols-3" : "grid-cols-1"}`}>
        {showCosts && (
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">Costo prom.</p>
            <p className="text-sm font-medium">
              {Number(variantStock.stock) > 0 ? format(Number(variantStock.avg_unit_cost ?? 0)) : "—"}
            </p>
          </div>
        )}
        <div className="pt-2">
          <p className="text-xs text-muted-foreground">Precio venta</p>
          <p className="text-sm font-medium">{format(salePrice)}</p>
        </div>
        {showCosts && (
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">Valor total</p>
            <p className="text-sm font-bold text-primary">
              {Number(variantStock.stock) > 0 ? format(Number(variantStock.total_value ?? 0)) : "—"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { push, replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Estado de filtros restaurado desde la URL — así, al volver del detalle
  // de un producto (que usa router.back()), el historial del navegador
  // trae de vuelta esta misma URL con los filtros ya aplicados.
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [stockFilter, setStockFilter] = useState(() => searchParams.get("stock") ?? "in_stock");
  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get("page"));
    return Number.isInteger(p) && p > 0 ? p : 1;
  });
  const pageLimit = 15;

  const debouncedSearch = useDebounce(search, 300);

  // No resetear la página a 1 en el primer render — solo cuando el
  // usuario realmente cambia un filtro después de montar la página
  // (evita pisar la página restaurada desde la URL).
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) { isFirstFilterRun.current = false; return; }
    setPage(1);
  }, [debouncedSearch, stockFilter]);

  // Reflejar los filtros en la URL (replace, no push, para no ensuciar el
  // historial) — es lo que permite que "volver" desde /inventory/[id]
  // restaure búsqueda, filtro de stock y página.
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (stockFilter !== "in_stock") params.set("stock", stockFilter);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedSearch, stockFilter, page, pathname, replace]);

  const { inventory, stats, total, totalPages, isLoading: loadingInventory, mutate: mutateInventory } = useInventory({
    search: debouncedSearch || undefined,
    stock: stockFilter !== "all" ? stockFilter : undefined,  // "all" omits the param so API returns everything
    page,
    limit: pageLimit,
  });
  const { products, mutate: mutateProducts } = useProducts();
  const { deleteVariant, isDeleting: isDeletingVariant } = useDeleteVariant();

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Diálogos de producto
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [inventoryProduct, setInventoryProduct] = useState<Product | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);

  // Diálogos de carga masiva

  // Diálogos de variante
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [editVariant, setEditVariant] = useState<{ product: Product; variant: ProductVariant } | null>(null);
  const [deleteVariantTarget, setDeleteVariantTarget] = useState<{ product: Product; variant: ProductVariant } | null>(null);
  const [adjustVariant, setAdjustVariant] = useState<{ product: Product; variant: ProductVariant } | null>(null);

  const { accounts, mutate: mutateAccounts } = useAccounts();
  const { creditCards, mutate: mutateCreditCards } = useCreditCards();
  const { format } = useCurrency();
  const { show_costs: showCosts, can_edit: canEdit, can_delete: canDelete } = useModulePermissions("INVENTORY");

  const findProduct = (productId: number): Product | null =>
    products.find((p) => p.id === productId) ?? null;

  const findVariant = (product: Product, variantId: number): ProductVariant | null =>
    product.variants.find((v) => v.id === variantId) ?? null;

  const toggleExpand = (productId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      return next;
    });
  };

  const hasFilters = search || stockFilter !== "in_stock";

  const handleSuccess = () => {
    mutateProducts();
    mutateInventory();
    mutateAccounts();
    mutateCreditCards();
  };

  const handleDeleteVariant = async () => {
    if (!deleteVariantTarget) return;
    try {
      await deleteVariant(deleteVariantTarget.product.id, deleteVariantTarget.variant.id);
      toast.success("Variante eliminada");
      setDeleteVariantTarget(null);
      handleSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar variante");
    }
  };

  const inventorySummary = [
    {
      label: "Unidades",
      value: `${stats.total_stock.toLocaleString("es-HN")} uds`,
      detail: `${stats.total_products.toLocaleString("es-HN")} productos`,
      icon: Warehouse,
      tone: "text-foreground",
      iconTone: "text-muted-foreground",
    },
    ...(showCosts ? [{
      label: "Valor",
      value: format(Number(stats.total_value ?? 0)),
      detail: "valor de inventario",
      icon: BanknoteArrowUp,
      tone: "text-foreground",
      iconTone: "text-muted-foreground",
    }] : []),
    {
      label: "Stock bajo",
      value: stats.low_stock.toLocaleString("es-HN"),
      detail: "stock bajo",
      icon: AlertTriangle,
      tone: "text-amber-600 dark:text-amber-400",
      iconTone: "text-amber-500/70",
    },
    {
      label: "Agotados",
      value: stats.out_of_stock.toLocaleString("es-HN"),
      detail: "agotados",
      icon: OctagonX,
      tone: "text-destructive",
      iconTone: "text-destructive/60",
    },
  ];

  // ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-24">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-muted-foreground text-sm">
            {loadingInventory
              ? "Cargando..."
              : `${stats.total_products} producto${stats.total_products !== 1 ? "s" : ""} · ${stats.total_stock} unidades`
            }
          </p>
        </div>
      </div>

      {/* Stats */}
      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <div className={cn(
          "grid grid-cols-2",
          showCosts ? "md:grid-cols-4" : "md:grid-cols-3",
        )}>
          {inventorySummary.map((stat, index) => {
            const isOddLastItem = inventorySummary.length % 2 === 1
              && index === inventorySummary.length - 1;
            const lastMobileRowStart = inventorySummary.length % 2 === 0
              ? inventorySummary.length - 2
              : inventorySummary.length - 1;
            const isInLastMobileRow = index >= lastMobileRowStart;
            const Icon = stat.icon;

            return (
              <div
                key={stat.label}
                className={cn(
                  "flex min-w-0 items-center gap-3 px-4 py-4",
                  index % 2 === 0 && !isOddLastItem && "border-r",
                  !isInLastMobileRow && "border-b",
                  isOddLastItem && "col-span-2",
                  "md:col-span-1 md:border-b-0",
                  index < inventorySummary.length - 1 ? "md:border-r" : "md:border-r-0",
                )}
              >
                <Icon className={cn("size-7 shrink-0 stroke-[1.6]", stat.iconTone)} />
                <div className="min-w-0">
                  {loadingInventory ? (
                    <Skeleton className="mb-1 h-5 w-24" />
                  ) : (
                    <p className={cn(
                      "truncate text-lg font-semibold leading-tight tabular-nums md:text-xl",
                      stat.tone,
                    )}>
                      {stat.value}
                    </p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">{stat.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <SearchBar value={search} onChange={setSearch} size="full" placeholder="Buscar por nombre o SKU..." />
        </div>
        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Estado de stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo</SelectItem>
            <SelectItem value="in_stock">Disponible</SelectItem>
            <SelectItem value="ok">Suficiente</SelectItem>
            <SelectItem value="low">Bajo</SelectItem>
            <SelectItem value="out">Agotado</SelectItem>
            <SelectItem value="services">Servicios</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button
            variant="ghost" size="sm"
            className="gap-1.5 text-muted-foreground shrink-0"
            onClick={() => { setSearch(""); setStockFilter("in_stock"); setPage(1); }}
          >
            <X className="size-3.5" /> Limpiar
          </Button>
        )}
      </div>

      {/* ── Tabla — desktop ──────────────────────────────────────── */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-center">Stock</TableHead>
                {showCosts && <TableHead className="text-right">Costo prom.</TableHead>}
                <TableHead className="text-right">Precio venta</TableHead>
                {showCosts && <TableHead className="text-right">Valor total</TableHead>}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingInventory ? (
                /* skeleton - index key ok */
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: showCosts ? 7 : 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : inventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showCosts ? 7 : 5} className="text-center py-12 text-muted-foreground">
                    {hasFilters ? "No se encontraron productos" : "Agrega productos para visualizarlos aquí"}
                  </TableCell>
                </TableRow>
              ) : (
                inventory.map((item) => {
                  const product = findProduct(item.product_id);
                  const hasVariants = item.variants_stock.length > 0 && !item.is_service;
                  const isExpanded = expanded.has(item.product_id);

                  return (
                    <Fragment key={item.product_id}>
                      {/* Fila del producto */}
                      <TableRow
                        className={cn(
                          "cursor-pointer select-none",
                          isExpanded && "bg-muted/20"
                        )}
                        onClick={() => hasVariants ? toggleExpand(item.product_id) : push(`/inventory/${item.product_id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {hasVariants ? (
                              <ChevronDown className={cn(
                                "size-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                                isExpanded && "rotate-180"
                              )} />
                            ) : (
                              <div className="w-3.5 shrink-0" />
                            )}
                            <div className="relative size-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                              {item.image_url
                                ? <Image src={item.image_url} alt={item.product_name} fill className="object-cover" />
                                : <Package className="size-5 text-muted-foreground/40" />
                              }
                            </div>
                            <div>
                              <span className="font-medium">{item.product_name}</span>
                              {hasVariants && (
                                <p className="text-xs text-muted-foreground">
                                  {item.variants_stock.length} variante{item.variants_stock.length !== 1 ? "s" : ""}
                                  {" · "}{item.stock} uds total
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {item.sku ?? "—"}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          {getStockBadge(Number(item.stock), item.is_service)}
                        </TableCell>
                        {showCosts && <TableCell className="text-right">{item.is_service ? "—" : format(Number(item.avg_unit_cost ?? 0))}</TableCell>}
                        <TableCell className="text-right">{format(item.price)}</TableCell>
                        {showCosts && (
                          <TableCell className="text-right font-medium">
                            {item.is_service ? format(item.price) : format(Number(item.total_value ?? 0))}
                          </TableCell>
                        )}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <ProductActionsMenu
                            item={item}
                            findProduct={findProduct}
                            setInventoryProduct={setInventoryProduct}
                            setAdjustProduct={setAdjustProduct}
                            setVariantProduct={setVariantProduct}
                            setEditProduct={setEditProduct}
                            setDeleteProduct={setDeleteProduct}
                            onViewDetail={(id) => push(`/inventory/${id}`)}
                            canEdit={canEdit}
                            canDelete={canDelete}
                          />
                        </TableCell>
                      </TableRow>

                      {/* Acordeón: base + variantes (base oculto si su stock
                          ya se convirtió en variante) */}
                      {hasVariants && isExpanded && (
                        <>
                          {Number(item.base_stock) > 0 && (
                            <BaseTableRow
                              item={item}
                              format={format}
                              showCosts={showCosts}
                              onClick={() => push(`/inventory/${item.product_id}`)}
                            />
                          )}
                          {item.variants_stock.map((vs) => (
                            <VariantTableRow
                              key={`vs-${vs.variant_id}`}
                              variantStock={vs}
                              product={product}
                              format={format}
                              showCosts={showCosts}
                              canEdit={canEdit}
                              canDelete={canDelete}
                              findVariant={findVariant}
                              setAdjustVariant={setAdjustVariant}
                              setEditVariant={setEditVariant}
                              setDeleteVariantTarget={setDeleteVariantTarget}
                              onClick={() => push(`/inventory/${item.product_id}`)}
                            />
                          ))}
                        </>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Cards — móvil ────────────────────────────────────────── */}
      <div className="space-y-3 md:hidden">
        {loadingInventory ? (
          /* skeleton - index key ok */
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))
        ) : inventory.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                {hasFilters ? "No se encontraron productos" : "Agrega productos para visualizarlos aquí"}
              </p>
            </CardContent>
          </Card>
        ) : (
          inventory.map((item) => {
            const product = findProduct(item.product_id);
            const hasVariants = item.variants_stock.length > 0 && !item.is_service;
            const isExpanded = expanded.has(item.product_id);

            return (
              <Card
                key={item.product_id}
                className={!hasVariants ? "cursor-pointer" : undefined}
                onClick={!hasVariants ? () => push(`/inventory/${item.product_id}`) : undefined}
              >
                <CardContent className="pl-3 pr-2">
                  {/* Cabecera del producto */}
                  <div className="flex items-center gap-3">
                    <div className="relative size-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                      {item.image_url
                        ? <Image src={item.image_url} alt={item.product_name} fill className="object-cover" />
                        : <Package className="size-6 text-muted-foreground/40" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.product_name}</p>
                          {hasVariants && (
                            <p className="text-xs text-muted-foreground">
                              {item.variants_stock.length} variante{item.variants_stock.length !== 1 ? "s" : ""}
                              {" · "}{item.stock} uds total
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {getStockBadge(Number(item.stock), item.is_service)}
                          <div onClick={(e) => e.stopPropagation()}>
                            <ProductActionsMenu
                              item={item}
                              findProduct={findProduct}
                              setInventoryProduct={setInventoryProduct}
                              setAdjustProduct={setAdjustProduct}
                              setVariantProduct={setVariantProduct}
                              setEditProduct={setEditProduct}
                              setDeleteProduct={setDeleteProduct}
                              onViewDetail={(id) => push(`/inventory/${id}`)}
                              canEdit={canEdit}
                              canDelete={canDelete}
                            />
                          </div>
                        </div>
                      </div>
                      {item.sku && (
                        <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                      )}
                    </div>
                  </div>

                  {/* Resumen general del producto */}
                  <div className={`grid gap-2 mt-3 pt-3 border-t text-center ${showCosts ? "grid-cols-3" : "grid-cols-1"}`}>
                    {showCosts && (
                      <div>
                        <p className="text-xs text-muted-foreground">Costo prom.</p>
                        <p className="text-sm font-medium">{item.is_service ? "—" : format(Number(item.avg_unit_cost ?? 0))}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground">Precio venta</p>
                      <p className="text-sm font-medium">{format(item.price)}</p>
                    </div>
                    {showCosts && (
                      <div>
                        <p className="text-xs text-muted-foreground">Valor total</p>
                        <p className="text-sm font-bold text-primary">
                          {item.is_service ? format(item.price) : format(Number(item.total_value ?? 0))}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Acordeón de variantes */}
                  {hasVariants && (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.product_id)}
                        className="w-full flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span className="font-medium">
                          Ver desglose — base + {item.variants_stock.length} variante{item.variants_stock.length !== 1 ? "s" : ""}
                        </span>
                        <ChevronDown className={cn(
                          "size-3.5 transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )} />
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-2">
                          {Number(item.base_stock) > 0 && (
                            <BaseCard
                              item={item}
                              format={format}
                              showCosts={showCosts}
                              onClick={() => push(`/inventory/${item.product_id}`)}
                            />
                          )}
                          {item.variants_stock.map((vs) => (
                            <VariantCard
                              key={vs.variant_id}
                              variantStock={vs}
                              product={product}
                              format={format}
                              showCosts={showCosts}
                              canEdit={canEdit}
                              canDelete={canDelete}
                              findVariant={findVariant}
                              setAdjustVariant={setAdjustVariant}
                              setEditVariant={setEditVariant}
                              setDeleteVariantTarget={setDeleteVariantTarget}
                              onClick={() => push(`/inventory/${item.product_id}`)}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground order-2 sm:order-1">
            {total} producto{total !== 1 ? "s" : ""} · página {page} de {totalPages}
          </p>
          <Pagination className="order-1 sm:order-2 w-auto mx-0 justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) =>
                  p === 1 || p === totalPages ||
                  (p >= page - 1 && p <= page + 1)
                )
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        isActive={p === page}
                        onClick={() => setPage(p as number)}
                        className="cursor-pointer"
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}

              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* FAB */}
      {canEdit && (
        <Fab
          actions={[
            { label: "Importar Excel", icon: FileSpreadsheet, onClick: () => setImportOpen(true) },
            { label: "Nuevo producto", icon: Plus, onClick: () => setCreateOpen(true) },
          ]}
        />
      )}

      {/* ── Diálogos de producto ──────────────────────────────────── */}
      <CreateProductDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={handleSuccess} />
      <ImportExcelModal
        open={importOpen}
        onOpenChange={setImportOpen}
        products={products}
        accounts={accounts}
        creditCards={creditCards}
        onSuccess={handleSuccess}
      />
      <EditProductDialog
        product={editProduct}
        open={!!editProduct}
        onOpenChange={(open) => !open && setEditProduct(null)}
        onSuccess={handleSuccess}
        is_service={editProduct?.is_service ?? false}
      />
      <DeleteProductDialog
        product={deleteProduct}
        open={!!deleteProduct}
        onOpenChange={(open) => !open && setDeleteProduct(null)}
        onSuccess={handleSuccess}
      />
      <AddInventoryDialog
        product={inventoryProduct}
        open={!!inventoryProduct}
        onOpenChange={(open) => !open && setInventoryProduct(null)}
        onSuccess={handleSuccess}
      />
      <AdjustInventoryDialog
        product={adjustProduct}
        open={!!adjustProduct}
        onOpenChange={(open) => !open && setAdjustProduct(null)}
        onSuccess={handleSuccess}
      />
      <AdjustInventoryDialog
        product={adjustVariant?.product ?? null}
        variant={adjustVariant?.variant ?? null}
        open={!!adjustVariant}
        onOpenChange={(open) => !open && setAdjustVariant(null)}
        onSuccess={handleSuccess}
      />

      {/* ── Diálogos de variante ─────────────────────────────────── */}
      <CreateProductVariantDialog
        open={!!variantProduct}
        onOpenChange={(open) => !open && setVariantProduct(null)}
        productId={variantProduct?.id ?? 0}
        productName={variantProduct?.name ?? ""}
        basePrice={variantProduct?.price ?? 0}
        baseSku={variantProduct?.sku ?? undefined}
        variantCount={variantProduct?.variants.length ?? 0}
        baseStock={Number(inventory.find((i) => i.product_id === variantProduct?.id)?.base_stock ?? 0)}
        onSuccess={handleSuccess}
      />
      <EditProductVariantDialog
        open={!!editVariant}
        onOpenChange={(open) => !open && setEditVariant(null)}
        productId={editVariant?.product.id ?? 0}
        productName={editVariant?.product.name ?? ""}
        basePrice={editVariant?.product.price ?? 0}
        baseSku={editVariant?.product.sku ?? undefined}
        variantIndex={editVariant ? editVariant.product.variants.findIndex((v) => v.id === editVariant.variant.id) : 0}
        variant={editVariant?.variant ?? null}
        onSuccess={handleSuccess}
      />

      {/* Confirmar eliminación de variante */}
      <AlertDialog open={!!deleteVariantTarget} onOpenChange={(open) => !open && setDeleteVariantTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar variante?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará{" "}
              <span className="font-medium text-foreground">"{deleteVariantTarget?.variant.variant_name}"</span>
              {" "}de{" "}
              <span className="font-medium text-foreground">{deleteVariantTarget?.product.name}</span>.
              {" "}Si tiene historial, solo se desactivará.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingVariant}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVariant}
              disabled={isDeletingVariant}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingVariant ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
