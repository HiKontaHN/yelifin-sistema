// app/(dashboard)/settings/warehouses/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useMe } from "@/hooks/swr/use-me";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import {
  useWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
  useWarehouseTransfers,
  useCreateWarehouseTransfer,
  useWarehouseStock,
} from "@/hooks/swr/use-warehouses";

import { Button }   from "@/components/ui/button";
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
import { CreateProductDialog } from "@/components/products/create-product-dialog";
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
  const { mutate: mutateTransfers } = useWarehouseTransfers();

  const [fromId,    setFromId]    = useState("");
  const [toId,      setToId]      = useState("");
  const [productKey, setProductKey] = useState(""); // "p123" o "v456"
  const [quantity,  setQuantity]  = useState("1");
  const [notes,     setNotes]     = useState("");
  const [createProductOpen, setCreateProductOpen] = useState(false);

  const { stock, mutate: mutateStock } = useWarehouseStock(fromId ? Number(fromId) : null);
  const keyOf = (s: { product_id: number; variant_id: number | null }) =>
    s.variant_id ? `v${s.variant_id}` : `p${s.product_id}`;
  const selectedItem = stock.find((s) => keyOf(s) === productKey);

  const reset = () => {
    setProductKey(""); setQuantity("1"); setNotes("");
  };

  const handleSubmit = async () => {
    if (!fromId || !toId) { toast.error("Elegí ambas bodegas"); return; }
    if (fromId === toId)  { toast.error("Las bodegas deben ser diferentes"); return; }
    if (!selectedItem) { toast.error("Elegí un producto"); return; }
    const qty = Number(quantity);
    if (!qty || qty < 1)  { toast.error("La cantidad debe ser al menos 1"); return; }
    if (qty > selectedItem.stock) { toast.error(`Solo hay ${selectedItem.stock} disponibles en la bodega de origen`); return; }

    try {
      await createTransfer({
        from_warehouse_id: Number(fromId),
        to_warehouse_id:   Number(toId),
        notes: notes.trim() || undefined,
        items: [{ product_id: selectedItem.product_id, variant_id: selectedItem.variant_id, quantity: qty }],
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
            <Select value={fromId} onValueChange={(v) => { setFromId(v); setProductKey(""); setQuantity("1"); }} disabled={isCreating}>
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
            onClick={() => { setFromId(toId); setToId(fromId); setProductKey(""); }}
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
          <div className="mt-3 grid items-center gap-3 md:grid-cols-[100px_minmax(0,1fr)_110px_auto_auto]">
            <div className="flex h-10 items-center justify-center gap-3 rounded-xl border px-2">
              <button type="button" className="text-muted-foreground" onClick={() => setQuantity(String(Math.max(1, Number(quantity) - 1)))} disabled={isCreating || Number(quantity) <= 1}>−</button>
              <span className="text-sm tabular-nums">{quantity}</span>
              <button type="button" className="text-muted-foreground" onClick={() => setQuantity(String(Math.min(selectedItem?.stock ?? 1, Number(quantity) + 1)))} disabled={isCreating || !selectedItem || Number(quantity) >= selectedItem.stock}>+</button>
            </div>
            <SearchableSelect
              value={productKey}
              onValueChange={(value) => { setProductKey(value); setQuantity("1"); }}
              disabled={isCreating || !fromId}
              placeholder={fromId ? "Agregar producto..." : "Selecciona primero el origen"}
              searchPlaceholder="Buscar producto..."
              className="h-10 w-full"
              items={stock.map((s) => ({ value: keyOf(s), label: `${s.product_name}${s.variant_name ? ` — ${s.variant_name}` : ""}` }))}
            />
            <span className="text-sm text-muted-foreground">{selectedItem ? `${selectedItem.stock} disponibles` : "—"}</span>
            <Button type="button" variant="ghost" size="icon" aria-label="Quitar producto" onClick={() => { setProductKey(""); setQuantity("1"); }} disabled={isCreating || !productKey}>
              <Trash2 className="size-4 text-muted-foreground" />
            </Button>
            <Button type="button" variant="outline" className="h-10 gap-1.5 whitespace-nowrap" onClick={() => setCreateProductOpen(true)} disabled={isCreating}>
              <Plus className="size-3.5" /> Agregar producto
            </Button>
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
      <CreateProductDialog
        open={createProductOpen}
        onOpenChange={setCreateProductOpen}
        onSuccess={() => { mutateStock(); }}
      />
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
  const { transfers, isLoading: transfersLoading } = useWarehouseTransfers();

  const [showCreate, setShowCreate] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

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

        <main className="h-full space-y-5 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <TransferStockCard warehouses={activeWarehouses} />
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Package className="size-4 text-muted-foreground" /> Transferencias recientes</CardTitle></CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {transfersLoading ? <div className="p-6"><Skeleton className="h-16 rounded-lg" /></div> : transfers.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">Sin transferencias todavía.</div> : transfers.map((t) => (
                <div key={t.id} className="space-y-1 px-6 py-3">
                  <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">{t.from_warehouse_name} <ArrowRightLeft className="mx-1 inline size-3 text-muted-foreground" /> {t.to_warehouse_name}</span><span className="shrink-0 text-xs text-muted-foreground">{format(new Date(t.created_at), "d MMM yyyy, HH:mm", { locale: es })}</span></div>
                  {t.items.map((item, i) => <p key={i} className="text-xs text-muted-foreground">{item.quantity} × {item.product_name}{item.variant_name ? ` (${item.variant_name})` : ""}</p>)}
                  {t.notes && <p className="text-xs italic text-muted-foreground">"{t.notes}"</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </main>
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
