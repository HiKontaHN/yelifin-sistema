// components/events/edit-event-dialog.tsx
"use client";

import { useEffect } from "react";
import { toLocalDateInput } from "@/lib/date-utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useUpdateEvent, Event } from "@/hooks/swr/use-events";
import { useCurrency } from "@/hooks/swr/use-currency";

const schema = z.object({
  name:       z.string().min(1, "El nombre es requerido"),
  location:   z.string().optional(),
  starts_at:  z.string().min(1, "La fecha inicio es requerida"),
  ends_at:    z.string().min(1, "La fecha fin es requerida"),
  fixed_cost: z.coerce.number().min(0).default(0),
  notes:      z.string().optional(),
}).refine((d) => new Date(d.starts_at) <= new Date(d.ends_at), {
  message: "La fecha inicio debe ser antes o igual que la fecha fin",
  path:    ["ends_at"],
});

type FormData = z.infer<typeof schema>;

// Convert ISO → "YYYY-MM-DD" for date input

type Props = {
  event:        Event | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess:    () => void;
};

export function EditEventDialog({ event, open, onOpenChange, onSuccess }: Props) {
  const { updateEvent }  = useUpdateEvent();
  const { symbol }       = useCurrency();

  const {
    register, handleSubmit, reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (event && open) {
      reset({
        name:       event.name,
        location:   event.location ?? "",
        starts_at:  toLocalDateInput(event.start_date ?? event.starts_at),
        ends_at:    toLocalDateInput(event.end_date ?? event.ends_at),
        fixed_cost: event.fixed_cost,
        notes:      event.notes ?? "",
      });
    }
  }, [event, open, reset]);

  const handleClose = () => onOpenChange(false);

  const onSubmit = async (data: FormData) => {
    if (!event) return;
    try {
      await updateEvent(event.id, {
        name:       data.name,
        location:   data.location   || undefined,
        start_date: data.starts_at,
        end_date:   data.ends_at,
        starts_at:  data.starts_at,
        ends_at:    data.ends_at,
        fixed_cost: data.fixed_cost || 0,
        notes:      data.notes      || undefined,
      });
      toast.success("Evento actualizado exitosamente");
      handleClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar evento");
    }
  };

  if (!event) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Editar evento"
      icon={Pencil}
      subtitle={event.name}
      width="wide"
      as="form"
      formProps={{ id: "edit-event-form", onSubmit: handleSubmit(onSubmit) }}
      footer={
        <>
          <Button
            type="button" variant="outline"
            onClick={handleClose} disabled={isSubmitting}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            type="submit" form="edit-event-form"
            disabled={isSubmitting}
            className="flex-1 h-11 gap-2"
          >
            {isSubmitting
              ? <><Loader2 className="size-4 animate-spin" />Guardando…</>
              : <><Pencil className="size-4" />Guardar cambios</>
            }
          </Button>
        </>
      }
    >
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Nombre <span className="text-destructive text-xs">*</span>
            </Label>
            <Input {...register("name")} disabled={isSubmitting} className="h-11 text-base" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Ubicación{" "}
              <span className="text-xs text-muted-foreground font-normal">opcional</span>
            </Label>
            <Input
              placeholder="Centro de Convenciones..."
              {...register("location")}
              disabled={isSubmitting}
              className="h-11 text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Inicio <span className="text-destructive text-xs">*</span>
              </Label>
              <Input type="date" {...register("starts_at")} disabled={isSubmitting} className="h-11 text-base" />
              {errors.starts_at && <p className="text-xs text-destructive">{errors.starts_at.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Fin <span className="text-destructive text-xs">*</span>
              </Label>
              <Input type="date" {...register("ends_at")} disabled={isSubmitting} className="h-11 text-base" />
              {errors.ends_at && <p className="text-xs text-destructive">{errors.ends_at.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Costos fijos ({symbol}){" "}
              <span className="text-xs text-muted-foreground font-normal">opcional</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                {symbol}
              </span>
              <Input
                type="number" step="0.01" min="0" placeholder="0.00"
                {...register("fixed_cost")}
                disabled={isSubmitting}
                className="h-11 pl-8 text-base"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Notas{" "}
              <span className="text-xs text-muted-foreground font-normal">opcional</span>
            </Label>
            <Textarea
              placeholder="Detalles del evento..."
              rows={2}
              {...register("notes")}
              disabled={isSubmitting}
              className="resize-none text-base"
            />
          </div>
    </ResponsiveModal>
  );
}
