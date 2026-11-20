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
});
