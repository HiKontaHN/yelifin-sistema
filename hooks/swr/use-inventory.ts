// hooks/swr/use-inventory.ts
'use client';

import useSWR from 'swr';
import { useAuth } from '@/hooks/use-auth';

const KEY = '/api/inventory';

export type VariantStock = {
  variant_id:    number;
  variant_name:  string;
  sku:           string | null;
  attributes:    Record<string, string> | null;
  price_override: number | null;
  image_url:     string | null;
  stock:         number;
  avg_unit_cost: number | null; // null sin show_costs
  total_value:   number | null; // null sin show_costs
  is_service:    boolean;
};

export type InventoryItem = {
  product_id:       number;
  product_name:     string;
  sku:              string | null;
  image_url:        string | null;
  price:            number;
  is_service:       boolean;
  // Stock total (base + variantes)
  stock:            number;
  avg_unit_cost:    number | null; // null sin show_costs
  total_value:      number | null; // null sin show_costs
  // Stock y costos solo del producto base
  base_stock:       number;
  base_avg_unit_cost: number | null; // null sin show_costs
  base_total_value: number | null;   // null sin show_costs
  // Desglose por variante
  variants_stock:   VariantStock[];
};

export type InventoryStats = {
  total_products: number;
  total_physical: number;
  total_stock:    number;
  total_value:    number | null; // null sin show_costs
  low_stock:      number;
  out_of_stock:   number;
};

export type InventoryFilters = {
  search?: string;
  stock?:  string;
  page?:   number;
  limit?:  number;
};

type InventoryResponse = {
  data:       InventoryItem[];
  stats:      InventoryStats;
  total:      number;
  page:       number;
  totalPages: number;
  limit:      number;
};

function useAuthFetch() {
  const { firebaseUser } = useAuth();
  return async (url: string) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error('No autenticado');
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error en la solicitud');
    }
    return res.json();
  };
}

export function useInventory(filters?: InventoryFilters) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.stock && filters.stock !== 'all') params.set('stock', filters.stock);
  if (filters?.page)  params.set('page',  String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));

  const url = `${KEY}?${params.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<InventoryResponse>(
    firebaseUser ? url : null,
    (u: string) => authFetch(u),
    { dedupingInterval: 5 * 60_000 }
  );

  return {
    inventory:  data?.data ?? [],
    stats: data?.stats ?? {
      total_products: 0,
      total_physical: 0,
      total_stock:    0,
      total_value:    0,
      low_stock:      0,
      out_of_stock:   0,
    },
    total:      data?.total      ?? 0,
    page:       data?.page       ?? 1,
    totalPages: data?.totalPages ?? 1,
    limit:      data?.limit      ?? 25,
    isLoading,
    error:  error?.message ?? null,
    mutate,
  };
}