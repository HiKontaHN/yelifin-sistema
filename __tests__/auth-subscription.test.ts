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
