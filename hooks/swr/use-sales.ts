'use client';

import useSWR, { useSWRConfig } from 'swr';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

const KEY = '/api/sales';

export type CartItem = {
  product_id:   number;
  variant_id:   number | null | undefined; 
  product_name: string;
  variant_name: string | null | undefined;
  image_url:    string | null;
  quantity:     number;
  unit_price:   number;
  discount:     number;
};

export type SaleStatus = 'PENDING' | 'COMPLETED';

export type CreateSaleInput = {
  customer_id?:    number | null;
  items:           { product_id: number; quantity: number; unit_price: number; discount: number }[];
  discount?:       number;
  shipping_cost?:  number;
  payment_method:  string;
  account_id:      number;
  notes?:          string;
  tax_rate?:       number;
  supplies_used?:  { supply_id: number; quantity: number; unit_cost: number }[];
  event_id?:       number;
  status?:         SaleStatus;
};

export type ConfirmSaleInput = { action: 'confirm'; confirmed_at: string };
export type CancelSaleInput  = { action: 'cancel' };

export type EditSaleInput = {
  action:          'edit';
  items:           { product_id: number; variant_id?: number | null; quantity: number; unit_price: number; discount: number }[];
  discount?:       number;
  shipping_cost?:  number;
  tax_rate?:       number;
  notes?:          string;
  customer_id?:    number | null;
  account_id:      number;
  status?:         SaleStatus;
  supplies_used?:  { supply_id: number; quantity: number; unit_cost: number }[];
};

export type PatchSaleInput = ConfirmSaleInput | CancelSaleInput | EditSaleInput;

export type Sale = {
  id:             number;
  sale_number:    string;
  customer_id:    number | null;
  customer_name:  string | null;
  customer_phone: string | null;
  subtotal:       number;
  discount:       number;
  shipping_cost:  number;
  tax:            number;
  tax_rate:       number;
  total:          number;
  payment_method: string;
  account_id:     number;
  account_name:   string;
  event_id:       number | null;
  status:         SaleStatus;
  sold_at:        string;
  notes:          string | null;
  items_count:    number;
  net_profit:     number;
};

export type SaleDetail = Sale & {
  next_id: number | null;
  prev_id: number | null;
  items: {
    id:           number;
    product_id:   number;
    variant_name: string | null;
    product_name: string;
    image_url:    string | null;
    quantity:     number;
    unit_price:   number;
    unit_cost:    number;
    line_total:   number;
  }[];
  supplies: {
    id:          number;
    supply_id:   number;
    supply_name: string;
    quantity:    number;
    unit_cost:   number;
    line_total:  number;
  }[];
};

export type SalesPreset = 'today' | '7d' | 'this_month' | 'last_month' | 'all';

export type SalesFilters = {
  preset?:     SalesPreset;
  from?:       string;
  to?:         string;
  payment?:    'all' | 'CASH' | 'CARD' | 'TRANSFER' | 'MIXED' | 'OTHER';
  search?:     string;
  status?:     'all' | 'COMPLETED' | 'PENDING';
  account_id?: string;
  page?:       number;
  limit?:      number;
};

export type SalesStats = {
  total_revenue:   number;
  total_profit:    number;
  pending_count:   number;
  completed_count: number;
};

function buildQuery(filters?: SalesFilters) {
  const sp     = new URLSearchParams();
  const preset = filters?.preset ?? 'this_month';
  sp.set('preset', preset);
  if (filters?.from) sp.set('from', filters.from);
  if (filters?.to)   sp.set('to',   filters.to);
  if (filters?.payment && filters.payment !== 'all') {
    sp.set('payment', filters.payment);
  } else {
    sp.set('payment', 'all');
  }
  if (filters?.search)                              sp.set('search',     filters.search);
  if (filters?.status && filters.status !== 'all') sp.set('status',     filters.status);
  if (filters?.account_id && filters.account_id !== 'all') sp.set('account_id', filters.account_id);
  if (filters?.page)                                sp.set('page',       String(filters.page));
  if (filters?.limit)                               sp.set('limit',      String(filters.limit));
  const q = sp.toString();
  return q ? `${KEY}?${q}` : KEY;
}

function useAuthFetch() {
  const { firebaseUser } = useAuth();

  return async (url: string, options: RequestInit = {}) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error('No autenticado');

    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error en la solicitud');
    }

    return res.json();
  };
}

