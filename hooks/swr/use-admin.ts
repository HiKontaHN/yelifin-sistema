// hooks/swr/use-admin.ts
"use client";

import useSWR from "swr";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

function useAuthFetch() {
  return async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Error en la solicitud");
    }
    return res.json();
  };
}

// ── Types ─────────────────────────────────────────────────────────────

export type AdminUserRow = {
  id:                    number;
  firebase_uid:          string;
  email:                 string;
  display_name:          string | null;
  is_active:             boolean;
  created_at:            string;
  business_name:         string | null;
  business_logo_url:     string | null;
  currency:              string | null;
  subscription_id:       number | null;
  subscription_status:   string | null;
  trial_end_date:        string | null;
  current_period_end:    string | null;
  plan_id:               number | null;
  plan_name:             string | null;
  plan_slug:             string | null;
  price_usd:             number | null;
  last_sign_in_time:     string | null;
  last_refresh_time:     string | null;
};

export type AdminUserDetail = AdminUserRow & {
  photo_url:             string | null;
  timezone:              string;
  locale:                string;
  onboarding_completed:  boolean;
  trial_start_date:      string | null;
  current_period_start:  string | null;
  cancel_at_period_end:  boolean;
  cancelled_at:          string | null;
  provider:              string | null;
  billing_interval:      string | null;
  max_products:          number | null;
  max_sales_per_month:   number | null;
};

export type AdminUserActivity = {
  total_sales:        number;
  total_products:     number;
  total_transactions: number;
};

export type AdminUserStorage = {
  products:            number;
  sales:               number;
  transactions:        number;
  customers:           number;
  accounts:            number;
  credit_cards:        number;
  cc_transactions:     number;
  inventory_batches:   number;
  inventory_movements: number;
  events:              number;
  image_count:         number;
};

export type AdminStorageStats = {
  db_size_bytes: number;
  table_sizes: { tablename: string; size_bytes: number }[];
  top_users: { id: number; email: string; display_name: string; total_rows: number }[];
  image_counts: { user_photos: number; logos: number; product_images: number };
};

export type AdminPlan = {
  id:                   number;
  name:                 string;
  slug:                 string;
  description:          string | null;
  price_usd:            number;
  billing_interval:     string | null;
  max_products:         number | null;
  max_sales_per_month:  number | null;
  max_storage_mb:       number | null;
  max_transactions_per_month: number | null;
  max_accounts:         number | null;
  max_supplies:         number | null;
  is_active:            boolean;
  user_count:           number;
};

export type PlanFeatureRow = {
  id:           number;
  feature_key:  string;
  feature_name: string;
  category:     string;
  is_enabled:   boolean;
};

export type AdminStats = {
  total_users:    number;
  active_users:   number;
  inactive_users: number;
  new_this_month: number;
  trial_count:    number;
  active_count:   number;
  cancelled_count: number;
  expired_count:  number;
  past_due_count: number;
};

// ── Hooks ─────────────────────────────────────────────────────────────

export function useAdminStats() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? "/api/admin/stats" : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );
  return {
    counts:      (data?.counts  ?? null) as AdminStats | null,
    planStats:   (data?.planStats  ?? []) as { id: number; name: string; slug: string; user_count: number }[],
    recentUsers: (data?.recentUsers ?? []) as AdminUserRow[],
    isLoading,
    error: (error as any)?.message ?? null,
    mutate,
  };
}

export function useAdminUsers(params: { search?: string; status?: string; page?: number } = {}) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { search = "", status = "all", page = 1 } = params;
  const key = firebaseUser
    ? `/api/admin/users?search=${encodeURIComponent(search)}&status=${status}&page=${page}`
    : null;

  const { data, isLoading, error, mutate } = useSWR(
    key,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 15_000 }
  );
  return {
    users:    (data?.data   ?? []) as AdminUserRow[],
    total:    (data?.total  ?? 0)  as number,
    pages:    (data?.pages  ?? 1)  as number,
    isLoading,
    error:    (error as any)?.message ?? null,
    mutate,
  };
}

