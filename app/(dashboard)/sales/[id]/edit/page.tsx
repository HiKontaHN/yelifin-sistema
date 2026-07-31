"use client";

import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  Suspense,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  AlertTriangle,
  ChevronRight,
  ShoppingCart,
  ArrowRight,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { useCurrency } from "@/hooks/swr/use-currency";
import { useProducts } from "@/hooks/swr/use-products";
import {
  useSale,
  usePatchSale,
  type CartItem,
} from "@/hooks/swr/use-sales";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCustomers } from "@/hooks/swr/use-costumers";
import { useSupplies } from "@/hooks/swr/use-supplies";
import { useInventory } from "@/hooks/swr/use-inventory";
import { Product, ProductVariant } from "@/types";

import { PosProductGrid } from "@/components/sales/pos/product-grid";
import { VariantPickerSheet } from "@/components/sales/pos/variant-picker-sheet";
import {
  EditCartPanel,
  type EditDiscountType as DiscountType,
} from "@/components/sales/pos/edit/edit-cart-panel";
import {
  EditSaleOptionsPanel,
} from "@/components/sales/pos/edit/edit-sale-options-panel";
import {
  EditMobileCartSheet,
} from "@/components/sales/pos/edit/edit-mobile-cart-sheet";
import {
  SuppliesUsedModal,
  type SupplyUsed,
} from "@/components/sales/pos/supplies-used-modal";

type Step = 1 | 2;

type SearchBarProps = {
  search: string;
  onChange: (value: string) => void;
};

