const mockSql = jest.fn();
const mockVerifySessionCookie = jest.fn();

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
  neonConfig: {},
  Pool: jest.fn(),
}));

jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifySessionCookie: mockVerifySessionCookie },
}));

import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { GET as getProducts } from "@/app/api/products/route";

function request() {
  return new NextRequest("http://localhost/api/products", {
    headers: { cookie: "hikonta_auth=session-cookie" },
  });
}

function authRow(status: "ACTIVE" | "EXPIRED") {
  return {
    user_id: 1,
    firebase_uid: "firebase-1",
    email: "user@example.com",
    display_name: "Usuario",
    is_active: true,
    org_id: 7,
    owner_user_id: 1,
    timezone: "America/Tegucigalpa",
    locale: "es-HN",
    role_id: 2,
    role_name: "Dueño",
    role_is_owner: true,
    subscription_status: status,
    plan_slug: "pro",
  };
}

describe("subscription guard", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockVerifySessionCookie.mockReset();
    mockVerifySessionCookie.mockResolvedValue({
      uid: "firebase-1",
      email_verified: true,
    });
  });

  it("verifyAuth permite una organización EXPIRED", async () => {
    mockSql.mockResolvedValue([authRow("EXPIRED")]);

    const result = await verifyAuth(request());

    expect(result.status).toBe(200);
    expect(result.error).toBeNull();
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("responde 403 en una ruta protegida para una organización EXPIRED", async () => {
    mockSql
      .mockResolvedValueOnce([authRow("EXPIRED")])
      .mockResolvedValueOnce([{ status: "EXPIRED", plan_slug: "pro" }]);

    const response = await getProducts(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Tu suscripción no está activa" });
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it("responde 403 si el plan no incluye la feature de la ruta", async () => {
    mockSql
      .mockResolvedValueOnce([authRow("ACTIVE")])
      .mockResolvedValueOnce([{ status: "ACTIVE", plan_slug: "pro" }])
      .mockResolvedValueOnce([{ enabled: false }]);

    const response = await getProducts(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.needs_upgrade).toBe(true);
    expect(mockSql).toHaveBeenCalledTimes(3);
  });
});
