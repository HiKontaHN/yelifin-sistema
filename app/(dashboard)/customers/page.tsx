// app/(dashboard)/customers/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryStats } from "@/components/shared/summary-stats";
import {
  Users, TrendingUp, ShoppingCart,
  MoreHorizontal, Pencil, Trash2, Eye, Star,
} from "lucide-react";
import {
  useCustomers, useLoyaltyPolicies, computeLoyaltyTier,
  TIER_COLOR_CLASSES,
  type Customer,
} from "@/hooks/swr/use-costumers";
import { useDebounce } from "@/hooks/use-debounce";
import { useCurrency }             from "@/hooks/swr/use-currency";
import { useModulePermissions }    from "@/hooks/use-module-permissions";
import { CreateCustomerDialog }    from "@/components/customers/create-customer-dialog";
import { EditCustomerDialog }      from "@/components/customers/edit-customer-dialog";
import { DeleteCustomerDialog }    from "@/components/customers/delete-customer-dialog";
import { LoyaltyPoliciesDialog }   from "@/components/customers/loyalty-policies-dialog";
import { Fab }                     from "@/components/ui/fab";
import { SearchBar }               from "@/components/shared/search-bar";
import {
  DataTableTimeSection, DEFAULT_DATA_TABLE_PAGE_SIZE,
  type DataTableTimeSectionColumn,
} from "@/components/shared/data-table-time-section";
import { FeatureGate }             from "@/components/shared/feature-gate";
import { cn }                      from "@/lib/utils";

export default function CustomersPage() {
  return (
    <FeatureGate feature="customers.manage">
      <CustomersPageInner />
    </FeatureGate>
  );
}

