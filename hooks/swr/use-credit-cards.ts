// hooks/swr/use-credit-cards.ts
'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useHybridSearch, HybridSearchResult } from '@/hooks/use-hybrid-search';

const KEY = '/api/credit-cards';

export type CreditCard = {
  id: number;
  name: string;
  last_four: string | null;
  credit_limit: number | null;
  statement_closing_day: number | null;
  payment_due_day: number | null;
  balance: number;
  balance_usd: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // only present on detail endpoint
  statement_balance_local?: number;
  statement_balance_usd?: number;
  cycle_start?: string;
};

export type CreditCardTransaction = {
  id: number;
  type: 'CHARGE' | 'PAYMENT';
  description: string | null;
  amount: number;
  currency: string;
  exchange_rate: number | null;
  amount_local: number | null;
  sale_id: number | null;
  sale_number: string | null;
  account_transaction_id: number | null;
  account_name: string | null;
  category: string | null;
  occurred_at: string;
  created_at: string;
};

export type AllCardTransaction = CreditCardTransaction & {
  credit_card_id: number;
  card_name: string;
  last_four: string | null;
};

export type CreateCreditCardInput = {
  name: string;
  last_four?: string;
  credit_limit?: number;
  statement_closing_day?: number;
  payment_due_day?: number;
  initial_balance?: number;
  initial_balance_usd?: number;
};

export type PayCreditCardInput = {
  account_id: number;
  amount: number;
  currency: string;
  exchange_rate?: number;
  occurred_at?: string;
  description?: string;
  category?: string;
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
    return res.json();
  };
}

export function useCreditCards() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? KEY : null,
    (url: string) => authFetch(url),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 }
  );

  return {
    creditCards: (data?.data ?? []) as CreditCard[],
    total: data?.total ?? 0,
    isLoading,
    error: error?.message ?? null,
    mutate,
  };
}

export function useCreditCard(id: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser && id ? `${KEY}/${id}?tz_offset=${new Date().getTimezoneOffset()}` : null,
    (url: string) => authFetch(url),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  return {
    creditCard: data?.data as CreditCard | undefined,
    isLoading,
    error: error?.message ?? null,
    mutate,
  };
}

export function useCreditCardTransactions(
  id: number | null,
  params?: { month?: number; year?: number; tz_offset?: number }
) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const query = new URLSearchParams();
  if (params?.month)      query.set('month',     String(params.month));
  if (params?.year)       query.set('year',      String(params.year));
  if (params?.tz_offset !== undefined) query.set('tz_offset', String(params.tz_offset));
  const qs = query.toString();

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser && id ? `${KEY}/${id}/transactions${qs ? `?${qs}` : ''}` : null,
    (url: string) => authFetch(url),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  return {
    transactions: (data?.data ?? []) as CreditCardTransaction[],
    totals: data?.totals ?? { charges_local: 0, charges_usd: 0, payments_local: 0, payments_usd: 0, count: 0 },
    isLoading,
    error: error?.message ?? null,
    mutate,
  };
}

/**
 * Búsqueda de movimientos de una tarjeta: filtra primero el período ya
 * cargado; si no hay coincidencias, consulta (con debounce y caché) el
 * endpoint global de movimientos de esa tarjeta en todos los períodos.
 */
export function useCreditCardTxnSearch(
  cardId: number | null,
  query: string,
  localTxns: CreditCardTransaction[]
): HybridSearchResult<CreditCardTransaction> {
  const authFetch = useAuthFetch();

  return useHybridSearch<CreditCardTransaction>({
    query,
    items: localTxns,
    matchLocal: (t, q) =>
      (t.description ?? '').toLowerCase().includes(q) ||
      (t.category ?? '').toLowerCase().includes(q) ||
      (t.sale_number ?? '').toLowerCase().includes(q),
    remoteKey: (q) =>
      cardId ? `/api/credit-card-transactions?card_id=${cardId}&search=${encodeURIComponent(q)}` : null,
    fetchRemote: async (url) => (await authFetch(url)).data as CreditCardTransaction[],
  });
}

