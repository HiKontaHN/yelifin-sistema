"use client";

import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Download, Search, Package, Layers } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useProducts } from "@/hooks/swr/use-products";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BatchExportDialog({ open, onOpenChange }: Props) {
  const { firebaseUser } = useAuth();
  const { products, isLoading } = useProducts();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  const physical = useMemo(
    () => products.filter((p) => !p.is_service),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return physical.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku?.toLowerCase().includes(q) ?? false)
    );
  }, [physical, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDownload = async () => {
    if (selected.size === 0) {
      toast.error("Selecciona al menos un producto");
      return;
    }

    setIsDownloading(true);
    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("No autenticado");

      const res = await fetch("/api/inventory/batch/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productIds: Array.from(selected) }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al generar la plantilla");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plantilla-inventario-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success(
        `Plantilla generada con ${selected.size} producto${selected.size !== 1 ? "s" : ""}`
      );
      onOpenChange(false);
      setSelected(new Set());
      setSearch("");
    } catch (error: any) {
      toast.error(error.message || "Error al descargar la plantilla");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    if (isDownloading) return;
    onOpenChange(false);
    setSelected(new Set());
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      {/*
        DialogContent base tiene `grid` — no ponemos flex aquí.
        El div interno maneja el layout flex + altura.
      */}
      <DialogContent
        className={cn(
          "fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0",
          "w-full max-w-full rounded-t-2xl rounded-b-none border-t border-x-0 border-b-0",
          "p-0",
          "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2",
          "sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:w-full sm:max-w-md lg:max-w-xl xl:max-w-xl",
          "sm:rounded-2xl sm:border",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=open]:slide-in-from-bottom sm:data-[state=open]:slide-in-from-bottom-[48%]",
          "data-[state=closed]:slide-out-to-bottom sm:data-[state=closed]:slide-out-to-bottom-[48%]",
          "duration-300",
        )}
        onInteractOutside={(e) => { if (isDownloading) e.preventDefault(); }}
      >
        {/* Wrapper interno: maneja el layout flex y la altura máxima para scroll correcto */}
        <div className="flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden">

          {/* Handle móvil */}
          <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <DialogHeader className="shrink-0 px-5 pt-2 pb-3 sm:pt-5 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Download className="h-5 w-5 text-primary" />
              Exportar plantilla Excel
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Selecciona los productos para incluir en la plantilla de carga masiva.
            </p>
          </DialogHeader>

          {/* Buscador */}
          <div className="shrink-0 px-5 py-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
                disabled={isDownloading}
              />
            </div>
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                disabled={isDownloading}
                className="mt-2 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Checkbox
                  checked={allFilteredSelected}
                  className="h-3.5 w-3.5 pointer-events-none"
                  tabIndex={-1}
                />
                <span>
                  {allFilteredSelected
                    ? "Deseleccionar todos"
                    : `Seleccionar todos (${filtered.length})`}
                </span>
              </button>
            )}
          </div>

          {/* Lista de productos con scroll */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-5 py-3 space-y-1">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Package className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {physical.length === 0
                      ? "No tienes productos físicos registrados"
                      : "No se encontraron productos"}
                  </p>
                </div>
              ) : (
                filtered.map((p) => {
                  const isChecked = selected.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      disabled={isDownloading}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        "hover:bg-muted/60",
                        isChecked && "bg-primary/5 border border-primary/20"
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        className="shrink-0 pointer-events-none"
                        tabIndex={-1}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.sku && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {p.sku}
                            </span>
                          )}
                          {p.variants.length > 0 && (
                            <Badge
                              variant="outline"
                              className="text-xs h-4 px-1 gap-0.5 font-normal"
                            >
                              <Layers className="h-2.5 w-2.5" />
                              {p.variants.length} variante{p.variants.length !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="shrink-0 px-5 py-4 border-t bg-background flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isDownloading}
              className="flex-1 h-11"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading || selected.size === 0}
              className="flex-1 h-11 gap-2"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Descargar plantilla
                  {selected.size > 0 && (
                    <Badge className="ml-1 h-5 px-1.5 bg-primary-foreground text-primary text-xs">
                      {selected.size}
                    </Badge>
                  )}
                </>
              )}
            </Button>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
