import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const benefits = [
  "Inventario, ventas y finanzas conectados",
  "Clientes, eventos, reportes y suministros",
  "Prueba Premium por 30 dias",
  "Plan gratuito disponible",
  "Acceso desde telefono o computadora",
];

export function LandingPricing() {
  return (
    <section id="precios" className="bg-slate-50 px-5 py-16 sm:px-8">
      <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 className="text-3xl font-normal leading-tight text-black sm:text-5xl">
            Empieza simple. Crece cuando lo necesites.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            HiKonta esta pensado para emprendedores que quieren ordenar su negocio sin complicarse con herramientas enormes.
          </p>
        </div>

        <div className="rounded-xl border border-blue-100 bg-white p-6 shadow-[0_20px_60px_rgba(37,99,235,0.14)] sm:p-8">
          <div className="flex flex-col gap-4 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between">
            <div>
              <div className="text-sm font-bold uppercase tracking-wide text-[#0068ff]">Plan Premium</div>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-5xl font-bold text-black">$11.99</span>
                <span className="pb-2 text-slate-500">USD / mes</span>
              </div>
            </div>
            <span className="rounded-full bg-[#8cff00] px-3 py-1 text-normal font-bold text-black">30 dias gratis</span>
          </div>

          <div className="mt-7 grid gap-3">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3 text-sm text-slate-700">
                <CheckCircle2 className="size-5 text-[#0068ff]" />
                {benefit}
              </div>
            ))}
          </div>

          <Link href="/register" className="mt-8 block">
            <Button className="h-12 w-full rounded-xl bg-[#8cff00] font-bold text-black hover:bg-[#7ce600]">
              Empieza gratis
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <p className="mt-3 text-center text-xs text-slate-500">Sin tarjeta de credito para comenzar.</p>
        </div>
      </div>
    </section>
  );
}
