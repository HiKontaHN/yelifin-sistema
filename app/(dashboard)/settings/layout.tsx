// app/(dashboard)/settings/layout.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { useMe } from "@/hooks/swr/use-me";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModuleGuard } from "@/components/shared/module-guard";
import { FeatureGate, hasPlanFeature } from "@/components/shared/feature-gate";
import type { FeatureKey } from "@/types";

// Cada pestaña es una página aparte — la URL es el estado, así que
// recargar deja al usuario en la misma pestaña.
// - owner:   solo el dueño la ve (la página trae su propio OwnerGuard).
// - subitem: permiso ADMIN.<subitem> del rol; sin can_view no aparece.
// - feature: feature del plan; sin ella aparece con candado y la página
//            muestra el FeatureGate (upsell).
type SettingsTab = {
  title: string;
  href: string;
  owner?: boolean;
  subitem?: string;
  feature?: FeatureKey;
};

const TABS: SettingsTab[] = [
  { title: "Mi Perfil",   href: "/settings/profile" },
  { title: "Mi Negocio",  href: "/settings/organization", owner: true },
  { title: "Categorías",  href: "/settings/categories",   subitem: "CATEGORIES" },
  { title: "Mi Equipo",   href: "/settings/members",      subitem: "TEAM",  feature: "admin.multi_user" },
  { title: "Roles",       href: "/settings/roles",        subitem: "ROLES", feature: "admin.multi_user" },
  { title: "Mis Bodegas", href: "/settings/warehouses",   subitem: "WAREHOUSES" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { isOwner, getModulePermissions, isLoading } = useMe();

  // Mientras el perfil carga se muestran todas (igual que el sidebar).
  const visibleTabs = TABS.filter((t) => {
    if (isLoading) return true;
    if (t.owner) return isOwner;
    if (t.subitem) return getModulePermissions("ADMIN", t.subitem).can_view;
    return true;
  });

  const current = TABS.find((t) => pathname.startsWith(t.href));

  // Flechas de scroll horizontal (en móvil las pestañas no caben).
  const listRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = () => {
    const el = listRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [visibleTabs.length]);

  // Lleva la pestaña activa a la vista al navegar.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-state="active"]')
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [pathname]);

  const scrollBy = (dir: 1 | -1) =>
    listRef.current?.scrollBy({ left: dir * listRef.current.clientWidth * 0.6, behavior: "smooth" });

  const arrowClass =
    "absolute top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm text-muted-foreground hover:text-primary";

  let content = <>{children}</>;
  if (current?.feature) content = <FeatureGate feature={current.feature}>{content}</FeatureGate>;
  if (current?.subitem) content = <ModuleGuard module="ADMIN" subitem={current.subitem}>{content}</ModuleGuard>;

  return (
    <div className="space-y-4 md:space-y-6">
      <Tabs value={current?.href ?? ""} className="relative">
        {canLeft && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-10 rounded-l-xl bg-gradient-to-r from-card to-transparent" />
            <button type="button" aria-label="Ver pestañas anteriores" onClick={() => scrollBy(-1)} className={`${arrowClass} left-1`}>
              <ChevronLeft className="size-4" />
            </button>
          </>
        )}
        <TabsList
          ref={listRef}
          onScroll={updateArrows}
          className="max-w-full gap-1.5 overflow-x-auto rounded-xl border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visibleTabs.map((t) => (
            <TabsTrigger
              key={t.href}
              value={t.href}
              asChild
              className="rounded-xl border-0 px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-primary/15 hover:text-primary data-[state=active]:bg-primary/15 data-[state=active]:font-medium data-[state=active]:text-primary"
            >
              <Link href={t.href}>
                {t.title}
                {t.feature && user && !hasPlanFeature(user, t.feature) && <Lock className="size-3" />}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
        {canRight && (
          <>
            <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-10 rounded-r-xl bg-gradient-to-l from-card to-transparent" />
            <button type="button" aria-label="Ver más pestañas" onClick={() => scrollBy(1)} className={`${arrowClass} right-1`}>
              <ChevronRight className="size-4" />
            </button>
          </>
        )}
      </Tabs>
      {content}
    </div>
  );
}
