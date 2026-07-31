// hooks/swr/use-products.ts
'use client';

import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { useAuth } from '@/hooks/use-auth';
import { Product, ProductVariant } from '@/types';
import { useState } from 'react';

const KEY = '/api/products';

// ── Tipos ──────────────────────────────────────────────────────────────

export type ProductsResponse = {
  data: Product[];
  total: number;
};

export type ProductResponse = {
  data: Product;
};

export type VariantResponse = {
  data: ProductVariant;
};

export type CreateProductInput = {
  name: string;
  description?: string;
  sku?: string;
  price: number;
  image_url?: string | null;
  is_service?: boolean;
};

export type UpdateProductInput = Partial<CreateProductInput> & {
  is_active?: boolean;
};

export type CreateVariantInput = {
  variant_name: string;
  sku?: string;
  attributes?: Record<string, string> | null;
  price_override?: number | null;
  image_url?: string | null;
  /**
   * Solo al crear la PRIMERA variante de un producto con stock base:
   * convierte ese stock en una variante con este nombre (migra los lotes).
   */
  base_conversion?: { variant_name: string; sku?: string };
};

export type UpdateVariantInput = Partial<CreateVariantInput> & {
  is_active?: boolean;
};

// ── Helper interno para fetch autenticado ─────────────────────────────

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

// ── useProducts — listar todos ─────────────────────────────────────────

export function useProducts() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, error, isLoading, mutate } = useSWR<ProductsResponse>(
    firebaseUser ? KEY : null,
    (url: string) => authFetch(url),
    {
      revalidateOnFocus: false,
      dedupingInterval:  5 * 60_000,
    }
  );

  return {
    products:  data?.data  ?? [],
    total:     data?.total ?? 0,
    isLoading,
    error:     error?.message ?? null,
    mutate,
  };
}

// ── useProduct — uno por id ────────────────────────────────────────────

export function useProduct(id: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, error, isLoading, mutate } = useSWR<ProductResponse>(
    firebaseUser && id ? `${KEY}/${id}` : null,
    (url: string) => authFetch(url),
  );

  return {
    product:   data?.data ?? null,
    isLoading,
    error:     error?.message ?? null,
    mutate,
  };
}

// ── useCreateProduct ───────────────────────────────────────────────────

export function useCreateProduct() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { trigger, isMutating } = useSWRMutation(
    firebaseUser ? KEY : null,
    (_url: string, { arg }: { arg: CreateProductInput }) =>
      authFetch(KEY, { method: 'POST', body: JSON.stringify(arg) }),
  );

  const createProduct = async (input: CreateProductInput): Promise<Product> => {
    const result: ProductResponse = await trigger(input);
    return result.data;
  };

  return { createProduct, isCreating: isMutating };
}

// ── useUpdateProduct ───────────────────────────────────────────────────

export function useUpdateProduct(id: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { trigger, isMutating } = useSWRMutation(
    firebaseUser && id ? `${KEY}/${id}` : null,
    (_url: string, { arg }: { arg: UpdateProductInput }) =>
      authFetch(`${KEY}/${id}`, { method: 'PATCH', body: JSON.stringify(arg) }),
  );

  const updateProduct = async (input: UpdateProductInput): Promise<Product> => {
    const result: ProductResponse = await trigger(input);
    return result.data;
  };

  return { updateProduct, isUpdating: isMutating };
}

// ── useDeleteProduct ───────────────────────────────────────────────────

export function useDeleteProduct() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteProduct = async (id: number): Promise<void> => {
    setIsDeleting(true);
    try {
      await authFetch(`${KEY}/${id}`, { method: 'DELETE' });
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteProduct, isDeleting };
}

// ── useCreateVariant ───────────────────────────────────────────────────

export function useCreateVariant(productId: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { trigger, isMutating } = useSWRMutation(
    firebaseUser && productId ? `${KEY}/${productId}/variants` : null,
    (_url: string, { arg }: { arg: CreateVariantInput }) =>
      authFetch(`${KEY}/${productId}/variants`, {
        method: 'POST',
        body: JSON.stringify(arg),
      }),
  );

  const createVariant = async (input: CreateVariantInput): Promise<ProductVariant> => {
    const result: VariantResponse = await trigger(input);
    return result.data;
  };

  return { createVariant, isCreating: isMutating };
}

// ── useUpdateVariant ───────────────────────────────────────────────────

export function useUpdateVariant(productId: number | null, variantId: number | null) {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { trigger, isMutating } = useSWRMutation(
    firebaseUser && productId && variantId
      ? `${KEY}/${productId}/variants/${variantId}`
      : null,
    (_url: string, { arg }: { arg: UpdateVariantInput }) =>
      authFetch(`${KEY}/${productId}/variants/${variantId}`, {
        method: 'PATCH',
        body: JSON.stringify(arg),
      }),
  );

  const updateVariant = async (input: UpdateVariantInput): Promise<ProductVariant> => {
    const result: VariantResponse = await trigger(input);
    return result.data;
  };

  return { updateVariant, isUpdating: isMutating };
}

// ── useDeleteVariant ───────────────────────────────────────────────────

export function useDeleteVariant() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteVariant = async (
    productId: number,
    variantId: number,
  ): Promise<void> => {
    setIsDeleting(true);
    try {
      await authFetch(`${KEY}/${productId}/variants/${variantId}`, {
        method: 'DELETE',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return { deleteVariant, isDeleting };
}