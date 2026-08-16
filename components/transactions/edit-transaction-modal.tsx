// components/transactions/edit-transaction-modal.tsx
"use client";

import { useReducer, useEffect } from "react";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { useUpdateTransaction, Transaction } from "@/hooks/swr/use-transactions";
import { localDateToISO, toLocalDateInput } from "@/lib/date-utils";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useTransactionCategories } from "@/hooks/swr/use-transaction-categories";

type TxType = "INCOME" | "EXPENSE" | "TRANSFER";

const TYPE_CONFIG: Record<TxType, { label: string; icon: React.ElementType }> = {
  INCOME:   { label: "Ingreso",        icon: ArrowDownCircle },
  EXPENSE:  { label: "Egreso",         icon: ArrowUpCircle   },
  TRANSFER: { label: "Transferencia",  icon: ArrowLeftRight  },
};

type FormState = {
  accountId:   string;
  toAccountId: string;
  amount:      string;
  category:    string;
  description: string;
  occurredAt:  string;
};

function txFromTransaction(t: Transaction): FormState {
  return {
    accountId:   String(t.account_id),
    toAccountId: String(t.to_account_id ?? ""),
    amount:      String(t.amount),
    category:    t.category ?? "",
    description: t.description ?? "",
    occurredAt:  toLocalDateInput(t.occurred_at),
  };
}

function formReducer(state: FormState, patch: Partial<FormState>): FormState {
  return { ...state, ...patch };
}

type Props = {
  open:          boolean;
  onOpenChange:  (v: boolean) => void;
  transaction:   Transaction;
  accounts:      { id: number; name: string; balance: number | null }[];
  onSuccess?:    () => void;
};

export function EditTransactionModal({
  open, onOpenChange, transaction, accounts, onSuccess,
}: Props) {
  const { updateTransaction, isUpdating } = useUpdateTransaction();
  const { format, symbol }                = useCurrency();

  // El tipo no es editable — solo se muestran los campos relevantes
  const type = transaction.type as TxType;

  const [form, dispatch] = useReducer(formReducer, txFromTransaction(transaction));
  const { accountId, toAccountId, amount, category, description, occurredAt } = form;

  // Sincronizar si cambia la transacción (ej: se abre con otra tx)
  useEffect(() => {
    dispatch(txFromTransaction(transaction));
  }, [transaction]);

  const { categories } = useTransactionCategories(type);
  const activeCategories = categories.filter((c) => c.is_active);

  const handleClose = () => onOpenChange(false);

  const onSubmit = async () => {
    if (!accountId) return toast.error("Selecciona una cuenta");
    if (!amount || Number(amount) <= 0) return toast.error("El monto debe ser mayor a 0");
    if (type === "TRANSFER" && !toAccountId) return toast.error("Selecciona cuenta destino");
    if (type === "TRANSFER" && accountId === toAccountId)
      return toast.error("Las cuentas deben ser diferentes");

    try {
      await updateTransaction(transaction.id, {
        amount:        Number(amount),
        account_id:    Number(accountId),
        to_account_id: type === "TRANSFER" ? Number(toAccountId) : undefined,
        category:      category    || undefined,
        description:   description || undefined,
        occurred_at:   localDateToISO(occurredAt),
      });

      toast.success("Transacción actualizada");
      onSuccess?.();
      handleClose();
    } catch (error: any) {
      toast.error(error.message || "Error al actualizar");
    }
  };

  const { icon: Icon, label: typeLabel } = TYPE_CONFIG[type];

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Editar transacción"
      width="wide"
      subtitle={
        <span className="flex items-center gap-1.5 mt-1">
          <Icon className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{typeLabel} · No se puede cambiar el tipo</span>
        </span>
      }
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isUpdating}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isUpdating}
            className="flex-1 h-11 gap-2"
          >
            {isUpdating
              ? <><Loader2 className="size-4 animate-spin" />Guardando…</>
              : "Guardar cambios"
            }
          </Button>
        </>
      }
    >
          {/* Cuenta origen */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              {type === "TRANSFER" ? "Cuenta origen" : "Cuenta"}{" "}
              <span className="text-destructive text-xs">*</span>
            </Label>
            <Select value={accountId} onValueChange={(v) => dispatch({ accountId: v })}>
              <SelectTrigger className="w-full h-11">
                <SelectValue placeholder="Selecciona una cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    <div className="flex items-center justify-between gap-4 w-full">
                      <span>{a.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(Number(a.balance))}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cuenta destino (solo TRANSFER) */}
          {type === "TRANSFER" && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Cuenta destino <span className="text-destructive text-xs">*</span>
              </Label>
              <Select value={toAccountId} onValueChange={(v) => dispatch({ toAccountId: v })}>
                <SelectTrigger className="w-full h-11">
                  <SelectValue placeholder="Selecciona cuenta destino" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => String(a.id) !== accountId)
                    .map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Monto */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Monto ({symbol}) <span className="text-destructive text-xs">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                {symbol}
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => dispatch({ amount: e.target.value })}
                className="h-11 pl-8 text-base"
              />
            </div>
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Fecha <span className="text-destructive text-xs">*</span>
            </Label>
            <Input
              type="date"
              value={occurredAt}
              onChange={(e) => dispatch({ occurredAt: e.target.value })}
              className="h-11 text-base"
            />
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Categoría{" "}
              <span className="text-xs text-muted-foreground font-normal">opcional</span>
            </Label>
            <Select value={category} onValueChange={(v) => dispatch({ category: v })}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">Sin categoría</SelectItem>
                {activeCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Descripción{" "}
              <span className="text-xs text-muted-foreground font-normal">opcional</span>
            </Label>
            <Textarea
              placeholder="Detalle de la transacción..."
              rows={2}
              value={description}
              onChange={(e) => dispatch({ description: e.target.value })}
              className="resize-none text-base"
            />
          </div>
    </ResponsiveModal>
  );
}