// hooks/swr/use-customers.ts
'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

const KEY = '/api/customers';

export type Customer = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  total_orders: number;
  total_spent: number;
  created_at: string;
};

export type CreateCustomerInput = {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  total_orders?: number;
  total_spent?: number;
};

function useAuthFetch() {
  return async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error en la solicitud');
    }
    return res.json();
  };
}

export type CustomerFilters = {
  search?: string;
  page?:   number;
  limit?:  number;
};

export type CustomerStats = {
  total_customers: number;
  total_spent:     number;
  total_orders:    number;
};

export function useCustomers(filters?: CustomerFilters) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page)   params.set("page",   String(filters.page));
  if (filters?.limit)  params.set("limit",  String(filters.limit));

  const url = params.toString() ? `${KEY}?${params.toString()}` : KEY;

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? url : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 }
  );

  return {
    customers:  (data?.data ?? []) as Customer[],
    total:      (data?.total      ?? 0) as number,
    page:       (data?.page       ?? 1) as number,
    totalPages: (data?.totalPages ?? 1) as number,
    limit:      (data?.limit      ?? 25) as number,
    stats: (data?.stats ?? {
      total_customers: 0,
      total_spent:     0,
      total_orders:    0,
    }) as CustomerStats,
    isLoading,
    error: error?.message ?? null,
    mutate,
  };
}

export function useCreateCustomer() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);

  const createCustomer = async (input: CreateCustomerInput) => {
    setIsCreating(true);
    try {
      return await authFetch(KEY, { method: 'POST', body: JSON.stringify(input) });
    } finally {
      setIsCreating(false);
    }
  };

  return { createCustomer, isCreating };
}

export function useUpdateCustomer() {
  const authFetch = useAuthFetch();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateCustomer = async (id: number, input: Partial<CreateCustomerInput>) => {
    setIsUpdating(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateCustomer, isUpdating };
}

export function useDeleteCustomer() {
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteCustomer = async (id: number) => {
    setIsDeleting(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: 'DELETE' });
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteCustomer, isDeleting };
}

// ── Loyalty ────────────────────────────────────────────────────────────

export type LoyaltyPolicy = {
  id:           number;
  user_id:      number;
  tier_name:    string;
  color:        string;
  min_orders:   number | null;
  min_spent:    number | null;
  discount_pct: number;
  is_active:    boolean;
  sort_order:   number;
  created_at:   string;
};

export type CustomerSummary = Customer & {
  last_purchase_at: string | null;
  avg_order_value:  number;
};

export type RecentSaleItem = {
  product_name: string;
  quantity:     number;
};

export type RecentSale = {
  id:             number;
  sale_number:    string;
  total:          number;
  sold_at:        string;
  status:         string;
  discount:       number;
  shipping_cost:  number;
  items_count:    number;
  total_quantity: number;
  items:          RecentSaleItem[];
};

export const TIER_COLORS = [
  { value: "amber",  label: "Bronce"    },
  { value: "slate",  label: "Plata"     },
  { value: "yellow", label: "Oro"       },
  { value: "blue",   label: "Platino"   },
  { value: "green",  label: "Esmeralda" },
  { value: "purple", label: "Amatista"  },
  { value: "red",    label: "Rubí"      },
];

export const TIER_COLOR_CLASSES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  amber:  { bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-300",  dot: "bg-amber-500"  },
  slate:  { bg: "bg-slate-100",  text: "text-slate-600",  border: "border-slate-300",  dot: "bg-slate-400"  },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300", dot: "bg-yellow-400" },
  blue:   { bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-300",   dot: "bg-blue-500"   },
  green:  { bg: "bg-green-100",  text: "text-green-700",  border: "border-green-300",  dot: "bg-green-500"  },
  purple: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300", dot: "bg-purple-500" },
  red:    { bg: "bg-red-100",    text: "text-red-700",    border: "border-red-300",    dot: "bg-red-500"    },
};

export function computeLoyaltyTier(
  customer: Pick<Customer, "total_orders" | "total_spent">,
  policies: LoyaltyPolicy[]
): LoyaltyPolicy | null {
  const qualifying = policies
    .filter((p) => {
      if (!p.is_active) return false;
      const meetsOrders = p.min_orders == null || Number(customer.total_orders) >= p.min_orders;
      const meetsSpent  = p.min_spent  == null || Number(customer.total_spent)  >= Number(p.min_spent);
      return meetsOrders && meetsSpent;
    })
    .sort((a, b) => Number(b.discount_pct) - Number(a.discount_pct));
  return qualifying[0] ?? null;
}

export function useCustomerSummary(id: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser && id ? `/api/customers/${id}/summary` : null,
    (url: string) => authFetch(url),
    { revalidateOnFocus: false }
  );
  return {
    customer:    (data?.customer    ?? null) as CustomerSummary | null,
    recentSales: (data?.recentSales ?? [])   as RecentSale[],
    isLoading,
    error:       (error as any)?.message ?? null,
    mutate,
  };
}

export function useLoyaltyPolicies() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? "/api/customers/loyalty" : null,
    (url: string) => authFetch(url),
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );
  return {
    policies:  (data?.data ?? []) as LoyaltyPolicy[],
    isLoading,
    error:     (error as any)?.message ?? null,
    mutate,
  };
}

export function useCreateLoyaltyPolicy() {
  const authFetch = useAuthFetch();
  const [isSaving, setIsSaving] = useState(false);
  const create = async (payload: Omit<LoyaltyPolicy, "id" | "user_id" | "created_at">) => {
    setIsSaving(true);
    try {
      return await authFetch("/api/customers/loyalty", { method: "POST", body: JSON.stringify(payload) });
    } finally {
      setIsSaving(false);
    }
  };
  return { create, isSaving };
}

export function useUpdateLoyaltyPolicy() {
  const authFetch = useAuthFetch();
  const [isSaving, setIsSaving] = useState(false);
  const update = async (id: number, payload: Partial<Omit<LoyaltyPolicy, "id" | "user_id" | "created_at">>) => {
    setIsSaving(true);
    try {
      return await authFetch(`/api/customers/loyalty/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    } finally {
      setIsSaving(false);
    }
  };
  return { update, isSaving };
}

export function useDeleteLoyaltyPolicy() {
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);
  const remove = async (id: number) => {
    setIsDeleting(true);
    try {
      return await authFetch(`/api/customers/loyalty/${id}`, { method: "DELETE" });
    } finally {
      setIsDeleting(false);
    }
  };
  return { remove, isDeleting };
}
