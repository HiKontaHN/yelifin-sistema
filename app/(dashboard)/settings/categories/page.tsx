// app/(dashboard)/settings/categories/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Tags,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Fab } from "@/components/ui/fab";
import { OwnerGuard } from "@/components/shared/owner-guard";
import { SearchBar } from "@/components/shared/search-bar";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useTransactionCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  TransactionCategory,
} from "@/hooks/swr/use-transaction-categories";

const TYPE_CONFIG = {
  INCOME: {
    label: "Ingresos",
    icon: ArrowDownCircle,
    badge: "bg-green-100 text-green-700 border-green-200",
  },
  EXPENSE: {
    label: "Egresos",
    icon: ArrowUpCircle,
    badge: "bg-red-100 text-red-700 border-red-200",
  },
  TRANSFER: {
    label: "Transferencias",
    icon: ArrowLeftRight,
    badge: "bg-blue-100 text-blue-700 border-blue-200",
  },
};

export default function CategoriesPage() {
  return (
    <OwnerGuard>
      <CategoriesPageContent />
    </OwnerGuard>
  );
}

const pageLimit = 15;

function CategoriesPageContent() {
  const [selectedType, setSelectedType] = useState<"INCOME" | "EXPENSE" | "TRANSFER">("EXPENSE");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const { categories, totalPages, isLoading, mutate } = useTransactionCategories({
    type:   selectedType,
    status: statusFilter,
    search: debouncedSearch || undefined,
    page,
    limit: pageLimit,
  });
  const { create } = useCreateCategory();
  const { update } = useUpdateCategory();
  const { remove } = useDeleteCategory();

  const [createOpen, setCreateOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<TransactionCategory | null>(null);
  const [deleteCategory, setDeleteCategory] = useState<TransactionCategory | null>(null);
  const [reactivatingId, setReactivatingId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"INCOME" | "EXPENSE" | "TRANSFER">("EXPENSE");

  useEffect(() => { setPage(1); }, [selectedType, statusFilter, debouncedSearch]);

  const filtered = Array.isArray(categories) ? categories : [];

  // Prevenir autofocus al abrir modales
  useEffect(() => {
    if (createOpen || editCategory) {
      // Quitar focus de cualquier elemento activo
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  }, [createOpen, editCategory]);

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error("Ingresa un nombre");
      return;
    }

    setIsSubmitting(true);
    try {
      await create({ name: formName.trim(), type: formType });
      toast.success("Categoría creada");
      mutate();
      setCreateOpen(false);
      setFormName("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editCategory || !formName.trim()) return;

    setIsSubmitting(true);
    try {
      await update(editCategory.id, { name: formName.trim() });
      toast.success("Categoría actualizada");
      mutate();
      setEditCategory(null);
      setFormName("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCategory) return;

    setIsSubmitting(true);
    try {
      await remove(deleteCategory.id);
      toast.success("Categoría eliminada");
      mutate();
      setDeleteCategory(null);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReactivate = async (cat: TransactionCategory) => {
    setReactivatingId(cat.id);
    try {
      await update(cat.id, { is_active: true });
      toast.success("Categoría reactivada");
      mutate();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setReactivatingId(null);
    }
  };

  return (
    <div className="space-y-4 pb-24 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Categorías de Transacciones
          </h1>
          <p className="text-muted-foreground text-sm">
            Administra las categorías para clasificar tus transacciones
          </p>
        </div>
      </div>

      {/* Filtro de tipo — mismo estilo que "Tipo" en la modal de transacciones */}
      <div className="grid grid-cols-3 gap-1.5 rounded-xl border sm:inline-flex sm:w-fit">
        {(["INCOME", "EXPENSE", "TRANSFER"] as const).map((type) => {
          const config = TYPE_CONFIG[type];
          const Icon = config.icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200",
                selectedType === type
                  ? "rounded-xl bg-primary/15 text-primary"
                  : "text-muted-foreground hover:rounded-xl hover:bg-primary/15 hover:text-primary",
              )}
            >
              <Icon className="size-3.5" />
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Búsqueda + estado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBar
          value={search}
          onChange={setSearch}
          size="full"
          className="sm:max-w-sm"
          placeholder="Buscar por nombre..."
        />
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="h-10 w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activas</SelectItem>
            <SelectItem value="inactive">Inactivas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla Desktop */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-12 text-muted-foreground">
                    No hay categorías. Crea una para comenzar.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((cat) => (
                  <TableRow key={cat.id} className={cn(!cat.is_active && "opacity-60")}>
                    <TableCell className="font-medium">{cat.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={TYPE_CONFIG[cat.type].badge}>
                          {TYPE_CONFIG[cat.type].label}
                        </Badge>
                        {!cat.is_active && (
                          <Badge variant="secondary" className="text-xs">Inactiva</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {cat.is_active ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => {
                              setEditCategory(cat);
                              setFormName(cat.name);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteCategory(cat)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          disabled={reactivatingId === cat.id}
                          onClick={() => handleReactivate(cat)}
                        >
                          {reactivatingId === cat.id
                            ? <Loader2 className="size-3.5 animate-spin" />
                            : <RotateCcw className="size-3.5" />
                          }
                          Reactivar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cards Móvil */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">No hay categorías</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((cat) => (
            <Card key={cat.id} className={cn(!cat.is_active && "opacity-60")}>
              <CardContent className="flex items-center justify-between px-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{cat.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <Badge variant="outline" className={`${TYPE_CONFIG[cat.type].badge} text-xs`}>
                      {TYPE_CONFIG[cat.type].label}
                    </Badge>
                    {!cat.is_active && (
                      <Badge variant="secondary" className="text-xs">Inactiva</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {cat.is_active ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          setEditCategory(cat);
                          setFormName(cat.name);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => setDeleteCategory(cat)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={reactivatingId === cat.id}
                      onClick={() => handleReactivate(cat)}
                    >
                      {reactivatingId === cat.id
                        ? <Loader2 className="size-4 animate-spin" />
                        : <RotateCcw className="size-4" />
                      }
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination className="w-auto mx-0">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) =>
                  p === 1 || p === totalPages ||
                  (p >= page - 1 && p <= page + 1)
                )
                .reduce<(number | "…")[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push("…");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        isActive={p === page}
                        onClick={() => setPage(p as number)}
                        className="cursor-pointer"
                      >
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

      {/* FAB */}
      <Fab
        actions={[
          {
            label: "Nueva categoría",
            icon: Plus,
            onClick: () => {
              setFormType(selectedType);
              setCreateOpen(true);
            },
          },
        ]}
      />

      {/* Dialog Crear */}
      <Dialog open={createOpen} onOpenChange={(v) => !v && setCreateOpen(false)}>
        <DialogContent
          className={cn(
            "fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0",
            "w-full max-w-full rounded-t-2xl rounded-b-none border-t border-x-0 border-b-0",
            "max-h-[92dvh] flex flex-col p-0",
            "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2",
            "sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-full sm:max-w-md",
            "sm:rounded-2xl sm:border",
            "sm:max-h-[88vh]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-bottom sm:data-[state=open]:slide-in-from-bottom-[48%]",
            "data-[state=closed]:slide-out-to-bottom sm:data-[state=closed]:slide-out-to-bottom-[48%]",
            "duration-300",
          )}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={() => setCreateOpen(false)}
        >
          <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <DialogHeader className="shrink-0 px-5 pt-2 pb-3 sm:pt-5 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Tags className="size-4 text-primary" />
              Nueva Categoría
            </DialogTitle>
          </DialogHeader>

          <div
            className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
            style={{ scrollbarWidth: "none" } as React.CSSProperties}
          >
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Tipo <span className="text-destructive text-xs">*</span>
              </Label>
              <Select value={formType} onValueChange={(v: any) => setFormType(v)}>
                <SelectTrigger className="w-full h-11 text-left">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INCOME">Ingreso</SelectItem>
                  <SelectItem value="EXPENSE">Egreso</SelectItem>
                  <SelectItem value="TRANSFER">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Nombre <span className="text-destructive text-xs">*</span>
              </Label>
              <Input
                autoFocus={false}
                placeholder="Ej: Publicidad"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                onFocus={(e) => {
                  setTimeout(() => {
                    e.target.scrollIntoView({ 
                      behavior: 'smooth', 
                      block: 'center',
                      inline: 'nearest'
                    });
                  }, 300);
                }}
                className="h-11 text-base"
              />
            </div>
          </div>

          <div className="shrink-0 px-5 py-4 border-t bg-transparent xl:bg-transparent md:bg-transparent sm:bg-background flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={isSubmitting}
              className="flex-1 h-11"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={isSubmitting}
              className="flex-1 h-11 gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creando…
                </>
              ) : (
                "Crear"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar */}
      <Dialog open={!!editCategory} onOpenChange={(v) => !v && setEditCategory(null)}>
        <DialogContent
          className={cn(
            "fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0",
            "w-full max-w-full rounded-t-2xl rounded-b-none border-t border-x-0 border-b-0",
            "max-h-[92dvh] flex flex-col p-0",
            "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2",
            "sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-full sm:max-w-md",
            "sm:rounded-2xl sm:border",
            "sm:max-h-[88vh]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-bottom sm:data-[state=open]:slide-in-from-bottom-[48%]",
            "data-[state=closed]:slide-out-to-bottom sm:data-[state=closed]:slide-out-to-bottom-[48%]",
            "duration-300",
          )}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={() => setEditCategory(null)}
        >
          <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <DialogHeader className="shrink-0 px-5 pt-2 pb-3 sm:pt-5 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Pencil className="size-4 text-primary" />
              Editar Categoría
            </DialogTitle>
          </DialogHeader>

          <div
            className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
            style={{ scrollbarWidth: "none" } as React.CSSProperties}
          >
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Nombre <span className="text-destructive text-xs">*</span>
              </Label>
              <Input
                autoFocus={false}
                placeholder="Nombre de la categoría"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                onFocus={(e) => {
                  setTimeout(() => {
                    e.target.scrollIntoView({ 
                      behavior: 'smooth', 
                      block: 'center',
                      inline: 'nearest'
                    });
                  }, 300);
                }}
                className="h-11 text-base"
              />
            </div>
          </div>

          <div className="shrink-0 px-5 py-4 border-t bg-transparent xl:bg-transparent md:bg-transparent sm:bg-background flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditCategory(null)}
              disabled={isSubmitting}
              className="flex-1 h-11"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleUpdate}
              disabled={isSubmitting}
              className="flex-1 h-11 gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Eliminar */}
      <Dialog open={!!deleteCategory} onOpenChange={(v) => !v && setDeleteCategory(null)}>
        <DialogContent
          className={cn(
            "fixed bottom-0 left-0 right-0 top-auto translate-x-0 translate-y-0",
            "w-full max-w-full rounded-t-2xl rounded-b-none border-t border-x-0 border-b-0",
            "max-h-[92dvh] flex flex-col p-0",
            "sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2",
            "sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-full sm:max-w-md",
            "sm:rounded-2xl sm:border",
            "sm:max-h-[88vh]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-bottom sm:data-[state=open]:slide-in-from-bottom-[48%]",
            "data-[state=closed]:slide-out-to-bottom sm:data-[state=closed]:slide-out-to-bottom-[48%]",
            "duration-300",
          )}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={() => setDeleteCategory(null)}
        >
          <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          <DialogHeader className="shrink-0 px-5 pt-2 pb-3 sm:pt-5 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-destructive">
              <Trash2 className="size-4" />
              Eliminar Categoría
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <p className="text-sm text-muted-foreground">
              ¿Estás seguro que deseas eliminar la categoría{" "}
              <span className="font-medium text-foreground">
                "{deleteCategory?.name}"
              </span>
              ? Esta acción no se puede deshacer.
            </p>
          </div>

          <div className="shrink-0 px-5 py-4 border-t bg-transparent xl:bg-transparent md:bg-transparent sm:bg-background flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteCategory(null)}
              disabled={isSubmitting}
              className="flex-1 h-11"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="flex-1 h-11 gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Eliminando…
                </>
              ) : (
                "Eliminar"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}