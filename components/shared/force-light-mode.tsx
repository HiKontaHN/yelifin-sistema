"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useTheme } from "next-themes";

/**
 * Landing, login and register are public/marketing surfaces and must
 * always render in light mode, regardless of the visitor's system
 * preference or a signed-in user's saved dashboard theme.
 *
 * next-themes drives dark mode by toggling a single `.dark` class on
 * `<html>`, shared across the whole app, and it no-ops a nested
 * `<ThemeProvider forcedTheme="light">` when a provider already exists
 * above it — so per-route forcing has to happen by hand here.
 *
 * Two things run together on purpose:
 * 1. A `useLayoutEffect` that strips the class straight from the DOM,
 *    so there's no visible flash while step 2 propagates.
 * 2. `setTheme("light")`, which updates next-themes' own React state.
 *    This is required, not optional: on a hard navigation here (e.g. the
 *    redirect after logout), the root `ThemeProvider` mounts fresh and
 *    its own effect reapplies the class from its *stale* "dark" state
 *    right after our DOM patch runs — leaving everything permanently
 *    gray if we only touch the DOM. Updating the real state makes that
 *    effect converge on light instead of fighting us.
 *
 * The original theme is restored (via setTheme, not a raw class flip)
 * when this unmounts, so navigating back into the dashboard resumes the
 * user's real preference instead of being stuck on light.
 */
export function ForceLightMode() {
  const { theme, setTheme } = useTheme();
  const originalTheme = useRef<string | undefined>(undefined);
  const captured = useRef(false);

  if (!captured.current && theme !== undefined) {
    originalTheme.current = theme;
    captured.current = true;
  }

  useLayoutEffect(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  });

  useEffect(() => {
    if (theme !== "light") {
      setTheme("light");
    }
  }, [theme, setTheme]);

  useEffect(() => {
    return () => {
      const original = originalTheme.current;
      if (original && original !== "light") {
        setTheme(original);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
