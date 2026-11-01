// components/customers/delete-customer-dialog.tsx
"use client";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSWRConfig } from "swr";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDeleteCustomer, Customer } from "@/hooks/swr/use-costumers";

type Props = {
  customer: Customer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function DeleteCustomerDialog({ customer, open, onOpenChange, onSuccess }: Props) {
  const { deleteCustomer, isDeleting } = useDeleteCustomer();
  const { mutate: mutateCache } = useSWRConfig();

  const handleDelete = async () => {
    if (!customer) return;
    try {
      await deleteCustomer(customer.id);
      toast.success("Cliente eliminado correctamente");
      await mutateCache((key) => typeof key === "string" && (key.startsWith("/api/people") || key.startsWith("/api/customers")), undefined, { revalidate: true });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar cliente");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de eliminar a{" "}
            <span className="font-medium text-foreground">{customer?.name}</span>.
            El historial de ventas asociado se mantendrá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive hover:bg-destructive/90"
          >
            {isDeleting ? <><Loader2 className="mr-2 size-4 animate-spin" />Eliminando…</> : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
