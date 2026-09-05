// hooks/swr/use-reports.ts
"use client";

import useSWR from "swr";
import { useAuth } from "@/hooks/use-auth";

function useAuthFetch() {
  const { firebaseUser } = useAuth();
  return async (url: string) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Error al obtener reporte");
    }
    return res.json();
  };
}

// ── Types ─────────────────────────────────────────────────────────────

export type SalesSummary = {
  total_sales:    number;
  total_revenue:  number;
  total_discount: number;
  total_cogs:     number;
  gross_profit:   number;
};

export type SalesByDay = {
  date:        string;
  sales_count: number;
  revenue:     number;
  profit:      number;
};

export type SalesByProduct = {
  product_name: string;
  sku:          string;
  qty_sold:     number;
  revenue:      number;
  cogs:         number;
  profit:       number;
  margin_pct:   number;
};

export type SaleDetail = {
  sale_number:  string;
  date:         string;
  customer:     string;
  payment_method: string;
  account_name: string;
  items_count:  number;
  discount:     number;
  cogs:         number;
  total:        number;
  profit:       number;
};

export type InventorySummary = {
  total_products:   number;
  total_stock:      number;
  total_stock_value: number;
  low_stock_count:  number;
  zero_stock_count: number;
};

// Fila cruda de velocidad de venta por producto (query) — antes de cruzar
// con stock/valor.
export type InventoryVelocityRow = {
  id:       number;
  qty_sold: number;
  revenue:  number;
};

// Producto ya cruzado con su stock/valor — lo que consume la UI.
export type InventoryVelocityItem = {
  id:          number;
  name:        string;
  sku:         string;
  stock:       number;
  stock_value: number;
  qty_sold:    number;
  revenue:     number;
};

export type InventoryVelocity = {
  top_movers:        InventoryVelocityItem[];
  slow_movers:       InventoryVelocityItem[];
  slow_movers_count: number;
  dead_stock_value:  number;
  window_days:       number;
};

export type InventoryProduct = {
  id:          number;
  name:        string;
  sku:         string;
  price:       number;
  stock:       number;
  avg_cost:    number;
  stock_value: number;
  margin_pct:  number | null;
};

export type InventoryMovement = {
  created_at:     string;
  movement_type:  string;
  product_name:   string;
  sku:            string;
  quantity:       number;
  reference_type: string;
  notes:          string | null;
};

export type ProfitSummary = {
  revenue:        number;
  cogs:           number;
  gross_profit:   number;
  total_discount: number;
  margin_pct:     number;
  total_sales:    number;
};

export type ProfitByMonth = {
  month:        string;
  month_label:  string;
  revenue:      number;
  cogs:         number;
  profit:       number;
  sales_count:  number;
};

export type ProfitByProduct = {
  product_name: string;
  sku:          string;
  qty_sold:     number;
  revenue:      number;
  cogs:         number;
  profit:       number;
  margin_pct:   number;
};

export type EventSummary = {
  total_events:   number;
  total_revenue:  number;
  total_cogs:     number;
  total_expenses: number;
  gross_profit:   number;
  net_profit:     number;
  total_sales:    number;
};

export type EventRow = {
  id:            number;
  name:          string;
  location:      string;
  starts_at:     string;
  ends_at:       string;
  fixed_cost:    number;
  sales_count:   number;
  total_revenue: number;
  total_cogs:    number;
  extra_expenses: number;
  net_profit:    number;
  status:        "PLANNED" | "ONGOING" | "COMPLETED";
};

// ── Hooks ─────────────────────────────────────────────────────────────

export function useSalesReport(from: string, to: string) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? `/api/reports/sales?from=${from}&to=${to}` : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false }
  );
  return {
    summary:    (data?.summary    ?? null) as SalesSummary | null,
    byDay:      (data?.byDay      ?? [])   as SalesByDay[],
    byProduct:  (data?.byProduct  ?? [])   as SalesByProduct[],
    detail:     (data?.detail     ?? [])   as SaleDetail[],
    isLoading, error: (error as any)?.message ?? null, mutate,
  };
}

export function useInventoryReport() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? "/api/reports/inventory" : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false }
  );
  return {
    summary:   (data?.summary   ?? null) as InventorySummary | null,
    products:  (data?.products  ?? [])   as InventoryProduct[],
    movements: (data?.movements ?? [])   as InventoryMovement[],
    velocity:  (data?.velocity  ?? null) as InventoryVelocity | null,
    isLoading, error: (error as any)?.message ?? null, mutate,
  };
}

export function useProfitReport(from: string, to: string) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? `/api/reports/profit?from=${from}&to=${to}` : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false }
  );
  return {
    summary:    (data?.summary    ?? null) as ProfitSummary | null,
    byMonth:    (data?.byMonth    ?? [])   as ProfitByMonth[],
    byProduct:  (data?.byProduct  ?? [])   as ProfitByProduct[],
    expenses:   (data?.expenses   ?? null) as { total_expenses: number } | null,
    isLoading, error: (error as any)?.message ?? null, mutate,
  };
}

export function useEventsReport(from: string, to: string) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? `/api/reports/events?from=${from}&to=${to}` : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false }
  );
  return {
    summary: (data?.summary ?? null) as EventSummary | null,
    events:  (data?.events  ?? [])   as EventRow[],
    isLoading, error: (error as any)?.message ?? null, mutate,
  };
}
