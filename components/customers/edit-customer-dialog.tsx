// components/customers/edit-customer-dialog.tsx
"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil, History } from "lucide-react";
import { toast } from "sonner";
import { useUpdateCustomer, Customer } from "@/hooks/swr/use-costumers";
import { useCurrency } from "@/hooks/swr/use-currency";

const schema = z.object({
  name:  z.string().min(1, "El nombre es requerido"),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
  total_orders: z.coerce.number().int("Debe ser un número entero").min(0, "Debe ser 0 o más"),
  total_spent:  z.coerce.number().min(0, "Debe ser 0 o más"),
});

type FormData = z.infer<typeof schema>;

type Props = {
  customer:     Customer | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess:    () => void;
};

export function EditCustomerDialog({ customer, open, onOpenChange, onSuccess }: Props) {
  const { updateCustomer, isUpdating } = useUpdateCustomer();
  const { symbol } = useCurrency();

  const {
    register, handleSubmit, reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (customer && open) {
      reset({
        name:  customer.name,
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        notes: customer.notes ?? "",
        total_orders: customer.total_orders,
        total_spent:  customer.total_spent,
      });
    }
  }, [customer, open, reset]);

  const handleClose = () => onOpenChange(false);

  const onSubmit = async (data: FormData) => {
    if (!customer) return;
    try {
      await updateCustomer(customer.id, {
        name:  data.name,
        phone: data.phone || undefined,
        email: data.email || undefined,
        notes: data.notes || undefined,
        total_orders: data.total_orders,
        total_spent:  data.total_spent,
      });
      toast.success("Cliente actualizado exitosamente");
      handleClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar cliente");
    }
  };

  if (!customer) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Editar cliente"
      icon={Pencil}
      subtitle={customer.name}
      width="wide"
      as="form"
      formProps={{ id: "edit-customer-form", onSubmit: handleSubmit(onSubmit) }}
      footer={
        <>
          <Button
            type="button" variant="outline"
            onClick={handleClose} disabled={isUpdating}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            type="submit" form="edit-customer-form"
            disabled={isUpdating}
            className="flex-1 h-11 gap-2"
          >
            {isUpdating
              ? <><Loader2 className="size-4 animate-spin" />Guardando…</>
              : <><Pencil className="size-4" />Guardar cambios</>
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
              disabled={isUpdating}
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
                disabled={isUpdating}
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
                disabled={isUpdating}
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
              disabled={isUpdating}
              className="resize-none text-base"
            />
          </div>

          {/* Órdenes y total gastado — contador acumulado, no un histórico
              separado: al guardar se sobreescribe y las ventas nuevas
              se siguen sumando desde el valor que quede aquí. */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <History className="size-3.5 text-muted-foreground" />
              <p className="text-sm font-medium">Órdenes y total gastado</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed -mt-1">
              Ajustá estos totales si necesitás corregirlos. Las ventas nuevas se
              siguen sumando desde el valor que dejes aquí.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Órdenes</Label>
                <Input
                  type="number" step="1" min="0"
                  {...register("total_orders")}
                  disabled={isUpdating}
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
                    type="number" step="0.01" min="0"
                    {...register("total_spent")}
                    disabled={isUpdating}
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