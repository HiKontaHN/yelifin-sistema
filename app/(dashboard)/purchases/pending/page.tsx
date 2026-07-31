// app/(dashboard)/purchases/pending/page.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Clock, PackageCheck, XCircle,
  Wallet, CalendarDays, StickyNote, Truck, Package,
} from "lucide-react";

import { usePendingPurchases, PurchaseWithItems, Purchase } from "@/hooks/swr/use-purchases";
import { useAccounts }   from "@/hooks/swr/use-accounts";
import { useInventory }  from "@/hooks/swr/use-inventory";
import { useCurrency }   from "@/hooks/swr/use-currency";
import { ConfirmPurchaseArrivalDialog } from "@/components/products/confirm-purchase-arrival-dialog";
import { CancelPurchaseDialog } from "@/components/products/cancel-purchase-dialog";
import { StatCard } from "@/components/reports/report-shell";
import { SearchBar } from "@/components/shared/search-bar";
import { PaginationControls } from "@/components/shared/pagination-controls";

const PAGE_SIZE = 6;

export default function PendingPurchasesPage() {
  const { back, push } = useRouter();
  const { purchases, isLoading, mutate: mutatePurchases } = usePendingPurchases();
  const { mutate: mutateInventory }  = useInventory();
  const { accounts, mutate: mutateAccounts } = useAccounts();
  const { format } = useCurrency();

  const [selected, setSelected] = useState<PurchaseWithItems | null>(null);
  const [toCancel, setToCancel] = useState<Purchase | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const handleSuccess = () => {
    mutatePurchases();
    mutateInventory();
    mutateAccounts();
  };

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((p) =>
      p.items.some((item) => item.product_name.toLowerCase().includes(q))
    );
  }, [purchases, search]);

  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE));
  const pagePurchases = filteredPurchases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = purchases.reduce(
    (acc, p) => {
      acc.totalMoney += Number(p.total);
      p.items.forEach((item) => {
        acc.productKeys.add(`${item.product_id}-${item.variant_name ?? ""}`);
        acc.totalUnits += Number(item.quantity);
      });
      return acc;
    },
    { totalMoney: 0, totalUnits: 0, productKeys: new Set<string>() }
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">En camino</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading
              ? "Cargando..."
              : purchases.length === 0
                ? "Sin compras pendientes de llegada"
                : `${purchases.length} compra${purchases.length !== 1 ? "s" : ""} esperando llegada de mercancía`
            }
          </p>
        </div>
        {!isLoading && purchases.length > 0 && (
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 shrink-0">
            {purchases.length} pendiente{purchases.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : purchases.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Productos pendientes" value={String(stats.productKeys.size)} />
          <StatCard label="Unidades totales" value={stats.totalUnits.toLocaleString("es-HN")} />
          <StatCard label="Inversión" value={format(stats.totalMoney)} />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && purchases.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <div className="size-14 rounded-full bg-muted flex items-center justify-center">
            <PackageCheck className="size-7 opacity-40" />
          </div>
          <p className="text-sm">No hay compras pendientes de llegada</p>
          <Button variant="outline" size="sm" onClick={() => push("/inventory")}>
            Ir a inventario
          </Button>
        </div>
      )}

      {/* Buscador */}
      {!isLoading && purchases.length > 0 && (
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre de producto..."
        />
      )}

      {/* Sin resultados de búsqueda */}
      {!isLoading && purchases.length > 0 && filteredPurchases.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <div className="size-14 rounded-full bg-muted flex items-center justify-center">
            <Package className="size-7 opacity-40" />
          </div>
          <p className="text-sm">Ningún producto coincide con &quot;{search}&quot;</p>
        </div>
      )}

      {/* Lista */}
      {!isLoading && pagePurchases.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pagePurchases.map((p) => (
            <PurchaseCard
              key={p.id}
              purchase={p}
              format={format}
              onConfirm={() => setSelected(p)}
              onCancel={() => setToCancel(p)}
            />
          ))}
        </div>
      )}

      {/* Paginación */}
      {!isLoading && filteredPurchases.length > 0 && (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={filteredPurchases.length}
          label="compras"
          onPageChange={setPage}
        />
      )}

      {/* Dialog de confirmación */}
      <ConfirmPurchaseArrivalDialog
        purchase={selected}
        accounts={accounts}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onSuccess={handleSuccess}
      />

      {/* Dialog de cancelación */}
      <CancelPurchaseDialog
        purchase={toCancel}
        open={!!toCancel}
        onOpenChange={(open) => !open && setToCancel(null)}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

// ── Tarjeta de compra pendiente ────────────────────────────────────────

function PurchaseCard({
  purchase: p,
  format,
  onConfirm,
  onCancel,
}: {
  purchase: PurchaseWithItems;
  format: (v: number) => string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const date = new Date(p.purchased_at).toLocaleDateString("es-HN", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <Card className="border-amber-200/60 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800/30">
      <CardContent className="p-4 space-y-3">

        {/* Fila superior */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <Clock className="size-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">
                {p.items_count} producto{p.items_count !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground">Pendiente de llegada</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-bold">{format(Number(p.total))}</p>
            <p className="text-xs text-muted-foreground">{p.currency}</p>
          </div>
        </div>

        {/* Detalles */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3 shrink-0" />
            <span>{date}</span>
          </div>
          {p.account_name && (
            <div className="flex items-center gap-1.5">
              <Wallet className="size-3 shrink-0" />
              <span className="truncate">{p.account_name}</span>
            </div>
          )}
          {Number(p.shipping) > 0 && (
            <div className="flex items-center gap-1.5">
              <Truck className="size-3 shrink-0" />
              <span>Envío: {format(Number(p.shipping))}</span>
            </div>
          )}
          {p.notes && (
            <div className="flex items-center gap-1.5 col-span-2">
              <StickyNote className="size-3 shrink-0" />
              <span className="truncate">{p.notes}</span>
            </div>
          )}
        </div>

        {/* Lista de productos */}
        {p.items.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              {p.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Package className="size-3 text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">
                      {item.product_name}
                      {item.variant_name && (
                        <span className="text-muted-foreground font-normal"> · {item.variant_name}</span>
                      )}
                    </span>
                  </div>
                  <div className="shrink-0 text-right text-muted-foreground">
                    <span className="font-mono">{item.quantity}</span>
                    <span className="mx-1 opacity-50">×</span>
                    <span>{format(Number(item.unit_cost))}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Aviso */}
        <div className="rounded-lg bg-amber-100/60 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          El dinero ya fue debitado de la cuenta. Al confirmar la llegada, el stock se acreditará al inventario.
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={onCancel}
          >
            <XCircle className="size-4" />
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={onConfirm}>
            <PackageCheck className="size-4" />
            Confirmar llegada
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
