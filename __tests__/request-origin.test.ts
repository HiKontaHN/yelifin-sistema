jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: {
    verifySessionCookie: jest.fn(),
    verifyIdToken: jest.fn(),
  },
}));

const mockSql = jest.fn();
jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
}));

jest.mock("@/lib/rate-limit", () => ({
  rateLimit: jest.fn(),
  getClientIP: jest.fn(() => "127.0.0.1"),
}));

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { hasValidRequestOrigin, withDevelopmentCors } from "@/lib/request-origin";
import { verifyAuth } from "@/lib/auth";
import { proxy } from "@/proxy";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createSession, DELETE as deleteSession } from "@/app/api/auth/session/route";

const LOCAL_ORIGIN = "http://localhost:3000";
const TUNNEL_ORIGIN = "https://prueba.trycloudflare.com";

function setEnvironment(environment: "development" | "production" | "test") {
  jest.replaceProperty(process, "env", { ...process.env, NODE_ENV: environment });
}

function makeRequest(
  path: string,
  method = "GET",
  origin: string | undefined = TUNNEL_ORIGIN,
  extraHeaders: Record<string, string> = {},
) {
  return new NextRequest(`${LOCAL_ORIGIN}${path}`, {
    method,
    headers: {
      ...(origin !== undefined ? { Origin: origin } : {}),
      ...extraHeaders,
    },
    ...(!["GET", "HEAD", "OPTIONS"].includes(method) ? { body: "{}" } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setEnvironment("development");
  jest.mocked(rateLimit).mockReturnValue({ allowed: true, remaining: 299, retryAfterSec: 0 });
  jest.mocked(adminAuth.verifySessionCookie).mockResolvedValue({
    uid: "test-user",
    email_verified: true,
  } as Awaited<ReturnType<typeof adminAuth.verifySessionCookie>>);
  mockSql.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("política de origen", () => {
  it.each([TUNNEL_ORIGIN, "https://prueba.ngrok-free.app", "http://192.168.1.10:3000", "null"])(
    "acepta %s en desarrollo",
    (origin) => {
      expect(hasValidRequestOrigin(makeRequest("/api/sales", "POST", origin))).toBe(true);
    },
  );

  it("acepta peticiones sin Origin en desarrollo", () => {
    const request = makeRequest("/api/sales", "POST");
    request.headers.delete("origin");
    expect(hasValidRequestOrigin(request)).toBe(true);
  });

  it.each(["production", "test"] as const)("exige el mismo origen en %s", (environment) => {
    setEnvironment(environment);
    expect(hasValidRequestOrigin(makeRequest("/api/sales", "POST", LOCAL_ORIGIN))).toBe(true);
    expect(hasValidRequestOrigin(makeRequest("/api/sales", "POST", TUNNEL_ORIGIN))).toBe(false);
    const missingOrigin = makeRequest("/api/sales", "POST");
    missingOrigin.headers.delete("origin");
    expect(hasValidRequestOrigin(missingOrigin)).toBe(false);
  });
});

describe("CORS de desarrollo en la API", () => {
  it("responde el preflight con 204, admite credenciales y los encabezados solicitados", async () => {
    const response = await proxy(makeRequest("/api/sales", "OPTIONS", TUNNEL_ORIGIN, {
      "Access-Control-Request-Method": "PATCH",
      "Access-Control-Request-Headers": "content-type, x-test-header",
    }));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(TUNNEL_ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("content-type, x-test-header");
    expect(response.headers.get("Vary")).toContain("Origin");
    expect(response.headers.get("Vary")).toContain("Access-Control-Request-Headers");
    expect(rateLimit).not.toHaveBeenCalled();
    expect(adminAuth.verifySessionCookie).not.toHaveBeenCalled();
  });

  it("agrega CORS a las respuestas normales sin quitar los encabezados existentes", () => {
    const response = NextResponse.json({ ok: true }, { headers: { Vary: "Accept-Encoding" } });
    expect(withDevelopmentCors(makeRequest("/api/sales"), response)).toBe(response);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(TUNNEL_ORIGIN);
    expect(response.headers.get("Vary")).toBe("Accept-Encoding, Origin");
  });

  it("mantiene CORS incluso si la API responde por exceso de peticiones", async () => {
    jest.mocked(rateLimit).mockReturnValue({ allowed: false, remaining: 0, retryAfterSec: 30 });
    const response = await proxy(makeRequest("/api/sales"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(TUNNEL_ORIGIN);
  });

  it("no agrega CORS ni intercepta el preflight en producción", async () => {
    setEnvironment("production");
    const response = await proxy(makeRequest("/api/sales", "OPTIONS"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(rateLimit).toHaveBeenCalledTimes(1);
  });

  it("no altera respuestas sin Origin ni respuestas de producción", () => {
    const request = makeRequest("/api/sales");
    request.headers.delete("origin");
    const withoutOrigin = withDevelopmentCors(request, NextResponse.json({ ok: true }));
    expect(withoutOrigin.headers.get("Access-Control-Allow-Origin")).toBeNull();
    setEnvironment("production");
    const productionResponse = NextResponse.json({ ok: true });
    withDevelopmentCors(makeRequest("/api/sales"), productionResponse);
    expect(productionResponse.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("validación de origen en autenticación", () => {
  const handlers = [
    { name: "API protegida", handler: verifyAuth, path: "/api/sales", method: "POST", developmentStatus: 404 },
    { name: "login", handler: login, path: "/api/auth/login", method: "POST", developmentStatus: 400 },
    { name: "crear sesión", handler: createSession, path: "/api/auth/session", method: "POST", developmentStatus: 401 },
    { name: "cerrar sesión", handler: deleteSession, path: "/api/auth/session", method: "DELETE", developmentStatus: 200 },
  ];

  it.each(handlers)("$name permite el origen del túnel en desarrollo", async ({ handler, path, method, developmentStatus }) => {
    const response = await handler(makeRequest(path, method, TUNNEL_ORIGIN, { Cookie: "hikonta_auth=test-session" }));
    expect(response.status).toBe(developmentStatus);
  });

  it.each(handlers)("$name sigue rechazando otros orígenes en producción", async ({ handler, path, method }) => {
    setEnvironment("production");
    const response = await handler(makeRequest(path, method, TUNNEL_ORIGIN, { Cookie: "hikonta_auth=test-session" }));
    expect(response.status).toBe(403);
    expect(mockSql).not.toHaveBeenCalled();
    expect(adminAuth.verifyIdToken).not.toHaveBeenCalled();
  });

  it("abrir CORS no omite la autenticación", async () => {
    const response = await verifyAuth(makeRequest("/api/sales", "POST"));
    expect(response).toMatchObject({ status: 401, error: "No autorizado", data: null });
    expect(mockSql).not.toHaveBeenCalled();
  });
});
