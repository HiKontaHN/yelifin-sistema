// app/(dashboard)/sales/new/page.tsx
"use client";

import { useState, useMemo, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, AlertTriangle,
  ChevronRight, ShoppingCart, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { SearchBar } from "@/components/shared/search-bar";

import { useProducts } from "@/hooks/swr/use-products";
import { useCreateSale, CartItem } from "@/hooks/swr/use-sales";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCustomers, useLoyaltyPolicies, computeLoyaltyTier } from "@/hooks/swr/use-costumers";
import { useSupplies } from "@/hooks/swr/use-supplies";
import { useEvents } from "@/hooks/swr/use-events";

import { PosProductGrid } from "@/components/sales/pos/product-grid";
import { CartPanel, DiscountType } from "@/components/sales/pos/cart-panel";
import { SaleOptionsPanel } from "@/components/sales/pos/sale-options-panel";
import { SuppliesUsedModal, SupplyUsed } from "@/components/sales/pos/supplies-used-modal";
import { MobileCartSheet } from "@/components/sales/pos/mobile-cart-sheet";

import { VariantPickerSheet } from "@/components/sales/pos/variant-picker-sheet";
import { useInventory }        from "@/hooks/swr/use-inventory";
import { Product, ProductVariant } from "@/types";

const ACCOUNT_TYPE_TO_PAYMENT: Record<string, string> = {
  CASH: "CASH", BANK: "TRANSFER", WALLET: "TRANSFER", OTHER: "OTHER",
};


type SearchBarProps = {
  search: string;
  onChange: (value: string) => void;
};


