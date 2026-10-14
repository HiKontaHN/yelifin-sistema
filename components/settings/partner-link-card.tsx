// components/settings/partner-link-card.tsx
// Vincular con una incubadora/partner — código de invitación, ver
// database/partners/04-invite-codes.sql. Solo el dueño: linkear cambia con
// quién comparte visibilidad de actividad la org (el API también lo exige).
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Building2, Handshake, Loader2, Mail, Phone, UserRound } from "lucide-react";

import { useMe } from "@/hooks/swr/use-me";
import {
  useLinkPartner,
  useOrganizationPartner,
  useUpdatePartnerFinancialSharing,
} from "@/hooks/swr/use-organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

export function PartnerLinkCard() {
  const { isOwner } = useMe();
  const { partner, isLoading } = useOrganizationPartner(isOwner);
  const { linkPartner, isLinking } = useLinkPartner();
  const { updateFinancialSharing, isUpdating } = useUpdatePartnerFinancialSharing();
  const [code, setCode] = useState("");

  if (!isOwner) return null;

  const handleLink = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const { partnerName } = await linkPartner(trimmed);
      toast.success(`Tu negocio quedó vinculado a ${partnerName}`);
      setCode("");
    } catch (err: any) {
      toast.error(err.message || "No se pudo vincular el código");
    }
  };

  const handleFinancialSharing = async (checked: boolean) => {
    try {
      await updateFinancialSharing(checked);
      toast.success(
        checked
          ? "Tu partner ya puede consultar tus datos financieros"
          : "Dejaste de compartir tus datos financieros"
      );
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar el permiso");
    }
  };

  if (isLoading) {
    return <Skeleton className="h-52 rounded-xl" />;
  }

  if (partner) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Handshake className="size-4 text-muted-foreground" />
            Partner vinculado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="size-5" />
              </div>
              <div className="min-w-0 space-y-2">
                <div>
                  <p className="font-semibold">{partner.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Vinculado desde {new Intl.DateTimeFormat("es-HN", { dateStyle: "long" }).format(new Date(partner.linked_at))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {partner.contact_name && (
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="size-3.5" />{partner.contact_name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-3.5" />{partner.email}
                  </span>
                  {partner.phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5" />{partner.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
            <div className="space-y-1">
              <Label htmlFor="share-partner-financials" className="cursor-pointer">
                Compartir datos financieros
              </Label>
              <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Permite que {partner.name} consulte ingresos, costos y utilidad. La actividad general y las ventas sin montos siguen visibles mientras el vínculo esté activo.
              </p>
            </div>
            <Switch
              id="share-partner-financials"
              checked={partner.share_financials}
              onCheckedChange={handleFinancialSharing}
              disabled={isUpdating}
              aria-label="Compartir datos financieros con el partner"
              className="mt-0.5 cursor-pointer"
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Handshake className="size-4 text-muted-foreground" />
          Vincular con una incubadora
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Si una incubadora o aceleradora te dio un código de invitación, ingrésalo acá para
          que pueda monitorear tu rendimiento (nunca tus montos, a menos que lo autorices
          por separado).
        </p>
        <div className="flex gap-2 md:max-w-xl">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Código de invitación"
            disabled={isLinking}
            className="uppercase"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleLink}
            disabled={isLinking || !code.trim()}
          >
            {isLinking ? <Loader2 className="size-4 animate-spin" /> : "Vincular"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
