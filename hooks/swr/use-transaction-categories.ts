// hooks/swr/use-transaction-categories.ts
"use client";

import useSWR from "swr";
import { useAuth } from "@/hooks/use-auth";

export interface TransactionCategory {
  id: number;
  name: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  is_active: boolean;
}

interface CategoriesResponse {
  data: TransactionCategory[];
  total?: number;
  totalPages?: number;
}

export type CategoriesQuery = {
  type?: "INCOME" | "EXPENSE" | "TRANSFER";
  search?: string;
  status?: "active" | "inactive" | "all";
  page?: number;
  limit?: number;
};

interface CategoryResponse {
  data: TransactionCategory;
}

function useAuthFetch() {
  const { firebaseUser } = useAuth();
  return async (url: string) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Error en la solicitud");
    }
    return res.json();
  };
}

// Acepta el string de type de siempre (compatibilidad con los llamadores
// existentes que solo necesitan la lista completa para llenar un <Select>)
// o un objeto de filtros para paginar/buscar/ver inactivas — usado por
// /settings/categories.
export function useTransactionCategories(query?: string | CategoriesQuery) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const q: CategoriesQuery = typeof query === "string" ? { type: query as any } : (query ?? {});

  const params = new URLSearchParams();
  if (q.type)   params.set("type", q.type);
  if (q.search) params.set("search", q.search);
  if (q.status) params.set("status", q.status);
  if (q.page)   params.set("page", String(q.page));
  if (q.limit)  params.set("limit", String(q.limit));
  const qs = params.toString();
  const url = qs ? `/api/transaction-categories?${qs}` : "/api/transaction-categories";

  const { data, error, mutate } = useSWR<CategoriesResponse>(
    firebaseUser ? url : null,
    (url: string) => authFetch(url)
  );

  return {
    categories: data?.data ?? [],
    total: data?.total ?? 0,
    totalPages: data?.totalPages ?? 1,
    isLoading: !error && !data,
    error,
    mutate,
  };
}

export function useCreateCategory() {
  const { firebaseUser } = useAuth();

  const create = async (payload: {
    name: string;
    type: "INCOME" | "EXPENSE" | "TRANSFER";
  }): Promise<TransactionCategory> => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");

    const res = await fetch("/api/transaction-categories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Error al crear categoría");
    }

    const result: CategoryResponse = await res.json();
    return result.data;
  };

  return { create };
}

export function useUpdateCategory() {
  const { firebaseUser } = useAuth();

  const update = async (
    id: number,
    payload: { name?: string; is_active?: boolean }
  ): Promise<TransactionCategory> => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");

    const res = await fetch(`/api/transaction-categories/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Error al actualizar categoría");
    }

    const result: CategoryResponse = await res.json();
    return result.data;
  };

  return { update };
}

export function useDeleteCategory() {
  const { firebaseUser } = useAuth();

  const remove = async (id: number): Promise<void> => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error("No autenticado");

    const res = await fetch(`/api/transaction-categories/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Error al eliminar categoría");
    }
  };

  return { remove };
}