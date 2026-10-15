import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HiKontaTitle } from "@/components/shared/hikonta-title";

export const metadata = {
  title: "Agente DMCA — HiKonta",
  description: "Información del agente designado para notificaciones de infracción de derechos de autor.",
};

const agent = {
  provider: process.env.DMCA_SERVICE_PROVIDER_LEGAL_NAME,
  name: process.env.DMCA_AGENT_NAME,
  address: process.env.DMCA_AGENT_ADDRESS,
  phone: process.env.DMCA_AGENT_PHONE,
  email: process.env.DMCA_AGENT_EMAIL,
};

const isConfigured = Object.values(agent).every(Boolean);

export default function DmcaPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/40 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" /> Volver al inicio
          </Link>
          <HiKontaTitle className="h-5" />
        </div>
      </header>

      <main className="container mx-auto max-w-3xl space-y-8 px-4 py-10 md:py-16">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Agente designado DMCA</h1>
          <p className="text-sm text-muted-foreground">Última actualización: 15 de octubre de 2026</p>
        </section>

        {!isConfigured && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            La designación todavía no está publicada. El operador debe completar las variables <code>DMCA_AGENT_*</code> y registrar los mismos datos ante la U.S. Copyright Office antes de anunciar protección bajo el puerto seguro de la DMCA.
          </div>
        )}

        <section className="space-y-4 text-sm leading-relaxed md:text-base">
          <p>
            Las notificaciones de supuesta infracción de derechos de autor relacionadas con contenido alojado por HiKonta deben enviarse por escrito al agente indicado abajo.
          </p>

          {isConfigured && (
            <address className="not-italic rounded-lg border bg-card p-5 leading-7">
              <strong>Proveedor de servicios:</strong> {agent.provider}<br />
              <strong>Agente designado:</strong> {agent.name}<br />
              <strong>Dirección:</strong> {agent.address}<br />
              <strong>Teléfono:</strong> {agent.phone}<br />
              <strong>Correo:</strong>{" "}
              <a className="text-primary hover:underline" href={`mailto:${agent.email}`}>{agent.email}</a>
            </address>
          )}

          <h2 className="mt-6 text-lg font-semibold">Contenido de una notificación</h2>
          <p>Para facilitar una respuesta rápida, incluye:</p>
          <ol className="list-decimal space-y-2 pl-6">
            <li>Firma física o electrónica de la persona autorizada para actuar por el titular.</li>
            <li>Identificación de la obra protegida o una lista representativa de las obras.</li>
            <li>Identificación y ubicación precisa del material presuntamente infractor.</li>
            <li>Tu nombre, dirección, teléfono y correo electrónico.</li>
            <li>Una declaración de buena fe de que el uso no está autorizado por el titular, su agente o la ley.</li>
            <li>Una declaración, bajo pena de perjurio, de que la información es exacta y estás autorizado para actuar por el titular.</li>
          </ol>
          <p>
            HiKonta podrá retirar o inhabilitar el acceso al material y notificar al usuario afectado. Las declaraciones falsas pueden generar responsabilidad legal. Esta página no sustituye asesoría jurídica.
          </p>
        </section>

        <div className="flex flex-wrap gap-4 pt-6 text-sm">
          <Link href="/terms" className="text-primary hover:underline">Términos de Uso →</Link>
          <Link href="/privacy" className="text-primary hover:underline">Política de Privacidad →</Link>
        </div>
      </main>
    </div>
  );
}
