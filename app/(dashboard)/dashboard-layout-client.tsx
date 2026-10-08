"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useOnboardingGuard } from "@/hooks/use-onboarding-guard";
import { usePlanGuard } from "@/hooks/use-plan-guard";
import { LoadingScreen } from "@/hooks/ui/loading-screen";
import { HiKontaTitle } from "@/components/shared/hikonta-title";
import { SWRProvider } from "@/components/providers/swr-provider";
import { PrivacyModeProvider } from "@/context/privacy-mode-context";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavUserMenu } from "@/components/nav-user-menu";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/sales": "Ventas",
  "/sales/new": "Nueva venta",
  "/inventory": "Inventario",
  "/inventory/movements": "Movimientos",
  "/purchases/pending": "En camino",
  "/customers": "Clientes",
  "/finances": "Finanzas",
  "/finances/transactions": "Transacciones",
  "/finances/credit-cards": "Tarjetas de crédito",
  "/events": "Eventos y Ferias",
  "/supplies": "Suministros",
  "/settings": "Configuración",
  "/settings/profile": "Perfil",
  "/settings/organization": "Organización",
  "/settings/categories": "Categorías",
  "/settings/roles": "Roles y permisos",
  "/settings/members": "Equipo",
  "/settings/billing": "Suscripción",
  "/settings/warehouses": "Bodegas",
  "/reports/sales": "Reporte de ventas",
  "/reports/inventory": "Reporte de inventario",
  "/reports/profit": "Reporte de ganancias",
  "/reports/events": "Reporte de eventos",
  "/admin": "Panel de administración",
  "/admin/users": "Usuarios",
  "/admin/plans": "Planes",
};

function getPageTitle(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (/^\/sales\/[^/]+\/edit$/.test(pathname)) return "Editar venta";
  if (/^\/sales\/[^/]+$/.test(pathname)) return "Detalle de venta";
  if (/^\/inventory\/[^/]+$/.test(pathname)) return "Detalle de producto";
  if (/^\/customers\/[^/]+$/.test(pathname)) return "Detalle de cliente";
  if (/^\/events\/[^/]+$/.test(pathname)) return "Detalle de evento";
  if (/^\/finances\/credit-cards\/[^/]+$/.test(pathname)) return "Detalle de tarjeta";
  if (/^\/admin\/users\/[^/]+$/.test(pathname)) return "Usuario";
  if (/^\/admin\/plans\/[^/]+$/.test(pathname)) return "Plan";

  const lastSegment = pathname.split("/").filter(Boolean).at(-1);
  return lastSegment
    ? lastSegment.replaceAll("-", " ").replace(/^./, (letter) => letter.toLocaleUpperCase("es-HN"))
    : "Dashboard";
}

export function DashboardLayoutClient({
  children,
  initialSidebarOpen,
}: {
  children: React.ReactNode;
  initialSidebarOpen: boolean;
}) {
  const pathname = usePathname();
  const { firebaseUser, loading } = useRequireAuth();
  const { checking } = useOnboardingGuard();
  usePlanGuard();

  if (loading || checking) return <LoadingScreen />;
  if (!firebaseUser) return null;

  return (
    <SWRProvider>
      <PrivacyModeProvider>
        <SidebarProvider defaultOpen={initialSidebarOpen} className="h-svh overflow-hidden rounded-none">
          <AppSidebar />

          <SidebarInset className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-none">
            <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 py-4 lg:px-6">
              <SidebarTrigger className="-ml-1 md:hidden" />
              <Separator orientation="vertical" className="mr-2 h-4 md:hidden" />
              <h1 className="hidden min-w-0 truncate text-2xl font-semibold tracking-tight md:block">
                {getPageTitle(pathname)}
              </h1>
              <Breadcrumb className="md:hidden">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      <HiKontaTitle className="h-4" />
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="ml-auto flex items-center gap-2">
                <ThemeToggle isCollapsed />
                <NavUserMenu />
              </div>
            </header>

            {/* Tables cancel this scroll container's padding, not the navbar height. */}
            <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4 lg:p-6 [--data-table-sticky-offset:-1rem] lg:[--data-table-sticky-offset:-1.5rem] md:[&_h1]:hidden">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </PrivacyModeProvider>
    </SWRProvider>
  );
}
