'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import type { AuthContextResponse, SessionUser } from '@/types';
import { authReady } from '@/lib/firebase';

const SESSION_KEY = '/api/auth/session';
const PROFILE_KEY = '/api/auth/me';

async function fetchAuthContext(url: string): Promise<AuthContextResponse | null> {
  const response = await fetch(url, { cache: 'no-store' });
  if ([401, 403, 404].includes(response.status)) return null;
  if (!response.ok) throw new Error('No se pudo validar la sesión');
  return response.json();
}

export function useAuth() {
  // Borra persistencia SDK heredada, pero nunca deriva el estado de sesión de ella.
  void authReady.catch(() => undefined);

  const {
    data: authContext,
    error: authError,
    isLoading,
    mutate: mutateAuthContext,
  } = useSWR<AuthContextResponse | null>(
    PROFILE_KEY,
    fetchAuthContext,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      revalidateOnReconnect: false,
    },
  );

  const sessionUser = authContext?.session ?? null;
  const user = authContext ?? undefined;

  const logout = useCallback(async () => {
    const response = await fetch(SESSION_KEY, { method: 'DELETE' });
    if (!response.ok) throw new Error('No se pudo cerrar la sesión');
    await mutateAuthContext(null, { revalidate: false });
  }, [mutateAuthContext]);

  const refreshSession = useCallback(async (): Promise<SessionUser | null> => {
    const refreshed = await mutateAuthContext();
    return refreshed?.session ?? null;
  }, [mutateAuthContext]);

  // firebaseUser queda como alias compatible para consumidores que solo
  // necesitan uid/email; ahora es una identidad del servidor, no del SDK.
  return {
    firebaseUser: sessionUser ?? null,
    sessionUser: sessionUser ?? null,
    serverSession: !!sessionUser,
    user,
    loading: isLoading || !!authError,
    emailVerified: sessionUser?.emailVerified ?? false,
    sessionEmailVerified: sessionUser?.sessionEmailVerified ?? false,
    refreshProfile: () => mutateAuthContext(),
    refreshSession,
    logout,
  };
}
