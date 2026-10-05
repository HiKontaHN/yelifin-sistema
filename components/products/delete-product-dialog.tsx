// components/products/delete-product-dialog.tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDeleteProduct } from "@/hooks/swr/use-products";
import { deleteProductImage } from "@/lib/product-image";
import { Product } from "@/types";

type Props = {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function DeleteProductDialog({ product, open, onOpenChange, onSuccess }: Props) {
  const { deleteProduct, isDeleting } = useDeleteProduct();

  const handleDelete = async () => {
  try {
    if (product?.image_url) {
      try {
        await deleteProductImage(product.image_url);
      } catch {
        console.warn("No se pudo eliminar la imagen");
      }
    }

    console.log("Eliminando producto:", product?.id); // ← agrega esto
    await deleteProduct(product!.id);
    console.log("Producto eliminado"); // ← y esto

    toast.success("Producto eliminado correctamente");
    onOpenChange(false);
    onSuccess();

  } catch (error: any) {
    console.error("Error al eliminar:", error); // ← y esto
    toast.error(error.message || "Error al eliminar el producto");
  }
};

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de eliminar{" "}
            <span className="font-medium text-foreground">{product?.name}</span>.
            Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isDeleting ? (
              <><Loader2 className="mr-2 size-4 animate-spin" />Eliminando…</>
            ) : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
