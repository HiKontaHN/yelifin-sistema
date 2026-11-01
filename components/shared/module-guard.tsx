// components/shared/module-guard.tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { useMe } from "@/hooks/swr/use-me";
import { getLandingRoute } from "@/lib/landing-route";
import type { OrgModule, ModulePermissions } from "@/types";

type Props = {
  module: OrgModule;
  subitem?: string;
  permission?: keyof ModulePermissions;
  children: React.ReactNode;
};

export function ModuleGuard({ module, subitem, permission = "can_view", children }: Props) {
  const { replace } = useRouter();
  const pathname = usePathname();
  const redirectedTo = useRef<string | null>(null);
  const perms = useModulePermissions(module, subitem);
  const { getModulePermissions, isLoading: meIsLoading } = useMe();

  const blocked = !perms.isLoading && !perms[permission];
  // /dashboard es el destino fijo tras login — si el rol no puede verlo,
  // no tiene sentido mostrarle un "sin acceso" cuyo único botón es volver
  // al mismo /dashboard bloqueado. En ese caso lo mandamos directo a su
  // primera sección con acceso real.
  const isDashboard = module === "DASHBOARD";
  const autoRedirecting = blocked && isDashboard;
  const landingRoute = autoRedirecting ? getLandingRoute(getModulePermissions) : null;
  const shouldRedirect = Boolean(
    autoRedirecting && !meIsLoading && landingRoute && landingRoute !== pathname,
  );

  useEffect(() => {
    if (shouldRedirect && landingRoute && redirectedTo.current !== landingRoute) {
      redirectedTo.current = landingRoute;
      replace(landingRoute);
    } else if (!shouldRedirect) {
      redirectedTo.current = null;
    }
  }, [landingRoute, replace, shouldRedirect]);

  if (perms.isLoading || shouldRedirect) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
          <ShieldOff className="size-8 text-muted-foreground/50" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold">Sin acceso</p>
          <p className="text-sm text-muted-foreground">
            Tu rol no tiene permiso para ver esta sección.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => replace(getLandingRoute(getModulePermissions))}
        >
          Volver al inicio
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
