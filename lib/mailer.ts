// lib/mailer.ts
// Envío de correos transaccionales (verificación de cuenta, restablecer
// contraseña) vía SMTP de Gmail con Nodemailer. El código/enlace en sí lo
// sigue generando y validando Firebase (ver lib/firebase-admin.ts +
// app/(auth)/auth/action/page.tsx) — esto solo controla el diseño y el
// envío del correo, que antes hacía Firebase con su propia plantilla.
import nodemailer, { type Transporter } from "nodemailer";
import { neon } from "@neondatabase/serverless";
import { buildUnsubscribeUrl } from "@/lib/marketing-unsubscribe";

let transporter: Transporter | null = null;
const LOCAL_MAIL_RECIPIENT = "harol.kock34@gmail.com";

function getDeliveryRecipient(to: string): string {
  return process.env.NODE_ENV === "development" ? LOCAL_MAIL_RECIPIENT : to;
}

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
    to: getDeliveryRecipient(to),
    subject,
    html,
    text,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

/**
 * The only supported path for promotional email. It suppresses opted-out
 * recipients and always adds the unsubscribe mechanism and postal address.
 * Transactional account/security email must keep using sendMail above.
 */
export async function sendMarketingMail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<"sent" | "suppressed"> {
  const postalAddress = process.env.MARKETING_POSTAL_ADDRESS?.trim();
  if (!postalAddress) {
    throw new Error("MARKETING_POSTAL_ADDRESS no está configurada");
  }

  const sql = neon(process.env.DATABASE_URL!);
  const [preference] = await sql`
    SELECT opted_out_at
    FROM marketing_email_preferences
    WHERE email = ${to.trim().toLowerCase()}
    LIMIT 1
  `;
  if (preference?.opted_out_at) return "suppressed";

  const unsubscribeUrl = buildUnsubscribeUrl(to);
  const oneClickUrl = unsubscribeUrl.replace("/unsubscribe?", "/api/marketing/unsubscribe?");
  const safeAddress = escapeHtml(postalAddress);
  const footerHtml = `
    <hr style="margin:32px 0 20px;border:0;border-top:1px solid #e2e8f0" />
    <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;text-align:center">
      Este es un correo promocional de HiKonta.<br />
      ${safeAddress}<br />
      <a href="${unsubscribeUrl}" style="color:#0068ff">Cancelar suscripción a correos de marketing</a>
    </p>`;
  const footerText = [
    "",
    "---",
    "Correo promocional de HiKonta.",
    postalAddress,
    `Cancelar suscripción: ${unsubscribeUrl}`,
  ].join("\n");

  const user = process.env.MAIL_USER;
  await getTransporter().sendMail({
    from: `"HiKonta" <${user}>`,
    to: getDeliveryRecipient(to),
    subject,
    html: `${html}${footerHtml}`,
    text: `${text ?? ""}${footerText}`,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  return "sent";
}
