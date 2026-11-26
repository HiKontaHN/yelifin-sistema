const mockSql = jest.fn();
const mockVerifySessionCookie = jest.fn();
const mockVerifyIdToken = jest.fn();

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
  neonConfig: {},
  Pool: jest.fn(),
}));

jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifySessionCookie: mockVerifySessionCookie, verifyIdToken: mockVerifyIdToken },
}));

import { NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { GET as getProducts } from "@/app/api/products/route";
import { GET as getProductDetail } from "@/app/api/products/[id]/detail/route";

function request() {
  return new NextRequest("http://localhost/api/products", {
    headers: { cookie: "hikonta_auth=session-cookie" },
  });
}

function authRow(
  status: "ACTIVE" | "PAST_DUE" | "EXPIRED",
  overrides: Record<string, unknown> = {},
) {
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
    contracted_plan_slug: "pro",
    grace_ends_at: null,
    is_in_grace: false,
    is_degraded: false,
    is_trial_expired: false,
    ...overrides,
  };
}

describe("subscription guard", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockVerifySessionCookie.mockReset();
    mockVerifyIdToken.mockReset();
    mockVerifySessionCookie.mockResolvedValue({
      uid: "firebase-1",
      email_verified: true,
    });
  });

  it("bloquea una API protegida cuando la sesión web fue revocada", async () => {
    mockVerifySessionCookie.mockRejectedValue({ code: "auth/session-cookie-revoked" });

    const response = await getProducts(request());

    expect(response.status).toBe(401);
    expect(mockVerifySessionCookie).toHaveBeenCalledWith("session-cookie", true);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("acepta tokens móviles verificados solo en lecturas habilitadas", async () => {
    const headers = { authorization: "Bearer firebase-token" };
    const url = "http://localhost/api/inventory";
    const read = new NextRequest(url, { headers });
    const write = new NextRequest(url, { headers, method: "POST" });
    expect((await verifyAuth(read)).status).toBe(401);
    expect((await verifyAuth(write, { allowMobileRead: true })).status).toBe(401);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();

    mockVerifyIdToken.mockResolvedValue({ uid: "firebase-1", email_verified: true });
    mockSql.mockResolvedValue([authRow("ACTIVE")]);
    expect((await verifyAuth(read, { allowMobileRead: true })).data?.orgId).toBe(7);
    expect(mockVerifyIdToken).toHaveBeenCalledWith("firebase-token", true);
  });

  it("bloquea una lectura móvil si el correo sigue sin verificar", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "firebase-1", email_verified: false });
    const read = new NextRequest("http://localhost/api/inventory", {
      headers: { authorization: "Bearer firebase-token" },
    });
    expect((await verifyAuth(read, { allowMobileRead: true })).status).toBe(403);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("solo acepta un token móvil en el método de escritura habilitado", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "firebase-1", email_verified: true });
    mockSql.mockResolvedValue([authRow("ACTIVE")]);
    const headers = { authorization: "Bearer firebase-token" };
    const url = "http://localhost/api/accounts/2";
    const update = new NextRequest(url, { headers, method: "PATCH" });
    const remove = new NextRequest(url, { headers, method: "DELETE" });

    expect((await verifyAuth(remove, { mobileWriteMethod: "PATCH" })).status).toBe(401);
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    expect((await verifyAuth(update, { mobileWriteMethod: "PATCH" })).data?.orgId).toBe(7);
    expect(mockVerifyIdToken).toHaveBeenCalledWith("firebase-token", true);
  });

  it("mantiene la suscripción como requisito del detalle móvil", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "firebase-1", email_verified: true });
    mockSql.mockResolvedValueOnce([authRow("EXPIRED")]).mockResolvedValueOnce([{ status: "EXPIRED" }]);
    const req = new NextRequest("http://localhost/api/products/42/detail", {
      headers: { authorization: "Bearer firebase-token" },
    });

    const response = await getProductDetail(req, { params: Promise.resolve({ id: "42" }) });

    expect(response.status).toBe(403);
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it("sirve el detalle móvil dentro de la organización y oculta costos privados", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "firebase-1", email_verified: true });
    mockSql
      .mockResolvedValueOnce([authRow("ACTIVE", { role_is_owner: false, owner_user_id: 2 })])
      .mockResolvedValueOnce([{ status: "ACTIVE" }])
      .mockResolvedValueOnce([{ enabled: true }])
      .mockResolvedValueOnce([{ can_view: true }])
      .mockResolvedValueOnce([{ id: 42, is_service: true, service_cost: 9, price: 50 }])
      .mockResolvedValueOnce([{ total_stock: 0 }])
      .mockResolvedValueOnce([{ avg_cost: 0 }])
      .mockResolvedValueOnce([]) // Último costo
      .mockResolvedValueOnce([]) // Variantes
      .mockResolvedValueOnce([]) // Lotes
      .mockResolvedValueOnce([]) // Evolución de costo de inventario
      .mockResolvedValueOnce([{ id: 1, cost: 9 }]) // Evolución del costo del servicio
      .mockResolvedValueOnce([{ total_units_sold: 0, total_revenue: 0, total_profit: 0 }])
      .mockResolvedValueOnce([]) // Compras
      .mockResolvedValueOnce([]) // Movimientos
      .mockResolvedValueOnce([{ can_view: true, show_costs: false, show_profit: false }]);
    const req = new NextRequest("http://localhost/api/products/42/detail", {
      headers: { authorization: "Bearer firebase-token" },
    });

    const response = await getProductDetail(req, { params: Promise.resolve({ id: "42" }) });

    expect(response.status).toBe(200);
    expect(mockSql).toHaveBeenNthCalledWith(5, expect.anything(), 42, 7);
    expect((await response.json()).data).toMatchObject({
      id: 42, service_cost: null, avg_cost: null, margin_pct: null, service_cost_history: [],
    });
  });

  it("verifyAuth permite una organización EXPIRED", async () => {
    mockSql.mockResolvedValue([authRow("EXPIRED")]);

    const result = await verifyAuth(request());

    expect(result.status).toBe(200);
    expect(result.error).toBeNull();
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("mantiene el plan contratado mientras PAST_DUE está dentro de la gracia", async () => {
    mockSql.mockResolvedValue([
      authRow("PAST_DUE", {
        plan_slug: "pro",
        contracted_plan_slug: "pro",
        grace_ends_at: "2026-11-09T06:00:00.000Z",
        is_in_grace: true,
      }),
    ]);

    const result = await verifyAuth(request());

    expect(result.status).toBe(200);
    expect(result.data?.subscription).toMatchObject({
      status: "PAST_DUE",
      planSlug: "pro",
      contractedPlanSlug: "pro",
      isInGrace: true,
      isDegraded: false,
    });
  });

  it("usa Gratis después de la gracia para el dueño", async () => {
    mockSql.mockResolvedValue([
      authRow("PAST_DUE", {
        plan_slug: "free",
        contracted_plan_slug: "pro",
        grace_ends_at: "2026-11-09T06:00:00.000Z",
        is_degraded: true,
      }),
    ]);

    const result = await verifyAuth(request());

    expect(result.status).toBe(200);
    expect(result.data?.subscription).toMatchObject({
      planSlug: "free",
      contractedPlanSlug: "pro",
      isDegraded: true,
    });
  });

  it("restaura el plan contratado cuando se confirma el pago", async () => {
    mockSql.mockResolvedValue([
      authRow("ACTIVE", {
        plan_slug: "pro",
        contracted_plan_slug: "pro",
        grace_ends_at: null,
        is_degraded: false,
      }),
    ]);

    const result = await verifyAuth(request());

    expect(result.status).toBe(200);
    expect(result.data?.subscription).toMatchObject({
      status: "ACTIVE",
      planSlug: "pro",
      graceEndsAt: null,
      isDegraded: false,
    });
  });

  it("bloquea con 403 a un miembro no dueño cuando la organización está degradada", async () => {
    mockSql.mockResolvedValue([
      authRow("PAST_DUE", {
        owner_user_id: 99,
        role_is_owner: false,
        plan_slug: "free",
        is_degraded: true,
      }),
    ]);

    const result = await verifyAuth(request());

    expect(result.status).toBe(403);
    expect(result.error).toContain("limitado al dueño");
    expect(result.data).toBeNull();
  });

  it("no degrada un plan no facturable aunque esté PAST_DUE", async () => {
    mockSql.mockResolvedValue([
      authRow("PAST_DUE", {
        plan_slug: "original",
        contracted_plan_slug: "original",
        is_in_grace: false,
        is_degraded: false,
      }),
    ]);

    const result = await verifyAuth(request());

    expect(result.status).toBe(200);
    expect(result.data?.subscription).toMatchObject({
      planSlug: "original",
      contractedPlanSlug: "original",
      isDegraded: false,
    });
  });

  it("expone Gratis para un TRIAL vencido sin bloquear a un miembro", async () => {
    mockSql.mockResolvedValue([
      authRow("ACTIVE", {
        subscription_status: "TRIAL",
        owner_user_id: 99,
        role_is_owner: false,
        plan_slug: "free",
        contracted_plan_slug: "trial",
        is_trial_expired: true,
      }),
    ]);

    const result = await verifyAuth(request());

    expect(result.status).toBe(200);
    expect(result.data?.subscription).toMatchObject({
      status: "TRIAL",
      planSlug: "free",
      contractedPlanSlug: "trial",
      isTrialExpired: true,
      isDegraded: false,
    });
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
