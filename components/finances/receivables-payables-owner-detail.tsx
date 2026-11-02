"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Building2, CheckCircle, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryStats } from "@/components/shared/summary-stats";
import { useCurrency } from "@/hooks/swr/use-currency";

type Props = { type: "receivable" | "payable"; ownerId: string };

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el historial");
  return body;
};

const date = (value: string | null | undefined) => value
  ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString("es-HN")
  : "Sin vencimiento";

function StatusBadge({ status }: { status: string }) {
  if (status === "PAID") return <Badge variant="outline" className="border-green-200 bg-green-100 text-green-700">Pagada</Badge>;
  if (status === "CANCELLED") return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">Cancelada</Badge>;
  if (status === "OVERDUE") return <Badge variant="outline" className="border-red-200 bg-red-100 text-red-700">Vencida</Badge>;
  if (status === "PARTIAL") return <Badge variant="outline" className="border-blue-200 bg-blue-100 text-blue-700">Parcial</Badge>;
  return <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-700">Pendiente</Badge>;
}

export function ReceivablesPayablesOwnerDetail({ type, ownerId }: Props) {
  const router = useRouter();
  const { format } = useCurrency();
  const isReceivable = type === "receivable";
  const endpoint = isReceivable ? "/api/accounts-receivable" : "/api/accounts-payable";
  const { data, error, isLoading } = useSWR<{ data: any[] }>(endpoint, fetcher);
  const accounts = (data?.data ?? []).filter((account) => {
    if (!isReceivable) return ownerId === `entity-${account.entity_id}`;
    if (ownerId.startsWith("customer-")) return ownerId === `customer-${account.customer_id}`;
    return ownerId === `person-${account.person_id}` && !account.customer_id;
  });
  const name = accounts[0] ? (isReceivable ? accounts[0].customer_name : accounts[0].entity_name) : "Detalle";
  const paid = accounts.reduce((sum, account) => sum + Number(account.paid_amount ?? 0), 0);
  const balance = accounts.reduce((sum, account) => sum + Number(account.outstanding_amount ?? 0), 0);
  const total = paid + balance;
  const pending = accounts.filter((account) => Number(account.outstanding_amount ?? 0) > 0).length;
  const backPath = `/finances/receivables-payables/${isReceivable ? "cobrar" : "pagar"}`;

  if (isLoading) return <div className="space-y-4"><div className="h-9 w-56 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /><div className="h-72 animate-pulse rounded-xl bg-muted" /></div>;

  if (error || accounts.length === 0) return <div className="space-y-4"><Button variant="ghost" onClick={() => router.push(backPath)}><ArrowLeft className="size-4" />Volver</Button><p className="text-sm text-destructive">{error?.message ?? `${isReceivable ? "Persona" : "Entidad"} sin historial de cuentas`}</p></div>;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(backPath)} aria-label="Volver"><ArrowLeft className="size-5" /></Button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-semibold">{name}</h1><p className="text-sm text-muted-foreground">Historial consolidado de cuentas {isReceivable ? "por cobrar" : "por pagar"}.</p></div>
      </div>

      <SummaryStats ariaLabel={`Resumen de ${name}`} items={[
        { label: "Total histórico", icon: isReceivable ? ArrowDownToLine : ArrowUpFromLine, value: format(total), detail: `${accounts.length} cuenta${accounts.length === 1 ? "" : "s"}` },
        { label: isReceivable ? "Cobrado" : "Pagado", icon: CheckCircle, value: format(paid), valueClassName: "text-green-600 dark:text-green-400", detail: "pagos registrados" },
        { label: "Saldo pendiente", icon: Clock, value: format(balance), valueClassName: "text-amber-600 dark:text-amber-400", detail: `${pending} pendiente${pending === 1 ? "" : "s"}` },
        { label: isReceivable ? "Persona" : "Entidad", icon: isReceivable ? Users : Building2, value: name, detail: "responsable de las cuentas" },
      ]} />

      <div><h2 className="text-lg font-semibold">Todas las cuentas</h2><p className="text-sm text-muted-foreground">Cuentas pendientes y pagadas, ordenadas por vencimiento.</p></div>
      <Card className="py-0"><CardContent className="divide-y p-0">
        {accounts.map((account) => {
          const accountPaid = Number(account.paid_amount ?? 0);
          const accountBalance = Number(account.outstanding_amount ?? 0);
          return <button key={account.id} type="button" onClick={() => router.push(`${backPath}/${account.id}`)} className="flex w-full items-center gap-3 p-4 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{account.description}</p><StatusBadge status={account.status} /></div><p className="mt-1 text-xs text-muted-foreground">{account.due_date ? `Vence ${date(account.due_date)}` : "Sin fecha de vencimiento"} · {isReceivable ? "Cobrado" : "Pagado"} {format(accountPaid)}</p></div>
            <div className="shrink-0 text-right"><p className="font-semibold text-amber-700">{format(accountBalance)}</p><p className="text-xs text-muted-foreground">de {format(accountPaid + accountBalance)}</p></div>
          </button>;
        })}
      </CardContent></Card>
    </div>
  );
}
