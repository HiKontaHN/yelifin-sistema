// components/credit-cards/pay-credit-card-dialog.tsx
"use client";

import { useEffect, useState } from "react";
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
import { Loader2, Banknote } from "lucide-react";
import { toast } from "sonner";
import { usePayCreditCard, CreditCard } from "@/hooks/swr/use-credit-cards";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useSuggestedExchangeRate } from "@/hooks/swr/use-exchange-rate";
import { SuggestedRateHint } from "@/components/shared/suggested-rate-hint";
import { Account } from "@/hooks/swr/use-accounts";
import { useTransactionCategories } from "@/hooks/swr/use-transaction-categories";

const schema = z.object({
  account_id:    z.coerce.number().min(1, "Selecciona una cuenta"),
  currency:      z.string().min(1, "Selecciona la moneda"),
  amount:        z.coerce.number().positive("El monto debe ser mayor a 0"),
  exchange_rate: z.coerce.number().positive().optional(),
  occurred_at:   z.string().min(1, "La fecha es requerida"),
  category:      z.string().optional(),
  description:   z.string().optional(),
});

type FormData = z.infer<typeof schema>;

type Props = {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  card:         CreditCard | null;
  // Sin `card` (ej. desde el FAB del listado): se elige la tarjeta acá.
  cards?:       CreditCard[];
  accounts:     Account[];
  onSuccess:    () => void;
};

