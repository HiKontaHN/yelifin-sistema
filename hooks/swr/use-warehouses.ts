// hooks/swr/use-warehouses.ts
'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

const KEY = '/api/organization/warehouses';

export type Warehouse = {
  id: number;
  name: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
};

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
    if (res.status === 204) return null;
    return res.json();
  };
}

// Trae las bodegas de la org. `activeWarehouses` filtra las inactivas —
// úsalo para decidir si mostrar el selector (solo si hay 2+).
export function useWarehouses() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? KEY : null,
    (url: string) => authFetch(url),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 }
  );

  const warehouses = (data?.data ?? []) as Warehouse[];
  const activeWarehouses = warehouses.filter((w) => w.is_active);

  return {
    warehouses,
    activeWarehouses,
    defaultWarehouse: activeWarehouses.find((w) => w.is_default) ?? activeWarehouses[0] ?? null,
    isLoading,
    error: error?.message ?? null,
    mutate,
  };
}

export function useCreateWarehouse() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);

  const createWarehouse = async (name: string) => {
    setIsCreating(true);
    try {
      return await authFetch(KEY, { method: 'POST', body: JSON.stringify({ name }) });
    } finally {
      setIsCreating(false);
    }
  };

  return { createWarehouse, isCreating };
}

export function useUpdateWarehouse() {
  const authFetch = useAuthFetch();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateWarehouse = async (
    id: number,
    input: { name?: string; is_active?: boolean; is_default?: boolean }
  ) => {
    setIsUpdating(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateWarehouse, isUpdating };
}

// ── Transferencias entre bodegas ────────────────────────────────────────

const TRANSFERS_KEY = '/api/organization/warehouses/transfers';

export type WarehouseTransferItem = {
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_cost: number;
};

export type WarehouseTransfer = {
  id: number;
  notes: string | null;
  created_at: string;
  from_warehouse_name: string;
  to_warehouse_name: string;
  items: WarehouseTransferItem[];
};

export function useWarehouseTransfers() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? TRANSFERS_KEY : null,
    (url: string) => authFetch(url),
    { revalidateOnFocus: false }
  );

  return {
    transfers: (data?.data ?? []) as WarehouseTransfer[],
    isLoading,
    error: error?.message ?? null,
    mutate,
  };
}

export type CreateTransferInput = {
  from_warehouse_id: number;
  to_warehouse_id: number;
  notes?: string;
  items: { product_id: number; variant_id?: number | null; quantity: number }[];
};

export function useCreateWarehouseTransfer() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);

  const createTransfer = async (input: CreateTransferInput) => {
    setIsCreating(true);
    try {
      return await authFetch(TRANSFERS_KEY, { method: 'POST', body: JSON.stringify(input) });
    } finally {
      setIsCreating(false);
    }
  };

  return { createTransfer, isCreating };
}
