// lib/permissions.ts
// Catálogo de módulos y subitems de permisos de rol. Fuente única de
// verdad para qué subitems tiene cada módulo — reemplaza la lista de
// módulos duplicada en lib/auth.ts, app/api/organization/roles/*,
// app/api/auth/me/route.tsx y la anotación de settings/roles/page.tsx.
//
// El import de OrgModule es solo de tipos (se borra al compilar), así
// que este archivo no arrastra nada de servidor — es seguro de usar
// tanto en rutas de API como en componentes de cliente.
//
// Ver database/docs/public-id-and-permission-granularity-plan.md
// (Parte 2) para el contexto completo de por qué existen los
// subitems y cómo se migraron en v4.17.
import type { OrgModule } from "@/lib/auth";

export type ModuleSubitem = { code: string; label: string };

export const MODULE_LABELS: Record<OrgModule, string> = {
  DASHBOARD: "Dashboard",
  PRODUCTS:  "Productos",
  INVENTORY: "Inventario",
  SALES:     "Ventas",
  CUSTOMERS: "Clientes",
  FINANCES:  "Finanzas",
  EVENTS:    "Eventos",
  REPORTS:   "Reportes",
  ADMIN:     "Administración",
};

export const MODULES: OrgModule[] = [
  "DASHBOARD", "PRODUCTS", "INVENTORY", "SALES", "CUSTOMERS",
  "FINANCES", "EVENTS", "REPORTS", "ADMIN",
];

export const MODULE_SUBITEMS: Record<OrgModule, readonly ModuleSubitem[]> = {
  DASHBOARD: [{ code: "DASHBOARD", label: "Dashboard" }],
  PRODUCTS:  [{ code: "PRODUCTS",  label: "Productos" }],
  INVENTORY: [
    { code: "STOCK",     label: "Inventario" },
    { code: "MOVEMENTS", label: "Movimientos" },
    { code: "INCOMING",  label: "En camino" },
    { code: "SUPPLIES",  label: "Suministros" },
  ],
  SALES:     [{ code: "SALES", label: "Ventas" }],
  CUSTOMERS: [{ code: "CUSTOMERS", label: "Clientes" }],
  FINANCES: [
    { code: "ACCOUNTS",     label: "Cuentas" },
    { code: "TRANSACTIONS", label: "Transacciones" },
    { code: "CREDIT_CARDS", label: "Tarjetas de crédito" },
  ],
  EVENTS: [{ code: "EVENTS", label: "Eventos" }],
  REPORTS: [
    { code: "SALES",     label: "Ventas" },
    { code: "INVENTORY", label: "Inventario" },
    { code: "PROFIT",    label: "Rentabilidad" },
    { code: "EVENTS",    label: "Eventos" },
  ],
  ADMIN: [
    { code: "TEAM",  label: "Equipo" },
    { code: "ROLES", label: "Roles" },
  ],
};

/** Subitem por defecto de un módulo — el que representan las rutas ya
 * existentes que hoy llaman requireModule()/getModulePermissions() sin
 * especificar subitem. */
export function defaultSubitem(module: OrgModule): string {
  return MODULE_SUBITEMS[module][0].code;
}
