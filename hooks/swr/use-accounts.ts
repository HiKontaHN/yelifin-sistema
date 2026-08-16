// hooks/swr/use-accounts.ts
'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

const KEY = '/api/accounts';

export type Account = {
  id: number;
  name: string;
  type: 'CASH' | 'BANK' | 'WALLET' | 'OTHER';
  // null cuando el rol puede seleccionar la cuenta (SALES/INVENTORY/EVENTS)
  // pero no tiene acceso a FINANZAS — el backend oculta el saldo real.
  balance: number | null;
  is_active: boolean;
  created_at: string;
};

export type CreateAccountInput = {
  name: string;
  type: 'CASH' | 'BANK' | 'WALLET' | 'OTHER';
  balance?: number;
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
      const err = await res.json();
      throw new Error(err.error || 'Error en la solicitud');
    }
    return res.json();
  };
}

export function useAccounts() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading, error, mutate } = useSWR(
    firebaseUser ? KEY : null,
    (url: string) => authFetch(url),
    {
      revalidateOnFocus:    false,
      dedupingInterval:     5 * 60_000,
    }
  );

  return {
    accounts: (data?.data ?? []) as Account[],
    total:    data?.total ?? 0,
    isLoading,
    error:    error?.message ?? null,
    mutate,
  };
}

export function useCreateAccount() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);

  const createAccount = async (input: CreateAccountInput) => {
    setIsCreating(true);
    try {
      return await authFetch(KEY, { method: 'POST', body: JSON.stringify(input) });
    } finally {
      setIsCreating(false);
    }
  };

  return { createAccount, isCreating };
}

export function useUpdateAccount() {
  const authFetch = useAuthFetch();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateAccount = async (id: number, input: Partial<CreateAccountInput> & { is_active?: boolean }) => {
    setIsUpdating(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateAccount, isUpdating };
}

export function useDeleteAccount() {
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteAccount = async (id: number) => {
    setIsDeleting(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: 'DELETE' });
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteAccount, isDeleting };
}