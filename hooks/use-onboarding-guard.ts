"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export function useOnboardingGuard() {
  const { firebaseUser, user, loading, sessionEmailVerified, logout } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      setChecking(false);
      return;
    }

    const check = async () => {
      try {
        if (!firebaseUser.emailVerified) {
          router.replace("/verify-email");
          return;
        }
        if (!sessionEmailVerified) {
          await logout();
          router.replace("/login");
          return;
        }

        // /api/auth/me ya incluye este dato. Reutilizarlo evita otra
        // autenticación y otra consulta a Postgres en cada navegación.
        if (user && !user.profile?.onboarding_completed) {
          router.replace("/onboarding");
          return;
        }
      } catch {
        // fail-open
      } finally {
        setChecking(false);
      }
    };

    check();
  }, [firebaseUser, user, loading, sessionEmailVerified, logout, router]);

  return { checking };
}