export function useCreditCardPeriods(id: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading } = useSWR(
    firebaseUser && id ? `/api/credit-cards/${id}/periods` : null,
    (url: string) => authFetch(url),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 }
  );
  return {
    periods: (data?.data ?? []) as { year: number; month: number }[],
    isLoading,
  };
}

export function useCCTransactionPeriods() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const { data, isLoading } = useSWR(
    firebaseUser ? "/api/credit-card-transactions/periods" : null,
    (url: string) => authFetch(url),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 }
  );
  return {
    periods: (data?.data ?? []) as { year: number; month: number }[],
    isLoading,
  };
}

export function useAllCreditCardTransactions(params?: {
  month?: number;
  year?: number;
  date?: string;
  card_id?: number;
  search?: string;
  tz_offset?: number;
}) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const query = new URLSearchParams();
  if (params?.month)    query.set('month',     String(params.month));
  if (params?.year)     query.set('year',      String(params.year));
  if (params?.date)     query.set('date',      params.date);
  if (params?.card_id)  query.set('card_id',   String(params.card_id));
  if (params?.search)   query.set('search',    params.search);
  if (params?.tz_offset !== undefined) query.set('tz_offset', String(params.tz_offset));
  const qs = query.toString();

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? `/api/credit-card-transactions${qs ? `?${qs}` : ''}` : null,
    (url: string) => authFetch(url),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  return {
    transactions: (data?.data ?? []) as AllCardTransaction[],
    isLoading,
    error: error?.message ?? null,
    mutate,
  };
}

export function useCreateCreditCard() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);

  const createCreditCard = async (input: CreateCreditCardInput) => {
    setIsCreating(true);
    try {
      return await authFetch(KEY, { method: 'POST', body: JSON.stringify(input) });
    } finally {
      setIsCreating(false);
    }
  };

  return { createCreditCard, isCreating };
}

export function useUpdateCreditCard() {
  const authFetch = useAuthFetch();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateCreditCard = async (id: number, input: Partial<CreateCreditCardInput> & { is_active?: boolean }) => {
    setIsUpdating(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateCreditCard, isUpdating };
}

export function useDeleteCreditCard() {
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteCreditCard = async (id: number) => {
    setIsDeleting(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: 'DELETE' });
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteCreditCard, isDeleting };
}

export function usePayCreditCard() {
  const authFetch = useAuthFetch();
  const [isPaying, setIsPaying] = useState(false);

  const payCreditCard = async (id: number, input: PayCreditCardInput) => {
    setIsPaying(true);
    try {
      return await authFetch(`${KEY}/${id}/payment`, { method: 'POST', body: JSON.stringify(input) });
    } finally {
      setIsPaying(false);
    }
  };

  return { payCreditCard, isPaying };
}

export function useUpdateCCTransactionCategory() {
  const authFetch = useAuthFetch();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateCategory = async (id: number, category: string | null) => {
    setIsUpdating(true);
    try {
      return await authFetch(`/api/credit-card-transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ category }),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateCategory, isUpdating };
}

export function useUpdateCCTransaction() {
  const authFetch = useAuthFetch();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateTransaction = async (id: number, data: {
    description?: string;
    category?: string | null;
    occurred_at?: string;
    amount?: number;
    currency?: string;
    exchange_rate?: number;
  }) => {
    setIsUpdating(true);
    try {
      return await authFetch(`/api/credit-card-transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateTransaction, isUpdating };
}

export function useDeleteCCTransaction() {
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteTransaction = async (id: number) => {
    setIsDeleting(true);
    try {
      return await authFetch(`/api/credit-card-transactions/${id}`, { method: 'DELETE' });
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteTransaction, isDeleting };
}
