// components/settings/subscription-card.tsx
// Resumen del plan (plan actual, estado, facturación) + acceso a
// /settings/billing. Usado en Mi Negocio
// ("Plan y suscripción").
"use client";

import { useRouter } from "next/navigation";

import { useMe } from "@/hooks/swr/use-me";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Prueba",
  ACTIVE: "Activa",
  PAST_DUE: "Pago pendiente",
  CANCELLED: "Cancelada",
  EXPIRED: "Expirada",
};

const INTERVAL_LABEL: Record<string, string> = {
  MONTHLY: "Mensual",
  YEARLY: "Anual",
  LIFETIME: "De por vida",
};

export function SubscriptionCard({ title }: { title: string }) {
  const { push } = useRouter();
  const { subscription, features, isOwner } = useMe();

  const planSlug = subscription?.plan?.slug ?? null;
  const isAdmin = planSlug === "admin" || (features?.ADMIN ?? []).length > 0;
  const status = subscription?.status ?? "";
  const interval = INTERVAL_LABEL[subscription?.plan?.billing_interval ?? ""];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm md:flex-row md:items-center md:justify-between">
        {subscription ? (
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Plan actual</span>
              <p className="font-medium">{isAdmin ? "Admin" : subscription.plan?.name ?? "Sin plan"}</p>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Estado</span>
              <div>
                <Badge
                  variant={status === "ACTIVE" || status === "TRIAL" ? "secondary" : "outline"}
                  className="text-xs"
                >
                  {STATUS_LABEL[status] ?? "Sin suscripción"}
                </Badge>
              </div>
            </div>
            {interval && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Tipo de facturación</span>
                <p className="font-medium">{interval}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aún no tienes una suscripción configurada.
          </p>
        )}

        {isOwner && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => push("/settings/billing")}>
            Administrar suscripción
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
