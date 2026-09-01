// hooks/swr/use-stock-alerts.ts
"use client";

import useSWR from "swr";
import { useAuth } from "@/hooks/use-auth";

const KEY = "/api/dashboard/stock-alerts";

export type StockAlertsData = {
  critical: {
    id: number; name: string; sku: string | null; image_url: string | null;
    units_sold: number; stock: number; days_coverage: number;
  }[];
  rotation: {
    id: number; name: string; sku: string | null; image_url: string | null;
    units_recent: number; units_previous: number; stock: number; trend_pct: number;
  }[];
  stale: {
    id: number; name: string; sku: string | null; image_url: string | null;
    stock: number; stock_value: number | null;
    last_sale_at: string | null; days_since_sale: number | null; days_since_created: number | null;
  }[];
};

export function useStockAlerts() {
  const { firebaseUser } = useAuth();

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? KEY : null,
    async (url: string) => {
      const token = await firebaseUser?.getIdToken();
      if (!token) throw new Error("No autenticado");
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Error en la solicitud");
      return res.json();
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  return {
    data: (data?.data ?? null) as StockAlertsData | null,
    isLoading,
    error: (error as any)?.message ?? null,
    mutate,
  };
}