export function PayCreditCardDialog({ open, onOpenChange, card: cardProp, cards = [], accounts, onSuccess }: Props) {
  const { payCreditCard, isPaying } = usePayCreditCard();
  const { currency: nativeCurrency, symbol, format } = useCurrency();
  const { categories } = useTransactionCategories("EXPENSE");
  const [selectedCurrency, setSelectedCurrency] = useState<string>(nativeCurrency);
  const [pickedCardId, setPickedCardId] = useState("");
  const card = cardProp ?? cards.find((c) => String(c.id) === pickedCardId) ?? null;

  const todayLocal = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currency: nativeCurrency, occurred_at: todayLocal },
  });

  const watchCurrency = watch("currency", nativeCurrency);
  const watchAmount = watch("amount", 0);
  const watchRate = watch("exchange_rate", 0);
  const isUsd = watchCurrency === "USD";
  const localEquivalent = isUsd && watchAmount && watchRate ? watchAmount * watchRate : null;

  // Al pasar a USD, precargar la tasa del BCH (editable) si está vacía.
  const { rate: suggestedRate } = useSuggestedExchangeRate();
  useEffect(() => {
    if (isUsd && suggestedRate && nativeCurrency === "HNL" && !watchRate) {
      setValue("exchange_rate", suggestedRate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUsd, suggestedRate, nativeCurrency]);

  const handleClose = () => {
    reset({ currency: nativeCurrency, occurred_at: todayLocal });
    setSelectedCurrency(nativeCurrency);
    setPickedCardId("");
    onOpenChange(false);
  };

  const onSubmit = async (data: FormData) => {
    if (!card) {
      toast.error("Selecciona una tarjeta");
      return;
    }
    if (isUsd && (!data.exchange_rate || data.exchange_rate <= 0)) {
      toast.error("La tasa de cambio es requerida para pagos en USD");
      return;
    }
    try {
      await payCreditCard(card.id, {
        account_id:    data.account_id,
        amount:        data.amount,
        currency:      data.currency,
        exchange_rate: isUsd ? data.exchange_rate : undefined,
        occurred_at:   new Date(`${data.occurred_at}T12:00:00`).toISOString(),
        category:      data.category?.trim() || undefined,
        description:   data.description?.trim() || undefined,
      });
      toast.success("Pago registrado exitosamente");
      handleClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || "Error al registrar pago");
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(v) => !v && handleClose()}
      title="Pagar tarjeta"
      icon={Banknote}
      subtitle={card && `${card.name}${card.last_four ? ` ···· ${card.last_four}` : ""}`}
      width="wide"
      as="form"
      formProps={{ id: "pay-cc-form", onSubmit: handleSubmit(onSubmit) }}
      topContent={card && (
        <div className="shrink-0 px-5 pt-4 pb-0">
          <div className="bg-muted/50 rounded-xl p-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Deuda {nativeCurrency}</p>
              <p className="font-bold text-destructive">{format(Number(card.balance))}</p>
            </div>
            {Number(card.balance_usd) > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Deuda USD</p>
                <p className="font-bold text-destructive">
                  {new Intl.NumberFormat("es-HN", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(card.balance_usd))}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isPaying} className="flex-1 h-11">
            Cancelar
          </Button>
          <Button type="submit" form="pay-cc-form" disabled={isPaying} className="flex-1 h-11 gap-2">
            {isPaying
              ? <><Loader2 className="size-4 animate-spin" />Registrando…</>
              : <><Banknote className="size-4" />Registrar pago</>
            }
          </Button>
        </>
      }
    >
          {/* Tarjeta — solo si no vino preseleccionada */}
          {!cardProp && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Tarjeta <span className="text-destructive text-xs">*</span>
              </Label>
              <Select value={pickedCardId} onValueChange={setPickedCardId}>
                <SelectTrigger className="w-full h-11">
                  <SelectValue placeholder="Selecciona una tarjeta" />
                </SelectTrigger>
                <SelectContent>
                  {cards.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}{c.last_four ? ` ···· ${c.last_four}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Cuenta */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Cuenta <span className="text-destructive text-xs">*</span>
            </Label>
            <Select onValueChange={(v) => setValue("account_id", Number(v))}>
              <SelectTrigger className="w-full h-11">
                <SelectValue placeholder="Selecciona una cuenta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} — {format(Number(a.balance))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.account_id && <p className="text-xs text-destructive">{errors.account_id.message}</p>}
          </div>

          {/* Fecha del pago */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Fecha del pago <span className="text-destructive text-xs">*</span>
            </Label>
            <Input
              type="date"
              max={todayLocal}
              {...register("occurred_at")}
              disabled={isPaying}
              className="h-11 text-base"
            />
            {errors.occurred_at && <p className="text-xs text-destructive">{errors.occurred_at.message}</p>}
          </div>

          {/* Moneda del pago */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Moneda del pago <span className="text-destructive text-xs">*</span>
            </Label>
            <Select
              defaultValue={nativeCurrency}
              onValueChange={(v) => {
                setValue("currency", v);
                setSelectedCurrency(v);
              }}
            >
              <SelectTrigger className="w-full h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={nativeCurrency}>{nativeCurrency} — Moneda local</SelectItem>
                <SelectItem value="USD">USD — Dólares</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Monto */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Monto a pagar ({isUsd ? "USD" : symbol}) <span className="text-destructive text-xs">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                {isUsd ? "$" : symbol}
              </span>
              <Input
                type="number" step="0.01" min="0.01" placeholder="0.00"
                {...register("amount")}
                disabled={isPaying}
                className="h-11 pl-8 text-base"
              />
            </div>
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>

          {/* Tasa de cambio — solo si USD */}
          {isUsd && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                1 USD = cuántos {symbol} <span className="text-destructive text-xs">*</span>
              </Label>
              <Input
                type="number" step="0.0001" min="0.0001" placeholder="Ej: 24.89"
                {...register("exchange_rate")}
                disabled={isPaying}
                className="h-11 text-base"
              />
              {errors.exchange_rate && <p className="text-xs text-destructive">{errors.exchange_rate.message}</p>}
              <SuggestedRateHint
                value={Number(watchRate)}
                localCurrency={nativeCurrency}
                onUse={(r) => setValue("exchange_rate", r, { shouldValidate: true })}
              />
              {localEquivalent && localEquivalent > 0 && (
                <div className="flex items-center gap-1.5 bg-muted/60 rounded-lg px-3 py-2">
                  <span className="text-xs text-muted-foreground">Se deducirán de la cuenta:</span>
                  <span className="text-xs font-semibold">{format(localEquivalent)}</span>
                </div>
              )}
            </div>
          )}

          {/* Categoría */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Categoría
              <span className="text-xs text-muted-foreground font-normal ml-1">opcional</span>
            </Label>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select
                  value={field.value ?? "__none__"}
                  onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                  disabled={isPaying}
                >
                  <SelectTrigger className="w-full h-11">
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin categoría</SelectItem>
                    {categories.filter((c) => c.is_active).map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Descripción opcional */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Descripción
              <span className="text-xs text-muted-foreground font-normal ml-1">opcional</span>
            </Label>
            <Input
              placeholder="Pago de tarjeta de crédito"
              {...register("description")}
              disabled={isPaying}
              className="h-11 text-base"
            />
          </div>
    </ResponsiveModal>
  );
}
