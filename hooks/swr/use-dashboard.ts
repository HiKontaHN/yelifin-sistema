// hooks/swr/use-dashboard.ts
"use client";

import useSWR from "swr";
import { useAuth } from "@/hooks/use-auth";

const KEY = "/api/dashboard";

export type DashboardPeriod = { year: number; month: number };

export type DashboardData = {
  period: { year: number; month: number } | "today" | null;
  metrics: {
    revenue: number;
    revenue_change: number | null;
    profit: number;
    profit_change: number | null;
    sales_count: number;
    customers_total: number;
    customers_new: number;
    inventory: {
      total_products: number;
      total_units: number;
      total_value: number;
      out_of_stock: number;
      low_stock: number;
    };
    balance: number;
    credit_card_debt: {
      local: number;
      usd:   number;
    };
  };
  sales_chart:     { date: string; revenue: number; profit: number }[];
  payment_methods: { method: string; amount: number }[];
  top_products: {
    id: number; name: string; image_url: string | null;
    units_sold: number; revenue: number; profit: number;
  }[];
  recent_sales: {
    id: number; sale_number: string; total: number;
    payment_method: string; sold_at: string;
    customer_name: string | null; items_count: number; profit: number;
  }[];
  low_stock: {
    id: number; name: string; sku: string | null;
    image_url: string | null; stock: number;
  }[];
};

function useAuthFetch() {
  const { firebaseUser } = useAuth();
  return async (url: string) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Error en la solicitud");
    return res.json();
  };
}

// Hook principal con filtros opcionales
export function useDashboard(filters?: { month?: number; year?: number; period?: "today" }) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const params = new URLSearchParams();
  if (filters?.period === "today") {
    params.set("period", "today");
  } else {
    if (filters?.month) params.set("month", String(filters.month));
    if (filters?.year)  params.set("year",  String(filters.year));
  }

  const qs  = params.toString();
  const url = qs ? `${KEY}?${qs}` : KEY;

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? url : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  return {
    data:      (data?.data ?? null) as DashboardData | null,
    isLoading,
    error:     (error as any)?.message ?? null,
    mutate,
  };
}

// Hook para obtener períodos disponibles
export function useDashboardPeriods() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading } = useSWR(
    firebaseUser ? "/api/dashboard/periods" : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );

  return {
    periods:   (data?.data ?? []) as DashboardPeriod[],
    isLoading,
  };
}