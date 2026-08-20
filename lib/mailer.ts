// lib/mailer.ts
// Envío de correos transaccionales (verificación de cuenta, restablecer
// contraseña) vía SMTP de Gmail con Nodemailer. El código/enlace en sí lo
// sigue generando y validando Firebase (ver lib/firebase-admin.ts +
// app/(auth)/auth/action/page.tsx) — esto solo controla el diseño y el
// envío del correo, que antes hacía Firebase con su propia plantilla.
import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "MAIL_USER / MAIL_PASSWORD no configurados — revisa .env.local (contraseña de aplicación de Gmail)."
    );
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  return transporter;
}

export async function sendMail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  // Alternativa en texto plano (multipart/alternative) — mejora la señal
  // de spam: un correo HTML sin versión de texto es algo que muchos
  // filtros penalizan.
  text?: string;
}): Promise<void> {
  const user = process.env.MAIL_USER;
  await getTransporter().sendMail({
    from: `"HiKonta" <${user}>`,
    to,
    subject,
    html,
    text,
  });
}
