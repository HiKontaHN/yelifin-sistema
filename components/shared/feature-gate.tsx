// components/shared/feature-gate.tsx
"use client";

import { useAuth } from "@/hooks/use-auth";
import { FeatureKey } from "@/types";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";

type AuthUser = NonNullable<ReturnType<typeof useAuth>["user"]>;

export function hasPlanFeature(user: AuthUser, feature: FeatureKey) {
  return (
    user.subscription?.plan?.slug === "admin" ||
    Object.values(user.features ?? {})
      .flat()
      .some((f) => f.key === feature)
  );
}

// Bloquea el contenido si el plan de la org no incluye la feature.
// El bloqueo real está en el API (requireFeature) — esto es la capa de UX.
export function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { push } = useRouter();

  // Perfil aún cargando: renderizar el contenido (las páginas tienen sus
  // propios skeletons y el API bloquea igual si no corresponde)
  if (!user) return <>{children}</>;

  if (hasPlanFeature(user, feature)) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center max-w-md mx-auto">
      <div className="size-14 rounded-full bg-muted flex items-center justify-center">
        <Lock className="size-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Función no disponible en tu plan</h2>
        <p className="text-sm text-muted-foreground">
          Tu plan actual no incluye esta función. Mejorá tu plan para desbloquearla.
        </p>
      </div>
      <Button onClick={() => push("/settings/billing")}>Ver planes</Button>
    </div>
  );
}
