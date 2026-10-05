// components/products/edit-product-dialog.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Upload, X, Pencil, DollarSign, Hash, FileText, ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUpdateProduct } from "@/hooks/swr/use-products";
import { useCurrency } from "@/hooks/swr/use-currency";
import { deleteProductImage, uploadProductImage } from "@/lib/product-image";
import { Product } from "@/types";
import Image from "next/image";
import { is } from "date-fns/locale";

// ── Schema condicional según tipo ──────────────────────────────────────

const createSchema = (isService: boolean) =>
  z.object({
    name:        z.string().min(1, "El nombre es requerido"),
    description: z.string().optional(),
    sku:         isService
                   ? z.string().optional()
                   : z.string().min(1, "El SKU es requerido para productos"),
    price:       z.coerce.number().min(0, "El precio debe ser mayor o igual a 0"),
    service_cost: z.coerce.number().min(0, "El costo debe ser mayor o igual a 0").optional(),
  });

type FormData = z.infer<ReturnType<typeof createSchema>>;

type Props = {
  product:      Product | null;
  open:         boolean;
  is_service:   boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess:    () => void;
};

// ── WebP converter ─────────────────────────────────────────────────────

async function convertToWebP(file: File, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else                { width  = Math.round((width  * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          blob ? resolve(blob) : reject(new Error("Error al convertir imagen"));
        },
        "image/webp",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Error al cargar imagen"));
    };
    img.src = url;
  });
}

// ── Eliminar imagen de Firebase Storage desde download URL ─────────────

async function deleteOldImage(imageUrl: string) {
  try {
    await deleteProductImage(imageUrl);
  } catch {
    console.warn("No se pudo eliminar la imagen anterior de Storage");
  }
}

