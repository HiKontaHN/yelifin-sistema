"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Info, PackageOpen, Save } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { useCurrency } from "@/hooks/swr/use-currency";
import { useEditPurchaseItem, usePurchase } from "@/hooks/swr/use-purchases";

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function EditPurchaseContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const purchaseId = Number(params.id);
  const requestedItemId = Number(searchParams.get("item"));
  const { purchase, isLoading, error } = usePurchase(purchaseId, { edit: true });
  const { editPurchaseItem, isEditing } = useEditPurchaseItem(purchaseId);
  const { can_edit: canEdit, show_costs: showCosts } = useModulePermissions("INVENTORY", "INCOMING");
  const { format } = useCurrency();

  const [itemId, setItemId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [purchasedAt, setPurchasedAt] = useState("");
  const [notes, setNotes] = useState("");

  const selectedItem = useMemo(
    () => purchase?.items.find((item) => item.id === itemId) ?? null,
    [purchase, itemId],
  );

  useEffect(() => {
    if (!purchase || itemId !== null) return;
    const requested = purchase.items.find((item) => item.id === requestedItemId);
    setItemId(requested?.id ?? purchase.items[0]?.id ?? null);
    setPurchasedAt(toDateTimeLocal(purchase.purchased_at));
    setNotes(purchase.notes ?? "");
  }, [purchase, requestedItemId, itemId]);

  useEffect(() => {
    if (!selectedItem) return;
    setQuantity(Number(selectedItem.quantity));
    setUnitCost(Number(selectedItem.unit_cost_usd ?? 0));
  }, [selectedItem]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedItem) return;
    if (quantity < selectedItem.consumed_quantity) {
      toast.error(`Ya se vendieron ${selectedItem.consumed_quantity} unidades de este ingreso`);
      return;
    }
    try {
      await editPurchaseItem({
        item_id: selectedItem.id,
        quantity,
        unit_cost: showCosts ? unitCost : undefined,
        purchased_at: new Date(purchasedAt).toISOString(),
        notes,
      });
      toast.success("Ingreso actualizado");
      router.push(`/inventory/${selectedItem.product_id}`);
    } catch (submitError: any) {
      toast.error(submitError.message || "No se pudo actualizar el ingreso");
    }
  };

  if (isLoading) {
    return <div className="mx-auto max-w-2xl space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }

  if (!purchase || error) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-24 text-center">
        <PackageOpen className="size-12 text-muted-foreground/40" />
        <p className="text-muted-foreground">{error || "Ingreso no encontrado"}</p>
        <Button variant="outline" onClick={() => router.back()}>Volver</Button>
      </div>
    );
  }

  if (!canEdit || purchase.status !== "COMPLETED") {
    return (
      <div className="mx-auto max-w-xl py-16">
        <Alert>
          <Info />
          <AlertTitle>No se puede editar este ingreso</AlertTitle>
          <AlertDescription>
            {!canEdit
              ? "Tu rol no tiene permiso para editar ingresos de inventario."
              : "La compra aún no ha sido registrada en inventario."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-24">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Editar ingreso</h1>
            <Badge variant="secondary">Completado</Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            Compra {purchase.public_id ? `#${purchase.public_id.slice(0, 8)}` : `#${purchase.id}`}
          </p>
        </div>
      </div>

      <Alert>
        <Info />
        <AlertTitle>Corrección con historial</AlertTitle>
        <AlertDescription>
          El movimiento original se conserva. La diferencia de unidades se registrará como una corrección y los costos FIFO se recalcularán.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del ingreso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Producto</Label>
              <Select value={itemId ? String(itemId) : ""} onValueChange={(value) => setItemId(Number(value))}>
                <SelectTrigger><SelectValue placeholder="Selecciona un producto" /></SelectTrigger>
                <SelectContent>
                  {purchase.items.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.product_name}{item.variant_name ? ` · ${item.variant_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedItem && (
              <div className="grid gap-4 sm:grid-cols-2">
                {showCosts && <div className="space-y-2">
                  <Label htmlFor="quantity">Cantidad ingresada</Label>
                  <Input
                    id="quantity" type="number" min={Math.max(1, selectedItem.consumed_quantity)} step="1"
                    value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required
                  />
                  <p className="text-xs text-muted-foreground">
                    {selectedItem.consumed_quantity > 0
                      ? `${selectedItem.consumed_quantity} unidades ya fueron vendidas y no pueden retirarse.`
                      : "Ninguna unidad de este lote ha sido vendida."}
                  </p>
                </div>}
                <div className="space-y-2">
                  <Label htmlFor="unit-cost">Costo unitario ({purchase.currency})</Label>
                  <Input
                    id="unit-cost" type="number" min="0" step="0.0001"
                    value={unitCost} onChange={(event) => setUnitCost(Number(event.target.value))} required
                  />
                  {purchase.currency === "USD" && purchase.exchange_rate && (
                    <p className="text-xs text-muted-foreground">
                      Tasa original: {Number(purchase.exchange_rate).toFixed(4)} HNL/USD
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="purchased-at">Fecha del ingreso</Label>
              <Input id="purchased-at" type="datetime-local" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Motivo o detalle de la corrección" />
            </div>

            {showCosts && <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total actual de la compra</span>
                <span className="font-medium">{format(Number(purchase.total ?? 0))}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">El total final incluirá el envío ya registrado, distribuido entre todas las unidades.</p>
            </div>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => router.back()} disabled={isEditing}>Cancelar</Button>
              <Button type="submit" disabled={isEditing || !selectedItem} className="gap-2">
                <Save className="size-4" />
                {isEditing ? "Guardando..." : "Guardar corrección"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default function EditPurchasePage() {
  return <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-2xl" />}><EditPurchaseContent /></Suspense>;
}
