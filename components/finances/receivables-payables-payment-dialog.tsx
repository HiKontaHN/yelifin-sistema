"use client";

import { useId, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCurrency } from "@/hooks/swr/use-currency";

type AccountType = "receivable" | "payable";

export function getPaymentTarget(type: AccountType, account: {
  id: number;
  status: string;
  description?: string;
  outstanding_amount?: number | string | null;
  principal_outstanding?: number | string | null;
  original_amount?: number | string | null;
}) {
  const balance = Number(account.outstanding_amount ?? 0);
  if (!(balance > 0) || account.status === "PAID" || account.status === "CANCELLED") return null;

  return {
    type,
    id: account.id,
    description: account.description,
    balance,
    principalBalance: Number(account.principal_outstanding ?? account.original_amount ?? 0),
  };
}

export type PaymentTarget = NonNullable<ReturnType<typeof getPaymentTarget>>;

export function ReceivablesPayablesPaymentDialog({ target, onClose, onMessage }: {
  target: PaymentTarget;
  onClose: () => void;
  onMessage?: (message: string) => void;
}) {
  const formId = useId();
  const { mutate } = useSWRConfig();
  const { accounts } = useAccounts();
  const { format } = useCurrency();
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [paymentType, setPaymentType] = useState("INSTALLMENT");
  const [isPaying, setIsPaying] = useState(false);
  const isReceivable = target.type === "receivable";
  const isCapital = !isReceivable && paymentType === "CAPITAL";
  const maxAmount = isCapital ? Math.min(target.principalBalance, target.balance) : target.balance;

  const registerPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const paymentAmount = Number(amount);
    if (isPaying || !accountId || !(paymentAmount >= 0.01 && paymentAmount <= maxAmount)) return;

    setIsPaying(true);
    const endpoint = `/api/accounts-${target.type}`;
    const detailEndpoint = `${endpoint}/${target.id}`;
    try {
      const response = await fetch(`${detailEndpoint}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: paymentAmount,
          account_id: Number(accountId),
          payment_type: paymentType,
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "No se pudo registrar el pago");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo registrar el pago";
      toast.error(message);
      onMessage?.(message);
      setIsPaying(false);
      return;
    }

    const message = isReceivable ? "Cobro registrado" : "Pago registrado";
    toast.success(message);
    onMessage?.(message);
    await Promise.allSettled([
      mutate((key) => typeof key === "string" && (
        key === endpoint || key.startsWith(`${endpoint}?`) || key === detailEndpoint
        || key === "/api/accounts" || key === "/api/transactions" || key.startsWith("/api/transactions?")
      )),
    ]);
    onClose();
  };

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => { if (!open && !isPaying) onClose(); }}
      dragToClose={!isPaying}
      title={isReceivable ? "Registrar cobro" : "Registrar pago"}
      subtitle={target.description}
      icon={isReceivable ? ArrowDownToLine : ArrowUpFromLine}
      as="form"
      formProps={{ id: formId, onSubmit: registerPayment }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPaying} className="h-11 flex-1">Cancelar</Button>
          <Button type="submit" form={formId} disabled={isPaying || !accountId || !amount || maxAmount < 0.01} loading={isPaying} className="h-11 flex-1">Registrar</Button>
        </>
      }
    >
      {!isReceivable && (
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-type`}>Tipo de pago</Label>
          <SearchableSelect id={`${formId}-type`} value={paymentType} onValueChange={setPaymentType} items={[
            { value: "INSTALLMENT", label: "Pago de cuota" },
            { value: "CAPITAL", label: "Pago a capital" },
          ]} placeholder="Seleccionar tipo..." searchPlaceholder="Buscar tipo..." className="h-11 w-full" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-amount`}>Monto <span className="text-destructive text-xs">*</span></Label>
        <Input id={`${formId}-amount`} type="number" min="0.01" max={maxAmount} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className="h-11" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${formId}-account`}>Cuenta financiera <span className="text-destructive text-xs">*</span></Label>
        <SearchableSelect id={`${formId}-account`} value={accountId} onValueChange={setAccountId} items={accounts.map((account) => ({ value: String(account.id), label: account.name }))} placeholder="Seleccionar..." searchPlaceholder="Buscar cuenta..." className="h-11 w-full" />
      </div>
      <p className="text-sm text-muted-foreground">
        {isCapital ? "Capital pendiente: " : "Saldo pendiente: "}
        <strong>{format(isCapital ? target.principalBalance : target.balance)}</strong>
      </p>
    </ResponsiveModal>
  );
}
