// components/credit-cards/edit-cc-transaction-dialog.tsx
"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
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
import { CreditCardTransaction, useUpdateCCTransaction } from "@/hooks/swr/use-credit-cards";
import { localDateToISO, toLocalDateInput } from "@/lib/date-utils";
import { TransactionCategory } from "@/hooks/swr/use-transaction-categories";
import { useCurrency } from "@/hooks/swr/use-currency";

const schema = z.object({
  description:   z.string().optional(),
  category:      z.string().optional(),
  occurred_at:   z.string().min(1, "La fecha es requerida"),
  amount:        z.coerce.number().min(0.01, "El monto debe ser mayor a 0"),
  currency:      z.string().min(1, "La moneda es requerida"),
  exchange_rate: z.coerce.number().optional(),
}).refine((d) => {
  if (d.currency === "USD" && (!d.exchange_rate || d.exchange_rate <= 0)) return false;
  return true;
}, { message: "La tasa de cambio es requerida para cargos en USD", path: ["exchange_rate"] });

type FormData = z.infer<typeof schema>;


type Props = {
  txn:                CreditCardTransaction | null;
  open:               boolean;
  onOpenChange:       (v: boolean) => void;
  onSuccess:          () => void;
  nativeCurrency:     string;
  expenseCategories:  TransactionCategory[];
};

export function EditCCTransactionDialog({
  txn,
  open,
  onOpenChange,
  onSuccess,
  nativeCurrency,
  expenseCategories,
}: Props) {
  const { updateTransaction, isUpdating } = useUpdateCCTransaction();
  const { symbol } = useCurrency();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const selectedCurrency = watch("currency");
  const watchAmount      = watch("amount");
  const watchRate        = watch("exchange_rate");
  const isUsd            = selectedCurrency === "USD";
  const localEquivalent  = isUsd && watchAmount && watchRate ? Number(watchAmount) * Number(watchRate) : null;
  const isSubmittingOrUpdating = isSubmitting || isUpdating;

  useEffect(() => {
    if (txn && open) {
      reset({
        description:   txn.description ?? "",
        category:      txn.category ?? "",
        occurred_at:   toLocalDateInput(txn.occurred_at),
        amount:        Number(txn.amount),
        currency:      txn.currency,
        exchange_rate: txn.exchange_rate ? Number(txn.exchange_rate) : undefined,
      });
    }
  }, [txn, open, reset]);

  const handleClose = () => onOpenChange(false);

  const onSubmit = async (data: FormData) => {
    if (!txn) return;
    try {
      await updateTransaction(txn.id, {
        description:   data.description || undefined,
        category:      data.category || null,
        occurred_at:   localDateToISO(data.occurred_at),
        amount:        data.amount,
        currency:      data.currency,
        exchange_rate: data.currency === "USD" ? data.exchange_rate : undefined,
      });
      toast.success("Cargo actualizado");
      handleClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar cargo");
    }
  };

  if (!txn) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Editar cargo"
      icon={Pencil}
      subtitle={txn.description || "Compra"}
      width="wide"
      as="form"
      formProps={{ id: "edit-cc-txn-form", onSubmit: handleSubmit(onSubmit) }}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmittingOrUpdating}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="edit-cc-txn-form"
            disabled={isSubmittingOrUpdating}
            className="flex-1 h-11 gap-2"
          >
            {isSubmittingOrUpdating
              ? <><Loader2 className="size-4 animate-spin" />Guardando…</>
              : <><Pencil className="size-4" />Guardar cambios</>
            }
          </Button>
        </>
      }
    >
          {/* Descripcion */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Descripcion{" "}
              <span className="text-xs text-muted-foreground font-normal">opcional</span>
            </Label>
            <Input
              placeholder="Ej. Supermercado, gasolina..."
              {...register("description")}
              disabled={isSubmittingOrUpdating}
              className="h-11 text-base"
            />
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Fecha <span className="text-destructive text-xs">*</span>
            </Label>
            <Input
              type="date"
              {...register("occurred_at")}
              disabled={isSubmittingOrUpdating}
              className="h-11 text-base"
            />
            {errors.occurred_at && (
              <p className="text-xs text-destructive">{errors.occurred_at.message}</p>
            )}
          </div>

          {/* Moneda */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Moneda <span className="text-destructive text-xs">*</span>
            </Label>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isSubmittingOrUpdating}
                >
                  <SelectTrigger className="h-11 w-full text-base">
                    <SelectValue placeholder="Seleccionar moneda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={nativeCurrency}>{nativeCurrency}</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.currency && (
              <p className="text-xs text-destructive">{errors.currency.message}</p>
            )}
          </div>

          {/* Monto */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Monto <span className="text-destructive text-xs">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                {isUsd ? "$" : symbol}
              </span>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                {...register("amount")}
                disabled={isSubmittingOrUpdating}
                className="h-11 pl-12 text-base"
              />
            </div>
            {errors.amount && (
              <p className="text-xs text-destructive">{errors.amount.message}</p>
            )}
          </div>

          {/* Tasa de cambio (solo USD) */}
          {isUsd && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                1 USD = cuántos {symbol} <span className="text-destructive text-xs">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                  {nativeCurrency}
                </span>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  placeholder="25.00"
                  {...register("exchange_rate")}
                  disabled={isSubmittingOrUpdating}
                  className="h-11 pl-12 text-base"
                />
              </div>
              {errors.exchange_rate && (
                <p className="text-xs text-destructive">{errors.exchange_rate.message}</p>
              )}
              {localEquivalent && localEquivalent > 0 && (
                <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground">Equivalente en {symbol}:</span>
                  <span className="text-xs font-semibold">
                    {new Intl.NumberFormat("es-HN", { style: "currency", currency: nativeCurrency, minimumFractionDigits: 2 }).format(localEquivalent)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Categoria */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Categoria{" "}
              <span className="text-xs text-muted-foreground font-normal">opcional</span>
            </Label>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select
                  value={field.value ?? "__none__"}
                  onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                  disabled={isSubmittingOrUpdating}
                >
                  <SelectTrigger className="h-11 w-full text-base">
                    <SelectValue placeholder="Sin categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin categoria</SelectItem>
                    {expenseCategories.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
    </ResponsiveModal>
  );
}
