// hooks/swr/use-movements.ts
'use client';

import useSWR from 'swr';
import { useAuth } from '@/hooks/use-auth';

const KEY = '/api/inventory/movements';

// ── Tipos ──────────────────────────────────────────────────────────────

export type Movement = {
  id:             number;
  movement_type:  'IN' | 'OUT' | 'ADJUST';
  product_id:     number;
  product_name:   string;
  image_url:      string | null;
  sku:            string | null;
  // Variante (null si el movimiento es del producto base)
  variant_id:     number | null;
  variant_name:   string | null;
  variant_sku:    string | null;
  quantity:       number;
  reference_type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'INITIAL' | 'SALE_CANCELLED' | 'SALE_EDITED' | null;
  reference_id:   number | null;
  notes:          string | null;
  created_at:     string;

  // ── Compra (IN / reference_type = PURCHASE) ────────────────────
  purchase_currency:  string | null;   // moneda de la compra (USD, HNL, etc.)
  exchange_rate:      number | null;   // tasa usada al momento de la compra
  // Solo tiene valor cuando purchase_currency = 'USD'
  unit_cost_usd:      number | null;
  // Siempre disponible — costo en moneda local
  unit_cost_hnl:      number | null;
  // Costo en la moneda original de la compra (USD si fue en USD, HNL si fue en HNL)
  unit_cost_purchase: number | null;
  shipping_per_unit:  number | null;
  total_cost:         number | null;

  // ── Venta (OUT / reference_type = SALE) ───────────────────────
  unit_price:    number | null;
  unit_cost:     number | null;
  line_total:    number | null;
  profit:        number | null;
  sale_number:   string | null;
  customer_name: string | null;
};

export type MovementFilters = {
  date?:       string;
  from?:       string;
  to?:         string;
  month?:      number;
  year?:       number;
  product_id?: number;
  variant_id?: number;
  search?:     string;
  type?:       string;
  page?:       number;
  limit?:      number;
};

// ── Auth fetch ─────────────────────────────────────────────────────────

function useAuthFetch() {
  return async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error en la solicitud');
    }
    return res.json();
  };
}

// ── useMovements ───────────────────────────────────────────────────────

export function useMovements(filters?: MovementFilters) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const params = new URLSearchParams();
  if (filters?.date)       params.set('date',       filters.date);
  if (filters?.from)       params.set('from',       filters.from);
  if (filters?.to)         params.set('to',         filters.to);
  if (filters?.month)      params.set('month',      String(filters.month));
  if (filters?.year)       params.set('year',       String(filters.year));
  if (filters?.product_id) params.set('product_id', String(filters.product_id));
  if (filters?.variant_id) params.set('variant_id', String(filters.variant_id));
  if (filters?.search)     params.set('search',     filters.search);
  if (filters?.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters?.page)       params.set('page',       String(filters.page));
  if (filters?.limit)      params.set('limit',      String(filters.limit));

  const url = `${KEY}?${params.toString()}`;

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? url : null,
    (u: string) => authFetch(u),
    {
      revalidateOnFocus: false,
      dedupingInterval:  5 * 60_000,
    }
  );

  return {
    movements:  (data?.data ?? []) as Movement[],
    total:      (data?.total      ?? 0)  as number,
    page:       (data?.page       ?? 1)  as number,
    totalPages: (data?.totalPages ?? 1)  as number,
    limit:      (data?.limit      ?? 25) as number,
    isLoading,
    error:      error?.message ?? null,
    mutate,
  };
}

// ── useMovementPeriods ─────────────────────────────────────────────────

export function useMovementPeriods() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading } = useSWR(
    firebaseUser ? '/api/inventory/movements/periods' : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );

  return {
    periods:   (data?.data ?? []) as { year: number; month: number }[],
    isLoading,
  };
}
