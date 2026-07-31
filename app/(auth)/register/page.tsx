"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Sparkles, WalletCards } from "lucide-react";
import { RegisterForm } from "@/components/auth/register-form";
import { HiKontaIcon } from "@/components/shared/hikonta-icon";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/hooks/ui/loading-screen";
import { useRedirectIfAuthenticated } from "@/hooks/use-redirect-if-authenticated";

export default function RegisterPage() {
  const { loading } = useRedirectIfAuthenticated();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <main className="min-h-screen bg-white text-slate-950" style={{ colorScheme: "light" }}>
      <Link href="/" className="fixed left-4 top-4 z-50 md:left-6 md:top-6">
        <Button variant="ghost" size="icon" className="rounded-full bg-white/80 text-slate-900 shadow-sm backdrop-blur hover:bg-white">
          <ArrowLeft className="size-5" />
        </Button>
      </Link>

      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex items-center justify-center px-5 py-24 sm:px-8 lg:py-12">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-9 flex items-center gap-2">
              <HiKontaIcon className="size-10 rounded-lg shadow-lg shadow-blue-500/30" />
              <div
                role="img"
                aria-label="HiKonta"
                className="h-6 w-24 shrink-0 bg-[url('/title-black.svg')] bg-contain bg-left bg-no-repeat"
              />
            </Link>

            <div className="mb-8 space-y-3">
              <span className="inline-flex rounded-full bg-[#8cff00] px-3 py-1 text-xs font-bold text-black">
                30 días gratis
              </span>
              <h1 className="text-4xl font-normal leading-tight text-black">Crea tu cuenta</h1>
              <p className="text-base leading-7 text-slate-600">
                Empieza a ordenar tu emprendimiento con inventario, clientes, ventas y reportes en un solo lugar.
              </p>
            </div>

            <RegisterForm />

            <p className="mt-8 text-center text-sm text-slate-600">
              ¿Ya tienes una cuenta?{" "}
              <Link href="/login" className="font-bold text-[#0068ff] hover:underline">
                Inicia sesión
              </Link>
            </p>
          </div>
        </section>

        <AuthRegisterPanel />
      </div>
    </main>
  );
}

function AuthRegisterPanel() {
  return (
    <section className="relative hidden overflow-hidden lg:block">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_35%_45%_at_12%_72%,rgba(114,231,234,0.35)_0%,transparent_72%),radial-gradient(circle_at_86%_24%,rgba(95,177,255,0.34)_0%,transparent_30%),linear-gradient(153deg,#b7fbf2_0%,#99baff_28%,#c7d2ff_46%,#f7f8ff_72%,#ffffff_100%)]" />
      <div className="relative flex h-full min-h-screen flex-col justify-center px-12 py-16">
        <div className="max-w-xl">
          <h2 className="text-5xl font-normal leading-tight text-black">
            Bienvenido a <span className="rounded-md bg-[#0068ff] px-2 pb-1 text-white">HiKonta</span>
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-8 text-slate-700">
            La herramienta para emprendedores que venden por redes sociales y quieren menos desorden, menos errores y mejores decisiones.
          </p>

          <div className="mt-8 grid max-w-lg grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/70 bg-white/70 p-4 shadow-[0_14px_35px_rgba(37,99,235,0.12)] backdrop-blur">
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[#0068ff] text-white">
                <Sparkles className="size-5" />
              </div>
              <div className="text-3xl font-bold text-slate-900">30 días</div>
              <div className="mt-1 text-sm text-slate-600">de prueba Premium</div>
            </div>
            <div className="rounded-xl border border-white/70 bg-white/70 p-4 shadow-[0_14px_35px_rgba(37,99,235,0.12)] backdrop-blur">
              <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[#0068ff] text-white">
                <WalletCards className="size-5" />
              </div>
              <div className="text-3xl font-bold text-slate-900">$11.99</div>
              <div className="mt-1 text-sm text-slate-600">USD/mes plan Pro</div>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2 text-sm text-slate-600">
            <CheckCircle2 className="size-5 text-[#0068ff]" />
            Sin tarjeta de crédito para comenzar. Cancela cuando quieras.
          </div>
        </div>

        <div className="absolute bottom-[-6%] right-[-12%] h-[55%] w-[78%]">
          <Image
            src="/landing/hero%20hikonta.png"
            alt="Dashboard de HiKonta"
            fill
            sizes="55vw"
            className="object-contain object-right-bottom opacity-95 drop-shadow-2xl"
          />
        </div>
      </div>
    </section>
  );
}
