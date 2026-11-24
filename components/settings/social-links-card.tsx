"use client";

import { useState, type FormEvent } from "react";
import { Facebook, Instagram, Link2, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganizationSocialLinks } from "@/hooks/swr/use-organization";
import { SOCIAL_LABELS, SOCIAL_PLATFORMS, type OrganizationSocialLinks } from "@/lib/organization-social-links";

const platformIcons = { facebook: Facebook, instagram: Instagram, whatsapp: MessageCircle };
const placeholders = {
  facebook: "facebook.com/tunegocio",
  instagram: "instagram.com/tunegocio",
  whatsapp: "+504 9999-9999",
};

export function SocialLinksCard({ orgId }: { orgId: number }) {
  const { links, isLoading, isSaving, error, retry, saveLinks } = useOrganizationSocialLinks(orgId);
  const [draft, setDraft] = useState<OrganizationSocialLinks | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const values = draft ?? links;
  const hasChanges = SOCIAL_PLATFORMS.some((platform) =>
    (values?.[platform]?.trim() ?? "") !== (links?.[platform] ?? ""),
  );

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!values || !hasChanges || isSaving) return;
    setSaveError(null);
    try {
      await saveLinks(values);
      setDraft(null);
      toast.success("Redes sociales guardadas");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "No se pudieron guardar las redes sociales");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4 text-muted-foreground" />
          Redes sociales
        </CardTitle>
        <CardDescription>Tu catálogo público usa Instagram y WhatsApp para recibir consultas. Deja un campo vacío para quitar el enlace.</CardDescription>
      </CardHeader>
      <CardContent>
        {values ? (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {SOCIAL_PLATFORMS.map((platform) => {
                const Icon = platformIcons[platform];
                const id = `business-social-${platform}`;
                return (
                  <div key={platform} className="min-w-0 space-y-1.5">
                    <Label htmlFor={id} className="flex items-center gap-2">
                      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                      {SOCIAL_LABELS[platform]}
                    </Label>
                    <Input
                      id={id}
                      value={values[platform] ?? ""}
                      onChange={(event) => {
                        setDraft({ ...values, [platform]: event.target.value });
                        setSaveError(null);
                      }}
                      disabled={isSaving}
                      placeholder={placeholders[platform]}
                      inputMode={platform === "whatsapp" ? "text" : "url"}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={2048}
                      aria-describedby={platform === "whatsapp" ? `${id}-help` : undefined}
                    />
                    {platform === "whatsapp" && (
                      <p id={`${id}-help`} className="text-xs text-muted-foreground">
                        Enlace de WhatsApp o número con + y código de país.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
            <Button type="submit" variant="outline" disabled={!hasChanges || isSaving} loading={isSaving}>
              Guardar redes sociales
            </Button>
          </form>
        ) : isLoading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Cargando redes sociales…
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">No se pudieron cargar las redes sociales.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void retry()} disabled={!error}>
              Reintentar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
