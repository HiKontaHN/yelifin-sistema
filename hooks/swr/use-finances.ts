// hooks/swr/use-finances.ts
"use client";

import useSWR from "swr";
import { useAuth } from "@/hooks/use-auth";
import type { Account } from "@/hooks/swr/use-accounts";
import type { CreditCard } from "@/hooks/swr/use-credit-cards";

export type FinanceAccount = {
  id: number;
  name: string;
  type: "CASH" | "BANK" | "WALLET" | "OTHER";
  balance: number;
};

export type CashFlowEntry = {
  date: string;
  income: number;
  expense: number;
};

export type TodayTransaction = {
  id: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  description: string | null;
  category: string | null;
  reference_type: string | null;
  occurred_at: string;
  account_name: string;
  to_account_name: string | null;
};

export type FinanceSummary = {
  accounts:           FinanceAccount[];
  period:             { income: number; expense: number };
  today:              { income: number; expense: number; count: number };
  cash_flow:          CashFlowEntry[];
  today_transactions: TodayTransaction[];
};

export type FinancePeriod = { year: number; month: number };

function useAuthFetch() {
  return async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Error en la solicitud");
    }
    return res.json();
  };
}

export function useFinances(filters?: { month?: number; year?: number }) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const params = new URLSearchParams();
  if (filters?.month) params.set("month", String(filters.month));
  if (filters?.year)  params.set("year",  String(filters.year));

  const url = `/api/finances/summary?${params.toString()}`;

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? url : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false }
  );

  return {
    summary:   data as FinanceSummary | undefined,
    isLoading,
    error:     error?.message ?? null,
    mutate,
  };
}

/** Carga consolidada del resumen, períodos y selectores financieros. */
export function useFinancesView(filters?: {
  month?: number;
  year?: number;
  tz_offset?: number;
}) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const params = new URLSearchParams();
  if (filters?.month) params.set("month", String(filters.month));
  if (filters?.year) params.set("year", String(filters.year));
  if (filters?.tz_offset !== undefined) params.set("tz_offset", String(filters.tz_offset));
  const query = params.toString();
  const url = `/api/finances/view${query ? `?${query}` : ""}`;

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? url : null,
    (requestUrl: string) => authFetch(requestUrl),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  return {
    summary: data?.data?.summary as FinanceSummary | undefined,
    periods: (data?.data?.periods ?? []) as FinancePeriod[],
    accounts: (data?.data?.accounts ?? []) as Account[],
    creditCards: (data?.data?.credit_cards ?? []) as CreditCard[],
    isLoading,
    error: error?.message ?? null,
    mutate,
  };
}

export function useFinancePeriods() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading } = useSWR(
    firebaseUser ? "/api/finances/periods" : null,
    (u: string) => authFetch(u),
     {
      revalidateOnFocus:    false,
      dedupingInterval:     5 * 60_000,
    }
  );

  return {
    periods:   (data?.data ?? []) as FinancePeriod[],
    isLoading,
  };
}
