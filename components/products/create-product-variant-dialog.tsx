// components/products/create-product-variant-dialog.tsx
"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Plus, Trash2, DollarSign, Hash,
  ImageIcon, Tag, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreateVariant } from "@/hooks/swr/use-products";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/swr/use-currency";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { ProductImageUpload } from "./product-image-upload";
import { ExistingForm, ExistingFormValue, defaultExistingForm } from "./inventory-section/existing-form";
import { Boxes, ChevronDown, ChevronUp } from "lucide-react";
import { localDateToISO } from "@/lib/date-utils";
import { useDebounce } from "@/hooks/use-debounce";

// ── Schema ─────────────────────────────────────────────────────────────

const schema = z.object({
  variant_name:   z.string().min(1, "El nombre de la variante es requerido"),
  sku:            z.string().min(1, "El SKU es requerido"),
  price_override: z.coerce.number().min(0, "El precio debe ser mayor o igual a 0").optional()
                    .or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

// ── Tipos ──────────────────────────────────────────────────────────────

type AttributePair = { key: string; value: string };

type Props = {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  productId:     number;
  productName:   string;
  basePrice:     number;
  baseSku?:      string;
  variantCount?: number;
  /** Stock actual del producto base (sin variante). Si es la primera
   *  variante y hay stock, se pedirá un nombre para convertirlo. */
  baseStock?:    number;
  onSuccess:     () => void;
};

// ── Componente ─────────────────────────────────────────────────────────

export function CreateProductVariantDialog({
  open, onOpenChange, productId, productName, basePrice, baseSku, variantCount = 0, baseStock = 0, onSuccess,
}: Props) {
  const { firebaseUser }              = useAuth();
  const { createVariant, isCreating } = useCreateVariant(productId);
  const { symbol, format }            = useCurrency();

  const [imageFile,        setImageFile]        = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [attributes,       setAttributes]       = useState<AttributePair[]>([
    { key: "", value: "" },
  ]);
  const [inventoryOpen,    setInventoryOpen]    = useState(false);
  const [inventoryData,    setInventoryData]    = useState<ExistingFormValue>(defaultExistingForm());
  const [baseVariantName,  setBaseVariantName]  = useState("");
  const [baseSkuSuggested, setBaseSkuSuggested] = useState<string | null>(null);
  const [skuStatus,        setSkuStatus]        = useState<"unknown" | "checking" | "available" | "taken">("unknown");

  // Primera variante de un producto con stock: el stock base se convierte
  // en una variante con nombre propio (el producto queda como "padre").
  const needsBaseConversion = variantCount === 0 && Number(baseStock) > 0;

  const {
    register, handleSubmit, reset, watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { variant_name: "", sku: "", price_override: "" },
  });

  const priceOverrideValue = watch("price_override");
  const hasCustomPrice     = priceOverrideValue !== "" && priceOverrideValue !== undefined;

  // Auto-rellenar SKU al abrir con sugerencias verificadas del servidor.
  // Con conversión de base: el stock actual toma la primera (-01) y la
  // variante nueva la segunda (-02).
  useEffect(() => {
    if (!open || !productId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await firebaseUser?.getIdToken();
        const res = await fetch(
          `/api/products/${productId}/variants/suggest-sku?count=2`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        const suggestions: string[] = json.data?.suggestions ?? [];
        if (cancelled || suggestions.length === 0) return;
        setBaseSkuSuggested(needsBaseConversion ? suggestions[0] : null);
        const suggested = needsBaseConversion
          ? (suggestions[1] ?? suggestions[0])
          : suggestions[0];
        reset((prev) => ({ ...prev, sku: suggested }));
      } catch {
        // Fallback local si el endpoint falla
        if (!cancelled && baseSku) {
          const seq = String(variantCount + 1).padStart(2, "0");
          reset((prev) => ({ ...prev, sku: `${baseSku}-${seq}` }));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productId, needsBaseConversion]);

  // Verificación en vivo de disponibilidad del SKU escrito
  const skuValue = watch("sku");
  const debouncedSku = useDebounce(skuValue?.trim() ?? "", 400);
  useEffect(() => {
    if (!open || !productId || !debouncedSku) {
      setSkuStatus("unknown");
      return;
    }
    let cancelled = false;
    setSkuStatus("checking");
    (async () => {
      try {
        const token = await firebaseUser?.getIdToken();
        const res = await fetch(
          `/api/products/${productId}/variants/suggest-sku?check=${encodeURIComponent(debouncedSku)}`,
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
  }, [debouncedSku, open, productId]);

  // ── Atributos dinámicos ────────────────────────────────────────────

  const addAttribute = () => {
    setAttributes((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeAttribute = (index: number) => {
    setAttributes((prev) => prev.filter((_, i) => i !== index));
  };

  const updateAttribute = (
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    setAttributes((prev) =>
      prev.map((attr, i) => (i === index ? { ...attr, [field]: value } : attr))
    );
  };

  // ── Imagen ─────────────────────────────────────────────────────────

  const uploadImage = async (file: File): Promise<string> => {
    const path       = `products/${firebaseUser!.uid}/variants/${Date.now()}.webp`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: "image/webp" });
    return getDownloadURL(storageRef);
  };

  // ── Submit ─────────────────────────────────────────────────────────

  const onSubmit = async (data: FormData) => {
    // Validar atributos — si se llenó la clave debe tener valor y viceversa
    const filledAttrs = attributes.filter((a) => a.key.trim() || a.value.trim());
    const invalidAttr = filledAttrs.find(
      (a) => !a.key.trim() || !a.value.trim()
    );
    if (invalidAttr) {
      toast.error("Cada atributo debe tener nombre y valor");
      return;
    }

    if (needsBaseConversion && !baseVariantName.trim()) {
      toast.error("Indica el nombre de la variante que representa el stock actual");
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

      const attributesObj =
        filledAttrs.length > 0
          ? Object.fromEntries(filledAttrs.map((a) => [a.key.trim(), a.value.trim()]))
          : null;

      const newVariant = await createVariant({
        variant_name:   data.variant_name.trim(),
        sku:            data.sku?.trim() || undefined,
        price_override: data.price_override !== "" && data.price_override !== undefined && Number(data.price_override) > 0
                          ? Number(data.price_override)
                          : null,
        attributes:     attributesObj,
        image_url,
        ...(needsBaseConversion
          ? {
              base_conversion: {
                variant_name: baseVariantName.trim(),
                sku: baseSkuSuggested ?? undefined,
              },
            }
          : {}),
      });

      // Registrar inventario inicial si se configuró
      if (inventoryOpen && Number(inventoryData.quantity) >= 1) {
        try {
          const token = await firebaseUser?.getIdToken();
          const res = await fetch("/api/inventory/existing", {
            method:  "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              product_id:   productId,
              variant_id:   newVariant.id,
              quantity:     Number(inventoryData.quantity),
              unit_cost:    inventoryData.unit_cost || 0,
              purchased_at: inventoryData.purchased_at
                ? localDateToISO(inventoryData.purchased_at)
                : undefined,
              notes: inventoryData.notes?.trim() || "Inventario inicial de variante",
            }),
          });
          if (!res.ok) {
            const err = await res.json();
            toast.warning(`Variante creada, pero el inventario no se pudo registrar: ${err.error ?? "Error desconocido"}`);
          } else {
            toast.success("Variante e inventario inicial registrados");
          }
        } catch {
          toast.warning("Variante creada, pero el inventario inicial no se pudo registrar.");
        }
      } else {
        toast.success("Variante creada exitosamente");
      }

      handleClose();
      onSuccess();
    } catch (error: any) {
      setIsUploadingImage(false);
      toast.error(error.message || "Error al crear la variante");
    }
  };

  const handleClose = () => {
    reset();
    setImageFile(null);
    setAttributes([{ key: "", value: "" }]);
    setIsUploadingImage(false);
    setInventoryOpen(false);
    setInventoryData(defaultExistingForm());
    setBaseVariantName("");
    setBaseSkuSuggested(null);
    setSkuStatus("unknown");
    onOpenChange(false);
  };

  const isLoading   = isCreating || isUploadingImage;
  const submitLabel = isUploadingImage ? "Subiendo imagen..."
                    : isCreating       ? "Creando..."
                    : "Crear variante";

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Nueva variante"
      icon={Layers}
      subtitle={`${productName} · precio base ${format(basePrice)}`}
      width="wide"
      as="form"
      formProps={{ id: "create-variant-form", onSubmit: handleSubmit(onSubmit) }}
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
            form="create-variant-form"
            disabled={isLoading}
            className="flex-1 h-11 gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {submitLabel}
              </>
            ) : (
              <>
                <Plus className="size-4" />
                {submitLabel}
              </>
            )}
          </Button>
        </>
      }
    >
            {/* Conversión del stock base en variante */}
            {needsBaseConversion && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800/40 p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="size-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                    <Boxes className="size-4 text-amber-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Este producto ya tiene {baseStock} unidad{Number(baseStock) !== 1 ? "es" : ""} en stock
                    </p>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                      Ese stock se convertirá en una variante propia, para que todas las
                      presentaciones aparezcan juntas al vender. ¿Qué variante representa
                      el stock actual?
                    </p>
                  </div>
                </div>
                <Input
                  value={baseVariantName}
                  onChange={(e) => setBaseVariantName(e.target.value)}
                  placeholder="Ej: Blanco / Original / Talla única"
                  disabled={isLoading}
                  className="h-11 text-base bg-background"
                />
                {baseSkuSuggested && (
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                    SKU asignado: <span className="font-mono font-medium">{baseSkuSuggested}</span>
                  </p>
                )}
              </div>
            )}

            {/* Imagen */}
            <div className="space-y-2">
              <FieldLabel icon={<ImageIcon className="size-3.5" />} label="Imagen" optional />
              <ProductImageUpload disabled={isLoading} onChange={setImageFile} />
            </div>

            {/* Nombre de variante */}
            <div className="space-y-2">
              <FieldLabel icon={<Tag className="size-3.5" />} label="Nombre" required />
              <Input
                {...register("variant_name")}
                placeholder="Ej: Talla M / Color Rojo / 500g"
                disabled={isLoading}
                className="h-11 text-base"
              />
              {errors.variant_name && (
                <p className="text-xs text-destructive">{errors.variant_name.message}</p>
              )}
            </div>

            {/* SKU */}
            <div className="space-y-2">
              <FieldLabel icon={<Hash className="size-3.5" />} label="SKU" required />
              <Input
                {...register("sku")}
                placeholder="Ej: CAM-NEG-M"
                disabled={isLoading}
                className="h-11 text-base font-mono"
              />
              {errors.sku && (
                <p className="text-xs text-destructive">{errors.sku.message}</p>
              )}
              {!errors.sku && skuStatus === "taken" && (
                <p className="text-xs text-destructive">Este SKU ya está ocupado</p>
              )}
              {!errors.sku && skuStatus === "available" && (
                <p className="text-xs text-green-600">SKU disponible</p>
              )}
            </div>

            {/* Precio override */}
            <div className="space-y-2">
              <FieldLabel
                icon={<DollarSign className="size-3.5" />}
                label="Precio especial"
                optional
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                  {symbol}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`Dejar vacío para usar ${format(basePrice)}`}
                  {...register("price_override")}
                  disabled={isLoading}
                  className="h-11 pl-8 text-base"
                />
              </div>
              {hasCustomPrice && (
                <p className="text-xs text-muted-foreground">
                  Esta variante se venderá a{" "}
                  <span className="font-medium text-foreground font-mono">
                    {format(Number(priceOverrideValue))}
                  </span>{" "}
                  en lugar del precio base.
                </p>
              )}
              {errors.price_override && (
                <p className="text-xs text-destructive">{errors.price_override.message}</p>
              )}
            </div>

            {/* Atributos dinámicos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FieldLabel
                  icon={<Tag className="size-3.5" />}
                  label="Atributos"
                  optional
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addAttribute}
                  disabled={isLoading || attributes.length >= 8}
                  className="h-7 text-xs gap-1 text-primary hover:text-primary"
                >
                  <Plus className="size-3" />
                  Agregar
                </Button>
              </div>

              <div className="space-y-2">
                {attributes.map((attr, index) => (
                  <div key={`${attr.key}-${index}`} className="flex items-center gap-2">
                    <Input
                      value={attr.key}
                      onChange={(e) => updateAttribute(index, "key", e.target.value)}
                      placeholder="Ej: Color"
                      disabled={isLoading}
                      className="h-10 text-sm flex-1"
                    />
                    <Input
                      value={attr.value}
                      onChange={(e) => updateAttribute(index, "value", e.target.value)}
                      placeholder="Ej: Rojo"
                      disabled={isLoading}
                      className="h-10 text-sm flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAttribute(index)}
                      disabled={isLoading || attributes.length === 1}
                      className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Ej: Color → Rojo, Talla → M, Material → Algodón
              </p>
            </div>

            {/* Inventario inicial */}
            <div className="rounded-xl border overflow-hidden">
              <button
                type="button"
                onClick={() => setInventoryOpen((v) => !v)}
                disabled={isLoading}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  <div className={cn(
                    "size-7 rounded-lg flex items-center justify-center transition-colors",
                    inventoryOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}>
                    <Boxes className="size-4" />
                  </div>
                  <span>Agregar inventario inicial</span>
                  {!inventoryOpen && (
                    <span className="text-xs text-muted-foreground font-normal">opcional</span>
                  )}
                </div>
                {inventoryOpen
                  ? <ChevronUp   className="size-4 text-muted-foreground shrink-0" />
                  : <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                }
              </button>

              {inventoryOpen && (
                <div className="border-t bg-muted/10 px-4 pb-4 pt-4">
                  <ExistingForm
                    value={inventoryData}
                    onChange={setInventoryData}
                    disabled={isLoading}
                  />
                </div>
              )}
            </div>

    </ResponsiveModal>
  );
}

// ── FieldLabel ──────────────────────────────────────────────────────────

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