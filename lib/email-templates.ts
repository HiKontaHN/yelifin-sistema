// lib/email-templates.ts
// Plantillas HTML para los correos que manda lib/mailer.ts. Usan tablas y
// estilos inline (no CSS externo/flexbox) a propósito: es lo único que
// Outlook de escritorio renderiza de forma confiable. El logo es texto +
// una cajita de color, no una imagen — así siempre se ve, incluso con
// "mostrar imágenes" bloqueado (el comportamiento por defecto en la
// mayoría de los clientes de correo).

const BRAND_BLUE = "#0068ff";
const TEXT_DARK = "#0f172a";
const TEXT_MUTED = "#64748b";
const BORDER = "#e2e8f0";
const BG = "#f1f5f9";

function emailShell({ previewText, bodyHtml }: { previewText: string; bodyHtml: string }): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HiKonta</title>
  </head>
  <body style="margin:0; padding:0; background-color:${BG}; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <!-- Preview text: se ve como resumen en la bandeja de entrada, oculto en el cuerpo -->
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${previewText}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG}; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:100%; background-color:#ffffff; border:1px solid ${BORDER}; border-radius:16px;">
            <tr>
              <td style="padding:36px 32px 8px 32px;">
                <!-- Logo: cajita azul "hi" + wordmark, igual que components/shared/hikonta-icon.tsx + hikonta-title.tsx -->
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:${BRAND_BLUE}; border-radius:8px; width:32px; height:32px; text-align:center; vertical-align:middle;">
                      <span style="color:#ffffff; font-weight:700; font-size:16px; line-height:32px;">hi</span>
                    </td>
                    <td style="padding-left:8px; color:${TEXT_DARK}; font-weight:700; font-size:18px;">hikonta</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 36px 32px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>

          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px; max-width:100%;">
            <tr>
              <td style="padding:20px 32px 0 32px; color:${TEXT_MUTED}; font-size:12px; line-height:1.6; text-align:center;">
                © ${new Date().getFullYear()} HiKonta. Sistema de gestión para emprendedores.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ctaButton(label: string, href: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 16px 0;">
      <tr>
        <td style="background-color:${BRAND_BLUE}; border-radius:12px;">
          <a href="${href}" target="_blank" rel="noopener"
             style="display:inline-block; padding:14px 28px; color:#ffffff; font-weight:700; font-size:15px; text-decoration:none;">
            ${label}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0; color:${TEXT_MUTED}; font-size:12px; line-height:1.6;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
      <a href="${href}" target="_blank" rel="noopener" style="color:${BRAND_BLUE}; word-break:break-all;">${href}</a>
    </p>`;
}

export function verifyEmailTemplate({ actionLink }: { actionLink: string }): { subject: string; html: string; text: string } {
  const bodyHtml = `
    <h1 style="margin:0 0 12px 0; color:${TEXT_DARK}; font-size:22px; font-weight:700;">Verifica tu correo</h1>
    <p style="margin:0; color:${TEXT_MUTED}; font-size:15px; line-height:1.6;">
      Gracias por crear tu cuenta en HiKonta. Confirma tu correo para activarla y empezar a controlar tu inventario, ventas y finanzas.
    </p>
    ${ctaButton("Verificar mi correo", actionLink)}
    <p style="margin:0; color:${TEXT_MUTED}; font-size:12px; line-height:1.6;">
      Si no creaste una cuenta en HiKonta, puedes ignorar este correo.
    </p>`;

  const text = [
    "Verifica tu correo — HiKonta",
    "",
    "Gracias por crear tu cuenta en HiKonta. Confirma tu correo para activarla y empezar a controlar tu inventario, ventas y finanzas.",
    "",
    `Verificar mi correo: ${actionLink}`,
    "",
    "Si no creaste una cuenta en HiKonta, puedes ignorar este correo.",
  ].join("\n");

  return {
    subject: "Verifica tu correo — HiKonta",
    html: emailShell({ previewText: "Confirma tu correo para activar tu cuenta de HiKonta.", bodyHtml }),
    text,
  };
}

export function resetPasswordTemplate({ actionLink }: { actionLink: string }): { subject: string; html: string; text: string } {
  const bodyHtml = `
    <h1 style="margin:0 0 12px 0; color:${TEXT_DARK}; font-size:22px; font-weight:700;">Restablece tu contraseña</h1>
    <p style="margin:0; color:${TEXT_MUTED}; font-size:15px; line-height:1.6;">
      Recibimos una solicitud para restablecer la contraseña de tu cuenta de HiKonta. Crea una nueva contraseña desde el siguiente botón.
    </p>
    ${ctaButton("Crear nueva contraseña", actionLink)}
    <p style="margin:0; color:${TEXT_MUTED}; font-size:12px; line-height:1.6;">
      Si no solicitaste esto, puedes ignorar este correo — tu contraseña actual sigue funcionando.
    </p>`;

  const text = [
    "Restablece tu contraseña — HiKonta",
    "",
    "Recibimos una solicitud para restablecer la contraseña de tu cuenta de HiKonta. Crea una nueva contraseña desde el siguiente enlace.",
    "",
    `Crear nueva contraseña: ${actionLink}`,
    "",
    "Si no solicitaste esto, puedes ignorar este correo — tu contraseña actual sigue funcionando.",
  ].join("\n");

  return {
    subject: "Restablece tu contraseña — HiKonta",
    html: emailShell({ previewText: "Crea una nueva contraseña para tu cuenta de HiKonta.", bodyHtml }),
    text,
  };
}
