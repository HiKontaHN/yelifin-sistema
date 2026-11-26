// app/(dashboard)/settings/members/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMe } from "@/hooks/swr/use-me";
import { formatInTZ, useTimezone } from "@/hooks/swr/use-timezone";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { useFeatures } from "@/hooks/use-features";
import { RoleDialog } from "@/components/settings/role-dialog";
import {
  useOrgMembers,
  useOrgRoles,
  useCreateOrgMemberUser,
  useUpdateOrgMember,
  useRemoveOrgMember,
} from "@/hooks/swr/use-organization";
import { useWarehouses } from "@/hooks/swr/use-warehouses";
import type { OrgMember } from "@/types";

import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Badge }    from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { DataTableTimeSection, DEFAULT_DATA_TABLE_PAGE_SIZE, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, UserPlus, MoreHorizontal, Loader2, Crown, Eye, EyeOff, Plus,
  Warehouse as WarehouseIcon,
} from "lucide-react";


function getInitials(name: string | null, email: string) {
  const src = name || email;
  return src.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Create member dialog ───────────────────────────────────────────────────

function CreateMemberDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { roles, mutate: mutateRoles } = useOrgRoles();
  const { can_edit: canEditRoles } = useModulePermissions("ADMIN", "ROLES");
  const { hasMultiUser } = useFeatures();
  const { createMemberUser, isCreating } = useCreateOrgMemberUser();
  const { activeWarehouses, defaultWarehouse } = useWarehouses();

  const nonOwnerRoles = roles.filter((r) => !r.is_owner);

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [name,        setName]        = useState("");
  const [roleId,      setRoleId]      = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [showCreateRole, setShowCreateRole] = useState(false);

  const reset = () => {
    setEmail(""); setPassword(""); setName(""); setRoleId(""); setShowPass(false);
    setWarehouseId(defaultWarehouse ? String(defaultWarehouse.id) : "");
  };

  useEffect(() => {
    if (open) setWarehouseId(defaultWarehouse ? String(defaultWarehouse.id) : "");
  }, [open, defaultWarehouse]);

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (isCreating) return;
    if (!email.trim())    { toast.error("El email es requerido"); return; }
    if (!password.trim()) { toast.error("La contraseña es requerida"); return; }
    if (password.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres"); return; }
    if (!roleId)          { toast.error("Seleccioná un rol"); return; }

    try {
      const res = await createMemberUser({
        email:        email.trim(),
        password,
        display_name: name.trim() || undefined,
        role_id:      Number(roleId),
        ...(warehouseId ? { default_warehouse_id: Number(warehouseId) } : {}),
      });
      if (res?.data?.email_sent === false) {
        toast.warning("Usuario creado, pero no se pudo enviar el correo de bienvenida — avísale manualmente.");
      } else {
        toast.success("Usuario creado y agregado al equipo. Le enviamos un correo para confirmar su cuenta.");
      }
      onCreated();
      handleClose();
    } catch (err: any) {
      toast.error(err.message || "Error al crear usuario");
    }
  };

  return (
    <>
      <ResponsiveModal
        open={open && !showCreateRole}
        onOpenChange={(nextOpen) => { if (!nextOpen && !isCreating) handleClose(); }}
        title="Crear usuario para el equipo"
        width="sm"
        dragToClose={!isCreating}
        as="form"
        formProps={{
          id: "create-team-member-form",
          onSubmit: (event) => { event.preventDefault(); void handleSubmit(); },
        }}
        footer={
          <>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isCreating} className="h-11 flex-1">Cancelar</Button>
            <Button type="submit" form="create-team-member-form" loading={isCreating} className="h-11 flex-1">Crear usuario</Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="cm-email">Email <span className="text-destructive">*</span></Label>
          <Input
            id="cm-email"
            type="email"
            placeholder="usuario@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isCreating}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cm-pass">Contraseña <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Input
              id="cm-pass"
              type={showPass ? "text" : "password"}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isCreating}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPass((v) => !v)}
              tabIndex={-1}
            >
              {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cm-name">Nombre</Label>
          <Input
            id="cm-name"
            placeholder="Nombre del miembro"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isCreating}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cm-role">Rol <span className="text-destructive">*</span></Label>
          <div className="flex items-center gap-2">
            <Select value={roleId} onValueChange={setRoleId} disabled={isCreating}>
              <SelectTrigger id="cm-role" className="h-10 min-w-0 flex-1">
                <SelectValue placeholder="Seleccioná un rol…" />
              </SelectTrigger>
              <SelectContent>
                {nonOwnerRoles.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEditRoles && hasMultiUser && (
              <Button type="button" variant="outline" className="h-10 shrink-0" disabled={isCreating} onClick={() => setShowCreateRole(true)}>
                <Plus className="size-4" />
                Nuevo rol
              </Button>
            )}
          </div>
        </div>

        {activeWarehouses.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="cm-warehouse" className="flex items-center gap-1.5">
              <WarehouseIcon className="size-3.5 text-muted-foreground" />
              Bodega
            </Label>
            <Select value={warehouseId} onValueChange={setWarehouseId} disabled={isCreating}>
              <SelectTrigger id="cm-warehouse" className="h-10 w-full">
                <SelectValue placeholder="Seleccioná una bodega…" />
              </SelectTrigger>
              <SelectContent>
                {activeWarehouses.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Las ventas que registre este usuario descontarán de esta bodega.
            </p>
          </div>
        )}
      </ResponsiveModal>
      {open && showCreateRole && (
        <RoleDialog
          role={null}
          onClose={() => setShowCreateRole(false)}
          onSaved={(createdRole) => {
            void mutateRoles((current) => ({
              data: [...(current?.data ?? []).filter(({ id }) => id !== createdRole.id), createdRole],
            }), { revalidate: true });
          }}
        />
      )}
    </>
  );
}

