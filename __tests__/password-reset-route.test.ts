jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: { getUserByEmail: jest.fn(), generatePasswordResetLink: jest.fn() },
}));

const mockSql = jest.fn();
jest.mock("@neondatabase/serverless", () => ({ neon: () => mockSql }));

jest.mock("@/lib/auth", () => ({
  createErrorResponse: (error: string, status: number) => Response.json({ error }, { status }),
}));

jest.mock("@/lib/mailer", () => ({ sendMail: jest.fn() }));

jest.mock("@/lib/rate-limit", () => ({
  getClientIP: () => "127.0.0.1",
  sharedRateLimit: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { POST as sendPasswordReset } from "@/app/api/auth/send-password-reset/route";
import { adminAuth } from "@/lib/firebase-admin";
import { sendMail } from "@/lib/mailer";
import { sharedRateLimit } from "@/lib/rate-limit";

const appOrigin = "https://cuenta.hikonta.example";
const oobCode = "firebase-code+/=";
const email = "usuario@example.com";
const validPassword = "Clave!741";

function request(path: string, body: object, origin = appOrigin) {
  return new NextRequest(`${appOrigin}/api/auth/${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.replaceProperty(process, "env", {
    ...process.env,
    NEXT_PUBLIC_APP_URL: appOrigin,
    NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-test-key",
  });
  jest.mocked(sharedRateLimit).mockResolvedValue({ allowed: true, remaining: 4, retryAfterSec: 0 });
  jest.mocked(adminAuth.getUserByEmail).mockResolvedValue({
    uid: "firebase-user",
    disabled: false,
  } as Awaited<ReturnType<typeof adminAuth.getUserByEmail>>);
  mockSql.mockResolvedValue([{ is_active: true }]);
});

afterEach(() => jest.restoreAllMocks());

it("envía el enlace de HiKonta al correo de la cuenta con el código en el fragmento", async () => {
  jest.mocked(adminAuth.generatePasswordResetLink).mockResolvedValue(
    `https://example.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}&apiKey=test`,
  );

  const response = await sendPasswordReset(request("send-password-reset", { email: `  ${email.toUpperCase()}  ` }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: { message: "Te enviamos un correo con el enlace de recuperación." } });
  expect(adminAuth.getUserByEmail).toHaveBeenCalledWith(email);
  expect(mockSql).toHaveBeenCalledWith(expect.any(Array), "firebase-user");
  expect(adminAuth.generatePasswordResetLink).toHaveBeenCalledWith(email);
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: email, deliverToAccount: true }));

  const delivery = jest.mocked(sendMail).mock.calls[0][0];
  const link = new URL(delivery.text!.match(/https:\/\/cuenta\.hikonta\.example\/[^\s]+/)![0]);
  expect(link.origin).toBe(appOrigin);
  expect(link.pathname).toBe("/auth/action");
  expect(link.search).toBe("?mode=resetPassword");
  expect(new URLSearchParams(link.hash.slice(1)).get("oobCode")).toBe(oobCode);
  expect(delivery.html).toContain(link.href);
});

it("informa que el correo no pertenece a HiKonta cuando Firebase no encuentra una cuenta", async () => {
  jest.mocked(adminAuth.getUserByEmail).mockRejectedValue({ code: "auth/user-not-found" });

  const response = await sendPasswordReset(request("send-password-reset", { email }));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({
    error: "No hay una cuenta de HiKonta registrada con ese correo.",
  });
  expect(mockSql).not.toHaveBeenCalled();
  expect(adminAuth.generatePasswordResetLink).not.toHaveBeenCalled();
  expect(sendMail).not.toHaveBeenCalled();
});

it("exige una cuenta de HiKonta incluso si la identidad existe en Firebase", async () => {
  mockSql.mockResolvedValue([]);
  const response = await sendPasswordReset(request("send-password-reset", { email }));
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ error: "No hay una cuenta de HiKonta registrada con ese correo." });
  expect(adminAuth.generatePasswordResetLink).not.toHaveBeenCalled();
  expect(sendMail).not.toHaveBeenCalled();
});

