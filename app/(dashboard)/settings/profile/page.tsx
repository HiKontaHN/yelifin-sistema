// app/(dashboard)/settings/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useMe, useUpdateProfile } from "@/hooks/swr/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChangePasswordDialog } from "@/components/settings/change-password-dialog";
import { Building2, KeyRound, Loader2, Lock, Save } from "lucide-react";

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
    isLoading,
    error,
    mutate,
  } = useMe();
  const { updateProfile, isSaving } = useUpdateProfile();
  const [displayName, setDisplayName] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    if (user) setDisplayName(user.display_name ?? "");
  }, [user]);

  const isAdmin =
    subscription?.plan?.slug === "admin" || (features?.ADMIN ?? []).length > 0;

  const handleSave = async () => {
    try {
      await updateProfile({ display_name: displayName.trim() || null });
      await mutate();
      toast.success("Datos actualizados correctamente");
    } catch (err: any) {
      toast.error(err.message || "Error al guardar los cambios");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 pb-24 md:space-y-6">
        <Card className="animate-pulse">
          <CardContent className="h-32" />
        </Card>
        <Card className="animate-pulse">
          <CardContent className="h-20" />
        </Card>
      </div>
    );
  }

  if (error || !data || !user || !profile) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-destructive">
            {error || "No se pudo cargar la información de tu usuario."}
          </p>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  const unchanged = displayName.trim() === (user.display_name ?? "");

  return (
    <div className="space-y-4 pb-28 md:space-y-6">
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
              <Button size="sm" onClick={() => push("/onboarding")}>
                Ir al onboarding
              </Button>
              <Button size="sm" variant="ghost" onClick={() => mutate()}>
                Ya lo completé
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* General */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            General
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-col gap-3 md:max-w-xl">
            <div className="space-y-1.5">
              <Label htmlFor="displayName" className="text-xs text-muted-foreground font-normal">
                Nombre visible
              </Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre o apodo"
                disabled={isSaving}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Correo electrónico</span>
              <span className="font-mono text-xs md:text-sm break-all">{user.email}</span>
            </div>
            <Separator className="mt-1" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Rol</span>
            {isAdmin ? (
              <Badge variant="default" className="text-xs">Administrador</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Usuario estándar</Badge>
            )}
            {hasActiveSubscription ? (
              <Badge variant={isTrial ? "outline" : "secondary"} className="text-xs">
                {isTrial ? "Prueba activa" : "Suscripción activa"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Sin suscripción activa</Badge>
            )}
          </div>

          <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
            Cuenta creada el{" "}
            {new Date(user.created_at).toLocaleDateString("es-HN", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </CardContent>
      </Card>

      {/* Seguridad */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" />
            Seguridad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setPasswordOpen(true)}>
            <KeyRound className="size-3.5" />
            Cambiar contraseña
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />

      {/* Save bar — mismo patrón que Mi Negocio */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-3 bg-background/95 backdrop-blur border-t md:static md:flex md:justify-end md:border-0 md:bg-transparent md:backdrop-blur-none md:px-0 md:pt-0 md:pb-0">
        <Button className="w-full md:w-auto gap-2" onClick={handleSave} disabled={isSaving || unchanged}>
          {isSaving
            ? <><Loader2 className="size-4 animate-spin" />Guardando…</>
            : <><Save className="size-4" />Guardar cambios</>
          }
        </Button>
      </div>
    </div>
  );
}
