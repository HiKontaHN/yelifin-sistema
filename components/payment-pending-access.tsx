"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function PaymentPendingAccess({ message }: { message?: string | null }) {
  const { logout } = useAuth();

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-lg space-y-5 rounded-2xl border bg-background p-8 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="size-7 text-amber-700" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Pago pendiente</h1>
          <p className="text-muted-foreground">
            {message || "El pago está pendiente; por ahora, solo el dueño de la organización puede entrar."}
          </p>
          <p className="text-sm text-muted-foreground">
            Pídele al dueño que actualice la suscripción o confirme el pago.
          </p>
        </div>
        <Button variant="outline" onClick={() => void logout().then(() => window.location.replace("/login"))}>
          Cerrar sesión
        </Button>
      </div>
    </main>
  );
}