function SearchBar({ search, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Buscar producto..."
        value={search}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 pr-9"
      />
      {search && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function EditSaleContent() {
  const params = useParams();
  const { push } = useRouter();
  const { format } = useCurrency();

  const saleId = Number(params.id);
  const backHref = "/sales";

  const { sale, isLoading } = useSale(saleId);
  const { products } = useProducts();
  const { accounts } = useAccounts();
  const { customers } = useCustomers({ limit: 500 });
  const { supplies } = useSupplies();
  const { inventory, mutate: mutateInventory } = useInventory({ limit: 500 });
  const { editSale, confirmSale, cancelSale, isPatching } = usePatchSale(saleId);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountType, setDiscountType] =
    useState<DiscountType>("none");
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [customerId, setCustomerId] =
    useState<number | null>(null);
  const [accountId, setAccountId] =
    useState<number | null>(null);
  const [isPending, setIsPending] = useState(true);

  const [search, setSearch] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [initialQuantities, setInitialQuantities] = useState<Map<string, number>>(new Map());

  const [suppliesUsed, setSuppliesUsed] = useState<SupplyUsed[]>(
    []
  );
  const [suppliesModalOpen, setSuppliesModalOpen] =
    useState(false);

  const [mobileCartOpen, setMobileCartOpen] =
    useState(false);
  const [desktopStep, setDesktopStep] =
    useState<Step>(1);

  // modales de confirmación
  const [confirmCompleteOpen, setConfirmCompleteOpen] =
    useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] =
    useState(false);

  // diálogo salir sin guardar
  const [exitDialog, setExitDialog] = useState(false);
  const [pendingHref, setPendingHref] =
    useState<string | null>(null);

  const [variantPickerProduct, setVariantPickerProduct] =
    useState<Product | null>(null);

  const hasCart = cart.length > 0;
  const hasSupplies = supplies.length > 0;

  // beforeunload
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasCart) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () =>
      window.removeEventListener("beforeunload", handler);
  }, [hasCart]);

  const safeNavigate = useCallback(
    (href: string) => {
      if (!hasCart) {
        push(href);
        return;
      }
      setPendingHref(href);
      setExitDialog(true);
    },
    [hasCart, push]
  );

  const confirmExit = () => {
    setExitDialog(false);
    if (pendingHref) push(pendingHref);
  };
  const cancelExit = () => {
    setExitDialog(false);
    setPendingHref(null);
  };

  // inicializar desde venta
  useEffect(() => {
    if (!sale || initialized) return;

    if (sale.status !== "PENDING") {
      toast.error("Solo se pueden editar ventas pendientes");
      push("/sales");
      return;
    }

    const mappedCart: CartItem[] = sale.items.map(
      (i: any) => ({
        product_id:   i.product_id,
        variant_id:   i.variant_id ?? null,
        product_name: i.product_name,
        variant_name: i.variant_name ?? null,
        image_url:    i.image_url,
        quantity:     Number(i.quantity),
        unit_price:   Number(i.unit_price),
        discount:     0,
      })
    );

    setCart(mappedCart);

    const initQtyMap = new Map<string, number>();
    mappedCart.forEach((i) =>
      initQtyMap.set(`${i.product_id}-${i.variant_id ?? "base"}`, i.quantity)
    );
    setInitialQuantities(initQtyMap);

    setTaxRate(Number(sale.tax_rate ?? 0));
    setShippingCost(Number(sale.shipping_cost ?? 0));
    setNotes(sale.notes ?? "");
    setCustomerId(sale.customer_id ?? null);
    setAccountId((sale as any).account_id ?? null);
    setIsPending(sale.status === "PENDING");

    const saleSubtotal = Number(sale.subtotal ?? 0);
    const saleDiscount = Number(sale.discount ?? 0);
    if (saleDiscount > 0 && saleSubtotal > 0) {
      const percent = (saleDiscount / saleSubtotal) * 100;
      setDiscountType("global");
      setGlobalDiscount(
        Number(percent.toFixed(2))
      );
    } else {
      setDiscountType("none");
      setGlobalDiscount(0);
    }

    if ((sale as any).supplies && Array.isArray((sale as any).supplies)) {
      const rawSupplies = (sale as any).supplies as any[];
      setSuppliesUsed(
        rawSupplies.map((s) => ({
          supply_id: s.supply_id,
          name: s.supply_name,
          unit: null,
          quantity: Number(s.quantity),
          unit_cost: Number(s.unit_cost),
        }))
      );
    }

    setInitialized(true);
  }, [sale, initialized, push]);

  // productos disponibles
  const availableProducts = useMemo(
    () =>
      products.filter((p) => {
        const hasStock = p.is_service || (p.stock ?? 0) > 0;
        if (!hasStock) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku?.toLowerCase().includes(q) ?? false)
        );
      }),
    [products, search]
  );

  // carrito
  const addToCart = (product: Product) => {
    if (product.variants.length > 0) {
      setVariantPickerProduct(product);
      return;
    }
    addItemToCart(product, null);
  };

  const addItemToCart = (product: Product, variant: ProductVariant | null) => {
    const variantId  = variant?.id ?? null;
    const key        = cartKey(product.id, variantId);
    const price      = variant?.price_override != null
      ? Number(variant.price_override)
      : product.price;
    const image      = variant?.image_url ?? product.image_url;

    const invItem    = inventory.find((i) => i.product_id === product.id);
    const stockAvail = variantId
      ? Number(invItem?.variants_stock.find((v) => v.variant_id === variantId)?.stock ?? 0)
      : Number(invItem?.base_stock ?? product.stock ?? 0);

    setCart((prev) => {
      const existing = prev.find(
        (i) => cartKey(i.product_id, i.variant_id) === key
      );
      if (existing) {
        // El inventario ya fue descontado al crear la venta pendiente,
        // por lo que el máximo real es: stockAvail (restante) + initialQty (reservado en esta venta)
        const initialQty = initialQuantities.get(key) ?? 0;
        const effectiveMax = stockAvail + initialQty;
        if (!product.is_service && existing.quantity >= effectiveMax) {
          toast.error(`Stock máximo: ${effectiveMax} unidades`);
          return prev;
        }
        return prev.map((i) =>
          cartKey(i.product_id, i.variant_id) === key
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      // Item nuevo en el edit (no estaba en la venta original)
      if (!product.is_service && stockAvail <= 0) {
        toast.error(`Sin stock disponible`);
        return prev;
      }
      return [
        ...prev,
        {
          product_id:   product.id,
          variant_id:   variantId,
          product_name: product.name,
          variant_name: variant?.variant_name ?? null,
          image_url:    image,
          quantity:     1,
          unit_price:   price,
          discount:     0,
        },
      ];
    });
  };

  const cartKey = (productId: number, variantId?: number | null) =>
    `${productId}-${variantId ?? "base"}`;

  const updateQuantity = (id: number, delta: number, variantId?: number | null) => {
    if (delta > 0) {
      const key      = cartKey(id, variantId);
      const invItem  = inventory.find((i) => i.product_id === id);
      const stockAvail = variantId
        ? Number(invItem?.variants_stock.find((v) => v.variant_id === variantId)?.stock ?? 0)
        : Number(invItem?.base_stock ?? 0);
      const initialQty   = initialQuantities.get(key) ?? 0;
      const effectiveMax = stockAvail + initialQty;

      setCart((prev) => {
        const item = prev.find((i) => cartKey(i.product_id, i.variant_id) === key);
        if (item && item.quantity >= effectiveMax) {
          toast.error(`Stock máximo: ${effectiveMax} unidades`);
          return prev;
        }
        return prev
          .map((i) =>
            cartKey(i.product_id, i.variant_id) === key
              ? { ...i, quantity: i.quantity + delta }
              : i
          )
          .filter((i) => i.quantity > 0);
      });
    } else {
      setCart((prev) =>
        prev
          .map((i) =>
            cartKey(i.product_id, i.variant_id) === cartKey(id, variantId)
              ? { ...i, quantity: i.quantity + delta }
              : i
          )
          .filter((i) => i.quantity > 0)
      );
    }
  };

  const removeFromCart = (id: number, variantId?: number | null) =>
    setCart((prev) =>
      prev.filter((i) => cartKey(i.product_id, i.variant_id) !== cartKey(id, variantId))
    );

  const updateItemPrice = (id: number, v: number, variantId?: number | null) =>
    setCart((prev) =>
      prev.map((i) =>
        cartKey(i.product_id, i.variant_id) === cartKey(id, variantId) ? { ...i, unit_price: v } : i
      )
    );

  const updateDiscount = (id: number, v: number, variantId?: number | null) =>
    setCart((prev) =>
      prev.map((i) =>
        cartKey(i.product_id, i.variant_id) === cartKey(id, variantId) ? { ...i, discount: v } : i
      )
    );

  const updateSupplyQty = (id: number, qty: number) =>
    setSuppliesUsed((prev) =>
      prev.map((s) =>
        s.supply_id === id ? { ...s, quantity: qty } : s
      )
    );

  const removeSupply = (id: number) =>
    setSuppliesUsed((prev) =>
      prev.filter((s) => s.supply_id !== id)
    );

  // totales (igual que new sale)
  const subtotal = cart.reduce(
    (acc, i) => acc + i.unit_price * i.quantity,
    0
  );
  // i.discount es un porcentaje (0-100) por producto, igual que el global
  const itemDiscounts = cart.reduce(
    (acc, i) => acc + i.unit_price * i.quantity * (i.discount / 100),
    0
  );

  const appliedGlobal =
    discountType === "global"
      ? subtotal * (globalDiscount / 100)
      : 0;
  const appliedPerItem =
    discountType === "per_item" ? itemDiscounts : 0;

  const totalDiscount = appliedGlobal + appliedPerItem;
  const total = subtotal - totalDiscount;
  const taxAmount =
    taxRate > 0 ? (total * taxRate) / (100 + taxRate) : 0;
  const grandTotal = total + shippingCost;

  const handleSuppliesConfirm = (supplies: SupplyUsed[]) =>
    setSuppliesUsed(supplies);

  // Guardar como pendiente (sin modal)
  const handleSavePending = async () => {
    if (!sale) return;
    if (cart.length === 0)
      return toast.error("El carrito está vacío");
    if (!accountId)
      return toast.error(
        "Selecciona una cuenta de destino"
      );

    try {
      const payload: any = {
        items: cart.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? undefined,
          quantity: i.quantity,
          unit_price: i.unit_price,
          // El backend espera un monto por línea; convertimos el % a monto
          discount:
            discountType === "per_item"
              ? i.unit_price * i.quantity * (i.discount / 100)
              : 0,
        })),
        discount: appliedGlobal,
        shipping_cost:
          shippingCost >= 0 ? shippingCost : undefined,
        tax_rate: taxRate > 0 ? taxRate : undefined,
        notes: notes || undefined,
        customer_id: customerId,
        account_id: accountId,
        status: isPending ? "PENDING" : "COMPLETED",
        supplies_used:
          suppliesUsed.length > 0
            ? suppliesUsed.map((s) => ({
              supply_id: s.supply_id,
              quantity: s.quantity,
              unit_cost: s.unit_cost,
            }))
            : undefined,
      };

      await editSale(payload);
      mutateInventory();
      toast.success("Venta actualizada");
      push("/sales");
    } catch (err: any) {
      toast.error(
        err.message || "Error al actualizar la venta"
      );
    }
  };

  const handleConfirmComplete = async () => {
    if (!sale) return;
    setConfirmCompleteOpen(false);
    if (cart.length === 0) return toast.error("El carrito está vacío");
    if (!accountId) return toast.error("Selecciona una cuenta de destino");

    try {
      // 1. Primero guardar todos los cambios (SIN cambiar status)
      await editSale({
        items: cart.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? undefined,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: discountType === "per_item"
            ? i.unit_price * i.quantity * (i.discount / 100)
            : 0,
        })),
        discount: appliedGlobal,
        shipping_cost: shippingCost > 0 ? shippingCost : undefined,
        tax_rate: taxRate > 0 ? taxRate : undefined,
        notes: notes || undefined,
        customer_id: customerId,
        account_id: accountId,
        // ⚠️ NO enviar status aquí
        supplies_used: suppliesUsed.length > 0
          ? suppliesUsed.map((s) => ({
            supply_id: s.supply_id,
            quantity: s.quantity,
            unit_cost: s.unit_cost,
          }))
          : undefined,
      });

      // 2. Luego completar la venta (cambiar status)
      await confirmSale();

      mutateInventory();
      toast.success("Venta completada");
      push("/sales");
    } catch (err: any) {
      console.error("Error:", err);
      toast.error(err.message || "Error al completar la venta");
    }
  };

  // Confirmar cancelar (modal → acción simple)
  const handleConfirmCancel = async () => {
    if (!sale) return;
    setConfirmCancelOpen(false);

    try {
      await cancelSale();
      mutateInventory();
      toast.success("Venta cancelada");
      push("/sales");
    } catch (err: any) {
      toast.error(
        err.message || "Error al cancelar la venta"
      );
    }
  };

  if (isLoading || !initialized) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  const cartProps = {
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
    onQuantity: updateQuantity,
    onRemove: removeFromCart,
    onPriceChange: updateItemPrice,
    onDiscountChange: updateDiscount,
    onDiscountTypeChange: setDiscountType,
    onGlobalDiscountChange: setGlobalDiscount,
    onTaxRateChange: setTaxRate,
    onSupplyQtyChange: updateSupplyQty,
    onSupplyRemove: removeSupply,
  };

  const baseOptionsProps = {
    customers,
    accounts,
    hasSupplies,
    customerId,
    accountId,
    notes,
    grandTotal,
    shippingCost,
    isCreating: isPatching,
    isPending,
    onCustomerChange: setCustomerId,
    onAccountChange: setAccountId,
    onNotesChange: setNotes,
    onShippingCostChange: setShippingCost,
    onIsPendingChange: setIsPending,
    onOpenSupplies: () => setSuppliesModalOpen(true),
    onSavePending: handleSavePending,
    onCompleteRequest: () => setConfirmCompleteOpen(true),
    onCancelRequest: () => setConfirmCancelOpen(true),
  };

  const mobileOptionsProps = baseOptionsProps;
  const desktopOptionsProps = {
    ...baseOptionsProps,
    onBack: () => setDesktopStep(1),
  };

  return (
    <>
      {/* MOBILE LAYOUT */}
      <div className="lg:hidden fixed inset-0 top-16 flex flex-col bg-background">
        <div className="shrink-0 px-4 pt-3 pb-3 space-y-3 bg-background z-10 border-b">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => safeNavigate(backHref)}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold tracking-tight">
                Editar Venta
              </h1>
              {sale?.sale_number && (
                <p className="text-xs text-muted-foreground">
                  No. {sale.sale_number}
                </p>
              )}
            </div>
            {cart.length > 0 && (
              <Badge
                variant="secondary"
                className="shrink-0"
              >
                {cart.reduce(
                  (acc, i) => acc + i.quantity,
                  0
                )}{" "}
                uds
              </Badge>
            )}
          </div>
          <SearchBar
            search={search}
            onChange={setSearch}
          />
        </div>

        <div
          className="flex-1 overflow-y-auto px-4 pt-3 pb-4"
          style={{
            scrollbarWidth: "none",
          } as React.CSSProperties}
        >
          <PosProductGrid
            products={availableProducts}
            cart={cart}
            onAdd={addToCart}
            search={search}
          />
        </div>

        <EditMobileCartSheet
          open={mobileCartOpen}
          onOpenChange={setMobileCartOpen}
          cart={cart}
          total={grandTotal}
          cartProps={cartProps as any}
          optionsProps={mobileOptionsProps}
        />
      </div>

      {/* DESKTOP LAYOUT */}
      <div className="hidden lg:flex flex-col h-[calc(100vh-4rem)] pb-4">
        <div className="shrink-0 flex items-center gap-3 py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => safeNavigate(backHref)}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Editar venta {sale?.sale_number}
            </h1>
            <p className="text-muted-foreground text-sm">
              {cart.length} producto
              {cart.length !== 1 ? "s" : ""}
              {suppliesUsed.length > 0 &&
                ` · ${suppliesUsed.length} suministro${suppliesUsed.length !== 1 ? "s" : ""
                }`}
              {taxRate > 0 &&
                ` · ISV ${taxRate}% incluido`}
              {shippingCost > 0 && " · envío incluido"}
              {isPending && " · pendiente"}
              {" · Total editado: "}
              {format(grandTotal)}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setDesktopStep(1)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${desktopStep === 1
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
                }`}
            >
              <ShoppingCart className="size-3.5" />
              Productos
            </button>
            <ChevronRight className="size-4 text-muted-foreground" />
            <button
              onClick={() =>
                cart.length > 0 && setDesktopStep(2)
              }
              disabled={cart.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${cart.length === 0
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : desktopStep === 2
                    ? "bg-primary text-primary-foreground cursor-pointer"
                    : "text-muted-foreground hover:bg-muted cursor-pointer"
                }`}
            >
              Detalle
            </button>
          </div>
        </div>

        {desktopStep === 1 && (
          <div className="flex-1 min-h-0 grid grid-cols-5 gap-4">
            <div className="col-span-3 flex flex-col min-h-0 gap-3">
              <SearchBar
                search={search}
                onChange={setSearch}
              />
              <div
                className="flex-1 overflow-y-auto"
                style={{
                  scrollbarWidth: "none",
                } as React.CSSProperties}
              >
                <PosProductGrid
                  products={availableProducts}
                  cart={cart}
                  onAdd={addToCart}
                  search={search}
                />
              </div>
            </div>
            <div
              className="col-span-2 flex flex-col min-h-0 gap-3 overflow-y-auto"
              style={{
                scrollbarWidth: "none",
              } as React.CSSProperties}
            >
              <EditCartPanel {...cartProps} />
              {cart.length > 0 && (
                <Button
                  className="w-full gap-2"
                  onClick={() => setDesktopStep(2)}
                >
                  Continuar al detalle{" "}
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {desktopStep === 2 && (
          <div className="flex-1 min-h-0 grid grid-cols-5 gap-4">
            <div
              className="col-span-3 flex flex-col min-h-0 gap-3 overflow-y-auto"
              style={{
                scrollbarWidth: "none",
              } as React.CSSProperties}
            >
              <EditCartPanel {...cartProps} />
            </div>
            <div
              className="col-span-2 flex flex-col min-h-0 gap-3 overflow-y-auto"
              style={{
                scrollbarWidth: "none",
              } as React.CSSProperties}
            >
              <EditSaleOptionsPanel
                {...desktopOptionsProps}
              />
            </div>
          </div>
        )}
      </div>

      {/* Picker de variantes */}
      <VariantPickerSheet
        open={!!variantPickerProduct}
        onOpenChange={(v) => !v && setVariantPickerProduct(null)}
        product={variantPickerProduct}
        variantsStock={
          inventory.find((i) => i.product_id === variantPickerProduct?.id)
            ?.variants_stock ?? []
        }
        baseStock={
          inventory.find((i) => i.product_id === variantPickerProduct?.id)
            ?.base_stock ?? 0
        }
        onSelect={(product, variant) => {
          addItemToCart(product, variant);
          setVariantPickerProduct(null);
        }}
      />

      {/* Modal suministros */}
      <SuppliesUsedModal
        open={suppliesModalOpen}
        onOpenChange={setSuppliesModalOpen}
        onConfirm={handleSuppliesConfirm}
        initialSupplies={suppliesUsed}
      />

      {/* Modal salir sin guardar */}
      {exitDialog && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={cancelExit}
        >
          <div
            className="bg-background rounded-2xl w-full sm:max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="size-10 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-5 text-yellow-600" />
                </div>
                <h2 className="text-base font-semibold">
                  ¿Salir sin guardar cambios?
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tenés{" "}
                <span className="font-semibold text-foreground">
                  {cart.length} producto
                  {cart.length !== 1 ? "s" : ""}
                </span>{" "}
                en la venta. Si salís ahora, se perderán los
                cambios realizados.
              </p>
            </div>
            <div className="flex flex-col gap-2 px-6 pb-6">
              <button
                onClick={confirmExit}
                className="w-full py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors cursor-pointer"
              >
                Sí, salir
              </button>
              <button
                onClick={cancelExit}
                className="w-full py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
              >
                Seguir editando
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar COMPLETAR */}
      {confirmCompleteOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setConfirmCompleteOpen(false)}
        >
          <div
            className="bg-background rounded-2xl w-full sm:max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-5 text-primary" />
                </div>
                <h2 className="text-base font-semibold">
                  ¿Completar esta venta?
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Esta venta pasará de{" "}
                <span className="font-semibold">
                  pendiente
                </span>{" "}
                a <span className="font-semibold">
                  completada
                </span>{" "}
                y se actualizarán los movimientos de
                inventario y finanzas correspondientes.
              </p>
            </div>
            <div className="flex flex-col gap-2 px-6 pb-6">
              <button
                onClick={handleConfirmComplete}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
              >
                Sí, completar venta
              </button>
              <button
                onClick={() => setConfirmCompleteOpen(false)}
                className="w-full py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar CANCELAR */}
      {confirmCancelOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setConfirmCancelOpen(false)}
        >
          <div
            className="bg-background rounded-2xl w-full sm:max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-5 text-destructive" />
                </div>
                <h2 className="text-base font-semibold">
                  ¿Cancelar esta venta pendiente?
                </h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Esta venta se marcará como{" "}
                <span className="font-semibold">
                  cancelada
                </span>{" "}
                y ya no aparecerá como pendiente. Asegurate
                de que no necesitás conservarla.
              </p>
            </div>
            <div className="flex flex-col gap-2 px-6 pb-6">
              <button
                onClick={handleConfirmCancel}
                className="w-full py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors cursor-pointer"
              >
                Sí, cancelar venta
              </button>
              <button
                onClick={() => setConfirmCancelOpen(false)}
                className="w-full py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
              >
                Volver
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function EditSalePage() {
  return (
    <Suspense>
      <EditSaleContent />
    </Suspense>
  );
}