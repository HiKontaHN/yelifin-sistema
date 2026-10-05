// hooks/use-currency.ts
"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/hooks/use-auth";
import { usePrivacyMode } from "@/context/privacy-mode-context";

const CACHE_KEY = "_currency";
const DEFAULT   = "HNL";

// Símbolo por código
const CURRENCY_SYMBOLS: Record<string, string> = {
  HNL: "L",
  USD: "$",
  MXN: "$",
  GTQ: "Q",
  CRC: "₡",
  EUR: "€",
};

export function useCurrency() {
  const { firebaseUser }    = useAuth();
  const { isPrivate }       = usePrivacyMode();
  const [cached, setCached] = useState<string>(() => {
    // Leer de localStorage inmediatamente (sin esperar al API)
    if (typeof window !== "undefined") {
      return localStorage.getItem(CACHE_KEY) ?? DEFAULT;
    }
    return DEFAULT;
  });

  // SWR dedupa la petición entre todos los componentes que usan el hook
  const { data } = useSWR(
    firebaseUser ? "/api/onboarding" : null,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al obtener configuración");
      return res.json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 5 * 60_000, // 5 minutos sin re-fetch
    }
  );

  const serverCurrency: string | undefined = data?.data?.currency;

  useEffect(() => {
    if (serverCurrency && serverCurrency !== cached) {
      localStorage.setItem(CACHE_KEY, serverCurrency);
      setCached(serverCurrency);
    }
  }, [serverCurrency, cached]);

  const currency = serverCurrency ?? cached;
  const symbol   = CURRENCY_SYMBOLS[currency] ?? currency;

  const format = (value: number, opts?: Intl.NumberFormatOptions) => {
    if (isPrivate) return "•••••";
    return new Intl.NumberFormat("es-HN", {
      style:                 "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      ...opts,
    }).format(value);
  };

  return { currency, symbol, format };
}
