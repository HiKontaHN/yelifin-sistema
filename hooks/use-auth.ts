'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { UserProfileResponse } from '@/types';
import { authReady } from '@/lib/firebase';

const SESSION_KEY = '/api/auth/session';
const PROFILE_KEY = '/api/auth/me';

type SessionUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  sessionEmailVerified: boolean;
};

async function fetchSession(url: string): Promise<SessionUser | null> {
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('No se pudo validar la sesión');
  return response.json();
}

export function useAuth() {
  // Borra persistencia SDK heredada, pero nunca deriva el estado de sesión de ella.
  void authReady.catch(() => undefined);

  const {
    data: sessionUser,
    error: sessionError,
    isLoading: sessionLoading,
    mutate: mutateSession,
  } = useSWR<SessionUser | null>(SESSION_KEY, fetchSession);

  const {
    data: user,
    isLoading: profileLoading,
    mutate: mutateProfile,
  } = useSWR<UserProfileResponse>(
    sessionUser ? PROFILE_KEY : null,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Error al obtener perfil');
      return response.json();
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      revalidateOnReconnect: false,
    },
  );

  const logout = useCallback(async () => {
    const response = await fetch(SESSION_KEY, { method: 'DELETE' });
    if (!response.ok) throw new Error('No se pudo cerrar la sesión');
    await mutateSession(null, { revalidate: false });
    await mutateProfile(undefined, { revalidate: false });
  }, [mutateSession, mutateProfile]);

  const refreshSession = useCallback(() => mutateSession(), [mutateSession]);

  // firebaseUser queda como alias compatible para consumidores que solo
  // necesitan uid/email; ahora es una identidad del servidor, no del SDK.
  return {
    firebaseUser: sessionUser ?? null,
    sessionUser: sessionUser ?? null,
    serverSession: !!sessionUser,
    user,
    loading: sessionLoading || !!sessionError || (!!sessionUser && profileLoading),
    emailVerified: sessionUser?.emailVerified ?? false,
    sessionEmailVerified: sessionUser?.sessionEmailVerified ?? false,
    refreshProfile: () => mutateProfile(),
    refreshSession,
    logout,
  };
}