function NewSaleContent() {
  const { push } = useRouter();
  const searchParams = useSearchParams();

  const eventIdParam = searchParams.get("event_id");
  const eventId = eventIdParam ? Number(eventIdParam) : null;
  const backHref = eventId ? "/events" : "/sales";

  const { inventory, mutate: mutateInventory } = useInventory({ limit: 500 });
  const { products } = useProducts();
  const { createSale, isCreating } = useCreateSale();
  const { accounts } = useAccounts();
  const { customers } = useCustomers({ limit: 500 });
  const { policies: loyaltyPolicies } = useLoyaltyPolicies();
  const { supplies } = useSupplies();
  const { mutate: mutateEvents } = useEvents();


  // ── Estado principal ───────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [isPending, setIsPending] = useState(false);  // ← nuevo
  const [suppliesOpen, setSuppliesOpen] = useState(false);
  const [suppliesUsed, setSuppliesUsed] = useState<SupplyUsed[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [desktopStep, setDesktopStep] = useState<1 | 2>(1);
  const [exitDialog, setExitDialog] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);

  const hasCart = cart.length > 0;
  const hasSupplies = supplies.length > 0;

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasCart) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasCart]);

  const safeNavigate = useCallback((href: string) => {
    if (!hasCart) { push(href); return; }
    setPendingHref(href);
    setExitDialog(true);
  }, [hasCart, push]);

  const confirmExit = () => { setExitDialog(false); if (pendingHref) push(pendingHref); };
  const cancelExit = () => { setExitDialog(false); setPendingHref(null); };

 const availableProducts = useMemo(
    () => products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku?.toLowerCase().includes(search.toLowerCase()) ?? false);
 
      // Mostrar si: servicio, o tiene stock disponible (incluye variantes)
      const hasStock = p.is_service || (p.stock ?? 0) > 0;
 
      return matchesSearch && hasStock;
    }),
    [products, search]
  );

  // Helper de clave — identifica un item único en el carrito
  const cartKey = (productId: number, variantId: number | null | undefined) =>
    `${productId}-${variantId ?? "base"}`;

  // ── Carrito ────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    // Si tiene variantes → abrir picker
    if (product.variants.length > 0) {
      setVariantPickerProduct(product);
      return;
    }
    // Sin variantes → agregar directo (lógica original)
    addItemToCart(product, null);
  };

   const addItemToCart = (product: Product, variant: ProductVariant | null) => {
    const variantId  = variant?.id ?? null;
    const key        = cartKey(product.id, variantId);
    const price      = variant?.price_override != null
      ? Number(variant.price_override)
      : product.price;
    const label      = variant ? variant.variant_name : product.name;
    const image      = variant?.image_url ?? product.image_url;
 
    // Stock a verificar — del producto base o de la variante
    const invItem   = inventory.find((i) => i.product_id === product.id);
    const stockAvail = variantId
      ? Number(invItem?.variants_stock.find((v) => v.variant_id === variantId)?.stock ?? 0)
      : Number(invItem?.base_stock ?? product.stock ?? 0);
 
    setCart((prev) => {
      const existing = prev.find((i) => cartKey(i.product_id, i.variant_id) === key);
      if (existing) {
        if (!product.is_service && existing.quantity >= stockAvail) {
          toast.error(`Stock máximo: ${stockAvail} unidades`);
          return prev;
        }
        return prev.map((i) =>
          cartKey(i.product_id, i.variant_id) === key
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, {
        product_id:   product.id,
        variant_id:   variantId,
        product_name: product.name,
        variant_name: variant?.variant_name ?? null,
        image_url:    image,
        quantity:     1,
        unit_price:   price,
        discount:     0,
      }];
    });
  };

  const updateQuantity = (productId: number, delta: number, variantId?: number | null) =>
    setCart((prev) =>
      prev
        .map((i) =>
          cartKey(i.product_id, i.variant_id) === cartKey(productId, variantId)
            ? { ...i, quantity: i.quantity + delta }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
 
  const removeFromCart = (productId: number, variantId?: number | null) =>
    setCart((prev) =>
      prev.filter((i) => cartKey(i.product_id, i.variant_id) !== cartKey(productId, variantId))
    );
 
  const updateItemPrice = (productId: number, v: number, variantId?: number | null) =>
    setCart((prev) =>
      prev.map((i) =>
        cartKey(i.product_id, i.variant_id) === cartKey(productId, variantId)
          ? { ...i, unit_price: v }
          : i
      )
    );
 
  const updateDiscount = (productId: number, v: number, variantId?: number | null) =>
    setCart((prev) =>
      prev.map((i) =>
        cartKey(i.product_id, i.variant_id) === cartKey(productId, variantId)
          ? { ...i, discount: v }
          : i
      )
    );
 

  const updateSupplyQty = (id: number, qty: number) =>
    setSuppliesUsed((prev) => prev.map((s) => s.supply_id === id ? { ...s, quantity: qty } : s));
  const removeSupply = (id: number) =>
    setSuppliesUsed((prev) => prev.filter((s) => s.supply_id !== id));

  // ── Fidelización ──────────────────────────────────────────────────
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  const loyaltyTier = useMemo(
    () => selectedCustomer && loyaltyPolicies.length > 0
      ? computeLoyaltyTier(selectedCustomer, loyaltyPolicies)
      : null,
    [selectedCustomer, loyaltyPolicies]
  );

  // ── Cálculos TAX-INCLUSIVE ─────────────────────────────────────────
  const subtotal = cart.reduce((acc, i) => acc + i.unit_price * i.quantity, 0);
  // i.discount es un porcentaje (0-100) por producto, igual que el global
  const itemDiscounts = cart.reduce(
    (acc, i) => acc + i.unit_price * i.quantity * (i.discount / 100),
    0
  );
  const appliedGlobal = discountType === "global" ? subtotal * (globalDiscount / 100) : 0;
  const appliedPerItem = discountType === "per_item" ? itemDiscounts : 0;
  const totalDiscount = appliedGlobal + appliedPerItem;
  const total = subtotal - totalDiscount;
  const taxAmount = taxRate > 0 ? total * taxRate / (100 + taxRate) : 0;
  const grandTotal = total + shippingCost;

  // ── Checkout ───────────────────────────────────────────────────────
  const handleCheckout = async () => {
    if (cart.length === 0) return toast.error("El carrito está vacío");
    if (!accountId) return toast.error("Selecciona una cuenta de destino");

    const account = accounts.find((a) => Number(a.id) === Number(accountId));
    const paymentMethod = ACCOUNT_TYPE_TO_PAYMENT[account?.type ?? "OTHER"] ?? "OTHER";

    try {
      const result = await createSale({
        customer_id: customerId,
        items: cart.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id ?? undefined,
          quantity: i.quantity,
          unit_price: i.unit_price,
          // El backend espera un monto por línea; convertimos el % a monto
          discount: discountType === "per_item"
            ? i.unit_price * i.quantity * (i.discount / 100)
            : 0,
        })),
        discount: appliedGlobal,
        shipping_cost: shippingCost > 0 ? shippingCost : undefined,
        tax_rate: taxRate > 0 ? taxRate : undefined,
        payment_method: paymentMethod as any,
        account_id: accountId,
        notes: notes || undefined,
        status: isPending ? "PENDING" : "COMPLETED",
        supplies_used: suppliesUsed.length > 0
          ? suppliesUsed.map((s) => ({ supply_id: s.supply_id, quantity: s.quantity, unit_cost: s.unit_cost }))
          : undefined,
        ...(eventId && { event_id: eventId }),
      });

      if (eventId) await mutateEvents();

      toast.success(
        isPending
          ? `Venta ${result.data.sale_number} guardada como pendiente`
          : `Venta ${result.data.sale_number} registrada`
      );
      mutateInventory();
      setCart([]);
      push(backHref);
    } catch (err: any) {
      toast.error(err.message || "Error al registrar la venta");
    }
  };

  // ── Props agrupados ────────────────────────────────────────────────
  const cartProps = {
    cart, discountType, globalDiscount, subtotal, totalDiscount, total,
    shippingCost, taxRate, taxAmount, suppliesUsed,
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
    customers, accounts, hasSupplies,
    customerId, accountId,
    notes, grandTotal, shippingCost,
    isCreating, isPending,
    loyaltyTier,
    onCustomerChange: setCustomerId,
    onAccountChange: setAccountId,
    onNotesChange: setNotes,
    onShippingCostChange: setShippingCost,
    onIsPendingChange: setIsPending,
    onCheckout: handleCheckout,
    onOpenSupplies: () => setSuppliesOpen(true),
    onApplyLoyaltyDiscount: (pct: number) => {
      setDiscountType("global");
      setGlobalDiscount(pct);
      toast.success(`Descuento de fidelización ${pct}% aplicado`);
    },
  };

  const mobileOptionsProps = baseOptionsProps;
  const desktopOptionsProps = { ...baseOptionsProps, onBack: () => setDesktopStep(1) };

  return (
    <>
      {/* ════════════════════ LAYOUT MÓVIL ════════════════════════════ */}
      <div className="lg:hidden fixed inset-0 top-16 flex flex-col bg-background">
        <div className="shrink-0 px-4 pt-3 pb-3 space-y-3 bg-background z-10 border-b">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => safeNavigate(backHref)}>
              <ArrowLeft className="size-4" />
            </Button>
            <h1 className="text-xl font-semibold tracking-tight flex-1">Nueva Venta</h1>
            {cart.length > 0 && (
              <Badge variant="secondary" className="shrink-0">
                {cart.reduce((acc, i) => acc + i.quantity, 0)} uds
              </Badge>
            )}
          </div>
          <SearchBar value={search} onChange={setSearch} />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
          <PosProductGrid products={availableProducts} cart={cart} onAdd={addToCart} search={search} />
        </div>

        <MobileCartSheet
          open={cartOpen}
          onOpenChange={setCartOpen}
          cart={cart}
          total={grandTotal}
          cartProps={cartProps}
          optionsProps={mobileOptionsProps}
        />
      </div>

      {/* ════════════════════ LAYOUT DESKTOP ═════════════════════════ */}
      <div className="hidden lg:flex flex-col h-[calc(100vh-4rem)] pb-4">
        <div className="shrink-0 flex items-center gap-3 py-3">
          <Button variant="ghost" size="icon" onClick={() => safeNavigate(backHref)}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Nueva Venta</h1>
            <p className="text-muted-foreground text-sm">
              {cart.length} producto{cart.length !== 1 ? "s" : ""}
              {suppliesUsed.length > 0 && ` · ${suppliesUsed.length} suministro${suppliesUsed.length !== 1 ? "s" : ""}`}
              {taxRate > 0 && ` · ISV ${taxRate}% incluido`}
              {shippingCost > 0 && " · envío incluido"}
              {isPending && " · pendiente"}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setDesktopStep(1)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${desktopStep === 1 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
            >
              <ShoppingCart className="size-3.5" />
              Productos
            </button>
            <ChevronRight className="size-4 text-muted-foreground" />
            <button
              onClick={() => cart.length > 0 && setDesktopStep(2)}
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

        {/* Paso 1 */}
        {desktopStep === 1 && (
          <div className="flex-1 min-h-0 grid grid-cols-5 gap-4">
            <div className="col-span-3 flex flex-col min-h-0 gap-3">
             <SearchBar value={search} onChange={setSearch} placeholder="Buscar Producto" />
              <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
                <PosProductGrid products={availableProducts} cart={cart} onAdd={addToCart} search={search} />
              </div>
            </div>
            <div className="col-span-2 flex flex-col min-h-0 gap-3 overflow-y-auto" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
              <CartPanel {...cartProps} />
              {cart.length > 0 && (
                <Button className="w-full gap-2" onClick={() => setDesktopStep(2)}>
                  Continuar al detalle <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Paso 2 */}
        {desktopStep === 2 && (
          <div className="flex-1 min-h-0 grid grid-cols-5 gap-4">
            <div className="col-span-3 flex flex-col min-h-0 gap-3 overflow-y-auto" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
              <CartPanel {...cartProps} />
            </div>
            <div className="col-span-2 flex flex-col min-h-0 gap-3 overflow-y-auto" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
              <SaleOptionsPanel {...desktopOptionsProps} />
            </div>
          </div>
        )}
      </div>

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

      <SuppliesUsedModal
        open={suppliesOpen}
        onOpenChange={setSuppliesOpen}
        onConfirm={setSuppliesUsed}
        initialSupplies={suppliesUsed}
      />

      {exitDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={cancelExit}>
          <div className="bg-background rounded-2xl w-full sm:max-w-sm shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 pb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="size-10 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="size-5 text-yellow-600" />
                </div>
                <h2 className="text-base font-semibold">¿Salir de la venta?</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tenés{" "}
                <span className="font-semibold text-foreground">
                  {cart.length} producto{cart.length !== 1 ? "s" : ""}
                </span>{" "}
                en el carrito. Si salís ahora, se perderán los datos de la venta en proceso.
              </p>
            </div>
            <div className="flex flex-col gap-2 px-6 pb-6">
              <button onClick={confirmExit} className="w-full py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors cursor-pointer">
                Sí, salir
              </button>
              <button onClick={cancelExit} className="w-full py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors cursor-pointer">
                Seguir en la venta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function NewSalePage() {
  return (
    <Suspense>
      <NewSaleContent />
    </Suspense>
  );
}