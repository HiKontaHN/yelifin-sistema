"use client";

import { useMemo, useState } from "react";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Building2, CheckCircle, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fab } from "@/components/ui/fab";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { DataTableTimeSection, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
import { SummaryStats } from "@/components/shared/summary-stats";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCurrency } from "@/hooks/swr/use-currency";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Error al cargar datos");
  return body;
};

type AccountTab = "receivable" | "payable";
type ViewMode = "accounts" | "owners";
type PaymentTarget = { type: AccountTab; id: number; balance: number; principalBalance?: number } | null;
type OwnerSummary = { id: string; name: string; accounts: any[]; total: number; paid: number; balance: number; active: number };


export default function ReceivablesPayablesPage({ initialTab = "receivable" }: { initialTab?: AccountTab }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<AccountTab>(initialTab);
  const [viewMode, setViewMode] = useState<ViewMode>("accounts");
  const [selectedOwner, setSelectedOwner] = useState<OwnerSummary | null>(null);
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<PaymentTarget>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAccount, setPaymentAccount] = useState("");
  const [paymentType, setPaymentType] = useState("INSTALLMENT");
  const [isCreating, setIsCreating] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [personId, setPersonId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [accountType, setAccountType] = useState("SUPPLIER_CREDIT");
  const [originalAmount, setOriginalAmount] = useState("");
  const [paymentFrequency, setPaymentFrequency] = useState("MONTHLY");
  const [termUnit, setTermUnit] = useState("MONTHS");
  const [termCount, setTermCount] = useState("1");
  const [interestPeriod, setInterestPeriod] = useState("NONE");
  const [interestRate, setInterestRate] = useState("0");
  const [manualInstallment, setManualInstallment] = useState("");
  const [autoPaymentEnabled, setAutoPaymentEnabled] = useState(false);
  const [autoPaymentAccount, setAutoPaymentAccount] = useState("");
  const [autoPaymentDay, setAutoPaymentDay] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));

  const receivables = useSWR<{ data: any[] }>("/api/accounts-receivable", fetcher);
  const payables = useSWR<{ data: any[] }>("/api/accounts-payable", fetcher);
  const entities = useSWR<{ data: any[] }>("/api/financial-entities", fetcher);
  const people = useSWR<{ data: any[] }>(createOpen && tab === "receivable" ? "/api/people?limit=500" : null, fetcher);
  const { accounts } = useAccounts();
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
    const manual = Number(manualInstallment) || 0;
    const calculatedInterest = Math.round(amount * (rate / 100) * interestBase * 100) / 100;
    const calculatedTotal = Math.round((amount + calculatedInterest) * 100) / 100;
    const totalPayable = manual > 0 ? Math.round(manual * installments * 100) / 100 : calculatedTotal;
    const totalInterest = manual > 0 ? Math.round((totalPayable - amount) * 100) / 100 : calculatedInterest;
    const calculatedInstallment = installments ? Math.round((calculatedTotal / installments) * 100) / 100 : 0;
    return { installments, totalInterest, totalPayable, calculatedInstallment, installmentAmount: manual > 0 ? manual : calculatedInstallment, hasManualInstallment: manual > 0 };
  }, [interestPeriod, interestRate, manualInstallment, originalAmount, paymentFrequency, termCount, termUnit]);

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
    setPersonId("");
    setEntityId("");
    setAccountType("SUPPLIER_CREDIT");
    setOriginalAmount("");
    setPaymentFrequency("MONTHLY");
    setTermUnit("MONTHS");
    setTermCount("1");
    setInterestPeriod("NONE");
    setInterestRate("0");
    setManualInstallment("");
    setAutoPaymentEnabled(false);
    setAutoPaymentAccount("");
    setAutoPaymentDay("");
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

  useEffect(() => setPage(1), [tab, viewMode]);

  const createAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setIsCreating(true);
    const data = new FormData(event.currentTarget);
    try {
      await submit(tab === "receivable" ? "/api/accounts-receivable" : "/api/accounts-payable", {
        person_id: tab === "receivable" ? Number(personId) : undefined,
        entity_id: tab === "payable" ? Number(entityId) : undefined,
        source_type: tab === "receivable" ? "OTHER" : undefined,
        account_type: tab === "payable" ? accountType : undefined,
        description: data.get("description"),
        original_amount: Number(originalAmount),
        start_date: tab === "payable" ? startDate : undefined,
        payment_frequency: tab === "payable" ? paymentFrequency : undefined,
        term_unit: tab === "payable" ? termUnit : undefined,
        term_count: tab === "payable" ? Number(termCount) : undefined,
        interest_period: tab === "payable" ? interestPeriod : undefined,
        interest_rate: tab === "payable" ? Number(interestRate) : undefined,
        installment_amount: tab === "payable" && manualInstallment ? Number(manualInstallment) : undefined,
        auto_payment_enabled: tab === "payable" ? autoPaymentEnabled : false,
        auto_payment_account_id: tab === "payable" && autoPaymentEnabled ? Number(autoPaymentAccount) : undefined,
        auto_payment_day: tab === "payable" && autoPaymentEnabled ? Number(autoPaymentDay) : undefined,
        due_date: data.get("due_date") || undefined,
      });
      form.reset();
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
        payment_type: target.type === "payable" ? paymentType : "INSTALLMENT",
      });
      const completedType = target.type;
      setTarget(null);
      setPaymentAmount("");
      setPaymentAccount("");
      setPaymentType("INSTALLMENT");
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
  const selectedId = tab === "receivable" ? personId : entityId;
  const isLoadingRows = tab === "receivable" ? receivables.isLoading : payables.isLoading;
  const getName = (row: any) => tab === "receivable" ? row.customer_name : row.entity_name;
  const getPaid = (row: any) => Number(row.paid_amount ?? 0);
  const getBalance = (row: any) => Number(row.outstanding_amount ?? 0);
  const getTotal = (row: any) => getPaid(row) + getBalance(row);
  const ownerRows = useMemo<OwnerSummary[]>(() => {
    const grouped = new Map<string, OwnerSummary>();
    rows.forEach((row: any) => {
      const ownerId = tab === "receivable"
        ? row.customer_id ? `customer-${row.customer_id}` : `person-${row.person_id}`
        : `entity-${row.entity_id}`;
      const current: OwnerSummary = grouped.get(ownerId) ?? { id: ownerId, name: getName(row) || "Sin nombre", accounts: [], total: 0, paid: 0, balance: 0, active: 0 };
      current.accounts.push(row);
      current.total += getTotal(row);
      current.paid += getPaid(row);
      current.balance += getBalance(row);
      if (getBalance(row) > 0) current.active += 1;
      grouped.set(ownerId, current);
    });
    return Array.from(grouped.values()).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "es"));
  }, [rows, tab]);
  const totals = useMemo(() => rows.reduce((result, row) => ({
    total: result.total + getTotal(row),
    paid: result.paid + getPaid(row),
    balance: result.balance + getBalance(row),
  }), { total: 0, paid: 0, balance: 0 }), [rows, tab]);
  const displayedRows = viewMode === "accounts" ? rows : ownerRows;
  const pagedRows = displayedRows.slice((page - 1) * pageSize, page * pageSize);
  const statusBadge = (row: any) => row.status === "PAID"
    ? <Badge className="gap-1 border-green-200 bg-green-100 text-green-700" variant="outline"><CheckCircle className="size-3" />Pagada</Badge>
    : <Badge className="gap-1 border-amber-200 bg-amber-100 text-amber-700" variant="outline"><Clock className="size-3" />Pendiente</Badge>;

  const accountColumns: DataTableTimeSectionColumn<any>[] = [
    {
      id: "name", header: tab === "receivable" ? "Persona" : "Entidad", width: "clamp(10rem, 18vw, 15rem)",
      cell: (row) => <span className="block truncate font-medium" title={getName(row)}>{getName(row)}</span>,
    },
    {
      id: "description", header: "Descripción", width: "clamp(12rem, 24vw, 20rem)",
      cell: (row) => <span className="block truncate" title={row.description}>{row.description}</span>,
    },
    { id: "status", header: "Estado", width: 125, cell: statusBadge },
    {
      id: "total", header: "Total", width: 110, align: "right", className: "font-medium",
      cell: (row) => format(getTotal(row)),
    },
    {
      id: "paid", header: "Pagado", width: 110, align: "right", className: "font-medium text-green-700",
      cell: (row) => format(getPaid(row)),
    },
    {
      id: "balance", header: "Saldo", width: 110, align: "right", className: "font-medium text-amber-700",
      cell: (row) => format(getBalance(row)),
    },
    {
      id: "actions", header: <span className="sr-only">Acciones</span>, width: 150, align: "right", stopRowClick: true,
      cell: (row) => getBalance(row) > 0
        ? <Button size="sm" variant="outline" onClick={() => setTarget({ type: tab, id: row.id, balance: getBalance(row), principalBalance: Number(row.principal_outstanding ?? row.original_amount ?? 0) })}>Registrar {tab === "receivable" ? "cobro" : "pago"}</Button>
        : null,
    },
  ];

  const ownerColumns: DataTableTimeSectionColumn<OwnerSummary>[] = [
    { id: "name", header: tab === "receivable" ? "Persona" : "Entidad", width: "clamp(12rem, 28vw, 22rem)", cell: (owner) => <div><p className="font-medium">{owner.name}</p><p className="text-xs text-muted-foreground">{owner.accounts.length} cuenta{owner.accounts.length === 1 ? "" : "s"} en el historial</p></div> },
    { id: "accounts", header: "Pendientes", width: 105, align: "right", cell: (owner) => owner.active },
    { id: "total", header: "Total", width: 120, align: "right", className: "font-medium", cell: (owner) => format(owner.total) },
    { id: "paid", header: tab === "receivable" ? "Cobrado" : "Pagado", width: 120, align: "right", className: "font-medium text-green-700", cell: (owner) => format(owner.paid) },
    { id: "balance", header: "Saldo", width: 120, align: "right", className: "font-semibold text-amber-700", cell: (owner) => format(owner.balance) },
  ];

  const renderMobileAccount = (row: any) => (
    <Card className="cursor-pointer pt-1 pb-1" onClick={() => router.push(`/finances/receivables-payables/${tab === "receivable" ? "cobrar" : "pagar"}/${row.id}`)}>
      <CardContent className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-medium">{getName(row)}</p>
              {statusBadge(row)}
            </div>
            <p className="truncate text-sm text-muted-foreground">{row.description}</p>
          </div>
          <p className="shrink-0 font-semibold">{format(getBalance(row))}</p>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3 text-xs text-muted-foreground">
          <div><span>Total {format(getTotal(row))}</span><span className="ml-3 text-green-700">Pagado {format(getPaid(row))}</span></div>
          {getBalance(row) > 0 && <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setTarget({ type: tab, id: row.id, balance: getBalance(row), principalBalance: Number(row.principal_outstanding ?? row.original_amount ?? 0) }); }}>Registrar {tab === "receivable" ? "cobro" : "pago"}</Button>}
        </div>
      </CardContent>
    </Card>
  );

  const renderMobileOwner = (owner: OwnerSummary) => (
    <Card className="cursor-pointer pt-1 pb-1" onClick={() => setSelectedOwner(owner)}>
      <CardContent className="px-4 py-3">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{owner.name}</p><p className="text-xs text-muted-foreground">{owner.accounts.length} en historial · {owner.active} pendiente{owner.active === 1 ? "" : "s"}</p></div><p className="shrink-0 font-semibold text-amber-700">{format(owner.balance)}</p></div>
        <div className="mt-3 text-xs text-muted-foreground"><span>Total {format(owner.total)}</span><span className="ml-3 text-green-700">{tab === "receivable" ? "Cobrado" : "Pagado"} {format(owner.paid)}</span></div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 p-4 pb-24 md:p-6 md:pb-6">
      <div>
        <h1 className="text-2xl font-semibold">Cobros y pagos</h1>
        <p className="text-sm text-muted-foreground">Controla lo que otras personas deben y las obligaciones de tu negocio.</p>
      </div>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <SummaryStats
        ariaLabel={tab === "receivable" ? "Resumen de cuentas por cobrar" : "Resumen de cuentas por pagar"}
        isLoading={isLoadingRows}
        items={[
          { label: tab === "receivable" ? "Total por cobrar" : "Total por pagar", icon: tab === "receivable" ? ArrowDownToLine : ArrowUpFromLine, value: format(totals.total), detail: `${rows.length} cuenta${rows.length === 1 ? "" : "s"} en el historial` },
          { label: tab === "receivable" ? "Cobrado" : "Pagado", icon: CheckCircle, value: format(totals.paid), valueClassName: "text-green-600 dark:text-green-400", detail: "pagos registrados" },
          { label: "Saldo pendiente", icon: Clock, value: format(totals.balance), valueClassName: "text-amber-600 dark:text-amber-400", detail: `${rows.filter((row: any) => getBalance(row) > 0).length} cuenta${rows.filter((row: any) => getBalance(row) > 0).length === 1 ? "" : "s"} pendiente${rows.filter((row: any) => getBalance(row) > 0).length === 1 ? "" : "s"}` },
          { label: tab === "receivable" ? "Personas" : "Entidades", icon: tab === "receivable" ? Users : Building2, value: ownerRows.length, detail: "con cuentas actuales o históricas" },
        ]}
      />

      <div className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold">{viewMode === "accounts" ? "Todas las cuentas" : tab === "receivable" ? "Por persona" : "Por entidad"}</p><p className="text-xs text-muted-foreground">{viewMode === "accounts" ? "Consulta cada cuenta por separado." : "Consulta el historial completo de cada responsable."}</p></div>
        <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
          <TabsList className="rounded-xl border bg-card">
            <TabsTrigger value="accounts" className="rounded-lg">Cuentas</TabsTrigger>
            <TabsTrigger value="owners" className="rounded-lg">{tab === "receivable" ? "Personas" : "Entidades"}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <DataTableTimeSection
        columns={viewMode === "accounts" ? accountColumns : ownerColumns}
        data={pagedRows}
        getRowKey={(row: any) => row.id}
        renderMobileRow={viewMode === "accounts" ? renderMobileAccount : renderMobileOwner}
        onRowClick={(row: any) => viewMode === "accounts" ? router.push(`/finances/receivables-payables/${tab === "receivable" ? "cobrar" : "pagar"}/${row.id}`) : setSelectedOwner(row)}
        isLoading={isLoadingRows}
        emptyState={viewMode === "accounts" ? `No hay cuentas ${tab === "receivable" ? "por cobrar" : "por pagar"} registradas` : `No hay ${tab === "receivable" ? "personas" : "entidades"} con historial`}
        recordLabel={viewMode === "accounts" ? (tab === "receivable" ? "cuentas por cobrar" : "cuentas por pagar") : (tab === "receivable" ? "personas" : "entidades")}
        ariaLabel={viewMode === "accounts" ? (tab === "receivable" ? "Cuentas por cobrar" : "Cuentas por pagar") : (tab === "receivable" ? "Personas con cuentas por cobrar" : "Entidades con cuentas por pagar")}
        minWidth={900}
        stickyOffset="var(--data-table-sticky-offset)"
        className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]"
        showFooterPagination={false}
        pagination={{ page, pageSize, total: displayedRows.length, onPageChange: setPage, onPageSizeChange: (size) => { setPage(1); setPageSize(size); } }}
      />

      <Fab actions={[
        { label: "Nueva cuenta por cobrar", icon: ArrowDownToLine, onClick: () => router.push("/finances/receivables-payables/cobrar?new=receivable") },
        { label: "Nueva cuenta por pagar", icon: ArrowUpFromLine, onClick: () => router.push("/finances/receivables-payables/pagar?new=payable") },
      ]} />

      <ResponsiveModal
        open={createOpen}
        onOpenChange={(open) => { if (!open) { resetCreateForm(); setCreateOpen(false); } }}
        title={`Nueva cuenta ${tab === "receivable" ? "por cobrar" : "por pagar"}`}
        icon={tab === "receivable" ? ArrowDownToLine : ArrowUpFromLine}
        width="2xl"
        as="form"
        formProps={{ id: "create-receivable-payable-form", onSubmit: createAccount }}
        footer={<><Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={isCreating} className="flex-1 h-11">Cancelar</Button><Button type="submit" form="create-receivable-payable-form" disabled={!selectedId || (tab === "payable" && autoPaymentEnabled && (!autoPaymentAccount || !autoPaymentDay))} loading={isCreating} className="flex-1 h-11">Registrar cuenta</Button></>}
      >
        <div className="space-y-1.5">
          <Label>{tab === "receivable" ? "Persona" : "Entidad"} <span className="text-destructive text-xs">*</span></Label>
          <SearchableSelect
            value={selectedId}
            onValueChange={tab === "receivable" ? setPersonId : setEntityId}
            items={(tab === "receivable" ? (people.data?.data ?? []) : (entities.data?.data ?? [])).map((item: any) => ({
              value: item.id.toString(),
              label: tab === "receivable"
                ? `${item.name}${item.roles?.length ? ` · ${item.roles.map((role: string) => ({ CLIENT: "Cliente", SUPPLIER: "Proveedor", THIRD_PARTY: "Tercero", CONTACT: "Contacto" } as Record<string, string>)[role] ?? role).join(", ")}` : ""}`
                : item.name ?? item.entity_name,
            }))}
            placeholder={tab === "receivable" ? "Seleccionar persona..." : "Seleccionar entidad..."}
            searchPlaceholder={tab === "receivable" ? "Buscar persona..." : "Buscar entidad..."}
            className="h-11 w-full"
          />
        </div>
        {tab === "payable" && <div className="space-y-1.5"><Label>Tipo</Label><SearchableSelect value={accountType} onValueChange={setAccountType} items={[{ value: "SUPPLIER_CREDIT", label: "Crédito de proveedor" }, { value: "BANK_LOAN", label: "Préstamo bancario" }, { value: "CREDIT_CARD", label: "Tarjeta de crédito" }, { value: "PERSONAL_LOAN", label: "Préstamo personal" }, { value: "OTHER", label: "Otro" }]} placeholder="Seleccionar tipo..." searchPlaceholder="Buscar tipo..." className="h-11 w-full" /></div>}
        <div className="space-y-1.5"><Label>Descripción <span className="text-destructive text-xs">*</span></Label><Input name="description" placeholder="Ej: Venta a crédito" required className="h-11" /></div>
        <div className="space-y-1.5"><Label>Monto original <span className="text-destructive text-xs">*</span></Label><Input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} className="h-11" /></div>
        {tab === "payable" && <>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5"><Label>Frecuencia de pago</Label><SearchableSelect value={paymentFrequency} onValueChange={setPaymentFrequency} items={[{ value: "WEEKLY", label: "Semanal" }, { value: "BIWEEKLY", label: "Quincenal" }, { value: "MONTHLY", label: "Mensual" }, { value: "ONCE", label: "Un solo pago" }]} placeholder="Seleccionar..." searchPlaceholder="Buscar frecuencia..." className="h-11 w-full" /></div>
            <div className="space-y-1.5"><Label>Plazo</Label><div className="flex gap-2"><Input type="number" min="1" step="1" value={termCount} onChange={(e) => setTermCount(e.target.value)} className="h-11" /><SearchableSelect value={termUnit} onValueChange={setTermUnit} items={[{ value: "DAYS", label: "Días" }, { value: "WEEKS", label: "Semanas" }, { value: "MONTHS", label: "Meses" }]} placeholder="Unidad" searchPlaceholder="Buscar unidad..." className="h-11 min-w-28" /></div></div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5"><Label>Interés</Label><div className="flex min-w-0 gap-2"><Input type="number" min="0" step="0.01" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} className="h-11 w-32 shrink-0 text-base" placeholder="0" /><SearchableSelect value={interestPeriod} onValueChange={setInterestPeriod} items={[{ value: "NONE", label: "Sin interés" }, { value: "ANNUAL", label: "Anual" }, { value: "MONTHLY", label: "Mensual" }, { value: "WEEKLY", label: "Semanal" }]} placeholder="Periodo" searchPlaceholder="Buscar periodo..." className="h-11 w-40 shrink-0" /></div></div>
            <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11" /></div>
          </div>
          <div className="space-y-1.5"><Label>Cuota {paymentFrequency === "WEEKLY" ? "semanal" : paymentFrequency === "BIWEEKLY" ? "quincenal" : paymentFrequency === "MONTHLY" ? "mensual" : "única"} <span className="text-xs text-muted-foreground">(opcional)</span></Label><Input type="number" min="0.01" step="0.01" value={manualInstallment} onChange={(e) => setManualInstallment(e.target.value)} placeholder={paymentPlan.calculatedInstallment ? format(paymentPlan.calculatedInstallment) : "0.00"} className="h-11 text-base" /><p className="text-xs text-muted-foreground">Al ingresarla se recalculan el total a pagar y los intereses.</p></div>
          <div className="rounded-xl border bg-muted/40 p-3 text-sm"><div className="flex justify-between"><span>Total de intereses</span><strong>{format(paymentPlan.totalInterest)}</strong></div><div className="mt-1 flex justify-between"><span>Total a pagar</span><strong>{format(paymentPlan.totalPayable)}</strong></div><div className="mt-1 flex justify-between text-primary"><span>Cuota {paymentFrequency === "WEEKLY" ? "semanal" : paymentFrequency === "BIWEEKLY" ? "quincenal" : paymentFrequency === "MONTHLY" ? "mensual" : "única"}</span><strong>{format(paymentPlan.installmentAmount)}</strong></div><p className="mt-1 text-xs text-muted-foreground">{paymentPlan.installments} cuota{paymentPlan.installments === 1 ? "" : "s"}. Interés simple calculado según el periodo seleccionado.</p></div>
          <div className="space-y-3 rounded-xl border p-3"><label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={autoPaymentEnabled} onChange={(event) => setAutoPaymentEnabled(event.target.checked)} />Activar abonos automáticos</label>{autoPaymentEnabled && <><div className="space-y-1.5"><Label>Cuenta de donde se debitará</Label><SearchableSelect value={autoPaymentAccount} onValueChange={setAutoPaymentAccount} items={accounts.map((account: any) => ({ value: String(account.id), label: account.name }))} placeholder="Seleccionar cuenta..." searchPlaceholder="Buscar cuenta..." className="h-11 w-full" /></div><div className="space-y-1.5"><Label>Día del mes</Label><Input type="number" min="1" max="31" step="1" value={autoPaymentDay} onChange={(event) => setAutoPaymentDay(event.target.value)} placeholder="Ej: 15" className="h-11" /><p className="text-xs text-muted-foreground">El abono se intentará ese día de cada mes.</p></div><p className="text-xs text-muted-foreground">Se debitará automáticamente el valor de la cuota según la frecuencia seleccionada.</p></>}</div>
        </>}
        {tab === "receivable" && <div className="space-y-1.5"><Label>Fecha de vencimiento <span className="text-xs text-muted-foreground">(opcional)</span></Label><Input name="due_date" type="date" className="h-11" /></div>}
      </ResponsiveModal>

      <ResponsiveModal
        open={Boolean(target)}
        onOpenChange={(open) => { if (!open) { setTarget(null); setPaymentAmount(""); setPaymentAccount(""); setPaymentType("INSTALLMENT"); } }}
        title={`Registrar ${target?.type === "receivable" ? "cobro" : "pago"}`}
        icon={target?.type === "receivable" ? ArrowDownToLine : ArrowUpFromLine}
        footer={<><Button type="button" variant="outline" onClick={() => setTarget(null)} disabled={isPaying} className="flex-1 h-11">Cancelar</Button><Button type="button" onClick={registerPayment} disabled={!paymentAmount || !paymentAccount} loading={isPaying} className="flex-1 h-11">Registrar</Button></>}
      >
        {target?.type === "payable" && <div className="space-y-1.5"><Label>Tipo de pago</Label><SearchableSelect value={paymentType} onValueChange={setPaymentType} items={[{ value: "INSTALLMENT", label: "Pago de cuota" }, { value: "CAPITAL", label: "Pago a capital" }]} placeholder="Seleccionar tipo..." searchPlaceholder="Buscar tipo..." className="h-11 w-full" /></div>}
        <div className="space-y-1.5"><Label>Monto <span className="text-destructive text-xs">*</span></Label><Input type="number" min="0.01" max={target?.type === "payable" && paymentType === "CAPITAL" ? target.principalBalance : target?.balance} step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="h-11" /></div>
        <div className="space-y-1.5"><Label>Cuenta financiera <span className="text-destructive text-xs">*</span></Label><SearchableSelect value={paymentAccount} onValueChange={setPaymentAccount} items={accounts.map((a: any) => ({ value: a.id.toString(), label: a.name }))} placeholder="Seleccionar..." searchPlaceholder="Buscar cuenta..." className="h-11 w-full" /></div>
        {target && <p className="text-sm text-muted-foreground">{target.type === "payable" && paymentType === "CAPITAL" ? <>Capital pendiente: <strong>{format(target.principalBalance ?? 0)}</strong></> : <>Saldo pendiente: <strong>{format(target.balance)}</strong></>}</p>}
      </ResponsiveModal>

      <ResponsiveModal open={Boolean(selectedOwner)} onOpenChange={(open) => { if (!open) setSelectedOwner(null); }} title={selectedOwner?.name ?? "Detalle"} width="wide">
        {selectedOwner && <div className="space-y-4">
          <SummaryStats ariaLabel={`Resumen de ${selectedOwner.name}`} columns="three" compact items={[
            { label: "Total", icon: tab === "receivable" ? ArrowDownToLine : ArrowUpFromLine, value: format(selectedOwner.total) },
            { label: tab === "receivable" ? "Cobrado" : "Pagado", icon: CheckCircle, value: format(selectedOwner.paid), valueClassName: "text-green-600" },
            { label: "Saldo", icon: Clock, value: format(selectedOwner.balance), valueClassName: "text-amber-600" },
          ]} />
          <div><h3 className="text-sm font-semibold">Historial de cuentas</h3><p className="text-xs text-muted-foreground">Incluye cuentas pendientes y pagadas.</p></div>
          <div className="divide-y rounded-xl border">
            {selectedOwner.accounts.map((account: any) => <button key={account.id} type="button" onClick={() => router.push(`/finances/receivables-payables/${tab === "receivable" ? "cobrar" : "pagar"}/${account.id}`)} className="flex w-full items-center gap-3 p-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{account.description}</p>{statusBadge(account)}</div><p className="mt-1 text-xs text-muted-foreground">{account.due_date ? `Vence ${new Date(`${account.due_date}T12:00:00`).toLocaleDateString("es-HN")}` : "Sin fecha de vencimiento"}</p></div>
              <div className="shrink-0 text-right"><p className="text-sm font-semibold text-amber-700">{format(getBalance(account))}</p><p className="text-xs text-muted-foreground">de {format(getTotal(account))}</p></div>
            </button>)}
          </div>
        </div>}
      </ResponsiveModal>

    </div>
  );
}
