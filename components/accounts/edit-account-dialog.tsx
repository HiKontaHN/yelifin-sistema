// components/accounts/edit-account-dialog.tsx
"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useUpdateAccount, Account } from "@/hooks/swr/use-accounts";

const schema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  type: z.enum(["CASH", "BANK", "WALLET", "OTHER"]),
});

type FormData = z.infer<typeof schema>;

const ACCOUNT_TYPES: { value: FormData["type"]; label: string }[] = [
  { value: "CASH",   label: "Efectivo" },
  { value: "BANK",   label: "Banco" },
  { value: "WALLET", label: "Billetera digital" },
  { value: "OTHER",  label: "Otro" },
];

type Props = {
  account:      Account | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess:    () => void;
};

export function EditAccountDialog({ account, open, onOpenChange, onSuccess }: Props) {
  const { updateAccount, isUpdating } = useUpdateAccount();

  const {
    register, handleSubmit, reset, setValue, watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (account && open) {
      reset({ name: account.name, type: account.type });
    }
  }, [account, open, reset]);

  const handleClose = () => onOpenChange(false);

  const onSubmit = async (data: FormData) => {
    if (!account) return;
    try {
      await updateAccount(account.id, data);
      toast.success("Cuenta actualizada exitosamente");
      handleClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar cuenta");
    }
  };

  if (!account) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Editar cuenta"
      icon={Pencil}
      subtitle={account.name}
      width="wide"
      as="form"
      formProps={{ id: "edit-account-form", onSubmit: handleSubmit(onSubmit) }}
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
            type="submit" form="edit-account-form"
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

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Tipo <span className="text-destructive text-xs">*</span>
            </Label>
            <Select
              value={watch("type")}
              onValueChange={(v) => setValue("type", v as FormData["type"])}
              disabled={isUpdating}
            >
              <SelectTrigger className="w-full h-11 text-left">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

    </ResponsiveModal>
  );
}
