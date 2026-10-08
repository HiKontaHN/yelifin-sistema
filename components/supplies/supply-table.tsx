"use client";

import { Supply } from "@/hooks/swr/use-supplies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DataTableTimeSection,
  type DataTableTimeSectionColumn,
  type DataTableTimeSectionPagination,
} from "@/components/shared/data-table-time-section";
import { Pencil, Trash2, PackagePlus, Boxes, Box } from "lucide-react";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-HN", {
    style: "currency", currency: "HNL", minimumFractionDigits: 2,
  }).format(value);

function getStatusBadge(stock: number, min: number) {
  if (stock === 0)
    return <Badge variant="destructive">Agotado</Badge>;
  if (stock < min)
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200" variant="outline">Stock bajo</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200" variant="outline">OK</Badge>;
}

function getStockColor(stock: number, min: number) {
  if (stock === 0) return "text-destructive font-bold";
  if (stock < min) return "text-yellow-600 font-bold";
  return "text-green-600 font-bold";
}

export function SupplyTable({
  supplies,
  total,
  isLoading,
  pagination,
  onEdit,
  onDelete,
  onAddPurchase,
  canEdit = true,
  canDelete = true,
}: {
  supplies: Supply[];
  total: number;
  isLoading: boolean;
  pagination: DataTableTimeSectionPagination;
  onEdit: (s: Supply) => void;
  onDelete: (s: Supply) => void;
  onAddPurchase: (s: Supply) => void;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const columns: DataTableTimeSectionColumn<Supply>[] = [
    {
      id: "name", header: "Nombre", width: "37%",
      className: "font-medium",
      cell: (supply) => <span className="block truncate" title={supply.name}>{supply.name}</span>,
    },
    {
      id: "unit", header: "Unidad", width: "10%",
      className: "font-mono text-muted-foreground",
      cell: (supply) => supply.unit ?? "unit",
    },
    {
      id: "stock", header: "Stock", width: "8%", align: "right",
      cell: (supply) => {
        const stock = Number(supply.stock ?? 0);
        return <span className={`font-mono ${getStockColor(stock, Number(supply.min_stock ?? 0))}`}>{stock}</span>;
      },
    },
    {
      id: "minimum", header: "Mínimo", width: "8%", align: "right",
      className: "font-mono text-muted-foreground",
      cell: (supply) => Number(supply.min_stock ?? 0),
    },
    {
      id: "unit-cost", header: "Costo/u", width: "13%", align: "right",
      className: "font-mono",
      cell: (supply) => formatCurrency(Number(supply.unit_cost ?? 0)),
    },
    {
      id: "status", header: "Estado", width: "12%", align: "center",
      cell: (supply) => getStatusBadge(Number(supply.stock ?? 0), Number(supply.min_stock ?? 0)),
    },
    {
      id: "actions", header: "Acciones", width: "12%", align: "right",
      stopRowClick: true,
      cell: (supply) => (
        <div className="inline-flex items-center gap-1">
          {canEdit && (
            <>
              <Button variant="ghost" size="icon" className="size-8" title="Registrar compra" aria-label={`Registrar compra de ${supply.name}`} onClick={() => onAddPurchase(supply)}>
                <PackagePlus className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="size-8" title="Editar suministro" aria-label={`Editar ${supply.name}`} onClick={() => onEdit(supply)}>
                <Pencil className="size-3.5" />
              </Button>
            </>
          )}
          {canDelete && (
            <Button variant="ghost" size="icon" className="size-8 text-destructive" title="Eliminar suministro" aria-label={`Eliminar ${supply.name}`} onClick={() => onDelete(supply)}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTableTimeSection
      columns={columns}
      data={supplies}
      getRowKey={(supply) => supply.id}
      pagination={pagination}
      recordLabel={total === 1 ? "suministro" : "suministros"}
      isLoading={isLoading}
      stickyOffset="var(--data-table-sticky-offset)"
      className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]"
      minWidth="100%"
      ariaLabel="Suministros"
      emptyState={(
        <div className="flex flex-col items-center justify-center gap-2">
          <Boxes className="size-10 text-muted-foreground/40" />
          <span>No hay suministros todavía.</span>
        </div>
      )}
      renderMobileRow={(supply) => {
        const stock = Number(supply.stock ?? 0);
        const min = Number(supply.min_stock ?? 0);

        return (
          <Card>
            <CardContent className="pl-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{supply.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Unidad: <span className="font-mono">{supply.unit ?? "unit"}</span>
                  </p>
                </div>
                <Box className="size-4 text-muted-foreground" />
              </div>

              <div className="mb-3 grid grid-cols-3 gap-2 border-y py-3 text-center">
                <div>
                  <p className="mb-0.5 text-[11px] text-muted-foreground">Stock</p>
                  <p className={`font-mono text-base ${getStockColor(stock, min)}`}>{stock}</p>
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] text-muted-foreground">Mínimo</p>
                  <p className="font-mono text-base font-semibold">{min}</p>
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] text-muted-foreground">Costo/u</p>
                  <p className="font-mono text-base font-semibold">{formatCurrency(Number(supply.unit_cost ?? 0))}</p>
                </div>
              </div>

              <div className="flex gap-2">
                {canEdit && (
                  <>
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => onAddPurchase(supply)}>
                      <PackagePlus className="size-3.5" />Compra
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => onEdit(supply)}>
                      <Pencil className="size-3.5" />Editar
                    </Button>
                  </>
                )}
                {canDelete && (
                  <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Eliminar ${supply.name}`} onClick={() => onDelete(supply)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      }}
      showFooterPagination={false}
    />
  );
}
