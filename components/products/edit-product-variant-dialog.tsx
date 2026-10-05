// components/products/edit-product-variant-dialog.tsx
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
  Loader2, Pencil, Trash2, Plus, DollarSign,
  Hash, ImageIcon, Tag, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { useUpdateVariant } from "@/hooks/swr/use-products";
import { useCurrency } from "@/hooks/swr/use-currency";
import { deleteProductImage, uploadProductImage } from "@/lib/product-image";
import { ProductVariant } from "@/types";
import { ProductImageUpload } from "./product-image-upload";

// ── Schema ─────────────────────────────────────────────────────────────

const schema = z.object({
  variant_name:   z.string().min(1, "El nombre de la variante es requerido"),
  sku:            z.string().min(1, "El SKU es requerido"),
  price_override: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : Number(val)),
    z.number().min(0, "El precio debe ser mayor o igual a 0").optional()
  ),
});

type FormData = z.infer<typeof schema>;

// ── Tipos ──────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

type AttributePair = { id: string; key: string; value: string };

type Props = {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  productId:     number;
  productName:   string;
  basePrice:     number;
  baseSku?:      string;
  variantIndex?: number;
  variant:       ProductVariant | null;
  onSuccess:     () => void;
};

// ── Helper para eliminar imagen desde download URL ─────────────────────

async function deleteOldImage(imageUrl: string) {
  try {
    await deleteProductImage(imageUrl);
  } catch {
    console.warn("No se pudo eliminar la imagen anterior de Storage");
  }
}

// ── Componente ─────────────────────────────────────────────────────────

export function EditProductVariantDialog({
  open, onOpenChange, productId, productName, basePrice, baseSku, variantIndex = 0, variant, onSuccess,
}: Props) {
  const { updateVariant, isUpdating } = useUpdateVariant(productId, variant?.id ?? null);
  const { symbol, format }            = useCurrency();

  const [imageFile,        setImageFile]        = useState<File | null>(null);
  const [imagePreview,     setImagePreview]      = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage]  = useState(false);
  const [attributes,       setAttributes]        = useState<AttributePair[]>([
    { id: uid(), key: "", value: "" },
  ]);

  const {
    register, handleSubmit, reset, watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const priceOverrideValue = watch("price_override");
  const hasCustomPrice     = priceOverrideValue !== undefined;

  // ── Poblar form cuando cambia la variante ──────────────────────────

  useEffect(() => {
    if (variant && open) {
      const autoSku = baseSku
        ? `${baseSku}-${String(variantIndex + 1).padStart(3, "0")}`
        : "";
      reset({
        variant_name:   variant.variant_name,
        sku:            variant.sku?.trim() || autoSku,
        price_override: variant.price_override ?? undefined,
      });
      setImagePreview(variant.image_url ?? null);
      setImageFile(null);

      if (variant.attributes && Object.keys(variant.attributes).length > 0) {
        setAttributes(
          Object.entries(variant.attributes).map(([key, value]) => ({ id: uid(), key, value }))
        );
      } else {
        setAttributes([{ id: uid(), key: "", value: "" }]);
      }
    }
  }, [variant, open, reset, baseSku, variantIndex]);

  // ── Atributos dinámicos ────────────────────────────────────────────

  const addAttribute = () => {
    setAttributes((prev) => [...prev, { id: uid(), key: "", value: "" }]);
  };

  const removeAttribute = (id: string) => {
    setAttributes((prev) => prev.filter((attr) => attr.id !== id));
  };

  const updateAttribute = (
    id: string,
    field: "key" | "value",
    value: string
  ) => {
    setAttributes((prev) =>
      prev.map((attr) => (attr.id === id ? { ...attr, [field]: value } : attr))
    );
  };

  // ── Imagen ─────────────────────────────────────────────────────────

  const uploadImage = async (file: File): Promise<string> => {
    return uploadProductImage(file, "variant");
  };

  // ── Submit ─────────────────────────────────────────────────────────

  const onSubmit = async (data: FormData) => {
    const filledAttrs = attributes.filter((a) => a.key.trim() || a.value.trim());
    const invalidAttr = filledAttrs.find((a) => !a.key.trim() || !a.value.trim());
    if (invalidAttr) {
      toast.error("Cada atributo debe tener nombre y valor");
      return;
    }

    try {
      let image_url: string | null | undefined = variant?.image_url;

      if (imageFile) {
        setIsUploadingImage(true);
        if (variant?.image_url) await deleteOldImage(variant.image_url);
        image_url = await uploadImage(imageFile);
        setIsUploadingImage(false);
      } else if (!imagePreview && variant?.image_url) {
        // Usuario quitó la imagen sin subir una nueva
        await deleteOldImage(variant.image_url);
        image_url = null;
      }

      const attributesObj: Record<string, string> | null =
        filledAttrs.length > 0
          ? Object.fromEntries(filledAttrs.map((a) => [a.key.trim(), a.value.trim()]))
          : null;

      await updateVariant({
        variant_name:   data.variant_name.trim(),
        sku:            data.sku.trim(),
        price_override: data.price_override !== undefined ? data.price_override : null,
        attributes:     attributesObj,
        image_url,
      });

      toast.success("Variante actualizada exitosamente");
      handleClose();
      onSuccess();
    } catch (error: any) {
      setIsUploadingImage(false);
      toast.error(error.message || "Error al actualizar la variante");
    }
  };

  const handleClose = () => {
    setImageFile(null);
    setIsUploadingImage(false);
    onOpenChange(false);
  };

  const isLoading   = isUpdating || isUploadingImage;
  const submitLabel = isUploadingImage ? "Subiendo imagen..."
                    : isUpdating       ? "Guardando..."
                    : "Guardar cambios";

  if (!variant) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Editar variante"
      icon={Layers}
      subtitle={`${productName} · precio base ${format(basePrice)}`}
      width="wide"
      as="form"
      formProps={{ id: "edit-variant-form", onSubmit: handleSubmit(onSubmit) }}
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
            form="edit-variant-form"
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
                <Pencil className="size-4" />
                {submitLabel}
              </>
            )}
          </Button>
        </>
      }
    >
            <div className="space-y-2">
              <FieldLabel icon={<ImageIcon className="size-3.5" />} label="Imagen" optional />
              <ProductImageUpload
                disabled={isLoading}
                onChange={setImageFile}
                initialPreview={imagePreview}
                onRemove={() => setImagePreview(null)}
              />
            </div>

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
            </div>

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
                {attributes.map((attr) => (
                  <div key={attr.id} className="flex items-center gap-2">
                    <Input
                      value={attr.key}
                      onChange={(e) => updateAttribute(attr.id, "key", e.target.value)}
                      placeholder="Ej: Color"
                      disabled={isLoading}
                      className="h-10 text-sm flex-1"
                    />
                    <Input
                      value={attr.value}
                      onChange={(e) => updateAttribute(attr.id, "value", e.target.value)}
                      placeholder="Ej: Rojo"
                      disabled={isLoading}
                      className="h-10 text-sm flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAttribute(attr.id)}
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
