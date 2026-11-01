"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Eye, History, MoreHorizontal, Pencil, Plus, ShoppingCart, Trash2, TrendingUp, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Fab } from "@/components/ui/fab";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { SearchBar } from "@/components/shared/search-bar";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { DataTableTimeSection } from "@/components/shared/data-table-time-section";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SummaryStats } from "@/components/shared/summary-stats";
import { useCustomers } from "@/hooks/swr/use-costumers";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useModulePermissions } from "@/hooks/use-module-permissions";

const ROLES = [
  { value: "ALL", label: "Todas" }, { value: "CLIENT", label: "Clientes" },
  { value: "SUPPLIER", label: "Proveedores" }, { value: "THIRD_PARTY", label: "Terceros" },
  { value: "CONTACT", label: "Contactos" },
];
const ROLE_LABELS: Record<string, string> = { CLIENT: "Cliente", SUPPLIER: "Proveedor", THIRD_PARTY: "Tercero", CONTACT: "Contacto" };
const fetcher = async (url: string) => { const response = await fetch(url); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar las personas"); return body; };

export default function PeoplePage() {
  const { push } = useRouter();
  const [role, setRole] = useState("ALL");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<any | null>(null);
  const [deletingPerson, setDeletingPerson] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [newRole, setNewRole] = useState("THIRD_PARTY");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [totalOrders, setTotalOrders] = useState("0");
  const [totalSpent, setTotalSpent] = useState("0");
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { format, symbol } = useCurrency();
  const { mutate: mutateCache } = useSWRConfig();
  const { can_edit: canEdit, can_delete: canDelete } = useModulePermissions("CUSTOMERS");
  const { stats: customerStats, isLoading: customerStatsLoading } = useCustomers({ limit: 1 });
  const query = new URLSearchParams();
  if (role !== "ALL") query.set("role", role);
  if (search) query.set("search", search);
  query.set("page", String(page)); query.set("limit", String(pageSize));
  const { data, isLoading, mutate } = useSWR<{ data: any[]; total: number }>(`/api/people?${query}`, fetcher);
  const people = data?.data ?? [];

  const reset = () => { setEditingPerson(null); setName(""); setNewRole("THIRD_PARTY"); setEmail(""); setPhone(""); setNotes(""); setTotalOrders("0"); setTotalSpent("0"); };
  const edit = (person: any) => { setEditingPerson(person); setName(person.name ?? ""); setNewRole(person.roles?.[0] ?? "THIRD_PARTY"); setEmail(person.email ?? ""); setPhone(person.phone ?? ""); setNotes(person.notes ?? ""); setTotalOrders(String(person.total_orders ?? 0)); setTotalSpent(String(person.total_spent ?? 0)); setOpen(true); };
  const remove = async () => { if (!deletingPerson) return; try { const response = await fetch(`/api/people/${deletingPerson.id}`, { method: "DELETE" }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "No se pudo eliminar"); toast.success("Persona eliminada"); setDeletingPerson(null); await mutateCache((key) => typeof key === "string" && (key.startsWith("/api/people") || key.startsWith("/api/customers")), undefined, { revalidate: true }); } catch (error: any) { toast.error(error.message ?? "No se pudo eliminar"); } };
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setIsSaving(true);
    try {
      const response = await fetch(editingPerson ? `/api/people/${editingPerson.id}` : "/api/people", { method: editingPerson ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, role: newRole, email: email || null, phone: phone || null, notes: notes || null, total_orders: Number(totalOrders), total_spent: Number(totalSpent) }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "No se pudo registrar");
      toast.success(editingPerson ? "Persona actualizada" : newRole === "CLIENT" ? "Cliente registrado" : "Persona registrada"); setOpen(false); reset(); await mutate();
    } catch (error: any) { toast.error(error.message ?? "No se pudo registrar"); } finally { setIsSaving(false); }
  };
  const renderPersonActions = (person: any) => <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Acciones de ${person.name}`} onClick={(event) => event.stopPropagation()}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-44">{person.source_customer_id && <DropdownMenuItem onClick={() => push(`/customers/${person.source_customer_id}`)} className="gap-2 cursor-pointer"><Eye className="size-4" />Ver resumen</DropdownMenuItem>}{canEdit && <DropdownMenuItem onClick={() => edit(person)} className="gap-2 cursor-pointer"><Pencil className="size-4" />Editar</DropdownMenuItem>}{canDelete && <><DropdownMenuSeparator /><DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => setDeletingPerson(person)}><Trash2 className="size-4" />Eliminar</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>;
  const columns = [
    { id: "name", header: "Persona", width: "clamp(13rem, 28vw, 22rem)", cell: (person: any) => <span className="font-medium">{person.name}</span> },
    { id: "roles", header: "Roles", width: "clamp(12rem, 28vw, 22rem)", cell: (person: any) => <div className="flex flex-wrap gap-1">{(person.roles ?? []).map((item: string) => <Badge key={item} variant="secondary">{ROLE_LABELS[item] ?? item}</Badge>)}</div> },
    { id: "contact", header: "Contacto", width: "clamp(13rem, 28vw, 22rem)", cell: (person: any) => <div><p>{person.email || "—"}</p><p className="text-xs text-muted-foreground">{person.phone || "Sin teléfono"}</p></div> },
    ...(role === "CLIENT" ? [{ id: "orders", header: "Órdenes", width: 100, align: "right" as const, cell: (person: any) => person.total_orders ?? 0 }, { id: "spent", header: "Total gastado", width: 140, align: "right" as const, cell: (person: any) => format(Number(person.total_spent ?? 0)) }] : []),
    { id: "actions", header: <span className="sr-only">Acciones</span>, width: 70, align: "right" as const, stopRowClick: true, cell: (person: any) => renderPersonActions(person) },
  ];

  return (
    <div className="space-y-5 pb-24">
      <div><h1 className="text-2xl font-semibold">Personas</h1><p className="text-sm text-muted-foreground">Clientes, proveedores, terceros y contactos relacionados con tu negocio.</p></div>
      <Tabs value={role} onValueChange={setRole}><TabsList className="max-w-full gap-1.5 overflow-x-auto rounded-xl border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{ROLES.map((item) => <TabsTrigger key={item.value} value={item.value} className="rounded-xl border-0 px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-primary/15 hover:text-primary data-[state=active]:bg-primary/15 data-[state=active]:font-medium data-[state=active]:text-primary">{item.label}</TabsTrigger>)}</TabsList></Tabs>
      {role === "CLIENT" && <SummaryStats ariaLabel="Resumen de clientes" isLoading={customerStatsLoading} items={[{ label: "Total clientes", icon: Users, value: customerStats.total_customers, detail: "registrados" }, { label: "Total órdenes", icon: ShoppingCart, value: customerStats.total_orders, detail: "ventas realizadas" }, { label: "Total facturado", icon: TrendingUp, value: format(customerStats.total_spent), detail: "a clientes registrados" }]} />}
      <SearchBar value={search} onChange={setSearch} placeholder="Buscar personas..." />
      <DataTableTimeSection columns={columns} data={people} getRowKey={(person) => person.id} isLoading={isLoading} emptyState="No hay personas en esta categoría" recordLabel={role === "ALL" ? "personas" : (ROLES.find((item) => item.value === role)?.label.toLowerCase() ?? "personas")} ariaLabel="Personas" minWidth={role === "CLIENT" ? 900 : 700} stickyOffset="var(--data-table-sticky-offset)" className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]" showFooterPagination={false} pagination={{ page, pageSize, total: data?.total ?? 0, onPageChange: setPage, onPageSizeChange: (size) => { setPage(1); setPageSize(size); } }} renderMobileRow={(person) => <div className="rounded-xl border bg-card p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0 flex-1"><p className="font-medium">{person.name}</p><p className="truncate text-sm text-muted-foreground">{person.phone || person.email || "Sin contacto"}</p></div>{role === "CLIENT" && <div className="flex shrink-0 items-center gap-4 text-right"><div><p className="text-xs text-muted-foreground">Órdenes</p><p className="font-bold">{person.total_orders ?? 0}</p></div><div><p className="text-xs text-muted-foreground">Gastado</p><p className="font-bold text-primary">{format(Number(person.total_spent ?? 0))}</p></div>{renderPersonActions(person)}</div>}{role !== "CLIENT" && renderPersonActions(person)}</div></div>} />
      <Fab actions={[{ label: "Nueva persona", icon: Plus, onClick: () => { reset(); setOpen(true); } }]} />
      <ResponsiveModal open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset(); }} title={editingPerson ? "Editar persona" : newRole === "CLIENT" ? "Nuevo cliente" : "Nueva persona"} icon={editingPerson ? Pencil : UserPlus} width="wide" as="form" formProps={{ id: "create-person-form", onSubmit: create }} footer={<><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving} className="flex-1 h-11">Cancelar</Button><Button type="submit" form="create-person-form" loading={isSaving} disabled={!name.trim()} className="flex-1 h-11 gap-2">{!isSaving && (editingPerson ? <Pencil className="size-4" /> : <UserPlus className="size-4" />)}{isSaving ? "Guardando…" : editingPerson ? "Guardar cambios" : newRole === "CLIENT" ? "Crear cliente" : "Registrar persona"}</Button></>}>
        <div className="space-y-5">
          <div className="space-y-1.5"><Label className="text-sm font-medium">Nombre <span className="text-destructive text-xs">*</span></Label><Input value={name} onChange={(event) => setName(event.target.value)} disabled={isSaving} className="h-11 text-base" /></div>
          <div className="space-y-1.5"><Label className="text-sm font-medium">Rol</Label><SearchableSelect value={newRole} onValueChange={setNewRole} items={ROLES.filter((item) => item.value !== "ALL")} placeholder="Seleccionar rol..." searchPlaceholder="Buscar rol..." className="h-11 w-full" /></div>
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label className="text-sm font-medium">Teléfono <span className="text-xs text-muted-foreground font-normal">opcional</span></Label><Input placeholder="+504 9999-9999" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={isSaving} className="h-11 text-base" /></div><div className="space-y-1.5"><Label className="text-sm font-medium">Email <span className="text-xs text-muted-foreground font-normal">opcional</span></Label><Input type="email" placeholder="correo@email.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={isSaving} className="h-11 text-base" /></div></div>
          <div className="space-y-1.5"><Label className="text-sm font-medium">Notas <span className="text-xs text-muted-foreground font-normal">opcional</span></Label><Textarea placeholder="Observaciones de la persona..." rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={isSaving} className="resize-none text-base" /></div>
          {newRole === "CLIENT" && <div className="space-y-3 rounded-xl border p-4"><div className="flex items-center gap-1.5"><History className="size-3.5 text-muted-foreground" /><p className="text-sm font-medium">Historial previo</p><span className="text-xs text-muted-foreground font-normal">opcional</span></div><p className="-mt-1 text-xs leading-relaxed text-muted-foreground">Si este cliente ya te compraba antes de usar el sistema, indicá cuánto lleva acumulado. Las ventas nuevas se sumarán a estos valores.</p><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label className="text-sm font-medium">Órdenes previas</Label><Input type="number" step="1" min="0" placeholder="0" value={totalOrders} onChange={(event) => setTotalOrders(event.target.value)} disabled={isSaving} className="h-11 text-base" /></div><div className="space-y-1.5"><Label className="text-sm font-medium">Total comprado</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">{symbol}</span><Input type="number" step="0.01" min="0" placeholder="0.00" value={totalSpent} onChange={(event) => setTotalSpent(event.target.value)} disabled={isSaving} className="h-11 pl-8 text-base" /></div></div></div></div>}
        </div>
      </ResponsiveModal>
      <ConfirmDialog open={Boolean(deletingPerson)} onOpenChange={(value) => !value && setDeletingPerson(null)} title="¿Eliminar persona?" description={`${deletingPerson?.name ?? "Esta persona"} dejará de aparecer en Personas, pero se conservarán sus registros históricos.`} confirmLabel="Eliminar" variant="danger" onConfirm={remove} />
    </div>
  );
}
