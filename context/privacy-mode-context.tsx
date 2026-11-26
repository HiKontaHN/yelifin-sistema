"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "_privacy_mode";

type PrivacyCtx = {
  isAvailable: boolean;
  isPrivate: boolean;
  toggle:    () => void;
  mask:      (value: string | number) => string;
};

const PrivacyContext = createContext<PrivacyCtx>({
  isAvailable: false,
  isPrivate: false,
  toggle:    () => {},
  mask:      (v) => String(v),
});

export function PrivacyModeProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const [storedPrivacy, setStoredPrivacy] = useState(false);
  const isPrivate = enabled && storedPrivacy;

  useEffect(() => {
    setStoredPrivacy(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const toggle = useCallback(() => {
    if (!enabled) return;
    setStoredPrivacy(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }, [enabled]);

  const mask = useCallback(
    (value: string | number) => (isPrivate ? "•••••" : String(value)),
    [isPrivate],
  );

  return (
    <PrivacyContext.Provider value={{ isAvailable: enabled, isPrivate, toggle, mask }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export const usePrivacyMode = () => useContext(PrivacyContext);
