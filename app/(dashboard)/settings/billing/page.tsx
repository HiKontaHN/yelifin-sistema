"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useMe } from "@/hooks/swr/use-me";
import { OwnerGuard } from "@/components/shared/owner-guard";

export default function BillingSettingsPage() {
  return (
    <OwnerGuard>
      <BillingSettingsContent />
    </OwnerGuard>
  );
}

function BillingSettingsContent() {
  const { push } = useRouter();
  const { subscription, isTrial, hasActiveSubscription, isLoading } = useMe();

  const planName = subscription?.plan?.name ?? "Sin plan";
  const status = subscription?.status ?? "SIN_SUSCRIPCIÓN";

  const statusLabel = (() => {
    switch (status) {
      case "TRIAL":
        return "Prueba";
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
    <div className="space-y-4 pb-24 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Suscripción</h1>
          <p className="text-muted-foreground text-sm">
            Aquí podrás gestionar tu plan, pagos y facturación.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => push("/settings/profile")}
          >
            Volver a mi perfil
          </Button>
        </div>
      </div>

      {/* Placeholder principal */}
      <Card>
        <CardHeader className="pb-3">
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
                Plan: <span className="font-medium">{planName}</span>
              </p>
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

          <p className="text-xs text-muted-foreground">
            Mientras tanto, puedes revisar un resumen de tu plan actual en{" "}
            <span className="font-medium">Mi perfil</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}