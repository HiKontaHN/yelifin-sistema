// components/events/add-expense-dialog.tsx
"use client";

import { useState } from "react";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Receipt } from "lucide-react";
import { localDateToISO, toLocalDateInput } from "@/lib/date-utils";
import { toast } from "sonner";
import { Event } from "@/hooks/swr/use-events";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useAuth } from "@/hooks/use-auth";

const EXPENSE_CATEGORIES = [
  "Stand / Espacio",
  "Transporte",
  "Electricidad",
  "Alimentación",
  "Personal",
  "Decoración",
  "Marketing",
  "Otro",
];

type Props = {
  event:        Event | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess:    () => void;
};

export function AddExpenseDialog({ event, open, onOpenChange, onSuccess }: Props) {
  const { firebaseUser } = useAuth();
  const { accounts }     = useAccounts();
  const { symbol }       = useCurrency();

  const [accountId,   setAccountId]   = useState("");
  const [amount,      setAmount]      = useState("");
  const [category,    setCategory]    = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt,  setOccurredAt]  = useState(toLocalDateInput(new Date()));
  const [isLoading,   setIsLoading]   = useState(false);

  const resetForm = () => {
    setAccountId(""); setAmount(""); setCategory("");
    setDescription(""); setOccurredAt(toLocalDateInput(new Date()));
  };

  const handleClose = () => { resetForm(); onOpenChange(false); };

  const handleSubmit = async () => {
    if (!event)                         return toast.error("Evento no definido");
    if (!accountId)                     return toast.error("Selecciona una cuenta");
    if (!amount || Number(amount) <= 0) return toast.error("El monto debe ser mayor a 0");

    setIsLoading(true);
    try {
      const token = await firebaseUser!.getIdToken();
      const res   = await fetch("/api/transactions", {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type:           "EXPENSE",
          account_id:     Number(accountId),
          amount:         Number(amount),
          category:       category    || undefined,
          description:    description || undefined,
          reference_type: "EVENT",
          reference_id:   event.id,
          occurred_at:    localDateToISO(occurredAt),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al registrar gasto");
      }
      toast.success("Gasto registrado exitosamente");
      handleClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al registrar gasto");
    } finally {
      setIsLoading(false);
    }
  };

  if (!event) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Agregar gasto"
      icon={Receipt}
      iconClassName="text-destructive"
      subtitle={event.name}
      footer={
        <>
          <Button
            type="button" variant="outline"
            onClick={handleClose} disabled={isLoading}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            type="button" variant="destructive"
            onClick={handleSubmit} disabled={isLoading}
            className="flex-1 h-11 gap-2"
          >
            {isLoading
              ? <><Loader2 className="size-4 animate-spin" />Registrando…</>
              : <><Receipt className="size-4" />Registrar gasto</>
            }
          </Button>
        </>
      }
    >
          {/* Cuenta */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Cuenta <span className="text-destructive text-xs">*</span>
            </Label>
            <Select value={accountId} onValueChange={setAccountId} disabled={isLoading}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Selecciona una cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Monto */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Monto <span className="text-destructive text-xs">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                {symbol}
              </span>
              <Input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                disabled={isLoading}
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
              onChange={(e) => setOccurredAt(e.target.value)}
              disabled={isLoading}
              className="h-11 text-base"
            />
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Categoría{" "}
              <span className="text-xs text-muted-foreground font-normal">opcional</span>
            </Label>
            <Select value={category} onValueChange={setCategory} disabled={isLoading}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Selecciona una categoría" />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
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
              placeholder="Detalle del gasto..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              className="resize-none text-base"
            />
          </div>
    </ResponsiveModal>
  );
}