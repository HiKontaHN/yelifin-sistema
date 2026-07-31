// hooks/swr/use-transactions.ts
"use client";

import useSWR from "swr";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

const KEY = "/api/transactions";

export type Transaction = {
  id: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  category: string | null;
  description: string | null;
  reference_type: string | null;
  reference_id: number | null;
  occurred_at: string;
  account_id: number;
  account_name: string;
  account_type: string;
  to_account_id: number | null;
  to_account_name: string | null;
};

export type TransactionTotals = {
  income: number;
  expense: number;
  transfer: number;
  count: number;
};

export type CreateTransactionInput = {
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  account_id: number;
  to_account_id?: number;
  amount: number;
  category?: string;
  description?: string;
  occurred_at?: string;
};

export type UpdateTransactionInput = {
  amount?: number;
  account_id?: number;
  to_account_id?: number;
  category?: string;
  description?: string;
  occurred_at?: string;
};

export type TransactionPeriod = { year: number; month: number };

function useAuthFetch() {
  const { firebaseUser } = useAuth();
  return async (url: string, options: RequestInit = {}) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Error en la solicitud");
    }
    return res.json();
  };
}

export function useTransactions(filters?: {
  account_id?: number;
  month?: number;
  year?: number;
  date?: string;
  type?: string;
  search?: string;
  tz_offset?: number;
  /** false = no consulta el endpoint (p. ej. cuando la vista solo muestra tarjetas) */
  enabled?: boolean;
}) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const params = new URLSearchParams();
  if (filters?.account_id) params.set("account_id", String(filters.account_id));
  if (filters?.month)      params.set("month",      String(filters.month));
  if (filters?.year)       params.set("year",        String(filters.year));
  if (filters?.date)       params.set("date",        filters.date);
  if (filters?.type && filters.type !== "all") params.set("type", filters.type);
  if (filters?.search)     params.set("search",      filters.search);
  if (filters?.tz_offset !== undefined) params.set("tz_offset", String(filters.tz_offset));

  const url = `${KEY}?${params.toString()}`;

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser && filters?.enabled !== false ? url : null,
    (u: string) => authFetch(u),
    {
      revalidateOnFocus:  false,
      dedupingInterval:   5 * 60_000,
    }
  );

  return {
    transactions: (data?.data   ?? []) as Transaction[],
    totals:       (data?.totals ?? { income: 0, expense: 0, transfer: 0, count: 0 }) as TransactionTotals,
    isLoading,
    error:        error?.message ?? null,
    mutate,
  };
}

export function useTransactionPeriods() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading } = useSWR(
    firebaseUser ? "/api/transactions/periods" : null,
    (u: string) => authFetch(u),
    { revalidateOnFocus: false, dedupingInterval: 300_000 }
  );

  return {
    periods:   (data?.data ?? []) as TransactionPeriod[],
    isLoading,
  };
}

export function useCreateTransaction() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);

  const createTransaction = async (input: CreateTransactionInput) => {
    setIsCreating(true);
    try {
      return await authFetch(KEY, { method: "POST", body: JSON.stringify(input) });
    } finally {
      setIsCreating(false);
    }
  };

  return { createTransaction, isCreating };
}

export function useUpdateTransaction() {
  const authFetch = useAuthFetch();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateTransaction = async (id: number, input: UpdateTransactionInput) => {
    setIsUpdating(true);
    try {
      return await authFetch(`${KEY}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateTransaction, isUpdating };
}

export function useDeleteTransaction() {
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteTransaction = async (id: number) => {
    setIsDeleting(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: "DELETE" });
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteTransaction, isDeleting };
}