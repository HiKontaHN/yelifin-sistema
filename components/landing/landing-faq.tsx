import Link from "next/link";
import { Mail, MessageCircle, Plus } from "lucide-react";

const questions = [
  {
    q: "Necesito saber de contabilidad para usar Konta?",
    a: "No. La experiencia esta pensada para registrar operaciones del dia a dia con lenguaje sencillo.",
  },
  {
    q: "Puedo usarlo desde mi telefono?",
    a: "Si. La landing y la aplicacion estan pensadas para funcionar desde telefono, tablet o computadora.",
  },
  {
    q: "Que pasa si estoy empezando?",
    a: "Puedes iniciar con el plan gratuito y subir cuando tu negocio necesite mas capacidad.",
  },
];

export function LandingFaq() {
  return (
    <section id="preguntas" className="bg-white px-5 py-16 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="text-3xl font-normal text-black sm:text-4xl">Preguntas frecuentes</h2>
          <p className="mt-4 text-slate-600">
            Respuestas rapidas para que puedas decidir sin vueltas.
          </p>
          <div id="contacto" className="mt-8 grid gap-3 text-sm">
            <Link href="mailto:hikonta.app@gmail.com" className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50">
              <Mail className="size-5 text-[#0068ff]" />
              hikonta.app@gmail.com
            </Link>
            <Link href="/register" className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50">
              <MessageCircle className="size-5 text-[#0068ff]" />
              Contactanos para empezar
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          {questions.map((item) => (
            <article key={item.q} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-bold text-slate-900">{item.q}</h3>
                <Plus className="mt-1 size-5 shrink-0 text-[#0068ff]" />
              </div>
              <p className="mt-3 leading-7 text-slate-600">{item.a}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
