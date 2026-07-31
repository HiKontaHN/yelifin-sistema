import Link from "next/link";
import { HiKontaIcon } from "@/components/shared/hikonta-icon";

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-zinc-900 px-5 py-10 text-white sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="flex items-center gap-2">
          <HiKontaIcon className="size-9 rounded-lg" />
          <div
            role="img"
            aria-label="HiKonta"
            className="h-6 w-24 shrink-0 bg-[url('/title-black.svg')] bg-contain bg-left bg-no-repeat invert"
          />
        </Link>
        <p className="text-sm text-white/60">© 2026 HiKonta. Sistema de gestión para emprendedores.</p>
        <div className="flex flex-wrap gap-5 text-sm text-white/70">
          <Link href="/login" className="hover:text-white">Iniciar Sesion</Link>
          <Link href="/register" className="hover:text-white">Registrarse</Link>
          <Link href="/terms" className="hover:text-white">Terminos</Link>
          <Link href="/privacy" className="hover:text-white">Privacidad</Link>
        </div>
      </div>
    </footer>
  );
}
