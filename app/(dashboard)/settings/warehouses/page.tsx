// app/(dashboard)/settings/warehouses/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMe } from "@/hooks/swr/use-me";
import { formatInTZ, useTimezone } from "@/hooks/swr/use-timezone";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { useFeatures } from "@/hooks/use-features";
import {
  useWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
  useWarehouseTransfers,
  useCreateWarehouseTransfer,
  useWarehouseStock,
} from "@/hooks/swr/use-warehouses";

import { Button }   from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Badge }    from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import {
  DATA_TABLE_PAGE_SIZE_OPTIONS,
  DEFAULT_DATA_TABLE_PAGE_SIZE,
  DataTableTimeSection,
  type DataTableTimeSectionColumn,
} from "@/components/shared/data-table-time-section";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Plus, MoreHorizontal, Loader2,
  Star, ArrowRightLeft, ArrowLeftRight, Package, Trash2,
} from "lucide-react";

// ── Create warehouse dialog ─────────────────────────────────────────────

function CreateWarehouseDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const { createWarehouse, isCreating } = useCreateWarehouse();
  const [name, setName] = useState("");

  const handleClose = () => { setName(""); onClose(); };

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("El nombre es requerido"); return; }
    try {
      await createWarehouse(name.trim());
      toast.success("Bodega creada");
      onCreated();
      handleClose();
    } catch (err: any) {
      toast.error(err.message || "Error al crear la bodega");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nueva bodega</DialogTitle>
          <DialogDescription>Agrega una ubicación para administrar el inventario.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-1">
          <Label htmlFor="wh-name">Nombre <span className="text-destructive">*</span></Label>
          <Input
            id="wh-name"
            placeholder="Ej: Bodega 2, Local Centro..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isCreating}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isCreating} className="gap-2">
            {isCreating && <Loader2 className="size-3.5 animate-spin" />}
            Crear bodega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rename warehouse dialog ──────────────────────────────────────────────

function RenameWarehouseDialog({ warehouse, onClose, onRenamed }: {
  warehouse: { id: number; name: string } | null;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const { updateWarehouse, isUpdating } = useUpdateWarehouse();
  const [name, setName] = useState(warehouse?.name ?? "");

  const handleSave = async () => {
    if (!warehouse || !name.trim()) return;
    try {
      await updateWarehouse(warehouse.id, { name: name.trim() });
      toast.success("Bodega renombrada");
      onRenamed();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Error al renombrar");
    }
  };

  return (
    <Dialog open={!!warehouse} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Renombrar bodega</DialogTitle>
          <DialogDescription>Actualiza el nombre visible de esta ubicación.</DialogDescription>
        </DialogHeader>
        {warehouse && (
          <div className="space-y-1.5 py-1">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isUpdating} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUpdating}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isUpdating || !name.trim()} className="gap-2">
            {isUpdating && <Loader2 className="size-3.5 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Transfer form ─────────────────────────────────────────────────────────

function TransferStockCard({ warehouses }: { warehouses: { id: number; name: string }[] }) {
  const { createTransfer, isCreating } = useCreateWarehouseTransfer();
  const { canViewMovements } = useFeatures();
  const { mutate: mutateTransfers } = useWarehouseTransfers(canViewMovements);

  const [fromId,    setFromId]    = useState("");
  const [toId,      setToId]      = useState("");
  const [lines, setLines] = useState<{ id: number; productKey: string; quantity: string }[]>([
    { id: 1, productKey: "", quantity: "1" },
  ]);
  const [notes,     setNotes]     = useState("");

  const { stock, mutate: mutateStock } = useWarehouseStock(fromId ? Number(fromId) : null);
  const keyOf = (s: { product_id: number; variant_id: number | null }) =>
    s.variant_id ? `v${s.variant_id}` : `p${s.product_id}`;
  const resetLines = () => setLines([{ id: 1, productKey: "", quantity: "1" }]);

  const reset = () => {
    resetLines(); setNotes("");
  };

  const handleSubmit = async () => {
    if (!fromId || !toId) { toast.error("Elegí ambas bodegas"); return; }
    if (fromId === toId)  { toast.error("Las bodegas deben ser diferentes"); return; }
    const selectedLines = lines.filter((line) => line.productKey);
    if (!selectedLines.length) { toast.error("Elegí al menos un producto"); return; }
    const items = [];
    for (const line of selectedLines) {
      const selectedItem = stock.find((s) => keyOf(s) === line.productKey);
      const qty = Number(line.quantity);
      if (!selectedItem) { toast.error("Elegí un producto válido"); return; }
      if (!Number.isInteger(qty) || qty < 1) { toast.error("La cantidad debe ser al menos 1"); return; }
      if (qty > selectedItem.stock) {
        toast.error(`Solo hay ${selectedItem.stock} disponibles en la bodega de origen`);
        return;
      }
      items.push({ product_id: selectedItem.product_id, variant_id: selectedItem.variant_id, quantity: qty });
    }

    try {
      await createTransfer({
        from_warehouse_id: Number(fromId),
        to_warehouse_id:   Number(toId),
        notes: notes.trim() || undefined,
        items,
      });
      toast.success("Transferencia registrada");
      reset();
      mutateTransfers();
      mutateStock();
    } catch (err: any) {
      toast.error(err.message || "Error al registrar la transferencia");
    }
  };

  if (warehouses.length < 2) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowRightLeft className="size-4 text-muted-foreground" />
            Transferir stock
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Necesitás al menos 2 bodegas activas para transferir stock entre ellas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Nueva transferencia de stock</CardTitle>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-medium">1</span>
          Define el origen y destino del movimiento
        </p>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-1.5">
            <Label className="text-xs">Bodega de origen</Label>
            <Select value={fromId} onValueChange={(v) => { setFromId(v); resetLines(); }} disabled={isCreating}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Selecciona una bodega" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={String(w.id)} disabled={String(w.id) === toId}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 border-primary text-primary"
            aria-label="Intercambiar bodegas"
            onClick={() => { setFromId(toId); setToId(fromId); resetLines(); }}
            disabled={isCreating || !fromId || !toId}
          >
            <ArrowLeftRight className="size-4" />
          </Button>
          <div className="space-y-1.5">
            <Label className="text-xs">Bodega de destino</Label>
            <Select value={toId} onValueChange={setToId} disabled={isCreating}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Selecciona una bodega" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={String(w.id)} disabled={String(w.id) === fromId}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t pt-5">
          <Label className="text-xs">Producto</Label>
          <div className="mt-3 space-y-3">
            {lines.map((line, index) => {
              const selectedItem = stock.find((s) => keyOf(s) === line.productKey);
              const selectedElsewhere = new Set(lines.filter((other) => other.id !== line.id).map((other) => other.productKey));
              const availableItems = stock
                .filter((s) => !selectedElsewhere.has(keyOf(s)))
                .map((s) => ({ value: keyOf(s), label: `${s.product_name}${s.variant_name ? ` — ${s.variant_name}` : ""}` }));
              return (
                <div key={line.id} className="grid items-center gap-3 md:grid-cols-[100px_minmax(0,1fr)_110px_auto_auto]">
                  <div className="flex h-10 items-center justify-center gap-3 rounded-xl border px-2">
                    <button type="button" className="text-muted-foreground" onClick={() => setLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: String(Math.max(1, Number(item.quantity) - 1)) } : item))} disabled={isCreating || Number(line.quantity) <= 1}>−</button>
                    <span className="text-sm tabular-nums">{line.quantity}</span>
                    <button type="button" className="text-muted-foreground" onClick={() => setLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: String(Math.min(selectedItem?.stock ?? 1, Number(item.quantity) + 1)) } : item))} disabled={isCreating || !selectedItem || Number(line.quantity) >= selectedItem.stock}>+</button>
                  </div>
                  <SearchableSelect
                    value={line.productKey}
                    onValueChange={(value) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, productKey: value, quantity: "1" } : item))}
                    disabled={isCreating || !fromId}
                    placeholder={fromId ? "Agregar producto..." : "Selecciona primero el origen"}
                    searchPlaceholder="Buscar producto..."
                    className="h-10 w-full"
                    items={availableItems}
                  />
                  <span className="text-sm text-muted-foreground">{selectedItem ? `${selectedItem.stock} disponibles` : "—"}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label="Quitar producto" onClick={() => setLines((current) => current.length === 1 ? [{ ...current[0], productKey: "", quantity: "1" }] : current.filter((item) => item.id !== line.id))} disabled={isCreating}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                  {/* El boton vive en la ultima fila; en las demas queda un hueco invisible para alinear columnas */}
                  <Button
                    type="button"
                    variant="outline"
                    className={cn("h-10 gap-1.5 whitespace-nowrap", index !== lines.length - 1 && "hidden md:inline-flex md:invisible")}
                    aria-hidden={index !== lines.length - 1}
                    tabIndex={index !== lines.length - 1 ? -1 : undefined}
                    onClick={() => setLines((current) => [...current, { id: Math.max(...current.map((item) => item.id), 0) + 1, productKey: "", quantity: "1" }])}
                    disabled={isCreating || !fromId}
                  >
                    <Plus className="size-3.5" /> Agregar producto
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Nota</Label>
          <Input placeholder="Motivo del traslado" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isCreating} className="h-12" />
        </div>

        <Button onClick={handleSubmit} disabled={isCreating} className="h-11 w-full gap-2">
          {isCreating && <Loader2 className="size-3.5 animate-spin" />}
          Transferir
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function WarehousesPage() {
  const { back } = useRouter();
  const { isLoading: meLoading } = useMe();
  const { can_edit: canEditWarehouses, isLoading: permLoading } = useModulePermissions("ADMIN", "WAREHOUSES");
  const { warehouses, isLoading: whLoading, mutate } = useWarehouses();
  const { updateWarehouse } = useUpdateWarehouse();
  const { canViewMovements, canAdjustInventory } = useFeatures();
  const { transfers, isLoading: transfersLoading } = useWarehouseTransfers(canViewMovements);
  const timezone = useTimezone();

  const [showCreate, setShowCreate] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [transferPage, setTransferPage] = useState(1);
  const [transferPageSize, setTransferPageSize] = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);

  const isLoading = meLoading || whLoading || permLoading;

  const handleSetDefault = async (id: number) => {
    try {
      await updateWarehouse(id, { is_default: true });
      toast.success("Bodega por defecto actualizada");
      mutate();
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar");
    }
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await updateWarehouse(id, { is_active: !isActive });
      toast.success(isActive ? "Bodega desactivada" : "Bodega reactivada");
      mutate();
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 pb-24 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const activeWarehouses = warehouses.filter((w) => w.is_active);
  const paginatedTransfers = transfers.slice(
    (transferPage - 1) * transferPageSize,
    transferPage * transferPageSize,
  );
  const transferColumns: DataTableTimeSectionColumn<(typeof transfers)[number]>[] = [
    {
      id: "time", header: "Hora", width: 90,
      cell: (transfer) => formatInTZ(transfer.created_at, timezone, { hour: "2-digit", minute: "2-digit" }),
    },
    {
      id: "route", header: "Origen → Destino", width: "clamp(12rem, 24vw, 18rem)",
      cell: (transfer) => <span className="inline-flex items-center gap-1 font-medium">{transfer.from_warehouse_name}<ArrowRightLeft className="size-3 shrink-0 text-muted-foreground" />{transfer.to_warehouse_name}</span>,
    },
    {
      id: "items", header: "Productos",
      cell: (transfer) => <div className="space-y-0.5 text-xs text-muted-foreground">{transfer.items.map((item, index) => <p key={index}>{item.quantity} × {item.product_name}{item.variant_name ? ` (${item.variant_name})` : ""}</p>)}</div>,
    },
    {
      id: "units", header: "Unidades", width: 90, align: "right", className: "font-medium tabular-nums",
      cell: (transfer) => transfer.items.reduce((sum, item) => sum + Number(item.quantity), 0),
    },
    {
      id: "notes", header: "Notas", width: "clamp(8rem, 18vw, 14rem)",
      cell: (transfer) => <span className="block truncate" title={transfer.notes ?? undefined}>{transfer.notes || "-"}</span>,
    },
  ];
  const transferDateKey = (transfer: (typeof transfers)[number]) => formatInTZ(transfer.created_at, timezone, { year: "numeric", month: "2-digit", day: "2-digit" });
  const renderTransferDate = (_key: string, rows: readonly (typeof transfers)[number][]) => formatInTZ(rows[0].created_at, timezone, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:h-full lg:min-h-0 md:gap-6">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => back()}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bodegas</h1>
            <p className="text-muted-foreground text-sm">
              Dónde vive físicamente tu inventario.
            </p>
          </div>
        </div>
        {canEditWarehouses && (
          <Button size="sm" className="gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" />
            Nueva bodega
          </Button>
        )}
      </div>

      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden lg:items-start">
        <Card className="shrink-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mis bodegas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {warehouses.filter((w) => w.is_active).map((w) => (
              <div key={w.id} className="rounded-xl bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{w.name}</p>
                    {w.is_default && <Star className="size-3.5 fill-primary text-primary" />}
                  </div>
                  {canEditWarehouses && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7"><MoreHorizontal className="size-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => setRenaming({ id: w.id, name: w.name })}>Renombrar</DropdownMenuItem>
                        {!w.is_default && <DropdownMenuItem onClick={() => handleSetDefault(w.id)}>Marcar como default</DropdownMenuItem>}
                        {!w.is_default && <DropdownMenuItem onClick={() => handleToggleActive(w.id, true)}>Desactivar</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 divide-x border-t pt-2 text-xs text-muted-foreground">
                  <div><span className="block">Productos</span><strong className="text-base font-medium text-foreground">{w.product_count ?? 0}</strong></div>
                  <div className="pl-3"><span className="block">Unidades</span><strong className="text-base font-medium text-foreground">{w.unit_count ?? 0}</strong></div>
                </div>
              </div>
            ))}
            {canEditWarehouses && (
              <Button className="w-full gap-2" onClick={() => setShowCreate(true)}><Plus className="size-4" /> Nueva bodega</Button>
            )}
          </CardContent>
        </Card>

        {(canAdjustInventory || canViewMovements) && <main className="h-full space-y-5 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          {canAdjustInventory && <TransferStockCard warehouses={activeWarehouses} />}
          {canViewMovements && <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Package className="size-4 text-muted-foreground" /> Transferencias recientes</h2>
            <DataTableTimeSection
              columns={transferColumns}
              data={paginatedTransfers}
              getRowKey={(transfer) => transfer.id}
              getGroupKey={transferDateKey}
              renderGroupHeader={renderTransferDate}
              renderMobileRow={(transfer) => (
                <Card key={transfer.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{transfer.from_warehouse_name} <ArrowRightLeft className="mx-1 inline size-3 text-muted-foreground" /> {transfer.to_warehouse_name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatInTZ(transfer.created_at, timezone, { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      {transfer.items.map((item, index) => <p key={index}>{item.quantity} × {item.product_name}{item.variant_name ? ` (${item.variant_name})` : ""}</p>)}
                    </div>
                    <p className="truncate text-xs italic text-muted-foreground">{transfer.notes || "-"}</p>
                  </CardContent>
                </Card>
              )}
              isLoading={transfersLoading}
              emptyState="Sin transferencias todavía."
              recordLabel="transferencias"
              ariaLabel="Transferencias recientes"
              minWidth={760}
              stickyOffset="0px"
              showFooterPagination={false}
              pagination={{
                page: transferPage,
                pageSize: transferPageSize,
                total: transfers.length,
                onPageChange: setTransferPage,
                onPageSizeChange: (size) => { setTransferPage(1); setTransferPageSize(size); },
                pageSizeOptions: DATA_TABLE_PAGE_SIZE_OPTIONS,
              }}
            />
          </section>}
        </main>}
      </div>

      <CreateWarehouseDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => mutate()}
      />
      <RenameWarehouseDialog
        warehouse={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={() => mutate()}
      />
    </div>
  );
}
