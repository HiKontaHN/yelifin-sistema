"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export function useOnboardingGuard() {
  const { firebaseUser, loading, sessionEmailVerified, logout } = useAuth();
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

        const res = await fetch("/api/onboarding");

        if (!res.ok) return;

        const data = await res.json();

        if (!data?.data?.onboarding_completed) {
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
  }, [firebaseUser, loading, sessionEmailVerified, logout, router]);

  return { checking };
}
