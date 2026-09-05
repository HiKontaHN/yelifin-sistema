// app/(dashboard)/settings/warehouses/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useMe } from "@/hooks/swr/use-me";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { useProducts } from "@/hooks/swr/use-products";
import {
  useWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
  useWarehouseTransfers,
  useCreateWarehouseTransfer,
} from "@/hooks/swr/use-warehouses";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Badge }    from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Plus, MoreHorizontal, Loader2, Warehouse as WarehouseIcon,
  Star, ArrowRightLeft, Package,
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
        <DialogHeader><DialogTitle>Nueva bodega</DialogTitle></DialogHeader>
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
        <DialogHeader><DialogTitle>Renombrar bodega</DialogTitle></DialogHeader>
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
  const { products } = useProducts();
  const { createTransfer, isCreating } = useCreateWarehouseTransfer();
  const { mutate: mutateTransfers } = useWarehouseTransfers();

  const [fromId,    setFromId]    = useState("");
  const [toId,      setToId]      = useState("");
  const [productKey, setProductKey] = useState(""); // "p123" o "v456"
  const [quantity,  setQuantity]  = useState("1");
  const [notes,     setNotes]     = useState("");

  const physicalProducts = products.filter((p) => !p.is_service);
  const selectedProduct = physicalProducts.find((p) =>
    productKey === `p${p.id}` || p.variants.some((v) => productKey === `v${v.id}`)
  );

  const reset = () => {
    setProductKey(""); setQuantity("1"); setNotes("");
  };

  const handleSubmit = async () => {
    if (!fromId || !toId) { toast.error("Elegí ambas bodegas"); return; }
    if (fromId === toId)  { toast.error("Las bodegas deben ser diferentes"); return; }
    if (!selectedProduct) { toast.error("Elegí un producto"); return; }
    const qty = Number(quantity);
    if (!qty || qty < 1)  { toast.error("La cantidad debe ser al menos 1"); return; }

    const variantId = productKey.startsWith("v") ? Number(productKey.slice(1)) : null;

    try {
      await createTransfer({
        from_warehouse_id: Number(fromId),
        to_warehouse_id:   Number(toId),
        notes: notes.trim() || undefined,
        items: [{ product_id: selectedProduct.id, variant_id: variantId, quantity: qty }],
      });
      toast.success("Transferencia registrada");
      reset();
      mutateTransfers();
    } catch (err: any) {
      toast.error(err.message || "Error al registrar la transferencia");
    }
  };

  if (warehouses.length < 2) {
    return (
      <Card>
        <CardHeader className="pb-3">
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowRightLeft className="size-4 text-muted-foreground" />
          Transferir stock
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Select value={fromId} onValueChange={setFromId} disabled={isCreating}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Origen" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)} disabled={String(w.id) === toId}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hacia</Label>
            <Select value={toId} onValueChange={setToId} disabled={isCreating}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Destino" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)} disabled={String(w.id) === fromId}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Producto</Label>
          <Select value={productKey} onValueChange={setProductKey} disabled={isCreating}>
            <SelectTrigger className="h-10"><SelectValue placeholder="Selecciona un producto..." /></SelectTrigger>
            <SelectContent>
              {physicalProducts.flatMap((p) =>
                p.variants.length > 0
                  ? p.variants.map((v) => (
                      <SelectItem key={`v${v.id}`} value={`v${v.id}`}>{p.name} — {v.variant_name}</SelectItem>
                    ))
                  : [<SelectItem key={`p${p.id}`} value={`p${p.id}`}>{p.name}</SelectItem>]
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Cantidad</Label>
            <Input
              type="number" min="1" value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={isCreating}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nota (opcional)</Label>
            <Input
              placeholder="Motivo del traslado"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isCreating}
              className="h-10"
            />
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={isCreating} className="w-full gap-2">
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
    <div className="space-y-4 pb-24 md:space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3">
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <WarehouseIcon className="size-4 text-muted-foreground" />
            {warehouses.length} {warehouses.length === 1 ? "bodega" : "bodegas"}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {warehouses.map((w) => (
            <div key={w.id} className="flex items-center gap-3 px-6 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{w.name}</p>
                  {w.is_default && (
                    <Badge variant="default" className="text-xs gap-1">
                      <Star className="size-3" /> Default
                    </Badge>
                  )}
                  {!w.is_active && (
                    <Badge variant="secondary" className="text-xs">Inactiva</Badge>
                  )}
                </div>
              </div>

              {canEditWarehouses && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setRenaming({ id: w.id, name: w.name })}>
                      Renombrar
                    </DropdownMenuItem>
                    {!w.is_default && w.is_active && (
                      <DropdownMenuItem onClick={() => handleSetDefault(w.id)}>
                        Marcar como default
                      </DropdownMenuItem>
                    )}
                    {!w.is_default && (
                      <DropdownMenuItem onClick={() => handleToggleActive(w.id, w.is_active)}>
                        {w.is_active ? "Desactivar" : "Reactivar"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <TransferStockCard warehouses={activeWarehouses} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" />
            Transferencias recientes
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {transfersLoading ? (
            <div className="p-6"><Skeleton className="h-16 rounded-lg" /></div>
          ) : transfers.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Sin transferencias todavía.
            </div>
          ) : (
            transfers.map((t) => (
              <div key={t.id} className="px-6 py-3 space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {t.from_warehouse_name} <ArrowRightLeft className="inline size-3 mx-1 text-muted-foreground" /> {t.to_warehouse_name}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(t.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                  </span>
                </div>
                {t.items.map((item, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {item.quantity} × {item.product_name}{item.variant_name ? ` (${item.variant_name})` : ""}
                  </p>
                ))}
                {t.notes && <p className="text-xs text-muted-foreground italic">"{t.notes}"</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

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
