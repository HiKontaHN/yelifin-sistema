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
  ArrowLeft, PackageCheck, XCircle, Package,
  Wallet, CalendarDays, Truck,
} from "lucide-react";

import { usePendingPurchases, PurchaseWithItems, Purchase } from "@/hooks/swr/use-purchases";
import { useAccounts }   from "@/hooks/swr/use-accounts";
import { useInventory }  from "@/hooks/swr/use-inventory";
import { useCurrency }   from "@/hooks/swr/use-currency";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { ConfirmPurchaseArrivalDialog } from "@/components/products/confirm-purchase-arrival-dialog";
import { CancelPurchaseDialog } from "@/components/products/cancel-purchase-dialog";
import { StatCard } from "@/components/reports/report-shell";
import { SearchBar } from "@/components/shared/search-bar";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { DataTableTimeSection, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
import { useTimezone } from "@/hooks/swr/use-timezone";

const PAGE_SIZE = 10;

export default function PendingPurchasesPage() {
  const { back, push } = useRouter();
  const timezone = useTimezone();
  const dateKeyFormatter = useMemo(() => new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }), [timezone]);
  const dateTitleFormatter = useMemo(() => new Intl.DateTimeFormat("es-HN", {
    timeZone: timezone, weekday: "long", year: "numeric", month: "long", day: "2-digit",
  }), [timezone]);
  const { purchases, isLoading, mutate: mutatePurchases } = usePendingPurchases();
  const { mutate: mutateInventory }  = useInventory();
  const { accounts, mutate: mutateAccounts } = useAccounts();
  const { format } = useCurrency();
  const { show_costs: showCosts, can_edit: canEdit, can_delete: canDelete } = useModulePermissions("INVENTORY");

  const [selected, setSelected] = useState<PurchaseWithItems | null>(null);
  const [toCancel, setToCancel] = useState<Purchase | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

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

  const totalPages = Math.max(1, Math.ceil(filteredPurchases.length / pageSize));
  const pagePurchases = filteredPurchases.slice((page - 1) * pageSize, page * pageSize);

  const columns: DataTableTimeSectionColumn<PurchaseWithItems>[] = [
    {
      id: "date", header: "Fecha", width: 110,
      className: "whitespace-nowrap text-sm text-muted-foreground",
      cell: (purchase) => new Date(purchase.purchased_at).toLocaleDateString("es-HN", {
        day: "numeric", month: "short", year: "numeric",
      }),
    },
    {
      id: "products", header: "Productos", width: "clamp(11rem, 20vw, 16rem)",
      cell: (purchase) => (
        <div className="max-w-64 space-y-0.5">
          {purchase.items.map((item, index) => (
            <p key={index} className="truncate text-sm font-medium">
              {item.product_name}
              {item.variant_name && <span className="font-normal text-muted-foreground">{" "}· {item.variant_name}</span>}
              {purchase.items.length > 1 && <span className="font-normal text-muted-foreground">{" "}· {Number(item.quantity).toLocaleString("es-HN")} un.</span>}
            </p>
          ))}
        </div>
      ),
    },
    {
      id: "units", header: "Unidades", width: 72, align: "center",
      className: "font-medium tabular-nums",
      cell: (purchase) => purchase.items.reduce((sum, item) => sum + Number(item.quantity), 0).toLocaleString("es-HN"),
    },
    { id: "account", header: "Cuenta", width: "clamp(5rem, 8vw, 6.5rem)", className: "truncate text-sm", cell: (purchase) => purchase.account_name ?? "—" },
    ...(showCosts ? [
      {
        id: "shipping", header: "Envío", width: 90, align: "right" as const,
        className: "tabular-nums",
        cell: (purchase: PurchaseWithItems) => Number(purchase.shipping ?? 0) > 0 ? format(Number(purchase.shipping)) : "—",
      },
      {
        id: "total", header: "Total", width: 100, align: "right" as const,
        className: "font-semibold tabular-nums",
        cell: (purchase: PurchaseWithItems) => <>{format(Number(purchase.total ?? 0))}<span className="ml-1 text-xs font-normal text-muted-foreground"></span></>,
      },
    ] : []),
    ...((canDelete || canEdit) ? [{
      id: "actions", header: "Acciones", width: 180, align: "right" as const,
      cell: (purchase: PurchaseWithItems) => (
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
          {canDelete && (
            <Button
              type="button" variant="ghost" size="icon-sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setToCancel(purchase)} aria-label="Cancelar compra" title="Cancelar compra"
            >
              <XCircle className="size-4" />
            </Button>
          )}
          {canEdit && showCosts && (
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setSelected(purchase)}>
              Confirmar llegada
            </Button>
          )}
          {canEdit && !showCosts && (
            <Button
              type="button" size="sm" className="gap-1.5" disabled
              title="Necesitas permiso de costos para confirmar la llegada"
            >
              Confirmar llegada
            </Button>
          )}
        </div>
      ),
    }] : []),
  ];
  const renderPurchaseDate = (_key: string, rows: readonly PurchaseWithItems[]) => {
    const parts = dateTitleFormatter.formatToParts(new Date(rows[0].purchased_at));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
    const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase("es-HN") + value.slice(1);
    return `${capitalize(part("weekday"))} ${part("day")} de ${capitalize(part("month"))} del ${part("year")}`;
  };

  const stats = purchases.reduce(
    (acc, p) => {
      acc.totalMoney += Number(p.total ?? 0);
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
        <div className={`grid gap-3 ${showCosts ? "grid-cols-3" : "grid-cols-2"}`}>
          {(showCosts ? [1, 2, 3] : [1, 2]).map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : purchases.length > 0 && (
        <div className={`grid gap-3 ${showCosts ? "grid-cols-3" : "grid-cols-2"}`}>
          <StatCard label="Productos pendientes" value={String(stats.productKeys.size)} />
          <StatCard label="Unidades totales" value={stats.totalUnits.toLocaleString("es-HN")} />
          {showCosts && <StatCard label="Inversión" value={format(stats.totalMoney)} />}
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

      {/* Tarjetas — móvil */}
      <div className="space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64 w-full rounded-xl" />
          ))
        ) : (
          pagePurchases.map((purchase) => (
            <PurchaseCard
              key={purchase.id}
              purchase={purchase}
              format={format}
              showCosts={showCosts}
              canEdit={canEdit}
              canDelete={canDelete}
              onConfirm={() => setSelected(purchase)}
              onCancel={() => setToCancel(purchase)}
            />
          ))
        )}
      </div>

      {/* Tabla reutilizable — tablet y escritorio */}
      {(isLoading || pagePurchases.length > 0) && (
        <div className="hidden md:block">
          <DataTableTimeSection
            columns={columns}
            data={pagePurchases}
            getRowKey={(purchase) => purchase.id}
            getGroupKey={(purchase) => dateKeyFormatter.format(new Date(purchase.purchased_at))}
            renderGroupHeader={renderPurchaseDate}
            rowClassName="bg-amber-50/20 dark:bg-amber-950/5"
            isLoading={isLoading}
            recordLabel={filteredPurchases.length === 1 ? "compra" : "compras"}
            ariaLabel="Compras pendientes de llegada"
            minWidth={showCosts ? 800 : 640}
            stickyOffset="var(--data-table-sticky-offset)"
            className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]"
            showFooterPagination={false}
            pagination={{
              page,
              pageSize,
              total: filteredPurchases.length,
              onPageChange: setPage,
              onPageSizeChange: (size) => { setPage(1); setPageSize(size); },
            }}
          />
        </div>
      )}

      {/* Paginación */}
      {!isLoading && filteredPurchases.length > 0 && (
        <div className="md:hidden">
          <PaginationControls
            page={page}
            totalPages={totalPages}
            total={filteredPurchases.length}
            label="compras"
            onPageChange={setPage}
          />
        </div>
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

function PurchaseCard({
  purchase,
  format,
  showCosts,
  canEdit,
  canDelete,
  onConfirm,
  onCancel,
}: {
  purchase: PurchaseWithItems;
  format: (value: number) => string;
  showCosts: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const date = new Date(purchase.purchased_at).toLocaleDateString("es-HN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Card className="border-amber-200/60 bg-amber-50/30 dark:border-amber-800/30 dark:bg-amber-950/10">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">
              {purchase.items_count} producto{purchase.items_count !== 1 ? "s" : ""}
            </p>
          </div>
          {showCosts && (
            <div className="shrink-0 text-right">
              <p className="text-base font-bold">{format(Number(purchase.total ?? 0))}</p>
              <p className="text-xs text-muted-foreground">{purchase.currency}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3 shrink-0" />
            <span>{date}</span>
          </div>
          {purchase.account_name && (
            <div className="flex items-center gap-1.5">
              <Wallet className="size-3 shrink-0" />
              <span className="truncate">{purchase.account_name}</span>
            </div>
          )}
          {showCosts && Number(purchase.shipping ?? 0) > 0 && (
            <div className="flex items-center gap-1.5">
              <Truck className="size-3 shrink-0" />
              <span>Envío: {format(Number(purchase.shipping))}</span>
            </div>
          )}
        </div>

        {purchase.items.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              {purchase.items.map((item, index) => (
                <div key={index} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Package className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">
                      {item.product_name}
                      {item.variant_name && (
                        <span className="font-normal text-muted-foreground">
                          {" "}· {item.variant_name}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="shrink-0 text-right text-muted-foreground">
                    <span className="font-mono">{item.quantity}</span>
                    {showCosts && (
                      <>
                        <span className="mx-1 opacity-50">×</span>
                        <span>{format(Number(item.unit_cost ?? 0))}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {(canDelete || canEdit) && (
          <div className="flex gap-2">
            {canDelete && (
              <Button
                variant="outline"
                className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onCancel}
              >
                <XCircle className="size-4" />
                Cancelar
              </Button>
            )}
            {canEdit && (
              showCosts ? (
                <Button className="flex-1 gap-2" onClick={onConfirm}>
                  Confirmar llegada
                </Button>
              ) : (
                <p className="flex-1 self-center text-center text-xs text-muted-foreground">
                  Necesitas permiso de costos para confirmar la llegada
                </p>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
