"use client";

import useSWR from "swr";
import { useSWRConfig } from "swr";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowDownToLine, ArrowUpFromLine, CheckCircle, Clock, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/hooks/swr/use-currency";
import { SummaryStats } from "@/components/shared/summary-stats";
import { SearchBar } from "@/components/shared/search-bar";
import { DataTableTimeSection, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { useAccounts } from "@/hooks/swr/use-accounts";

type Props = { type: "receivable" | "payable"; id: number };
const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudo cargar el detalle");
  return body.data;
};
const frequencyLabels: Record<string, string> = { WEEKLY: "Semanal", BIWEEKLY: "Quincenal", MONTHLY: "Mensual", ONCE: "Un solo pago" };
const termUnitLabels: Record<string, string> = { DAYS: "Días", WEEKS: "Semanas", MONTHS: "Meses" };
const interestPeriodLabels: Record<string, string> = { NONE: "Sin interés", ANNUAL: "Anual", MONTHLY: "Mensual", WEEKLY: "Semanal" };
const accountTypeLabels: Record<string, string> = { SUPPLIER_CREDIT: "Crédito de proveedor", BANK_LOAN: "Préstamo bancario", CREDIT_CARD: "Tarjeta de crédito", PERSONAL_LOAN: "Préstamo personal", OTHER: "Otro" };

const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("es-HN") : "—";