// ── Componente ─────────────────────────────────────────────────────────
export function EditProductDialog({
  product, open, onOpenChange, onSuccess, is_service,
}: Props) {
  const { updateProduct, isUpdating } = useUpdateProduct(product?.id ?? null);
  const { symbol }                    = useCurrency();

  const [imageFile,        setImageFile]        = useState<File | null>(null);
  const [imagePreview,     setImagePreview]      = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage]  = useState(false);
  const [isDragging,       setIsDragging]        = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register, handleSubmit, reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(createSchema(is_service)),
  });

  useEffect(() => {
    if (product && open) {
      reset({
        name:        product.name,
        description: product.description ?? "",
        sku:         product.sku ?? "",
        price:       product.price,
        service_cost: product.service_cost ?? 0,
      });
      setImagePreview(product.image_url ?? null);
      setImageFile(null);
    }
  }, [product, open, reset]);

  // ── Imagen ──────────────────────────────────────────────────────────

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imágenes"); return; }
    if (file.size > 5 * 1024 * 1024)    { toast.error("La imagen no puede superar 5MB"); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isLoading) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isLoading) return;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Solo se permiten imágenes"); return; }
    if (file.size > 5 * 1024 * 1024)    { toast.error("La imagen no puede superar 5MB"); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadImage = async (file: File): Promise<string> => {
    const webpBlob   = await convertToWebP(file);
    return uploadProductImage(webpBlob, "product");
  };

  // ── Submit ──────────────────────────────────────────────────────────

  const onSubmit = async (data: FormData) => {
    try {
      let image_url: string | null | undefined = product?.image_url;

      if (imageFile) {
        setIsUploadingImage(true);
        if (product?.image_url) await deleteOldImage(product.image_url);
        image_url = await uploadImage(imageFile);
        setIsUploadingImage(false);
      } else if (!imagePreview && product?.image_url) {
        // El usuario quitó la imagen sin subir una nueva
        await deleteOldImage(product.image_url);
        image_url = null;
      }

      await updateProduct({ ...data, image_url });
      toast.success(`${is_service ? "Servicio" : "Producto"} actualizado exitosamente`);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      setIsUploadingImage(false);
      toast.error(
        error.message || `Error al actualizar el ${is_service ? "servicio" : "producto"}`
      );
    }
  };

  const handleClose = () => {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    onOpenChange(false);
  };

  const isLoading = isUpdating || isUploadingImage;

  if (!product) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title={`Editar ${is_service ? "servicio" : "producto"}`}
      icon={Pencil}
      width="wide"
      as="form"
      formProps={{ id: "edit-product-form", onSubmit: handleSubmit(onSubmit) }}
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
            form="edit-product-form"
            disabled={isLoading}
            className="flex-1 h-11 gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {isUploadingImage ? "Subiendo imagen..." : "Guardando..."}
              </>
            ) : (
              <>
                <Pencil className="size-4" />
                Guardar cambios
              </>
            )}
          </Button>
        </>
      }
    >
            {/* Imagen */}
            <div className="space-y-2">
              <FieldLabel icon={<ImageIcon className="size-3.5" />} label="Imagen" optional />
              <div
                className={cn(
                  "relative w-full aspect-video rounded-xl border-2 border-dashed transition-colors overflow-hidden",
                  isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                  imagePreview
                    ? "border-transparent"
                    : "border-muted-foreground/20 hover:border-primary/40 bg-muted/20",
                  isDragging && !isLoading && "border-primary bg-primary/5",
                )}
                onClick={() => !isLoading && fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {imagePreview ? (
                  <>
                    <Image src={imagePreview} alt="Preview" fill className="object-cover" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveImage(); }}
                      className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-1.5 shadow hover:bg-background transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>
                    <span className="absolute bottom-2 right-2 text-xs bg-black/60 text-white px-2 py-0.5 rounded-full">
                      WebP
                    </span>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
                    <div className="size-10 rounded-xl bg-muted flex items-center justify-center">
                      <Upload className="size-5" />
                    </div>
                    <p className="text-sm font-medium">
                      {isDragging ? "Suelta la imagen aquí" : "Toca o arrastra una imagen"}
                    </p>
                    <p className="text-xs text-center opacity-70">
                      PNG, JPG, WebP · máx 5MB · se convierte a WebP
                    </p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
                disabled={isLoading}
              />
            </div>

            {/* Nombre */}
            <div className="space-y-2">
              <FieldLabel icon={<FileText className="size-3.5" />} label="Nombre" required />
              <Input
                {...register("name")}
                disabled={isLoading}
                className="h-11 text-base"
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* SKU */}
            <div className="space-y-2">
              <FieldLabel
                icon={<Hash className="size-3.5" />}
                label="SKU"
                required={!is_service}
                optional={is_service}
              />
              <Input
                {...register("sku")}
                placeholder={is_service ? "Ej: SERV-001 (opcional)" : "Ej: CAM-NEG-M"}
                disabled={isLoading}
                className="h-11 text-base font-mono"
              />
              {errors.sku && (
                <p className="text-xs text-destructive">{errors.sku.message}</p>
              )}
            </div>

            {/* Precio */}
            <div className="space-y-2">
              <FieldLabel
                icon={<DollarSign className="size-3.5" />}
                label="Precio de venta"
                required
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                  {symbol}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...register("price")}
                  disabled={isLoading}
                  className="h-11 pl-8 text-base"
                />
              </div>
              {errors.price && (
                <p className="text-xs text-destructive">{errors.price.message}</p>
              )}
            </div>

            {/* Costo del servicio: solo si ES servicio */}
            {is_service && (
              <div className="space-y-2">
                <FieldLabel icon={<DollarSign className="size-3.5" />} label="Costo del servicio" optional />
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                    {symbol}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...register("service_cost")}
                    disabled={isLoading}
                    className="h-11 pl-8 text-base"
                  />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Lo que te cuesta prestar este servicio (mano de obra, materiales, etc.).
                  No genera ningún movimiento financiero — solo se usa para calcular la
                  ganancia real de cada venta.
                </p>
                {errors.service_cost && (
                  <p className="text-xs text-destructive">{errors.service_cost.message}</p>
                )}
              </div>
            )}

            {/* Descripción */}
            <div className="space-y-2">
              <FieldLabel icon={<FileText className="size-3.5" />} label="Descripción" optional />
              <Textarea
                placeholder={
                  is_service
                    ? "Describe el servicio brevemente..."
                    : "Describe el producto brevemente..."
                }
                rows={2}
                {...register("description")}
                disabled={isLoading}
                className="resize-none text-base"
              />
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
