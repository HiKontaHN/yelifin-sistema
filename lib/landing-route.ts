// lib/landing-route.ts
// Ruta de aterrizaje segura para un usuario según los permisos reales de
// su rol — usada tanto para el auto-redirect fuera de /dashboard cuando
// el rol no puede verlo, como para el botón "volver" de ModuleGuard, así
// nunca apunta a otra sección bloqueada (ver components/shared/module-guard.tsx).
import type { OrgModule, ModulePermissions } from "@/types";

type LandingCandidate = { module: OrgModule; subitem?: string; url: string };

const LANDING_PRIORITY: LandingCandidate[] = [
  { module: "DASHBOARD",  url: "/dashboard" },
  { module: "SALES",      url: "/sales" },
  { module: "INVENTORY",  subitem: "STOCK",     url: "/inventory" },
  { module: "FINANCES",   subitem: "ACCOUNTS",  url: "/finances" },
  { module: "CUSTOMERS",  url: "/customers" },
  { module: "EVENTS",     url: "/events" },
  { module: "REPORTS",    subitem: "SALES",     url: "/reports/sales" },
  { module: "INVENTORY",  subitem: "SUPPLIES",  url: "/supplies" },
  { module: "ADMIN",      subitem: "TEAM",       url: "/settings/members" },
  { module: "ADMIN",      subitem: "WAREHOUSES", url: "/settings/warehouses" },
];

/** Primer módulo con can_view en orden de prioridad. "/settings/profile"
 * no está gateado por módulo — es el último recurso que SIEMPRE funciona,
 * para que este fallback nunca termine en otra pantalla de "sin acceso". */
export function getLandingRoute(
  getModulePermissions: (module: OrgModule, subitem?: string) => ModulePermissions
): string {
  for (const candidate of LANDING_PRIORITY) {
    if (getModulePermissions(candidate.module, candidate.subitem).can_view) {
      return candidate.url;
    }
  }
  return "/settings/profile";
}