it("aplica el límite por correo antes de consultar si existe la cuenta", async () => {
  jest.mocked(sharedRateLimit)
    .mockResolvedValueOnce({ allowed: true, remaining: 4, retryAfterSec: 0 })
    .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 120 });
  const response = await sendPasswordReset(request("send-password-reset", { email }));
  expect(response.status).toBe(429);
  expect(adminAuth.getUserByEmail).not.toHaveBeenCalled();
  expect(sendMail).not.toHaveBeenCalled();
});

it("informa que el envío falló y registra el rechazo SMTP sin exponer credenciales", async () => {
  jest.mocked(adminAuth.generatePasswordResetLink).mockResolvedValue(
    "https://example.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=private-reset-code",
  );
  jest.mocked(sendMail).mockRejectedValue({
    code: "EAUTH",
    responseCode: 535,
    message: "Detalle privado del proveedor",
  });
  const log = jest.spyOn(console, "error").mockImplementation(() => {});

  const response = await sendPasswordReset(request("send-password-reset", { email }));

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "No se pudo enviar el correo de recuperación. Intenta de nuevo más tarde.",
  });
  expect(log).toHaveBeenCalledWith(
    "POST /api/auth/send-password-reset: falló el envío",
    { stage: "smtp", code: "EAUTH", smtpStatus: 535 },
  );
});

it("permite verificar el código varias veces y lo rechaza cuando Firebase confirma que ya fue consumido", async () => {
  let consumed = false;
  const firebase = jest.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    const payload = JSON.parse(String(options?.body));
    expect(payload.oobCode).toBe(oobCode);
    if (consumed) return Response.json({ error: { message: "INVALID_OOB_CODE" } }, { status: 400 });
    if (payload.newPassword !== undefined) {
      expect(payload.newPassword).toBe(validPassword);
      consumed = true;
    }
    return Response.json({ email, requestType: "PASSWORD_RESET" });
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const check = await resetPassword(request("reset-password", { oobCode }));
    expect(await check.json()).toEqual({ email });
    expect(check.headers.get("Cache-Control")).toBe("no-store");
    expect(check.headers.has("Set-Cookie")).toBe(false);
  }

  const weak = await resetPassword(request("reset-password", { oobCode, newPassword: "Clave!123" }));
  expect(weak.status).toBe(400);
  expect(firebase).toHaveBeenCalledTimes(2);

  const confirmation = await resetPassword(request("reset-password", { oobCode, newPassword: validPassword }));
  expect(confirmation.status).toBe(200);
  expect(await confirmation.json()).toEqual({ ok: true });
  for (const name of ["hikonta_auth", "hikonta_nav", "token", "hikonta_session"]) {
    expect(confirmation.cookies.get(name)).toMatchObject({ value: "", maxAge: 0 });
  }

  for (const body of [{ oobCode }, { oobCode, newPassword: validPassword }]) {
    const reuse = await resetPassword(request("reset-password", body));
    expect(reuse.status).toBe(400);
    expect(await reuse.json()).toMatchObject({ code: "invalid-link" });
    expect(reuse.headers.has("Set-Cookie")).toBe(false);
  }
});

it("distingue los fallos temporales de un enlace inválido", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}, { status: 503 }));
  const response = await resetPassword(request("reset-password", { oobCode }));
  expect(response.status).toBe(503);
  expect(await response.json()).not.toHaveProperty("code", "invalid-link");
});

it("rechaza un enlace vencido sin borrar la sesión actual", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ error: { message: "EXPIRED_OOB_CODE" } }, { status: 400 }),
  );
  const response = await resetPassword(request("reset-password", { oobCode }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "invalid-link" });
  expect(response.headers.has("Set-Cookie")).toBe(false);
});

it("rechaza confirmaciones desde otro origen", async () => {
  const firebase = jest.spyOn(globalThis, "fetch");
  const response = await resetPassword(request("reset-password", { oobCode, newPassword: validPassword }, "https://other.example"));
  expect(response.status).toBe(403);
  expect(firebase).not.toHaveBeenCalled();
});
