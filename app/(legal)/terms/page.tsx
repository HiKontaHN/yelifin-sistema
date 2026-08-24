// app/(legal)/terms/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HiKontaTitle } from "@/components/shared/hikonta-title";

export const metadata = {
  title: "Términos de Uso — HiKonta",
  description: "Términos y condiciones de uso del servicio HiKonta.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/40 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            Volver al inicio
          </Link>
          <HiKontaTitle className="h-5" />
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-10 md:py-16 space-y-8">
        <section className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Términos de Uso</h1>
          <p className="text-sm text-muted-foreground">
            Última actualización: 17 de mayo de 2026
          </p>
        </section>

        <section className="space-y-4 text-sm leading-relaxed md:text-base">

          <p>
            Al crear una cuenta en HiKonta y utilizar la plataforma, aceptas estos Términos de Uso en su totalidad. Si no estás de acuerdo con alguna parte, no debes usar el sistema.
          </p>

          <h2 className="text-lg font-semibold mt-6">1. Aceptación de los Términos</h2>
          <p>
            El uso del Servicio constituye la aceptación plena y sin reservas de estos Términos. HiKonta se reserva el derecho de modificarlos en cualquier momento. Los cambios serán notificados con al menos 15 días de anticipación mediante correo electrónico o aviso dentro de la plataforma. El uso continuado después de los cambios implica su aceptación.
          </p>

          <h2 className="text-lg font-semibold mt-6">2. Descripción del Servicio</h2>
          <p>
            HiKonta es una plataforma de gestión empresarial en la nube que incluye módulos de inventario, punto de venta, finanzas, clientes, eventos y reportes. El Servicio se proporciona "tal como está" y puede ser modificado, suspendido o discontinuado en cualquier momento, con o sin previo aviso, a discreción exclusiva de HiKonta.
          </p>

          <h2 className="text-lg font-semibold mt-6">3. Cuenta y Seguridad</h2>
          <p>
            Eres responsable de mantener la confidencialidad de tus credenciales y de todas las actividades realizadas bajo tu cuenta. Debes notificarnos de inmediato ante cualquier acceso no autorizado. HiKonta no se hace responsable por pérdidas derivadas del uso indebido de tu cuenta. Nos reservamos el derecho de suspender o eliminar cuentas que violen estos Términos, sin previo aviso y sin derecho a reembolso.
          </p>

          <h2 className="text-lg font-semibold mt-6">4. Suscripción y Pagos</h2>
          <p>
            El Plan Profesional tiene un costo de <strong>$12.99 USD al mes, ISV incluido</strong>. El periodo de prueba gratuita es de 30 días sin necesidad de tarjeta de crédito. Al suscribirte, autorizas el cobro recurrente mensual. Los precios pueden cambiar con un aviso previo de al menos 30 días.
          </p>
          <p className="mt-2">
            <strong>No se realizan reembolsos</strong> por períodos parciales de servicio, meses no utilizados ni por cancelaciones anticipadas, salvo que la ley aplicable en Honduras lo exija expresamente. El acceso continuará hasta el final del período de facturación vigente.
          </p>

          <h2 className="text-lg font-semibold mt-6">5. Usos Prohibidos</h2>
          <p>
            Te comprometes a no usar el Servicio para: (a) actividades ilegales o fraudulentas; (b) cargar contenido malicioso o dañino; (c) intentar acceder sin autorización a sistemas o datos de terceros; (d) revender o redistribuir el Servicio sin autorización escrita de HiKonta; (e) realizar ingeniería inversa o descompilar cualquier parte del sistema.
          </p>

          <h2 className="text-lg font-semibold mt-6">6. Propiedad Intelectual</h2>
          <p>
            El Servicio, incluyendo código fuente, diseño, logotipos y funcionalidades, es propiedad exclusiva de HiKonta y está protegido por las leyes de propiedad intelectual de Honduras y tratados internacionales. Se te otorga una licencia limitada, no exclusiva, intransferible y revocable para usarlo exclusivamente en tus operaciones comerciales internas.
          </p>

          <h2 className="text-lg font-semibold mt-6">7. Tus Datos</h2>
          <p>
            Conservas la propiedad de todos los datos que ingreses al sistema. Es tu responsabilidad mantener copias de seguridad de tu información crítica. HiKonta no garantiza la recuperación de datos ante pérdidas ajenas a un fallo directo del Servicio.
          </p>

          <h2 className="text-lg font-semibold mt-6">8. Exclusión de Garantías</h2>
          <p>
            El Servicio se proporciona "tal como está" y "según disponibilidad", sin garantías de ningún tipo, ya sean expresas o implícitas, incluyendo garantías de comerciabilidad, idoneidad para un propósito particular o disponibilidad ininterrumpida. HiKonta no garantiza que el Servicio sea ininterrumpido, libre de errores o completamente seguro.
          </p>

          <h2 className="text-lg font-semibold mt-6">9. Limitación de Responsabilidad</h2>
          <p>
            En la máxima medida permitida por la ley, HiKonta no será responsable por daños indirectos, incidentales, especiales, consecuentes o punitivos, incluyendo pérdida de ganancias, pérdida de datos, interrupción del negocio o cualquier otro daño comercial, independientemente de la causa.
          </p>
          <p className="mt-2">
            La responsabilidad total de HiKonta por cualquier reclamación no excederá el monto pagado por ti durante los tres (3) meses anteriores a dicha reclamación.
          </p>

          <h2 className="text-lg font-semibold mt-6">10. Ley Aplicable y Jurisdicción</h2>
          <p>
            Estos Términos se rigen por las leyes de la República de Honduras. Cualquier disputa se someterá a la jurisdicción exclusiva de los tribunales competentes de Tegucigalpa, Honduras, renunciando a cualquier otro fuero que pudiera corresponder.
          </p>

          <h2 className="text-lg font-semibold mt-6">11. Contacto</h2>
          <p>
            Para preguntas sobre estos Términos, contáctanos a través de los canales de soporte habilitados dentro del Servicio.
          </p>
        </section>

        <div className="pt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="text-primary hover:underline">
            Política de Privacidad →
          </Link>
          <Link href="/register" className="text-primary hover:underline">
            Crear cuenta y comenzar la prueba →
          </Link>
        </div>
      </main>
    </div>
  );
}
