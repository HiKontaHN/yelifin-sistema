"use client";

import { Fragment, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/shared/responsive-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateOrgRole, useUpdateOrgRole, type OrgRole } from "@/hooks/swr/use-organization";
import { MODULES, MODULE_SUBITEMS, MODULE_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { OrgModule, ModulePermissions } from "@/types";

// ── Constants ──────────────────────────────────────────────────────────────

const PERM_COLS: { key: keyof ModulePermissions; label: string; mobileLabel: string; hint: string }[] = [
  { key: "can_view",    label: "Ver",      mobileLabel: "Ver",           hint: "Puede entrar y ver el módulo" },
  { key: "can_edit",    label: "Editar",   mobileLabel: "Crear / editar", hint: "Puede crear y modificar registros" },
  { key: "can_delete",  label: "Eliminar", mobileLabel: "Eliminar",      hint: "Puede borrar registros" },
  { key: "show_costs",  label: "Costos",   mobileLabel: "Ver costos",    hint: "Ve precios de compra y costos" },
  { key: "show_profit", label: "Ganancia", mobileLabel: "Ver ganancias", hint: "Ve utilidades y márgenes" },
];

// Permisos por módulo y, dentro de cada módulo, por subitem — ver
// lib/permissions.ts. Los módulos de un solo subitem (DASHBOARD,
// PRODUCTS, SALES, CUSTOMERS, EVENTS) se ven exactamente igual que
// antes; INVENTORY/FINANCES/REPORTS/ADMIN muestran una fila por subitem.
export type PermState = Record<OrgModule, Record<string, ModulePermissions>>;

const EMPTY_MODULE_PERM: ModulePermissions = {
  can_view: false, can_edit: false, can_delete: false,
  show_costs: false, show_profit: false,
};

function emptyPerms(): PermState {
  return Object.fromEntries(
    MODULES.map((module) => [module, Object.fromEntries(
      MODULE_SUBITEMS[module].map(({ code }) => [code, { ...EMPTY_MODULE_PERM }])
    )])
  ) as PermState;
}

export function roleToPerms(role: OrgRole): PermState {
  const base = emptyPerms();
  for (const module of MODULES) {
    const modulePerms = role.permissions[module];
    if (!modulePerms) continue;
    for (const { code } of MODULE_SUBITEMS[module]) {
      const p = modulePerms[code];
      if (p) base[module][code] = { ...p };
    }
  }
  return base;
}

// ── Permission grid ────────────────────────────────────────────────────────

export function PermGrid({
  perms,
  onChange,
  readOnly = false,
}: {
  perms: PermState;
  onChange?: (next: PermState) => void;
  readOnly?: boolean;
}) {
  const toggle = (module: OrgModule, subitem: string, col: keyof ModulePermissions) => {
    if (readOnly || !onChange) return;
    onChange({
      ...perms,
      [module]: {
        ...perms[module],
        [subitem]: { ...perms[module][subitem], [col]: !perms[module][subitem][col] },
      },
    });
  };

  // Encabezado de módulo dividido: un clic otorga/quita esa columna en
  // todos sus subitems a la vez (mismo efecto que el único checkbox de
  // antes, cuando el módulo todavía no se dividía).
  const toggleAll = (module: OrgModule, col: keyof ModulePermissions) => {
    if (readOnly || !onChange) return;
    const subitems = MODULE_SUBITEMS[module];
    const allOn = subitems.every(({ code }) => perms[module][code][col]);
    const nextValue = !allOn;
    onChange({
      ...perms,
      [module]: Object.fromEntries(
        subitems.map(({ code }) => [code, { ...perms[module][code], [col]: nextValue }])
      ),
    });
  };

  return (
    <>
      {/* ── Móvil: una tarjeta por módulo, subitems como filas propias ── */}
      <div className="sm:hidden space-y-3">
        {MODULES.map((module) => {
          const subitems = MODULE_SUBITEMS[module];
          const isSplit = subitems.length > 1;
          return (
            <div key={module} className="rounded-xl border p-3 space-y-2.5">
              <p className="font-semibold text-sm">{MODULE_LABELS[module]}</p>
              {subitems.map(({ code, label }) => {
                const p = perms[module][code];
                const activeCount = PERM_COLS.filter((c) => p[c.key]).length;
                return (
                  <div key={code} className={cn(isSplit && "space-y-2 border-t pt-2")}>
                    {isSplit && (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <Badge variant={activeCount > 0 ? "secondary" : "outline"} className="text-[10px] shrink-0">
                          {activeCount}/{PERM_COLS.length}
                        </Badge>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {PERM_COLS.map((col) => (
                        <label
                          key={col.key}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm",
                            !readOnly && "cursor-pointer active:bg-muted/50",
                            p[col.key] ? "border-primary/40 bg-primary/5" : "border-border",
                          )}
                        >
                          <Checkbox
                            checked={p[col.key]}
                            onCheckedChange={() => toggle(module, code, col.key)}
                            disabled={readOnly}
                          />
                          <span className="leading-tight">{col.mobileLabel}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── Desktop: tabla ── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-3 font-medium text-muted-foreground w-40">Sección</th>
              {PERM_COLS.map((c) => (
                <th key={c.key} className="text-center py-2 px-1 font-medium text-muted-foreground min-w-[48px]" title={c.hint}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((module) => {
              const subitems = MODULE_SUBITEMS[module];

              if (subitems.length === 1) {
                const code = subitems[0].code;
                const p = perms[module][code];
                return (
                  <tr key={module} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-sm">{MODULE_LABELS[module]}</span>
                    </td>
                    {PERM_COLS.map((col) => (
                      <td key={col.key} className="py-2.5 px-1 text-center align-top pt-3">
                        <Checkbox
                          checked={p[col.key]}
                          onCheckedChange={() => toggle(module, code, col.key)}
                          disabled={readOnly}
                          className="mx-auto"
                        />
                      </td>
                    ))}
                  </tr>
                );
              }

              return (
                <Fragment key={module}>
                  <tr className="border-b bg-muted/20">
                    <td className="py-2 pr-3">
                      <span className="font-semibold text-sm">{MODULE_LABELS[module]}</span>
                    </td>
                    {PERM_COLS.map((col) => {
                      const allOn = subitems.every(({ code }) => perms[module][code][col.key]);
                      return (
                        <td key={col.key} className="py-2 px-1 text-center">
                          <Checkbox
                            checked={allOn}
                            onCheckedChange={() => toggleAll(module, col.key)}
                            disabled={readOnly}
                            className="mx-auto"
                            aria-label={`Todo ${MODULE_LABELS[module]} — ${col.label}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {subitems.map(({ code, label }) => {
                    const p = perms[module][code];
                    return (
                      <tr key={`${module}-${code}`} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 pr-3 pl-4">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <span className="opacity-50">›</span> {label}
                          </span>
                        </td>
                        {PERM_COLS.map((col) => (
                          <td key={col.key} className="py-2 px-1 text-center">
                            <Checkbox
                              checked={p[col.key]}
                              onCheckedChange={() => toggle(module, code, col.key)}
                              disabled={readOnly}
                              className="mx-auto"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Role dialog (create / edit) ────────────────────────────────────────────

export function RoleDialog({
  role,
  onClose,
  onSaved,
}: {
  role: OrgRole | null;       // null = create mode
  onClose: () => void;
  onSaved: (savedRole: OrgRole) => void;
}) {
  const isEdit = !!role;
  const { createRole, isCreating } = useCreateOrgRole();
  const { updateRole, isUpdating } = useUpdateOrgRole();

  const [name,  setName]  = useState(role?.name ?? "");
  const [perms, setPerms] = useState<PermState>(role ? roleToPerms(role) : emptyPerms());

  const busy = isCreating || isUpdating;

  const handleSave = async () => {
    if (busy) return;
    if (!name.trim()) { toast.error("El nombre del rol es requerido"); return; }
    try {
      const result = role
        ? await updateRole(role.id, { name: name.trim(), permissions: perms })
        : await createRole(name.trim(), perms);
      toast.success(isEdit ? "Rol actualizado" : "Rol creado");
      onSaved(result.data);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar el rol");
    }
  };

  return (
    <ResponsiveModal
      open
      onOpenChange={(v) => { if (!v && !busy) onClose(); }}
      title={isEdit ? "Editar rol" : "Nuevo rol"}
      width="xl"
      dragToClose={!busy}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={busy} className="flex-1 gap-2">
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {isEdit ? "Guardar cambios" : "Crear rol"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="roleName">Nombre del rol</Label>
        <Input
          id="roleName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Cajero, Bodeguero, Contador…"
          disabled={busy}
        />
      </div>

      <div className="space-y-2">
        <Label>Permisos por módulo</Label>
        <PermGrid perms={perms} onChange={setPerms} readOnly={busy} />
      </div>
    </ResponsiveModal>
  );
}
