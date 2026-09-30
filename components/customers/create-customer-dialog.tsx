// components/customers/create-customer-dialog.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, UserPlus, History } from "lucide-react";
import { toast } from "sonner";
import { useCreateCustomer } from "@/hooks/swr/use-costumers";
import { useCurrency } from "@/hooks/swr/use-currency";

const schema = z.object({
  name:  z.string().min(1, "El nombre es requerido"),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
  total_orders: z.coerce.number().int("Debe ser un número entero").min(0, "Debe ser 0 o más").optional(),
  total_spent:  z.coerce.number().min(0, "Debe ser 0 o más").optional(),
});

type FormData = z.infer<typeof schema>;

type Props = {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess:    () => void;
};

export function CreateCustomerDialog({ open, onOpenChange, onSuccess }: Props) {
  const { createCustomer, isCreating } = useCreateCustomer();
  const { symbol } = useCurrency();

  const {
    register, handleSubmit, reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const onSubmit = async (data: FormData) => {
    try {
      await createCustomer({
        name:  data.name,
        phone: data.phone || undefined,
        email: data.email || undefined,
        notes: data.notes || undefined,
        total_orders: data.total_orders || undefined,
        total_spent:  data.total_spent  || undefined,
      });
      toast.success("Cliente creado exitosamente");
      handleClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al crear cliente");
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Nuevo cliente"
      icon={UserPlus}
      width="wide"
      as="form"
      formProps={{ id: "create-customer-form", onSubmit: handleSubmit(onSubmit) }}
      footer={
        <>
          <Button
            type="button" variant="outline"
            onClick={handleClose} disabled={isCreating}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            type="submit" form="create-customer-form"
            disabled={isCreating}
            className="flex-1 h-11 gap-2"
          >
            {isCreating
              ? <><Loader2 className="size-4 animate-spin" />Creando…</>
              : <><UserPlus className="size-4" />Crear cliente</>
            }
          </Button>
        </>
      }
    >
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Nombre <span className="text-destructive text-xs">*</span>
            </Label>
            <Input
              {...register("name")}
              disabled={isCreating}
              className="h-11 text-base"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          {/* Teléfono + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Teléfono{" "}
                <span className="text-xs text-muted-foreground font-normal">opcional</span>
              </Label>
              <Input
                placeholder="+504 9999-9999"
                {...register("phone")}
                disabled={isCreating}
                className="h-11 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Email{" "}
                <span className="text-xs text-muted-foreground font-normal">opcional</span>
              </Label>
              <Input
                type="email"
                placeholder="correo@email.com"
                {...register("email")}
                disabled={isCreating}
                className="h-11 text-base"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Notas{" "}
              <span className="text-xs text-muted-foreground font-normal">opcional</span>
            </Label>
            <Textarea
              placeholder="Observaciones del cliente..."
              rows={2}
              {...register("notes")}
              disabled={isCreating}
              className="resize-none text-base"
            />
          </div>

          {/* Historial previo — para clientes que ya compraban antes de usar el sistema */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <History className="size-3.5 text-muted-foreground" />
              <p className="text-sm font-medium">Historial previo</p>
              <span className="text-xs text-muted-foreground font-normal">opcional</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed -mt-1">
              Si este cliente ya te compraba antes de usar el sistema, indicá cuánto
              lleva acumulado — así su nivel de fidelización y sus estadísticas parten
              del histórico real, no de cero. Las ventas nuevas se suman a estos valores.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Órdenes previas</Label>
                <Input
                  type="number" step="1" min="0" placeholder="0"
                  {...register("total_orders")}
                  disabled={isCreating}
                  className="h-11 text-base"
                />
                {errors.total_orders && (
                  <p className="text-xs text-destructive">{errors.total_orders.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Total comprado</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                    {symbol}
                  </span>
                  <Input
                    type="number" step="0.01" min="0" placeholder="0.00"
                    {...register("total_spent")}
                    disabled={isCreating}
                    className="h-11 pl-8 text-base"
                  />
                </div>
                {errors.total_spent && (
                  <p className="text-xs text-destructive">{errors.total_spent.message}</p>
                )}
              </div>
            </div>
          </div>

    </ResponsiveModal>
  );
}