// hooks/use-hybrid-search.ts
"use client";

import { useMemo, useRef } from "react";
import useSWR from "swr";
import { useDebounce } from "@/hooks/use-debounce";

export type HybridSearchOptions<T> = {
  /** Texto crudo del input de búsqueda */
  query: string;
  /** Dataset ya cargado en el cliente (p. ej. el período visible) */
  items: T[];
  /** Predicado local; recibe el query normalizado (trim + lowercase) */
  matchLocal: (item: T, q: string) => boolean;
  /** Construye la URL del endpoint global para un query dado */
  remoteKey: (q: string) => string | null;
  /** Fetcher autenticado que resuelve la URL a resultados */
  fetchRemote: (url: string) => Promise<T[]>;
  /** Mínimo de caracteres antes de consultar al servidor */
  minChars?: number;
  /** Espera (ms) tras la última tecla antes de ir al servidor */
  delay?: number;
};

export type HybridSearchResult<T> = {
  results: T[];
  /** De dónde salieron los resultados actuales */
  source: "local" | "remote";
  /** true mientras se espera el debounce o la respuesta del servidor */
  isSearching: boolean;
};

/**
 * Búsqueda híbrida local-primero con fallback global:
 *
 * 1. Filtra en memoria sobre `items` en cada tecla (instantáneo, cero red).
 * 2. Solo si lo local no encontró nada y el usuario dejó de teclear
 *    (`delay` ms), consulta el endpoint global vía SWR.
 * 3. El caché de SWR (keyed por término) actúa como memo: repetir una
 *    búsqueda reciente no vuelve a pegar al servidor (dedupe de 5 min).
 */
export function useHybridSearch<T>({
  query,
  items,
  matchLocal,
  remoteKey,
  fetchRemote,
  minChars = 2,
  delay = 400,
}: HybridSearchOptions<T>): HybridSearchResult<T> {
  const q = query.trim().toLowerCase();
  const debouncedQ = useDebounce(q, delay);

  // Ref para no invalidar el memo cuando el caller pasa una arrow inline
  const matchRef = useRef(matchLocal);
  matchRef.current = matchLocal;

  const localResults = useMemo(
    () => (q ? items.filter((it) => matchRef.current(it, q)) : items),
    [items, q]
  );

  // Al servidor solo cuando: query estable (debounce cumplido), longitud
  // suficiente, y lo local quedó vacío.
  const needsRemote = q.length >= minChars && q === debouncedQ && localResults.length === 0;
  const key = needsRemote ? remoteKey(debouncedQ) : null;

  const { data: remoteResults, isLoading } = useSWR(key, fetchRemote, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
    keepPreviousData: true,
  });

  if (!q || localResults.length > 0) {
    return { results: localResults, source: "local", isSearching: false };
  }

  const waitingDebounce = q !== debouncedQ && q.length >= minChars;
  return {
    results: needsRemote ? (remoteResults ?? []) : [],
    source: "remote",
    isSearching: waitingDebounce || (needsRemote && isLoading),
  };
}
