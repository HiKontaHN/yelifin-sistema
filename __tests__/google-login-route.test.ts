import { NextRequest } from "next/server";

const mockVerifyIdToken = jest.fn();
const mockCreateSessionCookie = jest.fn();
const mockSql = jest.fn();

jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: {
    verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args),
    createSessionCookie: (...args: unknown[]) => mockCreateSessionCookie(...args),
  },
}));
jest.mock("@neondatabase/serverless", () => ({ neon: () => mockSql }));
jest.mock("@/lib/rate-limit", () => ({
  sharedRateLimit: async () => ({ allowed: true, remaining: 4, retryAfterSec: 0 }),
  getClientIP: () => "127.0.0.1",
}));
jest.mock("@/lib/request-origin", () => ({ hasValidRequestOrigin: () => true }));
jest.mock("@/lib/auth", () => ({
  ensureOrgExists: async () => ({ orgId: 9, roleName: "owner" }),
}));

import { POST } from "@/app/api/auth/login/route";

function loginWithGoogle(emailVerified: boolean, uid = "existing-firebase-uid") {
  mockVerifyIdToken.mockResolvedValueOnce({
    uid,
    auth_time: Math.floor(Date.now() / 1000),
    email_verified: emailVerified,
    firebase: { sign_in_provider: "google.com" },
  });
  return POST(new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ idToken: "firebase-token" }),
  }));
}

beforeEach(() => jest.resetAllMocks());

test("inicia sesión con Google verificado en la cuenta del mismo UID", async () => {
  mockSql.mockResolvedValueOnce([
    { id: 4, firebase_uid: "existing-firebase-uid", email: "user@example.com", is_active: true },
  ]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  mockCreateSessionCookie.mockResolvedValueOnce("session-cookie");

  const response = await loginWithGoogle(true);

  expect(response.status).toBe(200);
  expect(mockSql.mock.calls[0][1]).toBe("existing-firebase-uid");
  expect(response.cookies.get("hikonta_auth")?.value).toBe("session-cookie");
});

test("rechaza Google con correo sin verificar", async () => {
  expect((await loginWithGoogle(false)).status).toBe(403);
  expect(mockCreateSessionCookie).not.toHaveBeenCalled();
});

test("un UID desconocido de Google pasa al formulario de registro", async () => {
  mockSql.mockResolvedValueOnce([]);

  const response = await loginWithGoogle(true, "unknown-firebase-uid");
  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({ code: "google_registration_required" });
  expect(mockSql).toHaveBeenCalledTimes(1);
  expect(mockCreateSessionCookie).not.toHaveBeenCalled();
});
