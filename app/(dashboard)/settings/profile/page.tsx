// app/(dashboard)/settings/profile/page.tsx
"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { useMe } from "@/hooks/swr/use-me";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2, ImageIcon } from "lucide-react";

export default function ProfilePage() {
  const { push } = useRouter();
  const {
    data,
    user,
    profile,
    subscription,
    features,
    onboardingCompleted,
    isTrial,
    hasActiveSubscription,
    isOwner,
    isLoading,
    error,
    mutate,
  } = useMe();

  const planName = subscription?.plan?.name ?? "Sin plan";
  const planSlug = subscription?.plan?.slug ?? null;
  const subscriptionStatus = subscription?.status ?? "SIN_SUSCRIPCIÓN";

  const billingIntervalLabel = useMemo(() => {
    const i = subscription?.plan?.billing_interval;
    if (i === "MONTHLY") return "Mensual";
    if (i === "YEARLY") return "Anual";
    if (i === "LIFETIME") return "De por vida";
    return null;
  }, [subscription?.plan?.billing_interval]);

  const isAdmin = useMemo(() => {
    if (!features) return false;
    const adminFeatures = features.ADMIN ?? [];
    return adminFeatures.length > 0 || planSlug === "admin";
  }, [features, planSlug]);

  const subscriptionStatusLabel = useMemo(() => {
    switch (subscriptionStatus) {
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
  }, [subscriptionStatus]);

  if (isLoading) {
    return (
      <div className="space-y-4 pb-24 md:space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
          <p className="text-muted-foreground text-sm">
            Cargando información de tu cuenta…
          </p>
        </div>
        <Card className="animate-pulse">
          <CardContent className="h-32" />
        </Card>
      </div>
    );
  }

  if (error || !data || !user || !profile) {
    return (
      <div className="space-y-4 pb-24 md:space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
          <p className="text-muted-foreground text-sm">
            No se pudo cargar la información de tu usuario.
          </p>
        </div>
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-destructive">
              {error || "Ocurrió un error inesperado."}
            </p>
            <Button variant="outline" size="sm" onClick={() => mutate()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayName =
    profile.business_name ||
    user.display_name ||
    user.email.split("@")[0] ||
    "Usuario";

  return (
    <div className="space-y-4 pb-24 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>
          <p className="text-muted-foreground text-sm">
            Configura los datos de tu cuenta y de tu negocio.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
          >
            Actualizar datos
          </Button>
        </div>
      </div>

      {/* Aviso de onboarding pendiente */}
      {!onboardingCompleted && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-950/30">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium">
              Completa la configuración inicial de tu cuenta
            </p>
            <p className="text-xs text-muted-foreground">
              Aún te falta terminar algunos pasos del onboarding. Esto te
              ayudará a aprovechar al máximo  y tener datos más precisos.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => push("/onboarding")}
              >
                Ir al onboarding
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => mutate()}
              >
                Ya lo completé
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Layout principal: mobile 1 columna, desktop 2 columnas */}
      <div className="grid gap-4 md:grid-cols-3 md:gap-6">
        {/* Columna izquierda: usuario y negocio */}
        <div className="space-y-4 md:space-y-6 md:col-span-2">
          {/* Resumen de usuario */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg">
                Información de usuario
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Nombre visible
                  </span>
                  <span className="font-medium break-all">
                    {displayName}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Correo electrónico
                  </span>
                  <span className="font-mono text-xs md:text-sm break-all">
                    {user.email}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Rol
                </span>
                {isAdmin ? (
                  <Badge variant="default" className="text-xs">
                    Administrador
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    Usuario estándar
                  </Badge>
                )}

                {hasActiveSubscription && (
                  <Badge variant={isTrial ? "outline" : "secondary"} className="text-xs">
                    {isTrial ? "Prueba activa" : "Suscripción activa"}
                  </Badge>
                )}

                {!hasActiveSubscription && (
                  <Badge variant="outline" className="text-xs">
                    Sin suscripción activa
                  </Badge>
                )}
              </div>

              <div className="pt-1">
                <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                  Cuenta creada el{" "}
                  {new Date(user.created_at).toLocaleDateString("es-HN", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Datos del negocio */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                Datos de tu negocio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {/* Logo + nombre */}
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-xl border bg-muted/40 flex items-center justify-center shrink-0 overflow-hidden">
                  {profile.business_logo_url ? (
                    <Image
                      src={profile.business_logo_url}
                      alt="Logo"
                      width={56}
                      height={56}
                      className="object-contain w-full h-full"
                      unoptimized
                    />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground/40" />
                  )}
                </div>
                <div>
                  <p className="font-semibold">
                    {profile.business_name || "Sin definir"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profile.business_logo_url ? "Logo configurado" : "Sin logo"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-0.5">
                  <span className="text-xs text-muted-foreground">Moneda</span>
                  <p className="font-medium">{profile.currency}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-xs text-muted-foreground">Zona horaria</span>
                  <p className="font-medium text-xs md:text-sm">{profile.timezone}</p>
                </div>
              </div>

              {isOwner && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => push("/settings/organization")}
                    >
                      Editar datos del negocio
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha: plan y features */}
        <div className="space-y-4 md:space-y-6">
          {/* Suscripción */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg">
                Plan y suscripción
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  Plan actual
                </span>
                <p className="font-medium">
                  {isAdmin ? "Admin" : planName}
                </p>
              </div>

              {subscription && (
                <div className="grid grid-cols-1 gap-3">
                  {billingIntervalLabel && (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">
                        Tipo de facturación
                      </span>
                      <p className="font-medium">
                        {billingIntervalLabel}
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">
                      Estado
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          subscriptionStatus === "ACTIVE" || subscriptionStatus === "TRIAL"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs"
                      >
                        {subscriptionStatusLabel}
                      </Badge>
                    </div>
                  </div>

                  {subscription.current_period_start && subscription.current_period_end && (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">
                        Período actual
                      </span>
                      <p className="text-xs" suppressHydrationWarning>
                        Del{" "}
                        {new Date(
                          subscription.current_period_start
                        ).toLocaleDateString("es-HN", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        al{" "}
                        {new Date(
                          subscription.current_period_end
                        ).toLocaleDateString("es-HN", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!subscription && (
                <p className="text-xs text-muted-foreground">
                  Aún no tienes una suscripción configurada.
                </p>
              )}

              {isOwner && (
                <>
                  <Separator />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => push("/settings/billing")}
                    >
                      Administrar suscripción
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Features rápidas
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base md:text-lg">
                Funcionalidades disponibles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs md:text-sm">
              {features && Object.keys(features).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(features).map(([category, list]) => {
                    if (!list || list.length === 0) return null;
                    return (
                      <div key={category} className="space-y-1">
                        <p className="font-semibold text-xs uppercase text-muted-foreground tracking-wide">
                          {category}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {list.map((f) => (
                            <Badge
                              key={f.key}
                              variant="outline"
                              className="text-[11px] font-normal"
                            >
                              {f.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No se encontraron funcionalidades asociadas a tu plan.
                </p>
              )}
            </CardContent>
          </Card>
           */}
        </div>
      </div>
    </div>
  );
}