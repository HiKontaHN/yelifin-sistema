import Link from "next/link";
import { OwnerGuard } from "@/components/shared/owner-guard";
import { SubscriptionDetails } from "@/components/settings/subscription-details";
import { Button } from "@/components/ui/button";

export default function BillingSettingsPage() {
  return (
    <OwnerGuard>
      <div className="space-y-4 pb-24 md:space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Suscripción</h1>
            <p className="text-sm text-muted-foreground">Consulta el estado de tu plan y facturación.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link href="/settings/organization">Volver a mi negocio</Link>
          </Button>
        </div>
        <SubscriptionDetails />
      </div>
    </OwnerGuard>
  );
}
