// app/(legal)/privacy/page.tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HiKontaTitle } from "@/components/shared/hikonta-title";

export const metadata = {
  title: "Política de Privacidad — HiKonta",
  description: "Política de privacidad y tratamiento de datos personales de HiKonta.",
};

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-semibold tracking-tight">Política de Privacidad</h1>
          <p className="text-sm text-muted-foreground">
            Última actualización: 17 de mayo de 2026
          </p>
        </section>

        <section className="space-y-4 text-sm leading-relaxed md:text-base">

          <p>
            Esta Política de Privacidad explica cómo HiKonta recopila, utiliza, almacena y protege la información asociada a tu cuenta y al uso de la plataforma HiKonta.
          </p>

          <h2 className="text-lg font-semibold mt-6">1. Quiénes Somos</h2>
          <p>
            HiKonta opera la plataforma HiKonta, un sistema de gestión empresarial en la nube para emprendedores y pequeños negocios, disponible en hihikonta.com.
          </p>

          <h2 className="text-lg font-semibold mt-6">2. Información que Recopilamos</h2>
          <p><strong>Información que nos proporcionas:</strong> nombre, correo electrónico, nombre de tu negocio y cualquier dato que ingreses voluntariamente al sistema (productos, ventas, clientes, transacciones, etc.).</p>
          <p className="mt-2"><strong>Información de uso:</strong> fecha y hora de acceso, dirección IP, tipo de dispositivo y navegador, y acciones realizadas dentro del Servicio, con fines de seguridad y mejora del sistema.</p>
          <p className="mt-2"><strong>Autenticación:</strong> gestionada mediante Firebase Authentication de Google. No almacenamos contraseñas directamente.</p>

          <h2 className="text-lg font-semibold mt-6">3. Uso de la Información</h2>
          <p>
            Usamos tu información para: (a) prestar y mantener el Servicio; (b) gestionar tu cuenta y suscripción; (c) enviarte comunicaciones relacionadas con el Servicio; (d) mejorar funcionalidades usando datos agregados y anonimizados; (e) cumplir con obligaciones legales y fiscales aplicables en Honduras.
          </p>
          <p className="mt-2">
            <strong>No vendemos ni cedemos tu información personal a terceros con fines comerciales o publicitarios.</strong>
          </p>

          <h2 className="text-lg font-semibold mt-6">4. Proveedores de Servicios</h2>
          <p>Para operar el Servicio utilizamos:</p>
          <ul className="list-disc list-inside space-y-1 mt-2">
            <li><strong>Firebase (Google LLC):</strong> autenticación de usuarios.</li>
            <li><strong>Neon:</strong> almacenamiento de base de datos (PostgreSQL).</li>
            <li><strong>Vercel:</strong> alojamiento y despliegue de la plataforma.</li>
          </ul>
          <p className="mt-2">
            Estos proveedores solo acceden a los datos necesarios para prestar sus servicios y están obligados a mantener la confidencialidad de tu información.
          </p>

          <h2 className="text-lg font-semibold mt-6">5. Almacenamiento y Seguridad</h2>
          <p>
            Tus datos se almacenan en servidores con infraestructura que cumple estándares internacionales de seguridad. Implementamos medidas técnicas razonables para proteger tu información contra acceso no autorizado, alteración o destrucción.
          </p>
          <p className="mt-2">
            Sin embargo, ningún sistema es 100% seguro. Te recomendamos mantener tus propias copias de seguridad de la información crítica de tu negocio.
          </p>

          <h2 className="text-lg font-semibold mt-6">6. Retención de Datos</h2>
          <p>
            Conservamos tu información mientras tu cuenta esté activa. Tras la cancelación, podemos retener ciertos datos hasta 90 días por razones de seguridad y cumplimiento legal, tras lo cual serán eliminados o anonimizados permanentemente.
          </p>

          <h2 className="text-lg font-semibold mt-6">7. Tus Derechos</h2>
          <p>
            Tienes derecho a: (a) acceder a tu información personal; (b) solicitar la corrección de datos inexactos; (c) solicitar la eliminación de tu cuenta y datos asociados; (d) oponerte al tratamiento en casos previstos por la ley. Para ejercer estos derechos, contáctanos a través del soporte disponible en la plataforma.
          </p>

          <h2 className="text-lg font-semibold mt-6">8. Cookies</h2>
          <p>
            Usamos únicamente cookies de sesión estrictamente necesarias para el funcionamiento de la autenticación. No utilizamos cookies de seguimiento publicitario ni compartimos datos de navegación con redes publicitarias.
          </p>

          <h2 className="text-lg font-semibold mt-6">9. Menores de Edad</h2>
          <p>
            El Servicio no está dirigido a personas menores de 18 años. No recopilamos intencionalmente información de menores. Si detectamos que un menor ha creado una cuenta, la eliminaremos de inmediato.
          </p>

          <h2 className="text-lg font-semibold mt-6">10. Cambios a Esta Política</h2>
          <p>
            Podemos actualizar esta Política periódicamente. Te notificaremos cambios significativos con al menos 15 días de anticipación mediante correo electrónico o aviso dentro del Servicio. El uso continuado después de los cambios constituye aceptación de la nueva Política.
          </p>

          <h2 className="text-lg font-semibold mt-6">11. Ley Aplicable</h2>
          <p>
            Esta Política se rige por las leyes de la República de Honduras, incluyendo las disposiciones aplicables en materia de protección de datos personales.
          </p>

          <h2 className="text-lg font-semibold mt-6">12. Contacto</h2>
          <p>
            Para preguntas o solicitudes relacionadas con esta Política, contáctanos a través de los canales de soporte habilitados dentro del Servicio.
          </p>
        </section>

        <div className="pt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/terms" className="text-primary hover:underline">
            Términos de Uso →
          </Link>
          <Link href="/register" className="text-primary hover:underline">
            Crear cuenta y comenzar la prueba →
          </Link>
        </div>
      </main>
    </div>
  );
}
