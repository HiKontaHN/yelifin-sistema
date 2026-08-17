import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="relative mx-auto min-h-135 max-w-7xl px-5 pb-14 pt-28 sm:px-8 lg:min-h-[640px] lg:pb-20 lg:pt-24">
        <div className="relative z-20 max-w-2xl pt-6 lg:w-[58%] lg:pt-28">
          <h2 className="max-w-3xl text-4xl font-normal leading-[1.06] tracking-normal text-black min-[390px]:text-5xl sm:text-6xl lg:text-7xl">
            Hacemos que administrar tu negocio sea{" "}
            <span className="inline-block rounded-md bg-[#0068ff] px-2 pb-1 text-white mt-2">
              más facil
            </span>
          </h2>

          <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            Menos tiempo organizando y mas tiempo vendiendo con la herramienta definitiva para{" "}
            <strong className="font-semibold text-slate-800">emprendedores que venden por redes sociales.</strong>
          </p>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            Toma el control, reduce errores y accede a la informacion que necesitas para tomar mejores decisiones cada dia.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="w-full sm:w-auto">
              <Button className="h-12 w-full rounded-xl bg-[#8cff00] px-7 font-bold text-black shadow-none hover:bg-[#7ce600] sm:w-auto">
                Afiliate gratis
              </Button>
            </Link>
            <Link href="#como-funciona" className="w-full sm:w-auto">
              <Button variant="outline" className="h-12 w-full rounded-xl border-[#0068ff] px-7 font-semibold text-[#0068ff] hover:bg-blue-50 hover:text-[#0057d6] sm:w-auto">
                Ver como funciona
              </Button>
            </Link>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="size-4 text-sky-500" />
            Prueba el plan Premium por 30 dias. Plan gratuito disponible. 
          </div>
        </div>

        <div className="relative z-10 mt-8 min-h-90 lg:absolute lg:bottom-0 lg:right-[-4%] lg:top-16 lg:mt-0 lg:h-[82%] lg:w-[62%]">
          <div className="absolute left-0 top-16 h-60 w-60 rounded-full bg-sky-100 blur-3xl lg:left-8" />
          <Image
            src="/landing/hero%20hikonta.png"
            alt="Dashboard de HiKonta en telefono y computadora"
            fill
            priority
            sizes="(min-width: 1024px) 62vw, 100vw"
            className="object-contain object-center drop-shadow-2xl lg:object-right-bottom"
          />
        </div>
      </div>
    </section>
  );
}
