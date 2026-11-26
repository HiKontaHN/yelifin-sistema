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
  const { subscription, isOwner } = useMe();

  const status = subscription?.status ?? "";
  const interval = INTERVAL_LABEL[subscription?.plan?.billing_interval ?? ""];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-4 text-sm md:flex-row md:items-center md:justify-between md:pl-2.5 md:pr-6">
        {subscription ? (
          <div className="grid grid-cols-3 gap-2 text-center md:flex md:flex-wrap md:gap-x-10 md:gap-y-3 md:text-left">
            <div className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">
                {subscription.is_degraded ? "Plan contratado" : "Plan actual"}
              </span>
              <p className="wrap-break-word font-medium">
                {subscription.contracted_plan?.name ?? subscription.plan?.name ?? "Sin plan"}
              </p>
              {subscription.is_degraded && (
                <div className="pt-1">
                  <span className="block text-xs text-muted-foreground">Plan temporal</span>
                  <p className="wrap-break-word font-medium">{subscription.plan?.name ?? "Gratis"}</p>
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">Estado</span>
              <div>
                <Badge
                  variant={status === "ACTIVE" || status === "TRIAL" ? "secondary" : "outline"}
                  className="max-w-full whitespace-normal text-xs leading-tight"
                >
                  {STATUS_LABEL[status] ?? "Sin suscripción"}
                </Badge>
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">Tipo de facturación</span>
              <p className="font-medium">{interval ?? "—"}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Aún no tienes una suscripción configurada.
          </p>
        )}

        {isOwner && (
          <Button size="sm" variant="outline" className="shrink-0 self-end md:self-auto" onClick={() => push("/settings/billing")}>
            Administrar suscripción
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