export function useAdminUser(id: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser && id ? `/api/admin/users/${id}` : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false }
  );
  return {
    user:     (data?.user     ?? null) as AdminUserDetail | null,
    activity: (data?.activity ?? null) as AdminUserActivity | null,
    storage:  (data?.storage  ?? null) as AdminUserStorage | null,
    isLoading,
    error:    (error as any)?.message ?? null,
    mutate,
  };
}

export function useAdminStorage() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? "/api/admin/storage" : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  return {
    storage:  (data ?? null) as AdminStorageStats | null,
    isLoading,
    error:    (error as any)?.message ?? null,
    mutate,
  };
}

export function useAdminPlans() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? "/api/admin/plans" : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  return {
    plans:    (data?.data ?? []) as AdminPlan[],
    isLoading,
    error:    (error as any)?.message ?? null,
    mutate,
  };
}

export type PlanInput = {
  name?: string;
  slug?: string;
  description?: string | null;
  price_usd?: number;
  billing_interval?: string;
  max_products?: number | null;
  max_sales_per_month?: number | null;
  max_storage_mb?: number | null;
  max_transactions_per_month?: number | null;
  max_accounts?: number | null;
  max_supplies?: number | null;
  is_active?: boolean;
};

export function useAdminPlanFeatures(planId: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser && planId ? `/api/admin/plans/${planId}/features` : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false }
  );
  return {
    plan:     (data?.plan ?? null) as { id: number; name: string; slug: string } | null,
    features: (data?.data ?? []) as PlanFeatureRow[],
    isLoading,
    error:    (error as any)?.message ?? null,
    mutate,
  };
}

export function useAdminUpdatePlanFeatures(planId: number | null) {
  const authFetch = useAuthFetch();
  const [isSaving, setIsSaving] = useState(false);
  const updateFeatures = async (features: Record<number, boolean>) => {
    if (!planId) throw new Error("ID requerido");
    setIsSaving(true);
    try {
      return await authFetch(`/api/admin/plans/${planId}/features`, {
        method: "PUT",
        body: JSON.stringify({ features }),
      });
    } finally {
      setIsSaving(false);
    }
  };
  return { updateFeatures, isSaving };
}

export function useAdminCreatePlan() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);
  const createPlan = async (input: PlanInput) => {
    setIsCreating(true);
    try { return await authFetch("/api/admin/plans", { method: "POST", body: JSON.stringify(input) }); }
    finally { setIsCreating(false); }
  };
  return { createPlan, isCreating };
}

export function useAdminUpdatePlan() {
  const authFetch = useAuthFetch();
  const [isSaving, setIsSaving] = useState(false);
  const updatePlan = async (id: number, input: PlanInput) => {
    setIsSaving(true);
    try { return await authFetch(`/api/admin/plans/${id}`, { method: "PATCH", body: JSON.stringify(input) }); }
    finally { setIsSaving(false); }
  };
  return { updatePlan, isSaving };
}

export function useAdminDeletePlan() {
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);
  const deletePlan = async (id: number) => {
    setIsDeleting(true);
    try { return await authFetch(`/api/admin/plans/${id}`, { method: "DELETE" }); }
    finally { setIsDeleting(false); }
  };
  return { deletePlan, isDeleting };
}

export function useAdminUpdateUser(id: number | null) {
  const authFetch = useAuthFetch();
  const [isSaving, setIsSaving] = useState(false);
  const updateUser = async (payload: Record<string, unknown>) => {
    if (!id) throw new Error("ID requerido");
    setIsSaving(true);
    try {
      return await authFetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } finally {
      setIsSaving(false);
    }
  };
  return { updateUser, isSaving };
}

export type CreateUserInput = {
  email:          string;
  password:       string;
  display_name?:  string;
  business_name?: string;
  timezone?:      string;
  currency?:      string;
  locale?:        string;
  plan_id?:       number;
  email_verified?: boolean;
};

export function useAdminCreateUser() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);
  const createUser = async (input: CreateUserInput) => {
    setIsCreating(true);
    try {
      return await authFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(input),
      });
    } finally {
      setIsCreating(false);
    }
  };
  return { createUser, isCreating };
}
