// components/supplies/delete-supply-dialog.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Supply, useDeleteSupply } from "@/hooks/swr/use-supplies";

export function DeleteSupplyDialog({
  supply,
  open,
  onOpenChange,
  onSuccess,
}: {
  supply: Supply | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { deleteSupply, isDeleting } = useDeleteSupply(supply?.id ?? null);

  const handleDelete = async () => {
    try {
      await deleteSupply();
      toast.success("Suministro eliminado");
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || "Error al eliminar");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Eliminar suministro</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          ¿Seguro que querés eliminar <span className="font-medium text-foreground">{supply?.name}</span>?
          Se conservará su historial de uso.
        </p>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Eliminando…
              </>
            ) : (
              "Eliminar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
