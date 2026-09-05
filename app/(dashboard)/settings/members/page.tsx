// app/(dashboard)/settings/members/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useMe } from "@/hooks/swr/use-me";
import { useModulePermissions } from "@/hooks/use-module-permissions";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowLeft, UserPlus, MoreHorizontal, Loader2, Crown, Users, Eye, EyeOff,
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
  const { roles } = useOrgRoles();
  const { createMemberUser, isCreating } = useCreateOrgMemberUser();
  const { activeWarehouses, defaultWarehouse } = useWarehouses();

  const nonOwnerRoles = roles.filter((r) => !r.is_owner);

  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [name,        setName]        = useState("");
  const [roleId,      setRoleId]      = useState("");
  const [warehouseId, setWarehouseId] = useState("");

  const reset = () => {
    setEmail(""); setPassword(""); setName(""); setRoleId(""); setShowPass(false);
    setWarehouseId(defaultWarehouse ? String(defaultWarehouse.id) : "");
  };

  useEffect(() => {
    if (open) setWarehouseId(defaultWarehouse ? String(defaultWarehouse.id) : "");
  }, [open, defaultWarehouse]);

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Crear usuario para el equipo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
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
            <Label>Rol <span className="text-destructive">*</span></Label>
            <Select value={roleId} onValueChange={setRoleId} disabled={isCreating}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Seleccioná un rol…" />
              </SelectTrigger>
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
              <Select value={warehouseId} onValueChange={setWarehouseId} disabled={isCreating}>
                <SelectTrigger className="h-10">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isCreating} className="gap-2">
            {isCreating && <Loader2 className="size-3.5 animate-spin" />}
            Crear usuario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const [showAdd,    setShowAdd]    = useState(false);
  const [editMember, setEditMember] = useState<OrgMember | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const isLoading = meLoading || membersLoading || permLoading;

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

  return (
    <div className="space-y-4 pb-24 md:space-y-6 max-w-2xl mx-auto">

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => back()}>
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
          <Button size="sm" className="gap-2" onClick={() => setShowAdd(true)}>
            <UserPlus className="size-4" />
            Agregar al equipo
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            {members.length} {members.length === 1 ? "miembro" : "miembros"}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-6 py-4">
              <Avatar className="size-9 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {getInitials(m.display_name, m.email)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">
                    {m.display_name || m.email}
                  </p>
                  {m.is_owner_role && (
                    <Crown className="size-3.5 text-amber-500 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant={m.is_owner_role ? "default" : "secondary"}
                  className="text-xs hidden sm:inline-flex"
                >
                  {m.role_name}
                </Badge>
                {m.joined_at && (
                  <span className="text-xs text-muted-foreground hidden md:inline">
                    {format(new Date(m.joined_at), "d MMM yyyy", { locale: es })}
                  </span>
                )}

                {(canEditTeam || canDeleteTeam) && !m.is_owner_role && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {canEditTeam && (
                        <DropdownMenuItem onClick={() => setEditMember(m)}>
                          Editar miembro
                        </DropdownMenuItem>
                      )}
                      {canEditTeam && canDeleteTeam && <DropdownMenuSeparator />}
                      {canDeleteTeam && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setRemovingId(m.id)}
                        >
                          Revocar acceso
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}

          {members.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No hay miembros en esta organización.
            </div>
          )}
        </CardContent>
      </Card>

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
