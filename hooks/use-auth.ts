'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import posthog from 'posthog-js';
import type { AuthContextResponse, SessionUser } from '@/types';
import { authReady } from '@/lib/firebase';

const SESSION_KEY = '/api/auth/session';
const PROFILE_KEY = '/api/auth/me';

type AuthAccessBlocked = {
  accessBlocked: true;
  message: string;
};

type AuthFetchResult = AuthContextResponse | AuthAccessBlocked | null;

function isAccessBlocked(value: AuthFetchResult): value is AuthAccessBlocked {
  return !!value && 'accessBlocked' in value;
}

async function fetchAuthContext(url: string): Promise<AuthFetchResult> {
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 401) {
    const publicAuthPages = ['/', '/login', '/register', '/forgot-password'];
    if (typeof window !== 'undefined' && !publicAuthPages.includes(window.location.pathname)) {
      window.location.replace('/login');
    }
    return null;
  }
  if (response.status === 403) {
    const body = await response.json().catch(() => ({}));
    if (body?.needs_upgrade === true) {
      return {
        accessBlocked: true,
        message: body.error || 'El pago está pendiente; solo el dueño puede entrar.',
      };
    }
    return null;
  }
  if (response.status === 404) return null;
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
  } = useSWR<AuthFetchResult>(
    PROFILE_KEY,
    fetchAuthContext,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      revalidateOnReconnect: false,
    },
  );

  const authResult = authContext ?? null;
  const blockedContext: AuthAccessBlocked | null = isAccessBlocked(authResult)
    ? authResult
    : null;
  const accessBlocked = blockedContext !== null;
  const profile: AuthContextResponse | null = authContext && !isAccessBlocked(authContext)
    ? authContext
    : null;
  const sessionUser = profile?.session ?? null;
  const user = profile ?? undefined;

  const logout = useCallback(async () => {
    const response = await fetch(SESSION_KEY, { method: 'DELETE' });
    if (!response.ok) throw new Error('No se pudo cerrar la sesión');
    posthog.reset();
    await mutateAuthContext(null, { revalidate: false });
  }, [mutateAuthContext]);

  const refreshSession = useCallback(async (): Promise<SessionUser | null> => {
    const refreshed = await mutateAuthContext();
    return refreshed && !isAccessBlocked(refreshed) ? refreshed.session : null;
  }, [mutateAuthContext]);

  // firebaseUser queda como alias compatible para consumidores que solo
  // necesitan uid/email; ahora es una identidad del servidor, no del SDK.
  return {
    firebaseUser: sessionUser ?? null,
    sessionUser: sessionUser ?? null,
    serverSession: !!sessionUser,
    accessBlocked,
    accessBlockedMessage: blockedContext?.message ?? null,
    user,
    loading: isLoading || !!authError,
    emailVerified: sessionUser?.emailVerified ?? false,
    sessionEmailVerified: sessionUser?.sessionEmailVerified ?? false,
    refreshProfile: () => mutateAuthContext(),
    refreshSession,
    logout,
  };
}
