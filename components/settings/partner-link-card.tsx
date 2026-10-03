// components/settings/partner-link-card.tsx
// Vincular con una incubadora/partner — código de invitación, ver
// database/partners/04-invite-codes.sql. Solo el dueño: linkear cambia con
// quién comparte visibilidad de actividad la org (el API también lo exige).
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Handshake, Loader2 } from "lucide-react";

import { useMe } from "@/hooks/swr/use-me";
import { useLinkPartner } from "@/hooks/swr/use-organization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PartnerLinkCard() {
  const { isOwner } = useMe();
  const { linkPartner, isLinking } = useLinkPartner();
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
