// components/shared/owner-guard.tsx
"use client";

import { useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/swr/use-me";

// Igual que ModuleGuard, pero para secciones de Configuración que solo debe
// poder ver el propietario de la organización (Mi Negocio, Categorías,
// Suscripción) — sin importar los permisos por módulo del rol.
export function OwnerGuard({ children }: { children: React.ReactNode }) {
  const { push } = useRouter();
  const { isOwner, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
          <ShieldOff className="size-8 text-muted-foreground/50" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold">Sin acceso</p>
          <p className="text-sm text-muted-foreground">
            Solo el propietario de la organización puede ver esta sección.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => push("/settings/profile")}>
          Volver a mi perfil
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