function CustomersPageInner() {
  const { push } = useRouter();
  const [search,          setSearch]          = useState("");
  const [page,            setPage]            = useState(1);
  const [pageSize,        setPageSize]        = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const { customers, stats, total, isLoading, mutate } = useCustomers({
    search: debouncedSearch || undefined,
    page,
    limit: pageSize,
  });
  const { policies } = useLoyaltyPolicies();
  const { format }   = useCurrency();
  const { can_edit: canEdit, can_delete: canDelete } = useModulePermissions("CUSTOMERS");

  const [createOpen,      setCreateOpen]      = useState(false);
  const [loyaltyOpen,     setLoyaltyOpen]     = useState(false);
  const [editCustomer,    setEditCustomer]    = useState<Customer | null>(null);
  const [deleteCustomer,  setDeleteCustomer]  = useState<Customer | null>(null);

  const customerColumns: DataTableTimeSectionColumn<Customer>[] = [
    {
      id: "customer", header: "Cliente", width: "clamp(13rem, 25vw, 20rem)",
      cell: (customer) => {
        const tier = computeLoyaltyTier(customer, policies);
        const tierColors = tier ? (TIER_COLOR_CLASSES[tier.color] ?? TIER_COLOR_CLASSES.amber) : null;
        return (
          <div className="flex min-w-0 items-center gap-2 flex-wrap">
            <span className="font-medium">{customer.name}</span>
            {tier && tierColors && (
              <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", tierColors.bg, tierColors.text, tierColors.border)}>
                <Star className="size-2.5" />{tier.tier_name}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "phone", header: "Teléfono", width: "clamp(7rem, 13vw, 10rem)",
      className: "text-muted-foreground",
      cell: (customer) => customer.phone ?? "—",
    },
    {
      id: "email", header: "Email", width: "clamp(11rem, 22vw, 16rem)",
      className: "text-muted-foreground",
      cell: (customer) => <span className="block truncate" title={customer.email ?? undefined}>{customer.email ?? "—"}</span>,
    },
    {
      id: "orders", header: "Órdenes", width: 85,
      cell: (customer) => <Badge variant="secondary">{customer.total_orders}</Badge>,
    },
    {
      id: "spent", header: "Total gastado", width: 130, align: "right",
      className: "font-medium tabular-nums",
      cell: (customer) => format(Number(customer.total_spent)),
    },
    {
      id: "actions", header: <span className="sr-only">Acciones</span>, width: 48,
      align: "right", stopRowClick: true,
      cell: (customer) => (
        <ActionsDropdown
          onView={() => push(`/customers/${customer.id}`)}
          onEdit={() => setEditCustomer(customer)}
          onDelete={() => setDeleteCustomer(customer)}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5 pb-24">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading ? "Cargando..." : `${stats.total_customers} cliente${stats.total_customers !== 1 ? "s" : ""}`}
          </p>
        </div>
       {/* <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => setLoyaltyOpen(true)}
        >
          <Star className="size-3.5 text-amber-500" />
          Fidelización
        </Button>*/}
      </div>

      {/* Stats */}
      <SummaryStats
        ariaLabel="Resumen de clientes"
        isLoading={isLoading}
        items={[
          { label: "Total clientes", icon: Users, value: stats.total_customers, detail: "registrados" },
          { label: "Total órdenes", icon: ShoppingCart, value: stats.total_orders, detail: "ventas realizadas" },
          { label: "Total facturado", icon: TrendingUp, value: format(stats.total_spent), detail: "a clientes registrados" },
        ]}
      />

      {/* Búsqueda */}
      <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre, email o teléfono..." />

      {/* Tabla reutilizable y tarjetas móviles */}
      <DataTableTimeSection
          columns={customerColumns}
          data={customers}
          getRowKey={(customer) => customer.id}
          onRowClick={(customer) => push(`/customers/${customer.id}`)}
          isLoading={isLoading}
          emptyState="No se encontraron clientes"
          recordLabel={total === 1 ? "cliente" : "clientes"}
          ariaLabel="Clientes"
          renderMobileRow={(customer) => {
            const tier = computeLoyaltyTier(customer, policies);
            const tierColors = tier ? (TIER_COLOR_CLASSES[tier.color] ?? TIER_COLOR_CLASSES.amber) : null;

            return (
              <Card
                key={customer.id}
                className="cursor-pointer pb-1 pt-1 transition-colors hover:bg-muted/20"
                onClick={() => push(`/customers/${customer.id}`)}
              >
                <CardContent className="px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{customer.name}</p>
                        {tier && tierColors && <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", tierColors.bg, tierColors.text, tierColors.border)}><Star className="size-2.5" />{tier.tier_name}</span>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{customer.phone ?? customer.email ?? "Sin contacto"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <div><p className="text-xs text-muted-foreground">Órdenes</p><p className="text-sm font-bold">{customer.total_orders}</p></div>
                      <div><p className="text-xs text-muted-foreground">Gastado</p><p className="text-sm font-bold text-primary">{format(Number(customer.total_spent))}</p></div>
                      <div onClick={(event) => event.stopPropagation()}>
                        <ActionsDropdown onView={() => push(`/customers/${customer.id}`)} onEdit={() => setEditCustomer(customer)} onDelete={() => setDeleteCustomer(customer)} canEdit={canEdit} canDelete={canDelete} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          }}
          minWidth={760}
          stickyOffset="var(--data-table-sticky-offset)"
          className="[--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem]"
          showFooterPagination={false}
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: (size) => { setPage(1); setPageSize(size); },
          }}
        />

      {/* Modales */}
      <LoyaltyPoliciesDialog open={loyaltyOpen} onOpenChange={setLoyaltyOpen} />
      <CreateCustomerDialog  open={createOpen}  onOpenChange={setCreateOpen}  onSuccess={() => mutate()} />
      <EditCustomerDialog
        customer={editCustomer}
        open={!!editCustomer}
        onOpenChange={(o) => !o && setEditCustomer(null)}
        onSuccess={() => mutate()}
      />
      <DeleteCustomerDialog
        customer={deleteCustomer}
        open={!!deleteCustomer}
        onOpenChange={(o) => !o && setDeleteCustomer(null)}
        onSuccess={() => mutate()}
      />

      <Fab
        actions={[
          ...(canEdit ? [{ label: "Nuevo cliente", icon: Users, onClick: () => setCreateOpen(true) }] : []),
          { label: "Fidelización", icon: Star, onClick: () => setLoyaltyOpen(true) },
        ]}
      />
    </div>
  );
}

function ActionsDropdown({
  onView, onEdit, onDelete, canEdit, canDelete,
}: {
  onView:    () => void;
  onEdit:    () => void;
  onDelete:  () => void;
  canEdit:   boolean;
  canDelete: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onView} className="gap-2 cursor-pointer">
          <Eye className="size-4" /> Ver resumen
        </DropdownMenuItem>
        {canEdit && (
          <DropdownMenuItem onClick={onEdit} className="gap-2 cursor-pointer">
            <Pencil className="size-4" /> Editar
          </DropdownMenuItem>
        )}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" /> Eliminar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
