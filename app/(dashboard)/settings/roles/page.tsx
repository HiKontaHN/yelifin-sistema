// app/(dashboard)/settings/roles/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useMe } from "@/hooks/swr/use-me";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import {
  useOrgRoles,
  useDeleteOrgRole,
  type OrgRole,
} from "@/hooks/swr/use-organization";
import { MODULES, MODULE_SUBITEMS } from "@/lib/permissions";

import { Button }   from "@/components/ui/button";
import { Badge }    from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PermGrid, RoleDialog, roleToPerms, type PermState } from "@/components/settings/role-dialog";
import { DataTableTimeSection, DEFAULT_DATA_TABLE_PAGE_SIZE, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2, Crown, Shield,
} from "lucide-react";

// ── Page ───────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const { back } = useRouter();
  const { isLoading: meLoading } = useMe();
  const { can_edit: canEdit, can_delete: canDelete } = useModulePermissions("ADMIN", "ROLES");
  const { roles, isLoading: rolesLoading, mutate } = useOrgRoles();
  const { deleteRole, isDeleting } = useDeleteOrgRole();

  const [showCreate,  setShowCreate]  = useState(false);
  const [editRole,    setEditRole]    = useState<OrgRole | null>(null);
  const [deletingId,  setDeletingId]  = useState<number | null>(null);
  const [expandedId,  setExpandedId]  = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);

  const isLoading = meLoading || rolesLoading;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(roles.length / pageSize)));
  const pagedRoles = roles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteRole(deletingId);
      toast.success("Rol eliminado");
      mutate();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar rol");
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 pb-24 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const renderRoleName = (role: OrgRole) => (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {role.is_owner
        ? <Crown className="size-4 shrink-0 text-amber-500" />
        : <Shield className="size-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 wrap-break-word font-medium">{role.name}</span>
      {role.is_owner && <Badge variant="outline" className="text-xs">Sistema</Badge>}
    </div>
  );

  const renderRoleActions = (role: OrgRole) => {
    const isExpanded = expandedId === role.id;
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" className="text-xs" aria-expanded={isExpanded} onClick={() => setExpandedId(isExpanded ? null : role.id)}>
          {isExpanded ? "Ocultar permisos" : "Ver permisos"}
        </Button>
        {!role.is_owner && canEdit && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${role.name}`} onClick={() => setEditRole(role)}>
            <Pencil className="size-3.5" />
          </Button>
        )}
        {!role.is_owner && canDelete && (
          <Button type="button" variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Eliminar ${role.name}`} onClick={() => setDeletingId(role.id)}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    );
  };

  const renderPermissions = (role: OrgRole) => {
    const displayPerms = role.is_owner
      ? Object.fromEntries(
          MODULES.map((module) => [module, Object.fromEntries(
            MODULE_SUBITEMS[module].map(({ code }) => [code, {
              can_view: true, can_edit: true, can_delete: true,
              show_costs: true, show_profit: true,
            }])
          )])
        ) as PermState
      : roleToPerms(role);
    return <PermGrid perms={displayPerms} readOnly />;
  };

  const columns: DataTableTimeSectionColumn<OrgRole>[] = [
    { id: "role", header: "Rol", cell: renderRoleName },
    { id: "actions", header: "Acciones", width: 230, align: "right", cell: renderRoleActions },
  ];

  return (
    <div className="space-y-4 pb-24 md:space-y-6 max-w-3xl mx-auto">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Volver" onClick={() => back()}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Roles y permisos</h1>
            <p className="text-muted-foreground text-sm">
              Definí qué puede hacer cada rol en cada módulo.
            </p>
          </div>
        </div>
        {canEdit && (
          <Button size="sm" className="ml-auto gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" />
            Nuevo rol
          </Button>
        )}
      </div>

      <DataTableTimeSection
        columns={columns}
        data={pagedRoles}
        getRowKey={(role) => role.id}
        ariaLabel="Roles y permisos"
        recordLabel={roles.length === 1 ? "rol" : "roles"}
        minWidth={490}
        emptyState="No hay roles configurados."
        pagination={{
          page: currentPage, pageSize, total: roles.length,
          onPageChange: (nextPage) => { setPage(nextPage); setExpandedId(null); },
          onPageSizeChange: (size) => { setPageSize(size); setPage(1); setExpandedId(null); },
        }}
        showFooterPagination={false}
        renderExpandedRows={(role) => expandedId === role.id && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns.length} className="whitespace-normal px-4 py-3">
              {renderPermissions(role)}
            </TableCell>
          </TableRow>
        )}
        renderMobileRow={(role) => (
          <Card className="gap-0 p-3">
            <CardContent className="space-y-2 p-0">
              {renderRoleName(role)}
              {renderRoleActions(role)}
              {expandedId === role.id && <div className="border-t pt-2">{renderPermissions(role)}</div>}
            </CardContent>
          </Card>
        )}
      />

      {/* Dialogs */}
      {showCreate && (
        <RoleDialog
          role={null}
          onClose={() => setShowCreate(false)}
          onSaved={() => mutate()}
        />
      )}

      {editRole && (
        <RoleDialog
          role={editRole}
          onClose={() => setEditRole(null)}
          onSaved={() => mutate()}
        />
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(v) => { if (!v) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo se puede eliminar si no hay miembros activos asignados a este rol.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
