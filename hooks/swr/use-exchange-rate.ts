// hooks/swr/use-exchange-rate.ts
'use client';

import useSWR from 'swr';
import { useAuth } from '@/hooks/use-auth';

const KEY = '/api/exchange-rate';

function useAuthFetch() {
  const { firebaseUser } = useAuth();
  return async (url: string) => {
    const token = await firebaseUser?.getIdToken();
    if (!token) throw new Error('No autenticado');
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Error al obtener el tipo de cambio');
    return res.json();
  };
}

// Tipo de cambio USD → HNL sugerido (BCH, actualizado a diario por cron)
// — siempre es un punto de partida editable, nunca un valor forzado.
export function useSuggestedExchangeRate() {
  const { firebaseUser } = useAuth();
  const authFetch = useAuthFetch();

  const { data, isLoading } = useSWR(
    firebaseUser ? KEY : null,
    (url: string) => authFetch(url),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60 * 60_000, // 1 hora — solo cambia una vez al día
    }
  );

  return {
    rate: data?.data?.usd_hnl ?? null as number | null,
    rateDate: data?.data?.rate_date ?? null as string | null,
    isLoading,
  };
}
