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
  TableCell, TableRow,
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
  Package, createLucideIcon,
  Plus, MoreVertical, Pencil, Trash2, PackagePlus,
  SlidersHorizontal, ChevronDown, Layers, Box,
  X, Eye, FileSpreadsheet,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { SearchBar } from "@/components/shared/search-bar"
import {
  DataTableTimeSection, DEFAULT_DATA_TABLE_PAGE_SIZE,
  type DataTableTimeSectionColumn,
} from "@/components/shared/data-table-time-section";
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
  const [pageSize, setPageSize] = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);

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

  const { inventory, stats, total, isLoading: loadingInventory, mutate: mutateInventory } = useInventory({
    search: debouncedSearch || undefined,
    stock: stockFilter !== "all" ? stockFilter : undefined,  // "all" omits the param so API returns everything
    page,
    limit: pageSize,
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

  const inventoryColumns: DataTableTimeSectionColumn<InventoryItem>[] = [
    {
      id: "product", header: "Producto", width: "clamp(14rem, 25vw, 20rem)",
      cell: (item) => {
        const hasVariants = item.variants_stock.length > 0 && !item.is_service;
        const isExpanded = expanded.has(item.product_id);
        return (
          <div className="flex items-center gap-3">
            {hasVariants ? (
              <ChevronDown className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                isExpanded && "rotate-180",
              )} />
            ) : <div className="w-3.5 shrink-0" />}
            <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
              {item.image_url
                ? <Image src={item.image_url} alt={item.product_name} fill className="object-cover" />
                : <Package className="size-5 text-muted-foreground/40" />
              }
            </div>
            <div className="min-w-0">
              <span className="block truncate font-medium">{item.product_name}</span>
              {hasVariants && (
                <p className="text-xs text-muted-foreground">
                  {item.variants_stock.length} variante{item.variants_stock.length !== 1 ? "s" : ""}
                  {" · "}{item.stock} uds total
                </p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      id: "sku", header: "SKU", width: "clamp(7rem, 12vw, 9rem)",
      className: "font-mono text-sm text-muted-foreground",
      cell: (item) => item.sku ?? "—",
    },
    {
      id: "stock", header: "Stock", width: 110, align: "center", stopRowClick: true,
      cell: (item) => getStockBadge(Number(item.stock), item.is_service),
    },
    ...(showCosts ? [{
      id: "cost", header: "Costo prom.", width: 125, align: "right" as const,
      cell: (item: InventoryItem) => item.is_service ? "—" : format(Number(item.avg_unit_cost ?? 0)),
    }] : []),
    {
      id: "price", header: "Precio venta", width: 125, align: "right",
      cell: (item) => format(item.price),
    },
    ...(showCosts ? [{
      id: "value", header: "Valor total", width: 125, align: "right" as const,
      className: "font-medium",
      cell: (item: InventoryItem) => item.is_service ? format(item.price) : format(Number(item.total_value ?? 0)),
    }] : []),
    {
      id: "actions", header: <span className="sr-only">Acciones</span>, width: 48,
      align: "right", stopRowClick: true,
      cell: (item) => (
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
      ),
    },
  ];

  const renderExpandedInventoryRows = (item: InventoryItem) => {
    const hasVariants = item.variants_stock.length > 0 && !item.is_service;
    if (!hasVariants || !expanded.has(item.product_id)) return null;

    const product = findProduct(item.product_id);
    return (
      <Fragment>
        {Number(item.base_stock) > 0 && (
          <BaseTableRow
            item={item}
            format={format}
            showCosts={showCosts}
            onClick={() => push(`/inventory/${item.product_id}`)}
          />
        )}
        {item.variants_stock.map((variantStock) => (
          <VariantTableRow
            key={`vs-${variantStock.variant_id}`}
            variantStock={variantStock}
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
      </Fragment>
    );
  };

  const stockSummary = [
    {
      label: "Disponibles",
      count: Math.max(0, stats.total_products - stats.out_of_stock),
      filter: "in_stock",
      color: "bg-lime-500",
      dot: "bg-lime-500",
      glow: "hover:shadow-[0_0_12px_2px_rgba(132,204,22,0.7)]",
    },
    {
      label: "Bajo stock",
      count: stats.low_stock,
      filter: "low",
      color: "bg-orange-500",
      dot: "bg-orange-500",
      glow: "hover:shadow-[0_0_12px_2px_rgba(249,115,22,0.7)]",
    },
    {
      label: "Agotados",
      count: stats.out_of_stock,
      filter: "out",
      color: "bg-red-500",
      dot: "bg-red-500",
      glow: "hover:shadow-[0_0_12px_2px_rgba(239,68,68,0.7)]",
    },
  ];
  const stockSummaryTotal = stockSummary.reduce((sum, item) => sum + item.count, 0);
  const toggleStockSummaryFilter = (filter: string) => {
    setStockFilter((current) => current === filter ? (filter === "in_stock" ? "all" : "in_stock") : filter);
  };

  // ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-24">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="text-muted-foreground text-sm md:hidden">
            {loadingInventory
              ? "Cargando..."
              : `${stats.total_products} producto${stats.total_products !== 1 ? "s" : ""} · ${stats.total_stock} unidades`
            }
          </p>
        </div>
      </div>

      {/* Resumen compacto de inventario */}
      <section aria-label="Resumen de inventario" className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 items-center gap-3 sm:min-w-56 sm:border-r sm:pr-6">
          {showCosts ? (
            <BanknoteArrowUp className="size-8 shrink-0 stroke-[1.6] text-muted-foreground" />
          ) : (
            <Box className="size-8 shrink-0 stroke-[1.6] text-muted-foreground" />
          )}
          <div className="min-w-0">
            {loadingInventory ? (
              <Skeleton className="mb-1 h-6 w-32" />
            ) : (
              <p className="truncate text-lg font-semibold leading-tight tabular-nums sm:text-xl">
                {showCosts
                  ? format(Number(stats.total_value ?? 0))
                  : `${stats.total_stock.toLocaleString("es-HN")} uds`}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {showCosts ? "valor de inventario" : "unidades en inventario"}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 sm:py-1">
          <p className="mb-2 text-base font-medium leading-none tabular-nums text-muted-foreground">
            {loadingInventory ? <Skeleton className="h-5 w-28" /> : `${stats.total_products.toLocaleString("es-HN")} productos`}
          </p>

          <div role="group" aria-label="Filtrar por estado de inventario" className="flex h-2.5 w-full rounded-full bg-muted md:w-2/3">
            {stockSummary.map((item, index) => (
              <button
                key={item.filter}
                type="button"
                aria-label={`Filtrar ${item.label.toLocaleLowerCase("es-HN")}: ${item.count} productos`}
                aria-pressed={stockFilter === item.filter}
                title={`Filtrar por ${item.label.toLocaleLowerCase("es-HN")}`}
                disabled={loadingInventory || item.count === 0 || stockSummaryTotal === 0}
                onClick={() => toggleStockSummaryFilter(item.filter)}
                style={{ width: stockSummaryTotal ? `${(item.count / stockSummaryTotal) * 100}%` : "0%" }}
                className={cn(
                  "relative h-full cursor-pointer transition-[transform,box-shadow] duration-200 hover:z-10 hover:scale-110 disabled:cursor-default disabled:hover:scale-100",
                  item.color,
                  item.glow,
                  index < stockSummary.length - 1 && "border-r border-background/70",
                  index === 0 && "rounded-l-full",
                  index === stockSummary.length - 1 && "rounded-r-full",
                  stockFilter === item.filter ? "opacity-100" : "opacity-90 hover:opacity-100",
                )}
              />
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {stockSummary.map((item) => (
              <button
                key={item.filter}
                type="button"
                aria-pressed={stockFilter === item.filter}
                title={`Filtrar por ${item.label.toLocaleLowerCase("es-HN")}`}
                disabled={loadingInventory || item.count === 0}
                onClick={() => toggleStockSummaryFilter(item.filter)}
                className={cn(
                  "inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60",
                  stockFilter === item.filter && "text-foreground",
                )}
              >
                <span className={cn("size-1.5 rounded-full", item.dot)} aria-hidden="true" />
                <span>{item.label}</span>
                <span className="font-semibold tabular-nums text-foreground">{item.count.toLocaleString("es-HN")}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

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

      {/* Tabla reutilizable y tarjetas móviles */}
      <DataTableTimeSection
          columns={inventoryColumns}
          data={inventory}
          getRowKey={(item) => item.product_id}
          isLoading={loadingInventory}
          emptyState={hasFilters ? "No se encontraron productos" : "Agrega productos para visualizarlos aquí"}
          recordLabel={total === 1 ? "producto" : "productos"}
          ariaLabel="Productos del inventario"
          renderMobileRow={(item) => {
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
                  <div className="flex items-center gap-3">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                      {item.image_url ? <Image src={item.image_url} alt={item.product_name} fill className="object-cover" /> : <Package className="size-6 text-muted-foreground/40" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.product_name}</p>
                          {hasVariants && <p className="text-xs text-muted-foreground">{item.variants_stock.length} variante{item.variants_stock.length !== 1 ? "s" : ""} · {item.stock} uds total</p>}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {getStockBadge(Number(item.stock), item.is_service)}
                          <div onClick={(e) => e.stopPropagation()}>
                            <ProductActionsMenu item={item} findProduct={findProduct} setInventoryProduct={setInventoryProduct} setAdjustProduct={setAdjustProduct} setVariantProduct={setVariantProduct} setEditProduct={setEditProduct} setDeleteProduct={setDeleteProduct} onViewDetail={(id) => push(`/inventory/${id}`)} canEdit={canEdit} canDelete={canDelete} />
                          </div>
                        </div>
                      </div>
                      {item.sku && <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>}
                    </div>
                  </div>

                  <div className={cn("mt-3 grid gap-2 border-t pt-3 text-center", showCosts ? "grid-cols-3" : "grid-cols-1")}>
                    {showCosts && <div><p className="text-xs text-muted-foreground">Costo prom.</p><p className="text-sm font-medium">{item.is_service ? "—" : format(Number(item.avg_unit_cost ?? 0))}</p></div>}
                    <div><p className="text-xs text-muted-foreground">Precio venta</p><p className="text-sm font-medium">{format(item.price)}</p></div>
                    {showCosts && <div><p className="text-xs text-muted-foreground">Valor total</p><p className="text-sm font-bold text-primary">{item.is_service ? format(item.price) : format(Number(item.total_value ?? 0))}</p></div>}
                  </div>

                  {hasVariants && <>
                    <button type="button" onClick={() => toggleExpand(item.product_id)} className="mt-3 flex w-full items-center justify-between border-t pt-3 text-xs text-muted-foreground transition-colors hover:text-foreground">
                      <span className="font-medium">Ver desglose — base + {item.variants_stock.length} variante{item.variants_stock.length !== 1 ? "s" : ""}</span>
                      <ChevronDown className={cn("size-3.5 transition-transform duration-200", isExpanded && "rotate-180")} />
                    </button>
                    {isExpanded && <div className="mt-2 space-y-2">
                      {Number(item.base_stock) > 0 && <BaseCard item={item} format={format} showCosts={showCosts} onClick={() => push(`/inventory/${item.product_id}`)} />}
                      {item.variants_stock.map((vs) => <VariantCard key={vs.variant_id} variantStock={vs} product={product} format={format} showCosts={showCosts} canEdit={canEdit} canDelete={canDelete} findVariant={findVariant} setAdjustVariant={setAdjustVariant} setEditVariant={setEditVariant} setDeleteVariantTarget={setDeleteVariantTarget} onClick={() => push(`/inventory/${item.product_id}`)} />)}
                    </div>}
                  </>}
                </CardContent>
              </Card>
            );
          }}
          onRowClick={(item) => item.variants_stock.length > 0 && !item.is_service
            ? toggleExpand(item.product_id)
            : push(`/inventory/${item.product_id}`)}
          renderExpandedRows={renderExpandedInventoryRows}
          rowClassName={(item) => expanded.has(item.product_id) ? "select-none bg-muted/20" : "select-none"}
          minWidth={showCosts ? 900 : 700}
          stickyOffset="var(--data-table-sticky-offset)"
          className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]"
          showFooterPagination={false}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: (size) => { setPage(1); setPageSize(size); },
          }}
        />

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
