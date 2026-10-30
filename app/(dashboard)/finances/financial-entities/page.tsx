"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { Landmark, Pencil, Plus, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fab } from "@/components/ui/fab";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { SearchBar } from "@/components/shared/search-bar";
import { DataTableTimeSection, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useModulePermissions } from "@/hooks/use-module-permissions";

type Entity = {
  id: number;
  name: string;
  entity_type: string;
  tax_id?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

const ENTITY_TYPES = [
  { value: "SUPPLIER", label: "Proveedor" },
  { value: "BANK", label: "Banco" },
  { value: "FINANCIAL_INSTITUTION", label: "Financiera" },
  { value: "PERSON", label: "Persona" },
  { value: "OTHER", label: "Otro" },
];

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar las entidades");
  return body;
};

export default function FinancialEntitiesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [deactivatingEntity, setDeactivatingEntity] = useState<Entity | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [name, setName] = useState("");
  const [type, setType] = useState("SUPPLIER");
  const [taxId, setTaxId] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const { data, mutate, isLoading } = useSWR<{ data: Entity[] }>("/api/financial-entities", fetcher);
  const { can_edit: canEdit, can_delete: canDelete } = useModulePermissions("FINANCES", "ACCOUNTS");

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setOpen(true);
    router.replace(pathname);
  }, [pathname, router, searchParams]);

  const filtered = useMemo(() => (data?.data ?? []).filter((entity) =>
    `${entity.name} ${entity.entity_type} ${entity.tax_id ?? ""} ${entity.contact_name ?? ""} ${entity.email ?? ""} ${entity.phone ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  ), [data?.data, search]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const typeLabel = (value: string) => ENTITY_TYPES.find((item) => item.value === value)?.label ?? "Otro";

  const close = () => {
    setOpen(false); setEditingEntity(null);
    setName(""); setType("SUPPLIER"); setTaxId(""); setContactName("");
    setEmail(""); setPhone(""); setAddress(""); setNotes("");
  };

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch(editingEntity ? `/api/financial-entities/${editingEntity.id}` : "/api/financial-entities", {
        method: editingEntity ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, entity_type: type, tax_id: taxId || null, contact_name: contactName || null, email: email || null, phone: phone || null, address: address || null, notes: notes || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la entidad");
      const message = editingEntity ? "Entidad actualizada" : "Entidad registrada";
      close(); await mutate(); setMessage(message); toast.success(message);
    } catch (error: any) { setMessage(error.message); toast.error(error.message || "No se pudo registrar la entidad"); }
    finally { setIsSaving(false); }
  };

  const openCreate = () => { close(); setOpen(true); };
  const openEdit = (entity: Entity) => {
    setEditingEntity(entity); setName(entity.name); setType(entity.entity_type); setTaxId(entity.tax_id ?? "");
    setContactName(entity.contact_name ?? ""); setEmail(entity.email ?? ""); setPhone(entity.phone ?? "");
    setAddress(entity.address ?? ""); setNotes(entity.notes ?? ""); setOpen(true);
  };

  const deactivate = async () => {
    if (!deactivatingEntity) return;
    try {
      const response = await fetch(`/api/financial-entities/${deactivatingEntity.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo desactivar la entidad");
      setDeactivatingEntity(null); await mutate(); setMessage("Entidad desactivada"); toast.success("Entidad desactivada");
    } catch (error: any) { setMessage(error.message); toast.error(error.message || "No se pudo desactivar la entidad"); }
  };

  const columns: DataTableTimeSectionColumn<Entity>[] = [
    { id: "name", header: "Entidad", width: "clamp(13rem, 24vw, 20rem)", cell: (entity) => <span className="block truncate font-medium" title={entity.name}>{entity.name}</span> },
    { id: "type", header: "Tipo", width: 170, cell: (entity) => <span>{typeLabel(entity.entity_type)}</span> },
    { id: "contact", header: "Contacto", width: "clamp(12rem, 22vw, 18rem)", cell: (entity) => <div className="min-w-0"><p className="truncate">{entity.contact_name || "—"}</p><p className="truncate text-xs text-muted-foreground">{entity.email || entity.phone || "Sin datos de contacto"}</p></div> },
    { id: "location", header: "Dirección", width: "clamp(12rem, 24vw, 20rem)", cell: (entity) => <span className="block truncate" title={entity.address ?? ""}>{entity.address || "—"}</span> },
    { id: "tax", header: "RTN / ID", width: 150, cell: (entity) => <span>{entity.tax_id || "—"}</span> },
    { id: "actions", header: "Acciones", width: 110, align: "right", stopRowClick: true, cell: (entity) => <div className="flex justify-end gap-1">{canEdit && <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${entity.name}`} onClick={() => openEdit(entity)}><Pencil className="size-4" /></Button></TooltipTrigger><TooltipContent>Editar</TooltipContent></Tooltip>}{canDelete && <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Desactivar ${entity.name}`} onClick={() => setDeactivatingEntity(entity)}><PowerOff className="size-4" /></Button></TooltipTrigger><TooltipContent>Desactivar</TooltipContent></Tooltip>}</div> },
  ];

  return (
    <div className="space-y-5 pb-24">
      <div><h1 className="text-2xl font-semibold">Entidades financieras</h1><p className="text-sm text-muted-foreground">Proveedores, bancos, financieras y personas relacionadas con tus obligaciones.</p></div>
      <SearchBar value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Buscar entidades..." />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      <DataTableTimeSection
        columns={columns}
        data={paged}
        getRowKey={(entity) => entity.id}
        renderMobileRow={(entity) => <div className="space-y-1 rounded-xl border p-3"><p className="font-medium">{entity.name}</p><p className="text-sm text-muted-foreground">{typeLabel(entity.entity_type)} · {entity.contact_name || "Sin contacto"}</p><p className="text-xs text-muted-foreground">{entity.email || entity.phone || entity.address || "Sin información adicional"}</p></div>}
        isLoading={isLoading}
        emptyState={<div className="flex flex-col items-center justify-center gap-2 py-8"><Landmark className="size-10 text-muted-foreground/40" /><span>No hay entidades registradas</span></div>}
        recordLabel={filtered.length === 1 ? "entidad" : "entidades"}
        ariaLabel="Entidades financieras"
        minWidth={850}
        stickyOffset="var(--data-table-sticky-offset)"
        className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]"
        showFooterPagination={false}
        pagination={{ page, pageSize, total: filtered.length, onPageChange: setPage, onPageSizeChange: (size) => { setPage(1); setPageSize(size); } }}
      />
      <Fab actions={[{ label: "Nueva entidad", icon: Plus, onClick: openCreate }]} />
      <ResponsiveModal open={open} onOpenChange={(value) => !value && close()} title={editingEntity ? "Editar entidad financiera" : "Nueva entidad financiera"} icon={editingEntity ? Pencil : Landmark} width="wide" as="form" formProps={{ id: "create-financial-entity-form", onSubmit: create }} footer={<><Button type="button" variant="outline" onClick={close} disabled={isSaving} className="flex-1 h-11">Cancelar</Button><Button type="submit" form="create-financial-entity-form" disabled={!name.trim()} loading={isSaving} className="flex-1 h-11">{editingEntity ? "Guardar cambios" : "Registrar entidad"}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Nombre de la entidad <span className="text-destructive text-xs">*</span></Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Banco, proveedor o financiera" required className="h-11" /></div>
          <div className="space-y-1.5"><Label>Tipo</Label><SearchableSelect value={type} onValueChange={setType} items={ENTITY_TYPES} placeholder="Seleccionar tipo..." searchPlaceholder="Buscar tipo..." className="h-11 w-full" /></div>
          <div className="space-y-1.5"><Label>RTN / identificación</Label><Input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="h-11" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Nombre del contacto</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Persona de contacto" className="h-11" /></div>
          <div className="space-y-1.5"><Label>Correo</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" /></div>
          <div className="space-y-1.5"><Label>Teléfono</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Dirección</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección física o fiscal" className="h-11" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Información adicional" className="h-11" /></div>
        </div>
      </ResponsiveModal>
      <ConfirmDialog open={Boolean(deactivatingEntity)} onOpenChange={(value) => !value && setDeactivatingEntity(null)} title="¿Desactivar entidad?" description={`${deactivatingEntity?.name ?? "La entidad"} dejará de aparecer en nuevos registros, pero se conservará en las cuentas históricas.`} confirmLabel="Desactivar" variant="warning" onConfirm={deactivate} />
    </div>
  );
}
