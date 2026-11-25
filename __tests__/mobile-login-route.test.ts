const mockSharedRateLimit = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  getClientIP: () => "127.0.0.1",
  sharedRateLimit: mockSharedRateLimit,
}));

import { POST } from "@/app/api/auth/mobile/login/route";

function login(body: object = { email: " account@example.test ", password: " password " }) {
  return POST(new Request("http://localhost:3000/api/auth/mobile/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("inicio de sesión móvil", () => {
  const originalKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  let upstream: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "firebase-test-key";
    mockSharedRateLimit.mockReset().mockResolvedValue({ allowed: true });
    upstream = jest.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    else process.env.NEXT_PUBLIC_FIREBASE_API_KEY = originalKey;
  });

  it("autentica desde el backend y entrega solo el token de acceso sin caché", async () => {
    upstream.mockResolvedValue(Response.json({ idToken: "id-token", refreshToken: "refresh-token" }));

    const response = await login();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ token: "id-token" });
    expect(upstream).toHaveBeenCalledWith(
      expect.stringContaining("/accounts:signInWithPassword?"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "account@example.test",
          password: " password ",
          returnSecureToken: true,
        }),
      }),
    );
  });

  it("oculta el detalle del proveedor cuando la cuenta o contraseña es inválida", async () => {
    upstream.mockResolvedValue(Response.json({ error: { message: "EMAIL_NOT_FOUND" } }, { status: 400 }));
    const response = await login();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "No se pudo iniciar sesión. Revisa tu correo y contraseña.",
    });
  });

  it("aplica el límite de intentos antes de llamar al proveedor", async () => {
    mockSharedRateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 20 });
    const response = await login();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("20");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rechaza credenciales incompletas sin llamar al proveedor", async () => {
    expect((await login({ email: "account@example.test" })).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("intercambia la credencial de Google por un token Firebase verificado", async () => {
    upstream.mockResolvedValueOnce(Response.json({ idToken: "firebase-id-token", emailVerified: true }));

    const response = await login({ googleIdToken: "google-id-token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ token: "firebase-id-token" });
    expect(upstream).toHaveBeenCalledWith(
      expect.stringContaining("/accounts:signInWithIdp?"),
      expect.objectContaining({ body: expect.stringContaining("id_token=google-id-token&providerId=google.com") }),
    );
  });

  it("rechaza una credencial de Google con correo sin verificar", async () => {
    upstream.mockResolvedValueOnce(Response.json({ idToken: "firebase-id-token", emailVerified: false }));
    expect((await login({ googleIdToken: "google-id-token" })).status).toBe(403);
  });

  it("solicita la contraseña cuando Firebase pide vincular la cuenta", async () => {
    upstream.mockResolvedValueOnce(Response.json({ needConfirmation: true, email: "account@example.test" }));
    await expect((await login({ googleIdToken: "google-id-token" })).json()).resolves.toEqual({
      linkEmail: "account@example.test",
    });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("vincula Google con el token de la cuenta autenticada por contraseña", async () => {
    upstream.mockResolvedValueOnce(Response.json({ needConfirmation: true, email: "account@example.test" }))
      .mockResolvedValueOnce(Response.json({ idToken: "password-token" }))
      .mockResolvedValueOnce(Response.json({ idToken: "linked-token", emailVerified: true }));

    const response = await login({ googleIdToken: "google-id-token", email: "account@example.test", password: "password" });

    await expect(response.json()).resolves.toEqual({ token: "linked-token" });
    expect(upstream).toHaveBeenNthCalledWith(3, expect.stringContaining("/accounts:signInWithIdp?"),
      expect.objectContaining({ body: expect.stringContaining('"idToken":"password-token"') }));
  });

  it("rechaza vincular al iniciar sesión por contraseña con otro correo", async () => {
    upstream.mockResolvedValueOnce(Response.json({ needConfirmation: true, email: "account@example.test" }));
    expect((await login({ googleIdToken: "google-id-token", email: "other@example.test", password: "password" })).status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
