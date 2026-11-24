"use client";

import useSWR from "swr";

import { useAuth } from "@/hooks/use-auth";

const ENDPOINT = "/api/product-categories";

export type ProductCategory = { id: number; name: string };

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if (response.status === 204) return;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar las categorías de productos");
  return body;
}

export function useProductCategories(enabled = true) {
  const { firebaseUser } = useAuth();
  const { data, isLoading, error, mutate } = useSWR<{ data: ProductCategory[] }>(
    enabled && firebaseUser ? ENDPOINT : null,
    (url: string) => request(url),
  );

  const saveCategory = async (name: string, id?: number) => {
    const response: { data: ProductCategory } = await request(id === undefined ? ENDPOINT : `${ENDPOINT}/${id}`, {
      method: id === undefined ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const saved = response.data;
    await mutate((current) => ({
      data: [...(current?.data ?? []).filter((category) => String(category.id) !== String(saved.id)), saved]
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    }), { revalidate: true });
    return saved;
  };

  const deleteCategory = async (id: number) => {
    await request(`${ENDPOINT}/${id}`, { method: "DELETE" });
    await mutate();
  };

  return { categories: data?.data ?? [], isLoading, error, saveCategory, deleteCategory };
}
