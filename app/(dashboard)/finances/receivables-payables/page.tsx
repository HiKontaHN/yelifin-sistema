"use client";

import { useMemo, useState } from "react";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fab } from "@/components/ui/fab";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCustomers } from "@/hooks/swr/use-costumers";
import { useCurrency } from "@/hooks/swr/use-currency";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Error al cargar datos");
  return body;
};

type AccountTab = "receivable" | "payable";
type PaymentTarget = { type: AccountTab; id: number; balance: number } | null;

export default function ReceivablesPayablesPage({ initialTab = "receivable" }: { initialTab?: AccountTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<AccountTab>(initialTab);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<PaymentTarget>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [originalAmount, setOriginalAmount] = useState("");
  const [paymentFrequency, setPaymentFrequency] = useState("MONTHLY");
  const [termUnit, setTermUnit] = useState("MONTHS");
  const [termCount, setTermCount] = useState("1");
  const [interestPeriod, setInterestPeriod] = useState("NONE");
  const [interestRate, setInterestRate] = useState("0");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const receivables = useSWR<{ data: any[] }>("/api/accounts-receivable", fetcher);
  const payables = useSWR<{ data: any[] }>("/api/accounts-payable", fetcher);
  const entities = useSWR<{ data: any[] }>("/api/financial-entities", fetcher);
  const { accounts } = useAccounts();
  const { customers } = useCustomers({ limit: 500 });
  const { format } = useCurrency();

  const paymentPlan = useMemo(() => {
    const amount = Number(originalAmount) || 0;
    const count = Math.max(1, Number(termCount) || 1);
    const rate = Math.max(0, Number(interestRate) || 0);
    const durationDays = termUnit === "DAYS" ? count : termUnit === "WEEKS" ? count * 7 : count * 30;
    const durationMonths = durationDays / 30;
    const durationWeeks = durationDays / 7;
    const installments = paymentFrequency === "WEEKLY" ? Math.max(1, Math.ceil(durationWeeks)) : paymentFrequency === "BIWEEKLY" ? Math.max(1, Math.ceil(durationWeeks / 2)) : paymentFrequency === "MONTHLY" ? Math.max(1, Math.ceil(durationMonths)) : 1;
    const interestBase = interestPeriod === "ANNUAL" ? durationMonths / 12 : interestPeriod === "MONTHLY" ? durationMonths : interestPeriod === "WEEKLY" ? durationWeeks : 0;
    const totalInterest = Math.round(amount * (rate / 100) * interestBase * 100) / 100;
    const totalPayable = Math.round((amount + totalInterest) * 100) / 100;
    return { installments, totalInterest, totalPayable, installmentAmount: installments ? Math.round((totalPayable / installments) * 100) / 100 : 0 };
  }, [interestPeriod, interestRate, originalAmount, paymentFrequency, termCount, termUnit]);

  const submit = async (url: string, body: unknown) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "No se pudo guardar");
    return result;
  };

  const resetCreateForm = () => {
    setCustomerId("");
    setEntityId("");
    setOriginalAmount("");
    setPaymentFrequency("MONTHLY");
    setTermUnit("MONTHS");
    setTermCount("1");
    setInterestPeriod("NONE");
    setInterestRate("0");
    setStartDate(new Date().toISOString().slice(0, 10));
  };

  const newAccountType = searchParams.get("new");

  useEffect(() => {
    if (newAccountType !== "receivable" && newAccountType !== "payable") return;
    setTab(newAccountType);
    resetCreateForm();
    setCreateOpen(true);
    router.replace(pathname);
  }, [newAccountType, pathname, router]);

  const createAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    const data = new FormData(event.currentTarget);
    try {
      await submit(tab === "receivable" ? "/api/accounts-receivable" : "/api/accounts-payable", {
        customer_id: tab === "receivable" ? Number(customerId) : undefined,
        entity_id: tab === "payable" ? Number(entityId) : undefined,
        source_type: tab === "receivable" ? "OTHER" : undefined,
        account_type: tab === "payable" ? data.get("account_type") : undefined,
        description: data.get("description"),
        original_amount: Number(originalAmount),
        start_date: tab === "payable" ? startDate : undefined,
        payment_frequency: tab === "payable" ? paymentFrequency : undefined,
        term_unit: tab === "payable" ? termUnit : undefined,
        term_count: tab === "payable" ? Number(termCount) : undefined,
        interest_period: tab === "payable" ? interestPeriod : undefined,
        interest_rate: tab === "payable" ? Number(interestRate) : undefined,
        due_date: data.get("due_date") || undefined,
      });
      event.currentTarget.reset();
      resetCreateForm();
      setCreateOpen(false);
      await Promise.all([receivables.mutate(), payables.mutate()]);
      setMessage("Cuenta registrada");
      toast.success("Cuenta registrada");
    } catch (error: any) {
      setMessage(error.message);
      toast.error(error.message || "No se pudo registrar la cuenta");
    } finally {
      setIsCreating(false);
    }
  };

  const registerPayment = async () => {
    if (!target) return;
    setIsPaying(true);
    try {
      await submit(`/api/accounts-${target.type}/${target.id}/payments`, {
        amount: Number(paymentAmount),
        account_id: Number(paymentAccount),
      });
      const completedType = target.type;
      setTarget(null);
      setPaymentAmount("");
      setPaymentAccount("");
      await Promise.all([receivables.mutate(), payables.mutate()]);
      setMessage(completedType === "receivable" ? "Cobro registrado" : "Pago registrado");
      toast.success(completedType === "receivable" ? "Cobro registrado" : "Pago registrado");
    } catch (error: any) {
      setMessage(error.message);
      toast.error(error.message || "No se pudo registrar el pago");
    } finally {
      setIsPaying(false);
    }
  };

  const rows = tab === "receivable" ? (receivables.data?.data ?? []) : (payables.data?.data ?? []);
  const selectedId = tab === "receivable" ? customerId : entityId;

  return (
    <div className="space-y-6 p-4 pb-24 md:p-6 md:pb-6">
      <div>
        <h1 className="text-2xl font-semibold">Cobros y pagos</h1>
        <p className="text-sm text-muted-foreground">Controla lo que tus clientes deben y las obligaciones de tu negocio.</p>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <Card>
        <CardHeader><CardTitle>{tab === "receivable" ? "Cuentas por cobrar" : "Cuentas por pagar"}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No hay cuentas registradas.</p>}
          {rows.map((row: any) => {
            const balance = Number(row.outstanding_amount);
            return (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{tab === "receivable" ? row.customer_name : row.entity_name}</p>
                  <p className="truncate text-sm text-muted-foreground">{row.description}</p>
                  <p className="text-xs text-muted-foreground">{row.status}{row.due_date ? ` · vence ${new Date(row.due_date).toLocaleDateString("es-HN")}` : ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{format(balance)}</p>
                  {balance > 0 && <Button size="sm" variant="outline" className="mt-1" onClick={() => setTarget({ type: tab, id: row.id, balance })}>Registrar {tab === "receivable" ? "cobro" : "pago"}</Button>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Fab actions={[
        { label: "Nueva cuenta por cobrar", icon: ArrowDownToLine, onClick: () => router.push("/finances/receivables-payables/cobrar?new=receivable") },
        { label: "Nueva cuenta por pagar", icon: ArrowUpFromLine, onClick: () => router.push("/finances/receivables-payables/pagar?new=payable") },
        { label: "Nueva entidad", icon: ArrowUpFromLine, onClick: () => router.push("/finances/financial-entities?new=1") },
      ]} />

      <ResponsiveModal
        open={createOpen}
        onOpenChange={(open) => { if (!open) { resetCreateForm(); setCreateOpen(false); } }}
        title={`Nueva cuenta ${tab === "receivable" ? "por cobrar" : "por pagar"}`}
        icon={tab === "receivable" ? ArrowDownToLine : ArrowUpFromLine}
        as="form"
        formProps={{ id: "create-receivable-payable-form", onSubmit: createAccount }}
        footer={<><Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={isCreating} className="flex-1 h-11">Cancelar</Button><Button type="submit" form="create-receivable-payable-form" disabled={!selectedId} loading={isCreating} className="flex-1 h-11">Registrar cuenta</Button></>}
      >
        <div className="space-y-1.5">
          <Label>{tab === "receivable" ? "Cliente" : "Entidad"} <span className="text-destructive text-xs">*</span></Label>
          <SearchableSelect value={selectedId} onValueChange={tab === "receivable" ? setCustomerId : setEntityId} items={(tab === "receivable" ? customers : (entities.data?.data ?? [])).map((item: any) => ({ value: item.id.toString(), label: item.name ?? item.entity_name }))} placeholder="Seleccionar..." searchPlaceholder={tab === "receivable" ? "Buscar cliente..." : "Buscar entidad..."} className="h-11 w-full" />
        </div>
        {tab === "payable" && <div className="space-y-1.5"><Label>Tipo</Label><select name="account_type" className="h-11 w-full rounded-md border bg-background px-3 text-sm"><option value="SUPPLIER_CREDIT">Crédito de proveedor</option><option value="BANK_LOAN">Préstamo bancario</option><option value="CREDIT_CARD">Tarjeta de crédito</option><option value="PERSONAL_LOAN">Préstamo personal</option><option value="OTHER">Otro</option></select></div>}
        <div className="space-y-1.5"><Label>Descripción <span className="text-destructive text-xs">*</span></Label><Input name="description" placeholder="Ej: Venta a crédito" required className="h-11" /></div>
        <div className="space-y-1.5"><Label>Monto original <span className="text-destructive text-xs">*</span></Label><Input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} className="h-11" /></div>
        {tab === "payable" && <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Frecuencia de pago</Label><SearchableSelect value={paymentFrequency} onValueChange={setPaymentFrequency} items={[{ value: "WEEKLY", label: "Semanal" }, { value: "BIWEEKLY", label: "Quincenal" }, { value: "MONTHLY", label: "Mensual" }, { value: "ONCE", label: "Un solo pago" }]} placeholder="Seleccionar..." searchPlaceholder="Buscar frecuencia..." className="h-11 w-full" /></div>
            <div className="space-y-1.5"><Label>Plazo</Label><div className="flex gap-2"><Input type="number" min="1" step="1" value={termCount} onChange={(e) => setTermCount(e.target.value)} className="h-11" /><SearchableSelect value={termUnit} onValueChange={setTermUnit} items={[{ value: "DAYS", label: "Días" }, { value: "WEEKS", label: "Semanas" }, { value: "MONTHS", label: "Meses" }]} placeholder="Unidad" searchPlaceholder="Buscar unidad..." className="h-11 min-w-28" /></div></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Interés</Label><div className="flex gap-2"><Input type="number" min="0" step="0.01" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className="h-11" placeholder="0" /><SearchableSelect value={interestPeriod} onValueChange={setInterestPeriod} items={[{ value: "NONE", label: "Sin interés" }, { value: "ANNUAL", label: "Anual" }, { value: "MONTHLY", label: "Mensual" }, { value: "WEEKLY", label: "Semanal" }]} placeholder="Periodo" searchPlaceholder="Buscar periodo..." className="h-11 min-w-32" /></div></div>
            <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11" /></div>
          </div>
          <div className="rounded-xl border bg-muted/40 p-3 text-sm"><div className="flex justify-between"><span>Total de intereses</span><strong>{format(paymentPlan.totalInterest)}</strong></div><div className="mt-1 flex justify-between"><span>Total a pagar</span><strong>{format(paymentPlan.totalPayable)}</strong></div><div className="mt-1 flex justify-between text-primary"><span>Cuota {paymentFrequency === "WEEKLY" ? "semanal" : paymentFrequency === "BIWEEKLY" ? "quincenal" : paymentFrequency === "MONTHLY" ? "mensual" : "única"}</span><strong>{format(paymentPlan.installmentAmount)}</strong></div><p className="mt-1 text-xs text-muted-foreground">{paymentPlan.installments} cuota{paymentPlan.installments === 1 ? "" : "s"}. Interés simple calculado según el periodo seleccionado.</p></div>
        </>}
        {tab === "receivable" && <div className="space-y-1.5"><Label>Fecha de vencimiento <span className="text-xs text-muted-foreground">(opcional)</span></Label><Input name="due_date" type="date" className="h-11" /></div>}
      </ResponsiveModal>

      <ResponsiveModal
        open={Boolean(target)}
        onOpenChange={(open) => { if (!open) { setTarget(null); setPaymentAmount(""); setPaymentAccount(""); } }}
        title={`Registrar ${target?.type === "receivable" ? "cobro" : "pago"}`}
        icon={target?.type === "receivable" ? ArrowDownToLine : ArrowUpFromLine}
        footer={<><Button type="button" variant="outline" onClick={() => setTarget(null)} disabled={isPaying} className="flex-1 h-11">Cancelar</Button><Button type="button" onClick={registerPayment} disabled={!paymentAmount || !paymentAccount} loading={isPaying} className="flex-1 h-11">Registrar</Button></>}
      >
        <div className="space-y-1.5"><Label>Monto <span className="text-destructive text-xs">*</span></Label><Input type="number" min="0.01" max={target?.balance} step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="h-11" /></div>
        <div className="space-y-1.5"><Label>Cuenta financiera <span className="text-destructive text-xs">*</span></Label><SearchableSelect value={paymentAccount} onValueChange={setPaymentAccount} items={accounts.map((a: any) => ({ value: a.id.toString(), label: a.name }))} placeholder="Seleccionar..." searchPlaceholder="Buscar cuenta..." className="h-11 w-full" /></div>
        {target && <p className="text-sm text-muted-foreground">Saldo pendiente: <strong>{format(target.balance)}</strong></p>}
      </ResponsiveModal>

    </div>
  );
}
