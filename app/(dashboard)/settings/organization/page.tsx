// app/(dashboard)/settings/organization/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { toast } from "sonner";

import { useMe, useUploadLogo } from "@/hooks/swr/use-me";
import { useUpdateOrganization, useIndustries } from "@/hooks/swr/use-organization";
import { OwnerGuard } from "@/components/shared/owner-guard";
import { SubscriptionCard } from "@/components/settings/subscription-card";
import { PartnerLinkCard } from "@/components/settings/partner-link-card";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import {
  Building2, Upload, X, Loader2, Save, ImageIcon,
} from "lucide-react";

const TIMEZONES = [
  { value: "America/Tegucigalpa",             label: "Honduras (Tegucigalpa)" },
  { value: "America/Guatemala",               label: "Guatemala" },
  { value: "America/El_Salvador",             label: "El Salvador" },
  { value: "America/Managua",                 label: "Nicaragua" },
  { value: "America/Costa_Rica",              label: "Costa Rica" },
  { value: "America/Panama",                  label: "Panamá" },
  { value: "America/Mexico_City",             label: "México (Ciudad de México)" },
  { value: "America/Bogota",                  label: "Colombia (Bogotá)" },
  { value: "America/Lima",                    label: "Perú (Lima)" },
  { value: "America/Santiago",                label: "Chile (Santiago)" },
  { value: "America/Argentina/Buenos_Aires",  label: "Argentina (Buenos Aires)" },
  { value: "America/Caracas",                 label: "Venezuela (Caracas)" },
  { value: "America/New_York",                label: "EE.UU. Este (New York)" },
  { value: "America/Chicago",                 label: "EE.UU. Central (Chicago)" },
  { value: "America/Los_Angeles",             label: "EE.UU. Pacífico (Los Ángeles)" },
  { value: "Europe/Madrid",                   label: "España (Madrid)" },
  { value: "UTC",                             label: "UTC" },
];

const CURRENCIES = [
  { value: "HNL", label: "HNL — Lempira hondureño" },
  { value: "USD", label: "USD — Dólar estadounidense" },
  { value: "GTQ", label: "GTQ — Quetzal guatemalteco" },
  { value: "MXN", label: "MXN — Peso mexicano" },
  { value: "COP", label: "COP — Peso colombiano" },
  { value: "PEN", label: "PEN — Sol peruano" },
  { value: "CLP", label: "CLP — Peso chileno" },
  { value: "ARS", label: "ARS — Peso argentino" },
  { value: "EUR", label: "EUR — Euro" },
];

export default function OrganizationSettingsPage() {
  return (
    <OwnerGuard>
      <OrganizationSettingsContent />
    </OwnerGuard>
  );
}

function OrganizationSettingsContent() {
  // OwnerGuard ya garantiza que solo el dueño llega acá.
  const { org, isLoading, mutate } = useMe();
  const { updateOrg,  isSaving }    = useUpdateOrganization();
  const { uploadLogo, isUploading } = useUploadLogo();
  const { industries }              = useIndustries();

  const [orgName,     setOrgName]     = useState("");
  const [logoUrl,     setLogoUrl]     = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [timezone,    setTimezone]    = useState("");
  const [currency,    setCurrency]    = useState("");
  const [industryId,  setIndustryId]  = useState<string>(""); // string por el Select

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (org) {
      setOrgName(org.name ?? "");
      setLogoUrl(org.logo_url ?? null);
      setTimezone(org.timezone ?? "America/Tegucigalpa");
      setCurrency(org.currency ?? "HNL");
      setIndustryId(org.industry_id ? String(org.industry_id) : "");
    }
  }, [org]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes (JPG, PNG, WebP, GIF)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen no puede superar 2 MB");
      return;
    }
    setPendingFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleRemoveLogo = () => {
    setPendingFile(null);
    setLogoPreview(null);
    setLogoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async () => {
    try {
      let finalLogoUrl = logoUrl;
      if (pendingFile) {
        finalLogoUrl = await uploadLogo(pendingFile);
        setPendingFile(null);
        setLogoPreview(null);
        setLogoUrl(finalLogoUrl);
      }

      await updateOrg({
        name:        orgName.trim() || undefined,
        logo_url:    finalLogoUrl ?? undefined,
        timezone,
        currency,
        industry_id: industryId ? Number(industryId) : undefined,
      });
      await mutate();
      toast.success("Datos actualizados correctamente");
    } catch (err: any) {
      toast.error(err.message || "Error al guardar los cambios");
    }
  };

  const currentLogo = logoPreview ?? logoUrl;
  const busy = isSaving || isUploading;

  if (isLoading) {
    return (
      <div className="space-y-4 pb-24 md:space-y-6">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 md:space-y-6">

      {/* Información del negocio: logo a la izquierda, datos a la derecha */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            Información del negocio
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="size-20 rounded-xl border bg-muted/40 flex items-center justify-center shrink-0 overflow-hidden">
                {currentLogo ? (
                  <Image
                    src={currentLogo}
                    alt="Logo del negocio"
                    width={80}
                    height={80}
                    className="object-contain w-full h-full"
                    unoptimized
                  />
                ) : (
                  <ImageIcon className="size-8 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  {isUploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  {currentLogo ? "Cambiar logo" : "Subir logo"}
                </Button>
                {currentLogo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive"
                    onClick={handleRemoveLogo}
                    disabled={busy}
                  >
                    <X className="size-3.5" />
                    Eliminar logo
                  </Button>
                )}
              </div>
            </div>
            {pendingFile && (
              <p className="text-xs text-muted-foreground">
                Imagen seleccionada: <span className="font-medium">{pendingFile.name}</span>. Se subirá al guardar.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WebP o GIF de 200×200 px y máximo 2 MB.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="orgName">Nombre del negocio</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Ej. Tienda Don José"
                disabled={busy}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="industry">Rubro del negocio</Label>
              <SearchableSelect
                value={industryId}
                onValueChange={setIndustryId}
                disabled={busy}
                placeholder="Selecciona un rubro"
                searchPlaceholder="Buscar rubro..."
                className="h-10 w-full sm:w-72"
                items={industries.map((i) => ({ value: String(i.id), label: i.name }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Zona horaria</Label>
                <Select value={timezone} onValueChange={setTimezone} disabled={busy}>
                  <SelectTrigger id="timezone" className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="currency">Moneda principal</Label>
                <Select value={currency} onValueChange={setCurrency} disabled={busy}>
                  <SelectTrigger id="currency" className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <SubscriptionCard title="Plan y suscripción" />
      <PartnerLinkCard />

      {/* Save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-3 bg-background/95 backdrop-blur border-t md:static md:flex md:justify-end md:border-0 md:bg-transparent md:backdrop-blur-none md:px-0 md:pt-0 md:pb-0">
        <Button className="w-full md:w-auto gap-2" onClick={handleSave} disabled={busy}>
          {busy
            ? <><Loader2 className="size-4 animate-spin" />Guardando…</>
            : <><Save className="size-4" />Guardar cambios</>
          }
        </Button>
      </div>
    </div>
  );
}
