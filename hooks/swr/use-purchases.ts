// hooks/swr/use-purchases.ts
'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

const KEY = '/api/purchases';

export type PurchaseItem = {
  product_id: number;
  product_name?: string; // ← nuevo, opcional para mostrar en el resumen
  quantity: number;
  unit_cost_usd: number;
  unit_cost: number;
  total_cost: number;
};

export type CreatePurchaseInput = {
  account_id?: number;
  credit_card_id?: number;
  shipping_account_id?: number;
  currency: 'USD' | 'HNL';
  exchange_rate: number;
  shipping: number;
  notes?: string;
  purchased_at?: string;
  status?: 'PENDING' | 'COMPLETED';
  items: Omit<PurchaseItem, 'unit_cost' | 'total_cost'>[];
};

export type Purchase = {
  id: number;
  account_id: number | null;
  account_name: string | null;
  shipping_account_id: number | null;
  shipping_account_name: string | null;
  currency: string;
  exchange_rate: number;
  subtotal: number | null; // null sin show_costs
  shipping: number | null; // null sin show_costs
  total: number | null;    // null sin show_costs
  status: 'PENDING' | 'COMPLETED';
  is_paid: boolean;
  purchased_at: string;
  notes: string | null;
  created_at: string;
  items_count: number;
};

export type PurchaseItemDetail = {
  product_id: number;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_cost: number | null;     // null sin show_costs
  unit_cost_usd: number | null; // null sin show_costs
};

export type PurchaseWithItems = Purchase & {
  items: PurchaseItemDetail[];
};

// Devuelto por GET /api/purchases/:id — si la compra vino de una
// importación de Excel, agrupa todas las filas de esa misma ejecución.
// account_name/status son null cuando el grupo mezcla varios valores.
export type PurchaseDetail = {
  id: number;
  is_group: boolean;
  batches_count: number;
  account_name: string | null;
  shipping_account_name: string | null;
  status: 'PENDING' | 'COMPLETED' | null;
  purchased_at: string;
  notes: string | null;
  currency: string;
  subtotal: number | null;
  shipping: number | null;
  total: number | null;
  items: PurchaseItemDetail[];
};

function useAuthFetch() {
  const { firebaseUser } = useAuth();
  return async (url: string, options: RequestInit = {}) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error('No autenticado');
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error en la solicitud');
    }
    return res.json();
  };
}

export function usePurchases() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, error, isLoading, mutate } = useSWR(
    firebaseUser ? KEY : null,
    (url: string) => authFetch(url),
     {
      revalidateOnFocus:    false,
      dedupingInterval:     5 * 60_000,
    }
  );
  return {
    purchases: (data?.data ?? []) as Purchase[],
    total:     data?.total ?? 0,
    isLoading,
    error:     error?.message ?? null,
    mutate,
  };
}

export function useCreatePurchase() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);
  const createPurchase = async (input: CreatePurchaseInput) => {
    setIsCreating(true);
    try {
      return await authFetch(KEY, { method: 'POST', body: JSON.stringify(input) });
    } finally {
      setIsCreating(false);
    }
  };
  return { createPurchase, isCreating };
}

export function usePendingPurchases() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, error, isLoading, mutate } = useSWR(
    firebaseUser ? `${KEY}?status=PENDING&with_items=true` : null,
    (url: string) => authFetch(url),
    {
      revalidateOnFocus: false,
      dedupingInterval:  5 * 60_000,
    }
  );
  return {
    purchases: (data?.data ?? []) as PurchaseWithItems[],
    total:     data?.total ?? 0,
    isLoading,
    error:     error?.message ?? null,
    mutate,
  };
}

export function useCancelPurchase() {
  const authFetch = useAuthFetch();
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelPurchase = async (id: number) => {
    setIsCancelling(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: 'DELETE' });
    } finally {
      setIsCancelling(false);
    }
  };
  return { cancelPurchase, isCancelling };
}

export function usePurchase(id: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, error, isLoading, mutate } = useSWR(
    firebaseUser && id ? `${KEY}/${id}` : null,
    (url: string) => authFetch(url),
    {
      revalidateOnFocus: false,
    }
  );
  return {
    purchase: (data?.data ?? null) as PurchaseDetail | null,
    isLoading,
    error:    error?.message ?? null,
    mutate,
  };
}

export function useConfirmPurchaseArrival(id: number | null) {
  const authFetch = useAuthFetch();
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmArrival = async (shipping?: number, shipping_account_id?: number) => {
    if (!id) throw new Error('ID requerido');
    setIsConfirming(true);
    try {
      return await authFetch(`${KEY}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ shipping, shipping_account_id }),
      });
    } finally {
      setIsConfirming(false);
    }
  };
  return { confirmArrival, isConfirming };
}