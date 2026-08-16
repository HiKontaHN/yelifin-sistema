// components/transactions/create-transaction-modal.tsx
"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  CreditCard,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreateTransaction } from "@/hooks/swr/use-transactions";
import { localDateToISO, toLocalDateInput } from "@/lib/date-utils";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useTransactionCategories } from "@/hooks/swr/use-transaction-categories";
import { CreditCard as CreditCardType } from "@/hooks/swr/use-credit-cards";

type TxType = "INCOME" | "EXPENSE" | "TRANSFER";

const TYPE_CONFIG: Record<TxType, { label: string; icon: React.ElementType }> = {
  INCOME: { label: "Ingreso", icon: ArrowDownCircle },
  EXPENSE: { label: "Egreso", icon: ArrowUpCircle },
  TRANSFER: { label: "Transferencia", icon: ArrowLeftRight },
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: { id: number; name: string; balance: number | null }[];
  creditCards?: CreditCardType[];
  onSuccess?: () => void;
  defaultType?: TxType;
};

export function CreateTransactionModal({
  open,
  onOpenChange,
  accounts,
  creditCards = [],
  onSuccess,
  defaultType = "EXPENSE",
}: Props) {
  const { createTransaction, isCreating } = useCreateTransaction();
  const { format, symbol, currency: nativeCurrency } = useCurrency();
  const { mutate } = useSWRConfig();

  const [type, setType] = useState<TxType>(defaultType);
  const [sourceMode, setSourceMode] = useState<"account" | "credit_card">("account");
  const [accountId, setAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");
  const [ccCurrency, setCcCurrency] = useState(nativeCurrency);
  const [ccExchangeRate, setCcExchangeRate] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    toLocalDateInput(new Date()),
  );

  const showCreditCardOption = type === "EXPENSE" && creditCards.length > 0;
  const isCreditCardMode = showCreditCardOption && sourceMode === "credit_card";
  const isCcUsd = isCreditCardMode && ccCurrency === "USD";

  // Obtener categorías dinámicas filtradas por tipo
  const { categories } = useTransactionCategories(type);
  const activeCategories = categories.filter((c) => c.is_active);

  const resetForm = () => {
    setType(defaultType);
    setSourceMode("account");
    setAccountId("");
    setCreditCardId("");
    setCcCurrency(nativeCurrency);
    setCcExchangeRate("");
    setToAccountId("");
    setAmount("");
    setCategory("");
    setDescription("");
    setOccurredAt(toLocalDateInput(new Date()));
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const mutateAll = () =>
    mutate(
      (key) =>
        typeof key === "string" &&
        (key.startsWith("/api/transactions") ||
          key.startsWith("/api/accounts") ||
          key.startsWith("/api/finances")),
      undefined,
      { revalidate: true },
    );

  const onSubmit = async () => {
    if (!amount || Number(amount) <= 0)
      return toast.error("El monto debe ser mayor a 0");

    if (isCreditCardMode) {
      if (!creditCardId) return toast.error("Selecciona una tarjeta de crédito");
      if (isCcUsd && (!ccExchangeRate || Number(ccExchangeRate) <= 0))
        return toast.error("Ingresa la tasa de cambio para cargos en USD");
    } else {
      if (!accountId) return toast.error("Selecciona una cuenta");
      if (type === "TRANSFER" && !toAccountId)
        return toast.error("Selecciona cuenta destino");
      if (type === "TRANSFER" && accountId === toAccountId)
        return toast.error("Las cuentas deben ser diferentes");
    }

    try {
      await createTransaction({
        type,
        account_id: isCreditCardMode ? undefined : Number(accountId),
        to_account_id: type === "TRANSFER" ? Number(toAccountId) : undefined,
        credit_card_id: isCreditCardMode ? Number(creditCardId) : undefined,
        currency: isCreditCardMode ? ccCurrency : undefined,
        exchange_rate: isCcUsd ? Number(ccExchangeRate) : undefined,
        amount: Number(amount),
        category: category || undefined,
        description: description || undefined,
        occurred_at: localDateToISO(occurredAt),
      } as any);

      toast.success("Transacción registrada exitosamente");
      mutateAll();
      handleClose();
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Error al registrar");
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Nueva transacción"
      width="wide"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isCreating}
            className="flex-1 h-11"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isCreating}
            className="flex-1 h-11 gap-2"
          >
            {isCreating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Registrar"
            )}
          </Button>
        </>
      }
    >
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo</Label>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border">
              {(["INCOME", "EXPENSE", "TRANSFER"] as const).map((t) => {
                const { label, icon: Icon } = TYPE_CONFIG[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
                      type === t
                        ? "rounded-xl bg-primary/15 text-primary"
                        : "text-muted-foreground hover:rounded-xl hover:bg-primary/15 hover:text-primary",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid-gap-4 flex flex-col ">
            {/* Toggle cuenta / tarjeta (solo para EXPENSE) */}
            {showCreditCardOption && (
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border mb-4">
                <button
                  type="button"
                  onClick={() => setSourceMode("account")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all duration-200 cursor-pointer",
                    sourceMode === "account"
                      ? "rounded-xl bg-primary/15 text-primary"
                      : "text-muted-foreground hover:rounded-xl hover:bg-primary/15 hover:text-primary"
                  )}
                >
                  <Wallet className="size-3" /> Cuenta
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode("credit_card")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all duration-200 cursor-pointer",
                    sourceMode === "credit_card"
                      ? "rounded-xl bg-primary/15 text-primary"
                      : "text-muted-foreground hover:rounded-xl hover:bg-primary/15 hover:text-primary"
                  )}
                >
                  <CreditCard className="size-3" /> Tarjeta
                </button>
              </div>
            )}

            {/* Selector de cuenta */}
            {!isCreditCardMode && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {type === "TRANSFER" ? "Cuenta origen" : "Cuenta"}{" "}
                <span className="text-destructive text-xs">*</span>
              </Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="w-full h-11 text-left">
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
            )}

            {/* Selector de tarjeta de crédito */}
            {isCreditCardMode && (
              <div className="space-y-3">
                <div className="space-y-1.5 mb-4">
                  <Label className="text-sm font-medium">
                    Tarjeta de crédito <span className="text-destructive text-xs">*</span>
                  </Label>
                  <Select value={creditCardId} onValueChange={setCreditCardId}>
                    <SelectTrigger className="w-full h-11 text-left">
                      <SelectValue placeholder="Selecciona una tarjeta" />
                    </SelectTrigger>
                    <SelectContent>
                      {creditCards.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}{c.last_four ? ` ···· ${c.last_four}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Moneda del cargo</Label>
                  <Select value={ccCurrency} onValueChange={setCcCurrency}>
                    <SelectTrigger className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={nativeCurrency}>{nativeCurrency} — Moneda local</SelectItem>
                      <SelectItem value="USD">USD — Dólares</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isCcUsd && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">
                      1 USD = cuántos {symbol} <span className="text-destructive text-xs">*</span>
                    </Label>
                    <Input
                      type="number" step="0.0001" min="0" placeholder="Ej: 24.89"
                      value={ccExchangeRate}
                      onChange={(e) => setCcExchangeRate(e.target.value)}
                      className="h-11 text-base"
                    />
                    {Number(amount) > 0 && Number(ccExchangeRate) > 0 && (
                      <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-3 py-2">
                        <span className="text-xs text-muted-foreground">Equivalente en {symbol}:</span>
                        <span className="text-xs font-semibold">
                          {format(Number(amount) * Number(ccExchangeRate))}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {type === "TRANSFER" && (
              <div className="space-y-1.5 sm:mt-3 mt-4">
                <Label className="text-sm font-medium">
                  Cuenta destino{" "}
                  <span className="text-destructive text-xs">*</span>
                </Label>
                <Select value={toAccountId} onValueChange={setToAccountId}>
                  <SelectTrigger className="w-full h-11 text-left sm:mt-2">
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
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Monto ({isCcUsd ? "USD" : symbol}){" "}
              <span className="text-destructive text-xs">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                {isCcUsd ? "$" : symbol}
              </span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 pl-8 text-base"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Fecha <span className="text-destructive text-xs">*</span>
            </Label>
            <Input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="h-11 text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Categoría{" "}
              <span className="text-xs text-muted-foreground font-normal">
                opcional
              </span>
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                {activeCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Descripción{" "}
              <span className="text-xs text-muted-foreground font-normal">
                opcional
              </span>
            </Label>
            <Textarea
              placeholder="Detalle de la transacción..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="resize-none text-base"
            />
          </div>
    </ResponsiveModal>
  );
}