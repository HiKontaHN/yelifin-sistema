"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTransactionCategories, type TransactionCategory } from "@/hooks/swr/use-transaction-categories";
import { cn } from "@/lib/utils";

type Category = TransactionCategory;
type CategoryType = Category["type"];

export function TransactionCategoryOrderDialog({ initialType, typeOptions, onClose }: {
  initialType: CategoryType;
  typeOptions: { value: CategoryType; label: string }[];
  onClose: () => void;
}) {
  const [type, setType] = useState(initialType);
  const { categories, isLoading, error } = useTransactionCategories(type);
  const { mutate } = useSWRConfig();
  const [drafts, setDrafts] = useState<Partial<Record<CategoryType, Category[]>>>({});
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const dragRef = useRef<{ id: number; pointerId: number; x: number; y: number; overId: string | null } | null>(null);
  const frameRef = useRef(0);
  const draft = drafts[type];
  const items = draft ?? categories;
  const changed = Boolean(draft);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const moveCategory = (id: number, destination: number | ((items: Category[]) => number)) => {
    setDrafts((current) => {
      const ordered = current[type] ?? categories;
      const from = ordered.findIndex((item) => item.id === id);
      const to = typeof destination === "function" ? destination(ordered) : destination;
      if (from < 0 || to < 0 || to >= ordered.length || from === to) return current;

      const next = [...ordered];
      next.splice(from, 1);
      next.splice(to, 0, ordered[from]);
      const isOriginalOrder = next.length === categories.length
        && next.every(({ id }, index) => id === categories[index].id);
      return { ...current, [type]: isOriginalOrder ? undefined : next };
    });
  };

  const updateDrag = () => {
    const list = listRef.current;
    const drag = dragRef.current;
    if (!list || !drag) return;
    const bounds = list.getBoundingClientRect();
    const inside = drag.x >= bounds.left && drag.x <= bounds.right;
    if (inside) {
      const edgeSize = 32;
      const offset = drag.y < bounds.top + edgeSize ? -8 : drag.y > bounds.bottom - edgeSize ? 8 : 0;
      if (offset) list.scrollTop += offset;

      const y = Math.max(bounds.top + 1, Math.min(drag.y, bounds.bottom - 1));
      const row = document.elementFromPoint(drag.x, y)?.closest<HTMLElement>("[data-category-order-id]");
      const overId = row?.dataset.categoryOrderId;
      if (overId === String(drag.id)) drag.overId = null;
      if (row && list.contains(row) && overId && overId !== String(drag.id) && overId !== drag.overId) {
        drag.overId = overId;
        moveCategory(drag.id, (current) => current.findIndex((item) => String(item.id) === overId));
      }
    }
    frameRef.current = requestAnimationFrame(updateDrag);
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, id: number) => {
    const list = listRef.current;
    if (!list || saving || dragRef.current || event.button !== 0) return;
    event.preventDefault();
    list.setPointerCapture(event.pointerId);
    dragRef.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, overId: null };
    setDraggingId(id);
    frameRef.current = requestAnimationFrame(updateDrag);
  };

  const endDrag = (event: PointerEvent<HTMLOListElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    cancelAnimationFrame(frameRef.current);
    setDraggingId(null);
  };

  const saveOrder = async () => {
    if (!changed || saving || dragRef.current) return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/transaction-categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ids: items.map(({ id }) => Number(id)) }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "No se pudo guardar el orden");
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el orden");
      setSaving(false);
      return;
    }

    await Promise.allSettled([
      mutate((key) => typeof key === "string" && (
        key === "/api/transaction-categories" || key.startsWith("/api/transaction-categories?")
      ), undefined, { revalidate: true }),
    ]);
    setDrafts((current) => ({ ...current, [type]: undefined }));
    setSaving(false);
    toast.success("Orden de categorías guardado");
  };

  return (
    <Tabs
      value={type}
      onValueChange={(value) => {
        const option = typeOptions.find((option) => option.value === value);
        if (!option || saving || dragRef.current) return;
        setSaveError("");
        setType(option.value);
      }}
    >
      <ResponsiveModal
        open
        onOpenChange={(open) => { if (!open && !saving) onClose(); }}
        title="Ordenar categorías"
        subtitle="Arrastra desde el icono de agarre o usa las flechas para cambiar el orden."
        dragToClose={false}
        bodyClassName="[scrollbar-width:thin]"
        topContent={
          <div className="px-4 pt-3 sm:px-5">
            <TabsList aria-label="Tipo de categorías" className="grid w-full grid-cols-3 gap-1">
              {typeOptions.map(({ value, label }) => (
                <TabsTrigger key={value} value={value} disabled={saving || draggingId !== null} className="gap-1 px-1 text-xs sm:text-sm">
                  {label}
                  {drafts[value] && <span className="size-1.5 shrink-0 rounded-full bg-primary"><span className="sr-only"> Cambios sin guardar</span></span>}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        }
        footer={
          <>
            <Button type="button" variant="outline" className="flex-1" disabled={saving} onClick={onClose}>{Object.values(drafts).some(Boolean) ? "Cancelar" : "Cerrar"}</Button>
            <Button type="button" className="flex-1" loading={saving} disabled={!changed || draggingId !== null} onClick={saveOrder}>Guardar orden</Button>
          </>
        }
      >
        <TabsContent key={type} value={type} className="space-y-2">
          {isLoading ? (
            <div role="status" className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Spinner aria-hidden="true" />
              <span>Cargando categorías…</span>
            </div>
          ) : (
            <ol
              ref={listRef}
              className="max-h-[50dvh] space-y-2 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin]"
              onPointerMove={(event) => {
                const drag = dragRef.current;
                if (drag?.pointerId === event.pointerId) {
                  drag.x = event.clientX;
                  drag.y = event.clientY;
                }
              }}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={endDrag}
            >
              {items.map((category, index) => (
                <li key={category.id} data-category-order-id={category.id} className={cn(
                  "flex items-center gap-2 rounded-xl border bg-card p-2",
                  draggingId === category.id && "border-primary bg-primary/10",
                )}>
                  <button
                    type="button"
                    className="grid size-9 shrink-0 touch-none select-none place-items-center rounded-md text-muted-foreground enabled:cursor-grab enabled:active:cursor-grabbing"
                    aria-label={`Arrastrar ${category.name}`}
                    tabIndex={-1}
                    disabled={saving || items.length < 2}
                    onPointerDown={(event) => startDrag(event, category.id)}
                  >
                    <GripVertical className="size-4" />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-left text-sm font-medium" title={category.name}>{category.name}</span>
                  <div className="flex shrink-0">
                    <Button type="button" variant="ghost" size="icon-sm" disabled={saving || draggingId !== null || index === 0} aria-label={`Subir ${category.name}`} onClick={() => moveCategory(category.id, index - 1)}><ChevronUp /></Button>
                    <Button type="button" variant="ghost" size="icon-sm" disabled={saving || draggingId !== null || index === items.length - 1} aria-label={`Bajar ${category.name}`} onClick={() => moveCategory(category.id, index + 1)}><ChevronDown /></Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {!isLoading && !error && items.length === 0 && <p className="text-sm text-muted-foreground">No hay categorías activas de este tipo.</p>}
          {(saveError || error) && <p role="alert" className="text-sm text-destructive">{saveError || error.message}</p>}
        </TabsContent>
      </ResponsiveModal>
    </Tabs>
  );
}
