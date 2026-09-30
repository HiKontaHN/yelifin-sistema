// app/(dashboard)/customers/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import { useCurrency }             from "@/hooks/swr/use-currency";
import { useModulePermissions }    from "@/hooks/use-module-permissions";
import { CreateCustomerDialog }    from "@/components/customers/create-customer-dialog";
import { EditCustomerDialog }      from "@/components/customers/edit-customer-dialog";
import { DeleteCustomerDialog }    from "@/components/customers/delete-customer-dialog";
import { LoyaltyPoliciesDialog }   from "@/components/customers/loyalty-policies-dialog";
import { Fab }                     from "@/components/ui/fab";
import { SearchBar }               from "@/components/shared/search-bar";
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
  const pageLimit = 15;

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const { customers, stats, total, totalPages, isLoading, mutate } = useCustomers({
    search: debouncedSearch || undefined,
    page,
    limit: pageLimit,
  });
  const { policies } = useLoyaltyPolicies();
  const { format }   = useCurrency();
  const { can_edit: canEdit, can_delete: canDelete } = useModulePermissions("CUSTOMERS");

  const [createOpen,      setCreateOpen]      = useState(false);
  const [loyaltyOpen,     setLoyaltyOpen]     = useState(false);
  const [editCustomer,    setEditCustomer]    = useState<Customer | null>(null);
  const [deleteCustomer,  setDeleteCustomer]  = useState<Customer | null>(null);

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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          { title: "Total clientes",  value: stats.total_customers,       sub: "registrados",            icon: Users },
          { title: "Total órdenes",   value: stats.total_orders,          sub: "ventas realizadas",      icon: ShoppingCart },
          { title: "Total facturado", value: format(stats.total_spent),   sub: "a clientes registrados", icon: TrendingUp },
        ].map((stat) => (
          <Card key={stat.title} className={stat.title === "Total facturado" ? "col-span-2 md:col-span-1 pt-1 pb-1" : "pt-1 pb-1"}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pl-3.5 pb-1 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground mb-0">{stat.title}</CardTitle>
              <stat.icon className="size-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pl-3.5 pb-3">
              <div className="text-xl font-bold">
                {isLoading ? <Skeleton className="h-6 w-20" /> : stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Búsqueda */}
      <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre, email o teléfono..." />

      {/* Tabla — desktop */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Órdenes</TableHead>
                <TableHead className="text-right">Total gastado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No se encontraron clientes
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => {
                  const tier       = computeLoyaltyTier(customer, policies);
                  const tierColors = tier ? (TIER_COLOR_CLASSES[tier.color] ?? TIER_COLOR_CLASSES.amber) : null;
                  return (
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => push(`/customers/${customer.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{customer.name}</span>
                          {tier && tierColors && (
                            <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full border", tierColors.bg, tierColors.text, tierColors.border)}>
                              <Star className="size-2.5" />{tier.tier_name}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{customer.phone ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{customer.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{customer.total_orders}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {format(Number(customer.total_spent))}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ActionsDropdown
                          onView={()   => push(`/customers/${customer.id}`)}
                          onEdit={()   => setEditCustomer(customer)}
                          onDelete={() => setDeleteCustomer(customer)}
                          canEdit={canEdit}
                          canDelete={canDelete}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cards — móvil */}
      <div className="space-y-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
        ) : customers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">No se encontraron clientes</p>
            </CardContent>
          </Card>
        ) : (
          customers.map((customer) => {
            const tier       = computeLoyaltyTier(customer, policies);
            const tierColors = tier ? (TIER_COLOR_CLASSES[tier.color] ?? TIER_COLOR_CLASSES.amber) : null;
            return (
              <Card
                key={customer.id}
                className="pb-1 pt-1 cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => push(`/customers/${customer.id}`)}
              >
                <CardContent className="px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{customer.name}</p>
                        {tier && tierColors && (
                          <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full border", tierColors.bg, tierColors.text, tierColors.border)}>
                            <Star className="size-2.5" />{tier.tier_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {customer.phone ?? customer.email ?? "Sin contacto"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div>
                        <p className="text-xs text-muted-foreground">Órdenes</p>
                        <p className="text-sm font-bold">{customer.total_orders}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Gastado</p>
                        <p className="text-sm font-bold text-primary">{format(Number(customer.total_spent))}</p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <ActionsDropdown
                          onView={()   => push(`/customers/${customer.id}`)}
                          onEdit={()   => setEditCustomer(customer)}
                          onDelete={() => setDeleteCustomer(customer)}
                          canEdit={canEdit}
                          canDelete={canDelete}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground order-2 sm:order-1">
            {total} cliente{total !== 1 ? "s" : ""} · página {page} de {totalPages}
          </p>
          <Pagination className="order-1 sm:order-2 w-auto mx-0 justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1))
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <PaginationItem key={`ellipsis-${i}`}><PaginationEllipsis /></PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink isActive={p === page} onClick={() => setPage(p as number)} className="cursor-pointer">
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

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
