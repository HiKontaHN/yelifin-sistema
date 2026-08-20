// app/(dashboard)/settings/organization/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";

import { useMe, useUpdateProfile, useUploadLogo } from "@/hooks/swr/use-me";
import { useUpdateOrganization, useIndustries, useLinkPartner } from "@/hooks/swr/use-organization";
import { OwnerGuard } from "@/components/shared/owner-guard";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Building2, Upload, X, Loader2, Save, ImageIcon, Handshake,
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
  const { back } = useRouter();
  const { user, org, isOwner, isLoading, mutate } = useMe();
  const { updateProfile, isSaving: isSavingProfile }    = useUpdateProfile();
  const { updateOrg,     isSaving: isSavingOrg }        = useUpdateOrganization();
  const { uploadLogo,    isUploading }                   = useUploadLogo();
  const { industries }                                   = useIndustries();
  const { linkPartner,   isLinking }                     = useLinkPartner();

  const [partnerCode, setPartnerCode] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [orgName,     setOrgName]     = useState("");
  const [logoUrl,     setLogoUrl]     = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [timezone,    setTimezone]    = useState("");
  const [currency,    setCurrency]    = useState("");
  const [industryId,  setIndustryId]  = useState<string>(""); // string por el Select

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && org) {
      setDisplayName(user.display_name ?? "");
      setOrgName(org.name ?? "");
      setLogoUrl(org.logo_url ?? null);
      setTimezone(org.timezone ?? "America/Tegucigalpa");
      setCurrency(org.currency ?? "HNL");
      setIndustryId(org.industry_id ? String(org.industry_id) : "");
    }
  }, [user, org]);

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

      const promises: Promise<any>[] = [];

      // Datos personales → /api/auth/me
      if (displayName.trim() !== (user?.display_name ?? "")) {
        promises.push(updateProfile({ display_name: displayName.trim() || null }));
      }

      // Datos de la org → /api/organization (solo si es owner)
      if (isOwner) {
        promises.push(
          updateOrg({
            name:        orgName.trim() || undefined,
            logo_url:    finalLogoUrl ?? undefined,
            timezone,
            currency,
            industry_id: industryId ? Number(industryId) : undefined,
          })
        );
      }

      await Promise.all(promises);
      await mutate();
      toast.success("Datos actualizados correctamente");
    } catch (err: any) {
      toast.error(err.message || "Error al guardar los cambios");
    }
  };

  const handleLinkPartner = async () => {
    const code = partnerCode.trim();
    if (!code) return;
    try {
      const { partnerName } = await linkPartner(code);
      toast.success(`Tu negocio quedó vinculado a ${partnerName}`);
      setPartnerCode("");
    } catch (err: any) {
      toast.error(err.message || "No se pudo vincular el código");
    }
  };

  const currentLogo = logoPreview ?? logoUrl;
  const busy = isSavingProfile || isSavingOrg || isUploading;

  if (isLoading) {
    return (
      <div className="space-y-4 pb-24 md:space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 md:space-y-6 max-w-2xl mx-auto">

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mi negocio</h1>
          <p className="text-muted-foreground text-sm">
            Nombre, logo y configuración regional de tu organización.
          </p>
        </div>
      </div>

      {/* Logo */}
      {isOwner && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              Logo del negocio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  {currentLogo ? "Cambiar imagen" : "Subir logo"}
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
              JPG, PNG, WebP o GIF · Máximo 2 MB · Recomendado: cuadrado, min. 200×200 px.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Información */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Información general</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Tu nombre visible</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tu nombre o apodo"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">Cómo aparecés vos en el sistema.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="orgName">Nombre del negocio</Label>
            <Input
              id="orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Ej. Tienda Don José"
              disabled={busy || !isOwner}
            />
            {!isOwner && (
              <p className="text-xs text-muted-foreground">Solo el dueño puede cambiar el nombre del negocio.</p>
            )}
          </div>

          {isOwner && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Zona horaria</Label>
                <Select value={timezone} onValueChange={setTimezone} disabled={busy}>
                  <SelectTrigger id="timezone" className="h-10"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger id="currency" className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se usa para mostrar precios y calcular totales en el sistema.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="industry">Industria del negocio</Label>
                <Select value={industryId} onValueChange={setIndustryId} disabled={busy}>
                  <SelectTrigger id="industry" className="h-10"><SelectValue placeholder="Selecciona una industria" /></SelectTrigger>
                  <SelectContent>
                    {industries.map((i) => (
                      <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Vincular con una incubadora/partner — código de invitación, ver
          database/partners/04-invite-codes.sql. Solo el dueño (mismo
          criterio que el resto de esta página: linkear cambia con quién
          comparte visibilidad de actividad la organización). */}
      {isOwner && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Handshake className="size-4 text-muted-foreground" />
              Vincular con una incubadora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Si una incubadora o aceleradora te dio un código de invitación, ingrésalo acá para
              que pueda monitorear tu adopción de HiKonta (nunca tus montos, a menos que lo
              autorices por separado).
            </p>
            <div className="flex gap-2">
              <Input
                value={partnerCode}
                onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
                placeholder="Código de invitación"
                disabled={isLinking}
                className="uppercase"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleLinkPartner}
                disabled={isLinking || !partnerCode.trim()}
              >
                {isLinking ? <Loader2 className="size-4 animate-spin" /> : "Vincular"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-3 bg-background/95 backdrop-blur border-t md:static md:border-0 md:bg-transparent md:backdrop-blur-none md:px-0 md:pt-0 md:pb-0">
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
