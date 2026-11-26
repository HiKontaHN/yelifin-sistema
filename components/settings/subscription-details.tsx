"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useMe } from "@/hooks/swr/use-me";
import { SubscriptionStatusBanner } from "@/components/subscription-status-banner";

export function SubscriptionDetails() {
  const { subscription, org, isTrial, hasActiveSubscription, isLoading } = useMe();

  const planName = subscription?.contracted_plan?.name ?? subscription?.plan?.name ?? "Sin plan";
  const status = subscription?.status ?? "SIN_SUSCRIPCIÓN";
  const statusLabel = (() => {
    switch (status) {
      case "TRIAL":
        return subscription?.is_trial_expired ? "Prueba finalizada" : "Prueba";
      case "ACTIVE":
        return "Activa";
      case "PAST_DUE":
        return "Pago pendiente";
      case "CANCELLED":
        return "Cancelada";
      case "EXPIRED":
        return "Expirada";
      default:
        return "Sin suscripción";
    }
  })();

  return (
    <>
      {!isLoading && <SubscriptionStatusBanner subscription={subscription} org={org} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">
            Gestión de suscripción en construcción
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!isLoading && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Estado actual de tu suscripción
              </p>
              <p>
                Plan contratado: <span className="font-medium">{planName}</span>
              </p>
              {subscription?.is_degraded && (
                <p>
                  Plan temporal: <span className="font-medium">{subscription.plan.name}</span>
                </p>
              )}
              <p>
                Estado: <span className="font-medium">{statusLabel}</span>
              </p>
              {hasActiveSubscription && (
                <p className="text-xs text-muted-foreground">
                  {isTrial
                    ? "Estás en un período de prueba."
                    : "Tienes una suscripción activa."}
                </p>
              )}
            </div>
          )}

          <Separator />

          <p className="text-muted-foreground">
            Próximamente vas a poder:
          </p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Cambiar de plan.</li>
            <li>Actualizar tu método de pago.</li>
            <li>Ver tu historial de cobros y facturas.</li>
          </ul>

          <Separator />

          <div className="rounded-lg border bg-muted/40 p-4 text-xs leading-5 text-muted-foreground">
            Los planes pagos se renuevan mensualmente al precio aceptado hasta que los canceles. Para evitar el siguiente cobro, solicita la cancelación por el canal de soporte antes de la fecha de renovación. Mantendrás el acceso hasta que termine el período ya pagado.
          </div>
        </CardContent>
      </Card>
    </>
  );
}
