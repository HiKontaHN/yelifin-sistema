// hooks/swr/use-organization.ts
"use client";

import useSWR from "swr";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { OrgInfo, OrgMember, OrgModule, ModulePermissions } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────

export type OrgRole = {
  id:          number;
  name:        string;
  is_owner:    boolean;
  created_at:  string;
  permissions: Partial<Record<OrgModule, ModulePermissions>>;
};

// ── Auth fetch helper ──────────────────────────────────────────────────────

function useAuthFetch() {
  const { firebaseUser } = useAuth();
  return async (url: string, options: RequestInit = {}) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Error en la solicitud");
    }
    // 204 No Content → no body
    if (res.status === 204) return null;
    return res.json();
  };
}

// ── Organization profile ───────────────────────────────────────────────────

export function useOrganization() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading, error, mutate } = useSWR<{ data: OrgInfo }>(
    firebaseUser ? "/api/organization" : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  return {
    org:       data?.data ?? null,
    isLoading,
    error:     (error as any)?.message ?? null,
    mutate,
  };
}

export function useUpdateOrganization() {
  const authFetch = useAuthFetch();
  const [isSaving, setIsSaving] = useState(false);

  const updateOrg = async (input: Partial<Pick<OrgInfo, "name" | "logo_url" | "timezone" | "currency" | "locale" | "industry_id">>) => {
    setIsSaving(true);
    try {
      return await authFetch("/api/organization", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return { updateOrg, isSaving };
}

// ── Vincular con un partner ─────────────────────────────────────────────────
// Canjea un código de invitación de incubadora/partner (ver
// database/partners/04-invite-codes.sql y app/api/organization/link-partner) —
// usado por Configuración > Organización cuando el negocio ya existe.

export function useLinkPartner() {
  const authFetch = useAuthFetch();
  const [isLinking, setIsLinking] = useState(false);

  const linkPartner = async (code: string): Promise<{ partnerName: string }> => {
    setIsLinking(true);
    try {
      const res = await authFetch("/api/organization/link-partner", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      return res.data;
    } finally {
      setIsLinking(false);
    }
  };

  return { linkPartner, isLinking };
}

// ── Industries ──────────────────────────────────────────────────────────────

export type Industry = { id: number; slug: string; name: string };

export function useIndustries() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading, error } = useSWR<{ data: Industry[] }>(
    firebaseUser ? "/api/industries" : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 } // catálogo, cambia poco
  );

  return {
    industries: data?.data ?? [],
    isLoading,
    error: (error as any)?.message ?? null,
  };
}

// ── Members ────────────────────────────────────────────────────────────────

export function useOrgMembers() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading, error, mutate } = useSWR<{ data: OrgMember[] }>(
    firebaseUser ? "/api/organization/members" : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  return {
    members:   data?.data ?? [],
    isLoading,
    error:     (error as any)?.message ?? null,
    mutate,
  };
}

export function useCreateOrgMemberUser() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);

  const createMemberUser = async (payload: {
    email: string;
    password: string;
    display_name?: string;
    role_id: number;
  }) => {
    setIsCreating(true);
    try {
      return await authFetch("/api/organization/members/create-user", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } finally {
      setIsCreating(false);
    }
  };

  return { createMemberUser, isCreating };
}


export function useUpdateOrgMember() {
  const authFetch = useAuthFetch();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateMember = async (memberId: number, role_id: number) => {
    setIsUpdating(true);
    try {
      return await authFetch(`/api/organization/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role_id }),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateMember, isUpdating };
}

export function useRemoveOrgMember() {
  const authFetch = useAuthFetch();
  const [isRemoving, setIsRemoving] = useState(false);

  const removeMember = async (memberId: number) => {
    setIsRemoving(true);
    try {
      return await authFetch(`/api/organization/members/${memberId}`, { method: "DELETE" });
    } finally {
      setIsRemoving(false);
    }
  };

  return { removeMember, isRemoving };
}

// ── Roles ──────────────────────────────────────────────────────────────────

export function useOrgRoles() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading, error, mutate } = useSWR<{ data: OrgRole[] }>(
    firebaseUser ? "/api/organization/roles" : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  return {
    roles:     data?.data ?? [],
    isLoading,
    error:     (error as any)?.message ?? null,
    mutate,
  };
}

export function useCreateOrgRole() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);

  const createRole = async (
    name: string,
    permissions: Partial<Record<OrgModule, Partial<ModulePermissions>>>
  ) => {
    setIsCreating(true);
    try {
      return await authFetch("/api/organization/roles", {
        method: "POST",
        body: JSON.stringify({ name, permissions }),
      });
    } finally {
      setIsCreating(false);
    }
  };

  return { createRole, isCreating };
}

export function useUpdateOrgRole() {
  const authFetch = useAuthFetch();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateRole = async (
    id: number,
    payload: { name?: string; permissions?: Partial<Record<OrgModule, Partial<ModulePermissions>>> }
  ) => {
    setIsUpdating(true);
    try {
      return await authFetch(`/api/organization/roles/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateRole, isUpdating };
}

export function useDeleteOrgRole() {
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteRole = async (id: number) => {
    setIsDeleting(true);
    try {
      return await authFetch(`/api/organization/roles/${id}`, { method: "DELETE" });
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteRole, isDeleting };
}
