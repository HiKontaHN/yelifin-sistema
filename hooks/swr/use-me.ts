// hooks/swr/use-me.ts
"use client";

import useSWR from "swr";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type {
  UserProfileResponse,
  FeatureKey,
  FeatureCategory,
  OrgModule,
  ModulePermissions,
} from "@/types";
import { defaultSubitem } from "@/lib/permissions";

const KEY = "/api/auth/me";

const DENY_ALL: ModulePermissions = {
  can_view: false, can_edit: false, can_delete: false,
  show_costs: false, show_profit: false,
};

function useAuthFetch() {
  const { firebaseUser } = useAuth();

  return async (url: string, options: RequestInit = {}) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Error al obtener perfil");
    }

    return res.json();
  };
}

export type UpdateProfileInput = {
  display_name?:      string | null;
  business_name?:     string | null;
  business_logo_url?: string | null;
  timezone?:          string;
  currency?:          string;
  locale?:            string;
};

export function useUpdateProfile() {
  const authFetch = useAuthFetch();
  const [isSaving, setIsSaving] = useState(false);

  const updateProfile = async (input: UpdateProfileInput) => {
    setIsSaving(true);
    try {
      return await authFetch(KEY, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return { updateProfile, isSaving };
}

export function useUploadLogo() {
  const { firebaseUser } = useAuth();
  const [isUploading, setIsUploading] = useState(false);

  const uploadLogo = async (file: File): Promise<string> => {
    setIsUploading(true);
    try {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("No autenticado");

      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Error al subir imagen");
      }

      const { url } = await res.json();
      return url as string;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadLogo, isUploading };
}

export function useMe() {
  const { firebaseUser, loading: authLoading } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading: profileLoading, error, mutate } = useSWR<UserProfileResponse>(
    firebaseUser ? KEY : null,
    (u: string) => authFetch(u),
    {
      revalidateOnFocus:      false,
      dedupingInterval:       60_000,
      revalidateOnReconnect:  false,
    }
  );

  // SWR reporta isLoading=false mientras la key es null (Firebase aún no
  // resolvió firebaseUser) — sin esto, un consumidor que actúa apenas
  // isLoading es false (ej. ModuleGuard redirigiendo si !can_view) lee un
  // falso "ya cargó, sin acceso" en ese instante inicial y navega mal
  // antes de que llegue el perfil real. authLoading cubre ese hueco.
  const isLoading = authLoading || (!!firebaseUser && profileLoading);

  const user         = data?.user         ?? null;
  const profile      = data?.profile      ?? null;
  const org          = data?.org          ?? null;
  const role         = data?.role         ?? null;
  const permissions  = data?.permissions  ?? {};
  const subscription = data?.subscription ?? null;
  const features     = data?.features     ?? {};

  const orgId   = org?.id   ?? null;
  const roleId  = role?.id  ?? null;
  const isOwner = role?.is_owner ?? false;

  const onboardingCompleted = profile?.onboarding_completed ?? false;

  const hasFeature = (key: FeatureKey): boolean =>
    Object.values(features).some((list) => list?.some((f) => f.key === key));

  const hasFeatureInCategory = (category: FeatureCategory): boolean => {
    const list = features?.[category];
    return !!(list && list.length > 0);
  };

  const getModulePermissions = (module: OrgModule, subitem?: string): ModulePermissions => {
    if (isOwner) {
      return { can_view: true, can_edit: true, can_delete: true, show_costs: true, show_profit: true };
    }
    const key = subitem ?? defaultSubitem(module);
    return permissions[module]?.[key] ?? DENY_ALL;
  };

  const hasActiveSubscription =
    subscription?.status === "TRIAL" || subscription?.status === "ACTIVE";

  const isTrial = subscription?.status === "TRIAL";

  return {
    data,
    user,
    profile,
    org,
    role,
    permissions,
    orgId,
    roleId,
    isOwner,
    subscription,
    features,
    onboardingCompleted,
    hasFeature,
    hasFeatureInCategory,
    getModulePermissions,
    hasActiveSubscription,
    isTrial,
    isLoading,
    error: (error as any)?.message ?? null,
    mutate,
  };
}