// ── Change role dialog ─────────────────────────────────────────────────────

function ChangeRoleDialog({
  member,
  onClose,
  onChanged,
}: {
  member: OrgMember | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { roles } = useOrgRoles();
  const { updateMember, isUpdating } = useUpdateOrgMember();
  const { activeWarehouses } = useWarehouses();

  const [roleId, setRoleId] = useState(member ? String(member.role_id) : "");
  const [warehouseId, setWarehouseId] = useState(member?.default_warehouse_id ? String(member.default_warehouse_id) : "");
  const nonOwnerRoles = roles.filter((r) => !r.is_owner);

  useEffect(() => {
    setRoleId(member ? String(member.role_id) : "");
    setWarehouseId(member?.default_warehouse_id ? String(member.default_warehouse_id) : "");
  }, [member]);

  const handleSave = async () => {
    if (!member || !roleId) return;
    try {
      await updateMember(member.id, Number(roleId), warehouseId ? Number(warehouseId) : null);
      toast.success("Miembro actualizado");
      onChanged();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar miembro");
    }
  };

  return (
    <Dialog open={!!member} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar miembro</DialogTitle>
        </DialogHeader>

        {member && (
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Cambiando el rol de{" "}
              <span className="font-medium text-foreground">
                {member.display_name || member.email}
              </span>
            </p>
            <div className="space-y-1.5">
              <Label>Nuevo rol</Label>
              <Select value={roleId} onValueChange={setRoleId} disabled={isUpdating}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {nonOwnerRoles.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeWarehouses.length > 1 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <WarehouseIcon className="size-3.5 text-muted-foreground" />
                  Bodega
                </Label>
                <Select value={warehouseId} onValueChange={setWarehouseId} disabled={isUpdating}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Seleccioná una bodega…" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeWarehouses.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUpdating}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isUpdating || !roleId} className="gap-2">
            {isUpdating && <Loader2 className="size-3.5 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const { back } = useRouter();
  const { isLoading: meLoading } = useMe();
  const { can_edit: canEditTeam, can_delete: canDeleteTeam, isLoading: permLoading } = useModulePermissions("ADMIN", "TEAM");
  const { members, isLoading: membersLoading, mutate } = useOrgMembers();
  const { removeMember, isRemoving } = useRemoveOrgMember();
  const timezone = useTimezone();

  const [showAdd,    setShowAdd]    = useState(false);
  const [editMember, setEditMember] = useState<OrgMember | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);

  const isLoading = meLoading || membersLoading || permLoading;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(members.length / pageSize)));
  const pagedMembers = members.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleRemove = async () => {
    if (!removingId) return;
    try {
      await removeMember(removingId);
      toast.success("Acceso revocado");
      mutate();
    } catch (err: any) {
      toast.error(err.message || "Error al revocar acceso");
    } finally {
      setRemovingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 pb-24 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const renderMember = (member: OrgMember) => (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9 shrink-0">
        <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
          {getInitials(member.display_name, member.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{member.display_name || member.email}</p>
          {member.is_owner_role && <Crown className="size-3.5 shrink-0 text-amber-500" />}
        </div>
        {member.display_name && <p className="truncate text-xs text-muted-foreground">{member.email}</p>}
      </div>
    </div>
  );

  const renderRole = (member: OrgMember) => (
    <Badge variant={member.is_owner_role ? "default" : "secondary"} className="max-w-full whitespace-normal text-xs">
      {member.role_name}
    </Badge>
  );

  const joinedDate = (member: OrgMember) => member.joined_at
    ? formatInTZ(member.joined_at, timezone, { day: "numeric", month: "short", year: "numeric" })
    : "—";

  const renderActions = (member: OrgMember) => {
    if (member.is_owner_role || (!canEditTeam && !canDeleteTeam)) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Acciones para ${member.display_name || member.email}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {canEditTeam && <DropdownMenuItem onClick={() => setEditMember(member)}>Editar miembro</DropdownMenuItem>}
          {canEditTeam && canDeleteTeam && <DropdownMenuSeparator />}
          {canDeleteTeam && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setRemovingId(member.id)}>
              Revocar acceso
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const columns: DataTableTimeSectionColumn<OrgMember>[] = [
    { id: "member", header: "Miembro", cell: renderMember },
    { id: "role", header: "Rol", width: "25%", cell: renderRole },
    { id: "joined", header: "Fecha de ingreso", width: 140, className: "text-xs text-muted-foreground", cell: joinedDate },
    ...(canEditTeam || canDeleteTeam ? [{
      id: "actions",
      header: <span className="sr-only">Acciones</span>,
      width: 60,
      align: "right" as const,
      cell: renderActions,
    }] : []),
  ];

  return (
    <div className="space-y-4 pb-24 md:space-y-6 max-w-2xl mx-auto">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Volver" onClick={() => back()}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Equipo</h1>
            <p className="text-muted-foreground text-sm">
              Miembros que tienen acceso a esta organización.
            </p>
          </div>
        </div>
        {canEditTeam && (
          <Button size="sm" className="ml-auto gap-2" onClick={() => setShowAdd(true)}>
            <UserPlus className="size-4" />
            Agregar al equipo
          </Button>
        )}
      </div>

      <DataTableTimeSection
        columns={columns}
        data={pagedMembers}
        getRowKey={(member) => member.id}
        ariaLabel="Miembros del equipo"
        recordLabel={members.length === 1 ? "miembro" : "miembros"}
        minWidth={520}
        emptyState="No hay miembros en esta organización."
        pagination={{
          page: currentPage, pageSize, total: members.length,
          onPageChange: setPage,
          onPageSizeChange: (size) => { setPageSize(size); setPage(1); },
        }}
        showFooterPagination={false}
        renderMobileRow={(member) => (
          <Card className="gap-0 p-3">
            <CardContent className="space-y-2 p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">{renderMember(member)}</div>
                {renderActions(member)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {renderRole(member)}
                {member.joined_at && <span className="text-xs text-muted-foreground">{joinedDate(member)}</span>}
              </div>
            </CardContent>
          </Card>
        )}
      />

      {/* Dialogs */}
      <CreateMemberDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => mutate()}
      />

      <ChangeRoleDialog
        member={editMember}
        onClose={() => setEditMember(null)}
        onChanged={() => mutate()}
      />

      <AlertDialog open={!!removingId} onOpenChange={(v) => { if (!v) setRemovingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar acceso?</AlertDialogTitle>
            <AlertDialogDescription>
              El miembro perderá acceso a la organización. Podés volver a agregarlo después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={isRemoving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemoving && <Loader2 className="size-4 animate-spin mr-2" />}
              Revocar acceso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
