// components/app-sidebar.tsx
"use client"

import {
  BarChart3, ShoppingBag, Calendar, ChevronDown, ChevronsLeft, ChevronsRight, CreditCard,
  Home, ShoppingCart, Users, Package, PackageOpen, Settings,
  User, Building2, Receipt,
  Shield, Tags, Wallet, ArrowLeftRight, UserCog, Warehouse,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { useMe }   from "@/hooks/swr/use-me"
import type { OrgModule } from "@/types"
import { MODULE_SUBITEMS } from "@/lib/permissions"
import { useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { HiKontaIcon } from "@/components/shared/hikonta-icon"
import { HiKontaTitle } from "@/components/shared/hikonta-title"

import {
  Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"

// ── Plan-specific nav (finanzas plan: flat finance items) ────────────────
const financesOnlyNav = [
  { title: "Cuentas",          url: "/finances",                icon: Wallet },
  { title: "Transacciones",    url: "/finances/transactions",   icon: ArrowLeftRight },
  { title: "Tarjetas crédito", url: "/finances/credit-cards",   icon: CreditCard },
]

// ── Nav config ──────────────────────────────────────────────────────────
// `feature` opcional: el ítem/submenú solo se muestra si el plan la incluye.
type NavItemDef = {
  title: string; url: string; icon: any; activeIcon?: any; module?: OrgModule; subitem?: string; feature?: string;
  submenu?: Array<{ title: string; url: string; subitem?: string; feature?: string }>;
};

const mainNav: NavItemDef[] = [
  { title: "Dashboard",    url: "/dashboard",  icon: Home, module: "DASHBOARD" as OrgModule },
  {
    title: "Inventario", url: "/inventory", icon: Package, activeIcon: PackageOpen, module: "INVENTORY",
    submenu: [
      { title: "Productos",    url: "/inventory",          subitem: "STOCK" },
      { title: "Movimientos",  url: "/inventory/movements", subitem: "MOVEMENTS" },
      { title: "En camino",    url: "/purchases/pending",   subitem: "INCOMING" },
    ],
  },
  {
    title: "Ventas", url: "/sales", icon: ShoppingCart, module: "SALES",
    submenu: [
      { title: "Lista de Ventas",    url: "/sales" },
      { title: "Nueva Venta (POS)", url: "/sales/new" },
    ],
  },
  { title: "Clientes",    url: "/customers", icon: Users,     module: "CUSTOMERS", feature: "customers.manage" },
  {
    title: "Finanzas", url: "/finances", icon: CreditCard, module: "FINANCES",
    submenu: [
      { title: "Cuentas",          url: "/finances",               subitem: "ACCOUNTS" },
      { title: "Transacciones",    url: "/finances/transactions",  subitem: "TRANSACTIONS" },
      { title: "Tarjetas crédito", url: "/finances/credit-cards",  subitem: "CREDIT_CARDS" },
    ],
  },
  { title: "Eventos",     url: "/events",   icon: Calendar,  module: "EVENTS" },
  { title: "Suministros", url: "/supplies", icon: ShoppingBag, module: "INVENTORY", subitem: "SUPPLIES" },
]

const secondaryNav: NavItemDef[] = [
  {
    title: "Reportes", url: "/reports", icon: BarChart3, module: "REPORTS",
    submenu: [
      { title: "Ventas",        url: "/reports/sales",     subitem: "SALES",     feature: "reports.sales" },
      { title: "Inventario",    url: "/reports/inventory", subitem: "INVENTORY", feature: "reports.inventory" },
      { title: "Rentabilidad",  url: "/reports/profit",    subitem: "PROFIT",    feature: "reports.profit" },
      { title: "Eventos",       url: "/reports/events",    subitem: "EVENTS",    feature: "reports.events" },
    ],
  },
]

const adminNav = [
  {
    title: "Administración", url: "/admin", icon: Shield,
    submenu: [
      { title: "Resumen",   url: "/admin" },
      { title: "Usuarios",  url: "/admin/users" },
      { title: "Planes",    url: "/admin/plans" },
    ],
  },
]

const settingsNavBase = [
  { title: "Mi Perfil",   url: "/settings/profile",       icon: User },
]

// Solo el propietario de la organización puede ver estas secciones —
// tocan configuración estructural de la org (identidad legal, catálogo,
// facturación) o la definición misma de los permisos, así que se quedan
// fuera de la delegación por rol.
const settingsNavOwner = [
  { title: "Mi Negocio",  url: "/settings/organization",  icon: Building2 },
  { title: "Categorías",  url: "/settings/categories",    icon: Tags },
  { title: "Suscripción", url: "/settings/billing",       icon: Receipt },
  { title: "Roles",       url: "/settings/roles",         icon: UserCog },
]

// Delegable vía permisos de rol (ADMIN.TEAM / ADMIN.WAREHOUSES) — el dueño
// siempre las ve (getModulePermissions ya le da acceso total), y un
// miembro no-dueño las ve si su rol tiene can_view en el subitem.
const settingsNavDelegable: NavItemDef[] = [
  { title: "Equipo",  url: "/settings/members",    icon: Users,     module: "ADMIN", subitem: "TEAM" },
  { title: "Bodegas", url: "/settings/warehouses", icon: Warehouse, module: "ADMIN", subitem: "WAREHOUSES" },
]

// ── Icon-only item (collapsed) ─────────────────────────────────────────
function CollapsedItem({
  item,
  isActive,
  closeOnMobile,
  pathname,
}: {
  item: any;
  isActive: (url: string) => boolean;
  closeOnMobile: () => void;
  pathname: string;
}) {
  const active = isActive(item.url)
  const Icon = active && item.activeIcon ? item.activeIcon : item.icon
  return (
    <SidebarMenuItem>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarMenuButton
            asChild
            isActive={active}
            className="justify-center"
          >
            <Link href={item.submenu ? item.submenu[0].url : item.url} onClick={closeOnMobile}>
              <Icon className="size-4" />
            </Link>
          </SidebarMenuButton>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex flex-col gap-0.5 py-2 px-3 bg-foreground text-background">
          <span className="font-medium text-sm text-background">{item.title}</span>
          {item.submenu && (
            <div className="flex flex-col gap-0.5 mt-1">
              {item.submenu.map((s: any) => (
                <Link
                  key={s.url}
                  href={s.url}
                  onClick={closeOnMobile}
                  className={`text-xs transition-opacity text-background ${
                    pathname === s.url
                      ? "font-medium opacity-100"
                      : "opacity-70 hover:opacity-100"
                  }`}
                >
                  {s.title}
                </Link>
              ))}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  )
}

// ── Full item (expanded) ───────────────────────────────────────────────
const navIconCls = "flex items-center justify-center size-7 rounded-full group-hover/navbtn:bg-sidebar-accent-foreground/10 group-data-[active=true]/navbtn:bg-sidebar-accent-foreground/10 transition-colors shrink-0"

function ExpandedItem({
  item,
  isActive,
  closeOnMobile,
  pathname,
}: {
  item: any;
  isActive: (url: string) => boolean;
  closeOnMobile: () => void;
  pathname: string;
}) {
  const active = isActive(item.url)
  const Icon = active && item.activeIcon ? item.activeIcon : item.icon
  return (
    <SidebarMenuItem>
      {item.submenu ? (
        <Collapsible defaultOpen={active} className="group/collapsible">
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              isActive={active}
              className="group/navbtn h-11 hover:rounded-xl data-[active=true]:rounded-xl"
            >
              <span className={navIconCls}>
                <Icon className="size-4 shrink-0" />
              </span>
              <span>{item.title}</span>
              <span className={cn(navIconCls, "ml-auto")}>
                <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
              </span>
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.submenu.map((sub: any) => (
                <SidebarMenuSubItem key={sub.title}>
                  <SidebarMenuSubButton asChild isActive={pathname === sub.url}>
                    <Link href={sub.url} onClick={closeOnMobile}>{sub.title}</Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <SidebarMenuButton
          asChild
          isActive={active}
          className="group/navbtn h-11 hover:rounded-xl data-[active=true]:rounded-xl"
        >
          <Link href={item.url} onClick={closeOnMobile}>
            <span className={navIconCls}>
              <Icon className="size-4 shrink-0" />
            </span>
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      )}
    </SidebarMenuItem>
  )
}

// ── Component ───────────────────────────────────────────────────────────
export function AppSidebar() {
  const pathname = usePathname()
  const { user }  = useAuth()
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar()

  const { isOwner, getModulePermissions, isLoading: meIsLoading } = useMe()
  const isAdmin      = user?.subscription?.plan?.slug === "admin"
  const planSlug     = user?.subscription?.plan?.slug ?? null
  const isFinanzas   = planSlug === "finanzas"

  const isCollapsed  = !isMobile && state === "collapsed"
  const closeOnMobile = () => { if (isMobile) setOpenMobile(false) }

  const isActive = (url: string) => {
    if (url === "/dashboard") return pathname === url || pathname === "/"
    return pathname.startsWith(url)
  }

  const canViewModule = (module?: OrgModule, subitem?: string) => {
    if (!module || meIsLoading) return true
    if (subitem) return getModulePermissions(module, subitem).can_view
    // Sin subitem específico (ítems padre de INVENTORY/FINANCES/REPORTS):
    // visible si el rol puede ver AL MENOS uno de los subitems del módulo,
    // para que p. ej. "Inventario" siga apareciendo aunque el rol solo
    // tenga acceso a "Movimientos".
    return MODULE_SUBITEMS[module].some(({ code }) => getModulePermissions(module, code).can_view)
  }

  // Feature del plan: mientras el perfil carga se muestra todo (el API
  // bloquea igual); el plan admin siempre ve todo.
  const planHasFeature = (feature?: string) => {
    if (!feature || !user) return true
    if (planSlug === "admin") return true
    return Object.values(user.features ?? {}).flat().some((f: any) => f.key === feature)
  }

  const filterByPlan = (items: NavItemDef[]) =>
    items
      .filter(item => canViewModule(item.module, item.subitem) && planHasFeature(item.feature))
      .map(item => item.submenu
        ? { ...item, submenu: item.submenu.filter(s => canViewModule(item.module, s.subitem) && planHasFeature(s.feature)) }
        : item)
      .filter(item => !item.submenu || item.submenu.length > 0)

  const visibleMainNav = filterByPlan(mainNav)
  const visibleSecondaryNav = filterByPlan(secondaryNav)

  const renderNav = (items: typeof mainNav) =>
    items.map((item) =>
      isCollapsed
        ? <CollapsedItem key={item.title} item={item} isActive={isActive} closeOnMobile={closeOnMobile} pathname={pathname} />
        : <ExpandedItem  key={item.title} item={item} isActive={isActive} closeOnMobile={closeOnMobile} pathname={pathname} />
    )

  return (
    <TooltipProvider delayDuration={200}>
      <Sidebar collapsible="icon" variant="inset" className="sticky top-0 h-svh">

        {/* ── Header ── */}
        <SidebarHeader className="px-4 py-3">
          <div className={`flex items-center ${isCollapsed ? "flex-col gap-2" : "justify-between gap-2"}`}>
            <Link
              href="/dashboard"
              onClick={closeOnMobile}
              className="flex items-center gap-2"
            >
              <HiKontaIcon className="size-8" />
              {!isCollapsed && <HiKontaTitle className="h-5" />}
            </Link>

            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={isCollapsed ? "Expandir menú" : "Contraer menú"}
              className="hidden size-6 shrink-0 items-center justify-center rounded-xl text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:flex"
            >
              {isCollapsed
                ? <ChevronsRight className="size-4" />
                : <ChevronsLeft className="size-4" />}
            </button>
          </div>
        </SidebarHeader>

        {/* ── Content ── */}
        <SidebarContent>
          {isFinanzas ? (
            // Finanzas plan: flat finance nav, no dashboard, no other sections
            <SidebarGroup>
              {!isCollapsed && <SidebarGroupLabel>Finanzas</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>{renderNav(financesOnlyNav)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <>
              <SidebarGroup>
                {!isCollapsed && <SidebarGroupLabel>Menú Principal</SidebarGroupLabel>}
                <SidebarGroupContent>
                  <SidebarMenu>{renderNav(visibleMainNav)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {visibleSecondaryNav.length > 0 && (
                <SidebarGroup>
                  {!isCollapsed && <SidebarGroupLabel>Análisis</SidebarGroupLabel>}
                  <SidebarGroupContent>
                    <SidebarMenu>{renderNav(visibleSecondaryNav)}</SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              {isAdmin && (
                <SidebarGroup>
                  {!isCollapsed && <SidebarGroupLabel>Admin</SidebarGroupLabel>}
                  <SidebarGroupContent>
                    <SidebarMenu>{renderNav(adminNav)}</SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}
            </>
          )}

          <SidebarGroup>
            {!isCollapsed && <SidebarGroupLabel>Sistema</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {renderNav([{
                  title: "Configuración", url: "/settings", icon: Settings,
                  submenu: [
                    ...settingsNavBase,
                    ...(isOwner ? settingsNavOwner : []),
                    ...settingsNavDelegable.filter(item => canViewModule(item.module, item.subitem)),
                  ],
                }])}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

        </SidebarContent>

      </Sidebar>
    </TooltipProvider>
  )
}