"use client";

import type { OrgInfo, UserSubscription } from "@/types";

function graceEndLabel(value: string | null, timezone: string) {
  if (!value) return null;
  const lastGraceMinute = new Date(new Date(value).getTime() - 60_000);
  return new Intl.DateTimeFormat("es-HN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  }).format(lastGraceMinute);
}

export function SubscriptionStatusBanner({
  subscription,
  org,
}: {
  subscription: UserSubscription | null | undefined;
  org: OrgInfo | null | undefined;
}) {
  if (!subscription) return null;

  if (subscription.is_trial_expired) {
    return (
      <div className="mb-4 rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950 lg:mb-6">
        Tu prueba terminó, ahora estás en el plan Gratis.
      </div>
    );
  }

  if (!subscription.is_in_grace && !subscription.is_degraded) return null;

  const endLabel = graceEndLabel(
    subscription.grace_ends_at,
    org?.timezone || "America/Tegucigalpa",
  );

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 lg:mb-6">
      {subscription.is_degraded ? (
        <>
          El pago sigue pendiente y el período de gracia terminó
          {endLabel ? ` al final del ${endLabel}` : ""}. Hasta que se confirme el pago,
          solo el dueño puede ingresar y la organización usa temporalmente el plan Gratis.
        </>
      ) : (
        <>
          Tu pago está pendiente. Mantendrás las funciones del plan contratado
          {endLabel ? ` hasta el final del ${endLabel}` : " durante el período de gracia"};
          después se aplicará temporalmente el plan Gratis.
        </>
      )}
    </div>
  );
}
