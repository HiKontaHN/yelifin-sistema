"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, LayoutDashboard, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HiKontaIcon } from "@/components/shared/hikonta-icon";
import { HiKontaTitle } from "@/components/shared/hikonta-title";
import { useAuth } from "@/hooks/use-auth";

const links = [
  { href: "#como-funciona", label: "¿Cómo funciona?" },
  { href: "#precios", label: "Precios" },
  { href: "#preguntas", label: "Preguntas Frecuentes" },
  { href: "#contacto", label: "Contáctanos" },
];

export function LandingHeader() {
  const { firebaseUser, loading } = useAuth();
  const isLoggedIn = !!firebaseUser;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-white/95 py-3 backdrop-blur">
      <div className="relative mx-auto flex max-w-7xl items-center justify-center px-4">
        <nav className="flex h-12 w-full max-w-6xl items-center justify-between rounded-xl bg-[#2A2A2FCC] px-3 shadow-[0_16px_45px_rgba(15,23,42,0.18)] sm:h-14 sm:px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <HiKontaIcon className="size-8 rounded-lg shadow-lg shadow-blue-500/30 sm:size-9" />
            <HiKontaTitle className="h-5 invert sm:h-6" />
          </Link>

          <div className="hidden items-center gap-7 text-sm font-medium text-white/90 lg:flex">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="transition hover:text-white">
                {link.label}
              </Link>
            ))}
          </div>

          {loading ? (
            <div className="h-9 w-28 animate-pulse rounded-lg bg-white/15" />
          ) : isLoggedIn ? (
            <Link href="/dashboard">
              <Button className="h-9 gap-2 rounded-lg bg-[#8cff00] px-4 text-base font-bold text-black hover:bg-[#7ce600]">
                <LayoutDashboard className="size-4" />
                <span className="hidden sm:inline">Ir al panel</span>
                <span className="sm:hidden">Panel</span>
              </Button>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="hidden text-sm font-medium text-white/90 transition hover:text-white md:inline">
                Iniciar Sesión
              </Link>
              <Link href="/register">
                <Button className="h-9 gap-2 rounded-lg bg-[#8cff00] px-3 text-base font-bold text-black hover:bg-[#7ce600] sm:px-4">
                  <span className="hidden sm:inline">Empieza Gratis</span>
                  <span className="sm:hidden">Gratis</span>
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Button
                aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
                variant="ghost"
                size="icon"
                className="size-9 text-white hover:bg-white/10 hover:text-white lg:hidden"
                onClick={() => setMenuOpen((value) => !value)}
              >
                {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
            </div>
          )}
        </nav>

        {menuOpen && (
          <div className="absolute left-4 right-4 top-16 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.18)] lg:hidden">
            <div className="grid gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 md:hidden"
                onClick={() => setMenuOpen(false)}
              >
                Iniciar Sesión
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