export function ReceivablesPayablesAccountDetail({ type, id }: Props) {
  const router = useRouter();
  const { format } = useCurrency();
  const { mutate: mutateCache } = useSWRConfig();
  const [search, setSearch] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoAccountId, setAutoAccountId] = useState("");
  const [autoDay, setAutoDay] = useState("");
  const [isSavingAuto, setIsSavingAuto] = useState(false);
  const { accounts } = useAccounts();
  const { data, error, isLoading, mutate: mutateDetail } = useSWR(`/api/accounts-${type === "receivable" ? "receivable" : "payable"}/${id}`, fetcher);
  const isReceivable = type === "receivable";
  const Icon = isReceivable ? ArrowDownToLine : ArrowUpFromLine;
  const payments = useMemo(() => (data?.payments ?? []).filter((item: any) => `${item.notes ?? ""} ${item.account_name ?? ""} ${item.amount}`.toLowerCase().includes(search.toLowerCase())), [data?.payments, search]);
  const paymentColumns: DataTableTimeSectionColumn<any>[] = [
    { id: "date", header: "Fecha", width: 130, cell: (item) => date(item.paid_at) },
    { id: "description", header: "Descripción", width: "clamp(12rem, 30vw, 24rem)", cell: (item) => <span className="block truncate" title={item.notes ?? undefined}>{item.notes || (isReceivable ? "Cobro" : "Pago")}</span> },
    { id: "account", header: "Cuenta", width: "clamp(10rem, 22vw, 18rem)", cell: (item) => item.account_name },
    { id: "amount", header: "Monto", width: 120, align: "right", className: "font-bold text-green-700", cell: (item) => format(Number(item.amount)) },
  ];

  if (isLoading) return <div className="space-y-4"><div className="h-8 w-48 animate-pulse rounded bg-muted" /><div className="h-48 animate-pulse rounded-xl bg-muted" /><div className="h-64 animate-pulse rounded-xl bg-muted" /></div>;
  const account = data?.account;
  if (error || !account) return <div className="space-y-4"><Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="size-4" />Volver</Button><p className="text-sm text-destructive">{error?.message ?? "Cuenta no encontrada"}</p></div>;

  const total = Number(account.original_amount ?? account.total_payable ?? 0);
  const paid = Number(account.paid_amount ?? 0);
  const balance = Number(account.outstanding_amount ?? 0);
  const name = isReceivable ? account.customer_name : account.entity_name;
  const deleteAccount = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/accounts-payable/${id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo eliminar la cuenta");
      toast.success("Cuenta por pagar eliminada");
      await mutateCache((key) => typeof key === "string" && (key === "/api/accounts-payable" || key.startsWith("/api/accounts-payable?")), undefined, { revalidate: true });
      router.push("/finances/receivables-payables/pagar");
    } catch (error: any) {
      toast.error(error.message ?? "No se pudo eliminar la cuenta");
    } finally {
      setIsDeleting(false);
      setDeleteOpen(false);
    }
  };
  const openAutoPayment = () => {
    setAutoEnabled(Boolean(account.auto_payment_enabled));
    setAutoAccountId(account.auto_payment_account_id ? String(account.auto_payment_account_id) : "");
    setAutoDay(account.auto_payment_day ? String(account.auto_payment_day) : account.auto_payment_next_date ? String(new Date(`${account.auto_payment_next_date}T12:00:00`).getDate()) : "");
    setAutoOpen(true);
  };
  const saveAutoPayment = async () => {
    setIsSavingAuto(true);
    try {
      const response = await fetch(`/api/accounts-payable/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto_payment_enabled: autoEnabled, auto_payment_account_id: autoEnabled ? Number(autoAccountId) : undefined, auto_payment_day: autoEnabled ? Number(autoDay) : undefined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar la configuración");
      await mutateDetail();
      await mutateCache((key) => typeof key === "string" && (key === "/api/accounts-payable" || key.startsWith("/api/accounts-payable?")), undefined, { revalidate: true });
      toast.success("Abono automático actualizado");
      setAutoOpen(false);
    } catch (error: any) {
      toast.error(error.message ?? "No se pudo guardar la configuración");
    } finally {
      setIsSavingAuto(false);
    }
  };
  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Volver"><ArrowLeft className="size-5" /></Button><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h1 className="truncate text-2xl font-semibold">{name}</h1><p className="truncate text-sm text-muted-foreground">{account.description}</p></div>{account.status === "PAID" ? <Badge className="shrink-0 gap-1 border-green-200 bg-green-100 text-green-700" variant="outline"><CheckCircle className="size-3" />Pagada</Badge> : <Badge className="shrink-0 gap-1 border-amber-200 bg-amber-100 text-amber-700" variant="outline"><Clock className="size-3" />Pendiente</Badge>}</div></div></div>
      <SummaryStats ariaLabel="Resumen de la cuenta" columns="three" items={[{ label: "Total", icon: Icon, value: format(total) }, { label: "Pagado", icon: CheckCircle, value: format(paid), valueClassName: "text-green-600" }, { label: "Saldo", icon: Clock, value: format(balance), valueClassName: "text-amber-600" }]} />
      {!isReceivable && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="gap-2" onClick={openAutoPayment}>Configurar abono automático</Button><Button type="button" variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" />Eliminar cuenta</Button></div>}
      <div className="grid gap-x-8 gap-y-4 border-y py-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><p className="text-xs text-muted-foreground">{isReceivable ? "Cliente" : "Entidad"}</p><p>{name}</p></div><div><p className="text-xs text-muted-foreground">Fecha de inicio</p><p>{date(account.start_date)}</p></div><div><p className="text-xs text-muted-foreground">Vencimiento</p><p>{date(account.due_date)}</p></div>{!isReceivable && <><div><p className="text-xs text-muted-foreground">Tipo</p><p>{accountTypeLabels[account.account_type] ?? account.account_type}</p></div><div><p className="text-xs text-muted-foreground">Frecuencia</p><p>{frequencyLabels[account.payment_frequency] ?? "—"}</p></div><div><p className="text-xs text-muted-foreground">Plazo</p><p>{account.term_count} {termUnitLabels[account.term_unit] ?? ""}</p></div><div><p className="text-xs text-muted-foreground">Interés</p><p>{Number(account.interest_rate ?? 0)}% · {interestPeriodLabels[account.interest_period] ?? "—"}</p></div><div><p className="text-xs text-muted-foreground">Abono automático</p><p>{account.auto_payment_enabled ? `${account.auto_payment_account_name ?? "Cuenta"} · Día ${account.auto_payment_day ?? "—"}` : "Desactivado"}</p></div></>}</div>
      {!isReceivable && <Card><CardHeader><CardTitle className="text-base">Cuotas</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="px-2 py-2">Cuota</th><th className="px-2 py-2">Vencimiento</th><th className="px-2 py-2">Monto</th><th className="px-2 py-2">Estado</th></tr></thead><tbody>{(data.installments ?? []).map((item: any) => <tr key={item.id} className="border-b last:border-0"><td className="px-2 py-2">{item.installment_number}</td><td className="px-2 py-2">{date(item.due_date)}</td><td className="px-2 py-2">{format(Number(item.amount))}</td><td className="px-2 py-2">{item.status}</td></tr>)}</tbody></table></div></CardContent></Card>}
      <div className="space-y-3"><div><h2 className="text-lg font-semibold">Transacciones y pagos</h2><p className="text-sm text-muted-foreground">Movimientos asociados a esta cuenta.</p></div><SearchBar value={search} onChange={setSearch} placeholder="Buscar por detalle de la transacción..." /><DataTableTimeSection columns={paymentColumns} data={payments} getRowKey={(item) => item.id} emptyState="No hay pagos registrados" recordLabel={payments.length === 1 ? "transacción" : "transacciones"} ariaLabel="Transacciones de la cuenta" minWidth={700} stickyOffset="var(--data-table-sticky-offset)" className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]" showFooterPagination={false} /></div>
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="¿Eliminar cuenta por pagar?" description="La cuenta se cancelará y dejará de aparecer en el listado. Sus pagos y transacciones históricas se conservarán." confirmLabel="Eliminar cuenta" variant="danger" onConfirm={deleteAccount} />
      <ResponsiveModal open={autoOpen} onOpenChange={setAutoOpen} title="Abono automático" footer={<><Button type="button" variant="outline" onClick={() => setAutoOpen(false)} disabled={isSavingAuto} className="flex-1 h-11">Cancelar</Button><Button type="button" onClick={saveAutoPayment} disabled={isSavingAuto || (autoEnabled && (!autoAccountId || !autoDay))} loading={isSavingAuto} className="flex-1 h-11">Guardar configuración</Button></>}>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Checkbox checked={autoEnabled} onCheckedChange={(checked) => setAutoEnabled(checked === true)} />Activar abonos automáticos</label>
        {autoEnabled && <><div className="space-y-1.5"><Label>Cuenta de débito</Label><SearchableSelect value={autoAccountId} onValueChange={setAutoAccountId} items={accounts.map((account: any) => ({ value: String(account.id), label: account.name }))} placeholder="Seleccionar cuenta..." searchPlaceholder="Buscar cuenta..." className="h-11 w-full" /></div><div className="space-y-1.5"><Label>Día del mes</Label><Input type="number" min="1" max="31" step="1" value={autoDay} onChange={(event) => setAutoDay(event.target.value)} placeholder="Ej: 15" className="h-11" /></div><p className="text-xs text-muted-foreground">Se usará la cuota configurada y la frecuencia de esta cuenta.</p></>}
      </ResponsiveModal>
    </div>
  );
}
