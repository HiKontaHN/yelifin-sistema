"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, PackagePlus, DollarSign, Hash, FileText, ImageIcon, Wrench } from "lucide-react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { useCreateProduct } from "@/hooks/swr/use-products";
import { useCreatePurchase } from "@/hooks/swr/use-purchases";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/swr/use-currency";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

import { ProductImageUpload } from "./product-image-upload";
import { InventorySection, InventorySectionValue } from "./inventory-section";
import { localDateToISO } from "@/lib/date-utils";
import { useDebounce } from "@/hooks/use-debounce";

const schema = z.object({
  name:        z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  sku:         z.string().optional(),
  price:       z.coerce.number().min(0, "El precio debe ser mayor o igual a 0"),
  is_service:  z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (!data.is_service && (!data.sku || data.sku.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El SKU es requerido para productos",
      path: ["sku"],
    });
  }
});

type FormData = z.infer<typeof schema>;

type Props = {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess:    () => void;
};

export function CreateProductDialog({ open, onOpenChange, onSuccess }: Props) {
  const { firebaseUser }                                   = useAuth();
  const { createProduct, isCreating }                      = useCreateProduct();
  const { createPurchase, isCreating: isCreatingPurchase } = useCreatePurchase();
  const { symbol }                                         = useCurrency();

  const [imageFile,        setImageFile]        = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [inventory,        setInventory]        = useState<InventorySectionValue>(null);

  const {
    register, handleSubmit, reset, watch, setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { is_service: false },
  });

  const nameValue    = watch("name");
  const isService    = watch("is_service") ?? false;

  const [suggestedSku, setSuggestedSku] = useState("");
  const [skuStatus,    setSkuStatus]    = useState<"unknown" | "checking" | "available" | "taken">("unknown");

  // Sugerencia verificada por el servidor a partir del nombre
  // (PHK-001, PHK-002, ... rellenando huecos)
  const debouncedName = useDebounce(nameValue?.trim() ?? "", 400);
  useEffect(() => {
    if (!open || !debouncedName) {
      setSuggestedSku("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await firebaseUser?.getIdToken();
        const res = await fetch(
          `/api/products/suggest-sku?name=${encodeURIComponent(debouncedName)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled) setSuggestedSku(json.data?.suggestions?.[0] ?? "");
      } catch {
        // Fallback local si el endpoint falla
        if (!cancelled) {
          const prefix = debouncedName.split(/\s+/).map((w: string) => w[0]?.toUpperCase() ?? "").join("").slice(0, 4);
          setSuggestedSku(prefix ? `${prefix}-001` : "");
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedName, open]);

  // Verificación en vivo de disponibilidad del SKU escrito
  const skuValue = watch("sku");
  const debouncedSku = useDebounce(skuValue?.trim() ?? "", 400);
  useEffect(() => {
    if (!open || !debouncedSku) {
      setSkuStatus("unknown");
      return;
    }
    let cancelled = false;
    setSkuStatus("checking");
    (async () => {
      try {
        const token = await firebaseUser?.getIdToken();
        const res = await fetch(
          `/api/products/suggest-sku?check=${encodeURIComponent(debouncedSku)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const json = await res.json();
        if (!cancelled) setSkuStatus(json.data?.available ? "available" : "taken");
      } catch {
        if (!cancelled) setSkuStatus("unknown");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSku, open]);

  const uploadImage = async (file: File): Promise<string> => {
    const path       = `products/${firebaseUser!.uid}/${Date.now()}.webp`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: "image/webp" });
    return getDownloadURL(storageRef);
  };

  const onSubmit = async (data: FormData) => {
    if (!data.is_service && inventory) {
      const qty = Number(inventory.data.quantity);
      if (!qty || qty < 1) { toast.error("La cantidad debe ser al menos 1"); return; }
    }
    if (!data.is_service && inventory?.mode === "purchase" && !inventory.data.account_id) {
      toast.error("Selecciona una cuenta para la compra");
      return;
    }
    if (skuStatus === "taken") {
      toast.error("El SKU ya está ocupado, elige otro");
      return;
    }

    try {
      let image_url: string | null = null;
      if (imageFile) {
        setIsUploadingImage(true);
        image_url = await uploadImage(imageFile);
        setIsUploadingImage(false);
      }

      const product   = await createProduct({ ...data, image_url });
      const productId = product?.id as number;
      if (!productId) throw new Error("No se obtuvo el ID del producto");

      // Si es servicio, no registrar inventario
      if (!data.is_service && inventory?.mode === "purchase") {
        const d = inventory.data;
        await createPurchase({
          account_id:    d.account_id!,
          currency:      d.currency,
          exchange_rate: d.exchange_rate,
          shipping:      d.shipping,
          notes:         d.notes || undefined,
          purchased_at:  localDateToISO(d.purchased_at),
          items: [{
            product_id:    productId,
            quantity:      Number(d.quantity),
            unit_cost_usd: d.unit_cost,
          }],
        });
        toast.success("Producto e inventario registrados exitosamente");

      } else if (!data.is_service && inventory?.mode === "existing") {
        const d = inventory.data;
        const token = await firebaseUser?.getIdToken();
        const res = await fetch("/api/inventory/existing", {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            product_id:   productId,
            quantity:     Number(d.quantity),
            unit_cost:    d.unit_cost || undefined,
            purchased_at: d.purchased_at ? localDateToISO(d.purchased_at) : undefined,
            notes:        d.notes || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Error al registrar existencia inicial");
        }
        toast.success("Producto creado con existencia inicial");

      } else {
        toast.success(data.is_service ? "Servicio creado exitosamente" : "Producto creado exitosamente");
      }

      handleClose();
      onSuccess();

    } catch (error: any) {
      setIsUploadingImage(false);
      toast.error(error.message || "Error al crear el producto");
    }
  };

  const handleClose = () => {
    reset();
    setImageFile(null);
    setInventory(null);
    setIsUploadingImage(false);
    setSuggestedSku("");
    setSkuStatus("unknown");
    onOpenChange(false);
  };

  // Cuando se activa "es servicio", limpiar inventario
  const handleServiceToggle = (checked: boolean) => {
    setValue("is_service", checked);
    if (checked) setInventory(null);
  };

  const isLoading   = isCreating || isCreatingPurchase || isUploadingImage;
  const hasInv      = inventory !== null && !isService;
  const submitLabel = isUploadingImage   ? "Subiendo imagen..."
                    : isCreatingPurchase ? "Registrando compra..."
                    : isCreating        ? "Creando..."
                    : hasInv            ? "Crear y registrar"
                    : isService         ? "Crear servicio"
                    : "Crear producto";

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title={isService ? "Nuevo servicio" : "Nuevo producto"}
      width="wide"
      as="form"
      formProps={{ id: "create-product-form", onSubmit: handleSubmit(onSubmit) }}
      bodyClassName="space-y-5"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="create-product-form"
            disabled={isLoading}
            className="flex-1 h-11 gap-2"
          >
            {isLoading
              ? <><Loader2 className="size-4 animate-spin" />{submitLabel}</>
              : <><PackagePlus className="size-4" />{submitLabel}</>
            }
          </Button>
        </>
      }
    >
            {/* Toggle de servicio — va primero para que cambie el contexto del form */}
            <div className={cn(
              "flex items-start justify-between gap-4 rounded-xl border p-4 transition-colors",
              isService ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  "mt-0.5 rounded-lg p-1.5 transition-colors",
                  isService ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <Wrench className="size-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-none">Es un servicio</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Actívalo si vendés algo intangible como un mantenimiento,
                    consultoría o instalación. Los servicios no descuentan inventario.
                  </p>
                </div>
              </div>
              <Switch
                checked={isService}
                onCheckedChange={handleServiceToggle}
                disabled={isLoading}
                className="shrink-0 mt-0.5"
              />
            </div>

            {/* Imagen */}
            <div className="space-y-2">
              <FieldLabel icon={<ImageIcon className="size-3.5" />} label="Imagen" optional />
              <ProductImageUpload disabled={isLoading} onChange={setImageFile} />
            </div>

            {/* Nombre */}
            <div className="space-y-2">
              <FieldLabel icon={<FileText className="size-3.5" />} label="Nombre" required />
              <Input
                {...register("name")}
                placeholder={isService ? "Ej: Mantenimiento de equipo" : "Ej: Camiseta negra talla M"}
                disabled={isLoading}
                className="h-11 text-base"
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* SKU — opcional para servicios */}
            <div className="space-y-2">
              <FieldLabel
                icon={<Hash className="size-3.5" />}
                label="SKU"
                required={!isService}
                optional={isService}
              />
              <Input
                {...register("sku", { required: !isService })}
                placeholder={isService ? "Ej: SERV-001 (opcional)" : "Ej: CAM-NEG-M"}
                disabled={isLoading}
                className="h-11 text-base font-mono"
              />
              {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
              {!errors.sku && skuStatus === "taken" && (
                <p className="text-xs text-destructive">Este SKU ya está ocupado</p>
              )}
              {!errors.sku && skuStatus === "available" && (
                <p className="text-xs text-green-600">SKU disponible</p>
              )}
              {suggestedSku && (
                <p className="text-xs text-muted-foreground">
                  Sugerido:{" "}
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setValue("sku", suggestedSku)}
                  >
                    {suggestedSku}
                  </button>
                </p>
              )}
            </div>

            {/* Precio */}
            <div className="space-y-2">
              <FieldLabel icon={<DollarSign className="size-3.5" />} label="Precio de venta" required />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                  {symbol}
                </span>
                <Input
                  type="number" step="0.01" min="0" placeholder="0.00"
                  {...register("price")}
                  disabled={isLoading}
                  className="h-11 pl-8 text-base"
                />
              </div>
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <FieldLabel icon={<FileText className="size-3.5" />} label="Descripción" optional />
              <Textarea
                placeholder={
                  isService
                    ? "Describe el servicio que ofrecés..."
                    : "Describe el producto brevemente..."
                }
                rows={2}
                {...register("description")}
                disabled={isLoading}
                className="resize-none text-base"
              />
            </div>

            {/* Inventario: solo si NO es servicio */}
            {!isService && (
              <InventorySection
                value={inventory}
                onChange={setInventory}
                disabled={isLoading}
              />
            )}

    </ResponsiveModal>
  );
}

function FieldLabel({ icon, label, required, optional }: {
  icon?:     React.ReactNode;
  label:     string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <Label className="text-sm font-medium">{label}</Label>
      {required && <span className="text-destructive text-xs">*</span>}
      {optional && <span className="text-muted-foreground text-xs">opcional</span>}
    </div>
  );
}