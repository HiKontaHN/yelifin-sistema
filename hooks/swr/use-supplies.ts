// hooks/swr/use-supplies.ts
"use client";

import useSWR from "swr";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

const KEY = "/api/supplies";

export type Supply = {
  id: number;
  user_id: number;
  name: string;
  unit: string | null;
  stock: number;
  min_stock: number;
  unit_cost: number;
  created_at: string;
};

export type CreateSupplyInput = {
  name: string;
  unit?: string;
  stock?: number;
  min_stock?: number;
  unit_cost?: number;
};

export type UpdateSupplyInput = {
  name: string;
  unit?: string;
  min_stock?: number;
};

export type SupplyPurchaseInput = {
  account_id: number;            // ← nuevo, requerido
  supplier_id?: number | null;
  purchased_at?: string;
  items: { supply_id: number; quantity: number; unit_cost: number }[];
};

function useAuthFetch() {
  return async (url: string, options: RequestInit = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Error en la solicitud");
    }

    return json;
  };
}

export function useSupplies(params?: { search?: string; page?: number; limit?: number }) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.page)   qs.set("page",   String(params.page));
  if (params?.limit)  qs.set("limit",  String(params.limit));

  const swrKey = firebaseUser ? `${KEY}?${qs.toString()}` : null;

  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    (url: string) => authFetch(url),
     {
      revalidateOnFocus:    false,
      dedupingInterval:     5 * 60_000,
    }
  );

  return {
    supplies:   (data?.data ?? []) as Supply[],
    total:      (data?.total      ?? 0) as number,
    totalPages: (data?.totalPages ?? 1) as number,
    isLoading,
    error: error?.message ?? null,
    mutate,
  };
}

export function useCreateSupply() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);

  const createSupply = async (input: CreateSupplyInput) => {
    setIsCreating(true);
    try {
      return await authFetch(KEY, { method: "POST", body: JSON.stringify(input) });
    } finally {
      setIsCreating(false);
    }
  };

  return { createSupply, isCreating };
}

export function useUpdateSupply(id: number | null) {
  const authFetch = useAuthFetch();
  const [isUpdating, setIsUpdating] = useState(false);

  const updateSupply = async (input: UpdateSupplyInput) => {
    if (!id) throw new Error("ID inválido");
    setIsUpdating(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: "PUT", body: JSON.stringify(input) });
    } finally {
      setIsUpdating(false);
    }
  };

  return { updateSupply, isUpdating };
}

export function useDeleteSupply(id: number | null) {
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteSupply = async () => {
    if (!id) throw new Error("ID inválido");
    setIsDeleting(true);
    try {
      return await authFetch(`${KEY}/${id}`, { method: "DELETE" });
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteSupply, isDeleting };
}

export function useCreateSupplyPurchase() {
  const authFetch = useAuthFetch();
  const [isCreating, setIsCreating] = useState(false);

  const createSupplyPurchase = async (input: SupplyPurchaseInput) => {
    setIsCreating(true);
    try {
      return await authFetch("/api/supply-purchases", {
        method: "POST",
        body: JSON.stringify(input),
      });
    } finally {
      setIsCreating(false);
    }
  };

  return { createSupplyPurchase, isCreating };
}