export function useSales(filters?: SalesFilters) {
  const { firebaseUser } = useAuth();
  const authFetch        = useAuthFetch();
  const url              = buildQuery(filters);

  const { data, error, isLoading, mutate } = useSWR(
    firebaseUser ? url : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  return {
    sales:      (data?.data ?? []) as Sale[],
    total:      (data?.total      ?? 0)  as number,
    page:       (data?.page       ?? 1)  as number,
    totalPages: (data?.totalPages ?? 1)  as number,
    limit:      (data?.limit      ?? 25) as number,
    stats:      (data?.stats ?? {
      total_revenue:   0,
      total_profit:    0,
      pending_count:   0,
      completed_count: 0,
    }) as SalesStats,
    isLoading,
    error:      error?.message ?? null,
    mutate,
  };
}

export function useSale(id: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch        = useAuthFetch();

  const { data, error, isLoading, mutate } = useSWR(
    firebaseUser && id ? `${KEY}/${id}` : null,
    (url: string) => authFetch(url),
  );

  return {
    sale:     (data?.data ?? null) as SaleDetail | null,
    isLoading,
    error:    error?.message ?? null,
    mutate,
  };
}

export function useCreateSale() {
  const authFetch                  = useAuthFetch();
  const { mutate: globalMutate }   = useSWRConfig();
  const [isCreating, setIsCreating] = useState(false);

  const createSale = async (input: CreateSaleInput) => {
    setIsCreating(true);
    try {
      const result = await authFetch(KEY, {
        method: 'POST',
        body:   JSON.stringify(input),
      });

      await globalMutate(
        (key) =>
          typeof key === 'string' && (
            key.startsWith('/api/sales') ||
            key.startsWith('/api/accounts') ||
            key.startsWith('/api/finances') ||
            key.startsWith('/api/dashboard') ||
            key.startsWith('/api/inventory') ||
            key.startsWith('/api/products')
          ),
        undefined,
        { revalidate: true }
      );

      return result;
    } finally {
      setIsCreating(false);
    }
  };

  return { createSale, isCreating };
}

export function usePatchSale(id: number | null) {
  const authFetch                     = useAuthFetch();
  const { mutate: globalMutate }      = useSWRConfig();
  const [isPatching, setIsPatching]   = useState(false);

  const patchSale = async (input: PatchSaleInput) => {
    if (!id) throw new Error('ID de venta requerido');
    setIsPatching(true);
    try {
      const result = await authFetch(`${KEY}/${id}`, {
        method: 'PATCH',
        body:   JSON.stringify(input),
      });

      // Invalidar todo lo relacionado
      await globalMutate(
        (key) =>
          typeof key === 'string' && (
            key.startsWith('/api/sales') ||
            key.startsWith('/api/accounts') ||
            key.startsWith('/api/finances') ||
            key.startsWith('/api/dashboard') ||
            key.startsWith('/api/inventory') ||
            key.startsWith('/api/products')
          ),
        undefined,
        { revalidate: true }
      );

      return result;
    } finally {
      setIsPatching(false);
    }
  };

  const confirmSale = () => patchSale({ action: 'confirm', confirmed_at: new Date().toISOString() });
  const cancelSale  = () => patchSale({ action: 'cancel' });
  const editSale    = (data: Omit<EditSaleInput, 'action'>) =>
    patchSale({ action: 'edit', ...data });

  return { confirmSale, cancelSale, editSale, isPatching };
}


export function useDeleteSale() {
  const authFetch                   = useAuthFetch();
  const { mutate: globalMutate }    = useSWRConfig();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteSale = async (id: number) => {
    setIsDeleting(true);
    try {
      const result = await authFetch(`${KEY}/${id}`, {
        method: "DELETE",
      });

      await globalMutate(
        (key) =>
          typeof key === "string" && (
            key.startsWith("/api/sales") ||
            key.startsWith("/api/accounts") ||
            key.startsWith("/api/finances") ||
            key.startsWith("/api/dashboard") ||
            key.startsWith("/api/transactions") ||
            key.startsWith("/api/customers") ||
            key.startsWith("/api/inventory")
          ),
        undefined,
        { revalidate: true }
      );

      return result;
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteSale, isDeleting };
}