const mockSql = jest.fn();
const mockVerifySessionCookie = jest.fn();
const mockGetUser = jest.fn();

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
}));

jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: {
    verifySessionCookie: mockVerifySessionCookie,
    getUser: mockGetUser,
  },
}));

jest.mock("@/lib/auth", () => ({
  verifyAuth: jest.fn(),
  isAuthSuccess: jest.fn(),
  createErrorResponse: jest.fn((message: string, status: number) =>
    Response.json({ error: message }, { status }),
  ),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/auth/me/route";
import { verifyAuth } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

const profileRow = {
  id: 1,
  firebase_uid: "firebase-1",
  email: "user@example.com",
  display_name: "Usuario",
  photo_url: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  business_name: "Negocio",
  business_logo_url: null,
  onboarding_completed: true,
  org_id: 7,
  org_name: "Organización",
  org_slug: "organizacion",
  org_logo_url: null,
  timezone: "America/Tegucigalpa",
  currency: "HNL",
  locale: "es-HN",
  industry_id: null,
  owner_user_id: 1,
  role_id: 2,
  role_name: "Dueño",
  role_is_owner: true,
  subscription_id: 3,
  subscription_status: "ACTIVE",
  current_period_start: null,
  current_period_end: null,
  cancel_at_period_end: false,
  past_due_since: null,
  grace_ends_at: null,
  is_in_grace: false,
  is_degraded: false,
  is_trial_expired: false,
  plan_id: 4,
  plan_name: "Pro",
  plan_slug: "pro",
  price_usd: 20,
  billing_interval: "MONTHLY",
  max_products: null,
  max_sales_per_month: null,
  max_storage_mb: null,
  contracted_plan_id: 4,
  contracted_plan_name: "Pro",
  contracted_plan_slug: "pro",
  contracted_price_usd: 20,
  contracted_billing_interval: "MONTHLY",
  plan_features: [],
  role_permissions: [],
};

function authenticatedRequest() {
  return new NextRequest("http://localhost/api/auth/me", {
    headers: { cookie: "hikonta_auth=session-cookie" },
  });
}

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    mockSql.mockReset();
    mockVerifySessionCookie.mockReset();
    mockGetUser.mockReset();
    jest.mocked(verifyAuth).mockReset();
  });

  it("devuelve al móvil el permiso de cada submódulo y las funciones del plan", async () => {
    jest.mocked(verifyAuth).mockResolvedValue({
      error: null, status: 200,
      data: { firebaseUid: "firebase-1", emailVerified: true } as AuthUser,
    });
    mockGetUser.mockResolvedValue({ uid: "firebase-1", emailVerified: true, disabled: false });
    mockSql.mockResolvedValue([{
      ...profileRow,
      role_is_owner: false,
      owner_user_id: 2,
      plan_features: [{ key: "inventory.movements", name: "Movimientos", category: "INVENTORY" }],
      role_permissions: [{
        module: "INVENTORY", subitem: "MOVEMENTS", can_view: true, can_edit: false,
        can_delete: false, show_costs: false, show_profit: false,
      }],
    }]);
    const request = new NextRequest("http://localhost/api/auth/me", {
      headers: { authorization: "Bearer mobile-token" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(verifyAuth).toHaveBeenCalledWith(request, { allowMobileRead: true });
    expect(mockVerifySessionCookie).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      permissions: { INVENTORY: { MOVEMENTS: { can_view: true, show_costs: false, show_profit: false } } },
      features: { INVENTORY: [{ key: "inventory.movements" }] },
    });
  });

  it("devuelve sesión y perfil con una sola consulta a Neon", async () => {
    mockVerifySessionCookie.mockResolvedValue({
      uid: "firebase-1",
      email_verified: true,
    });
    mockGetUser.mockResolvedValue({
      uid: "firebase-1",
      email: "user@example.com",
      displayName: "Usuario",
      emailVerified: true,
      disabled: false,
    });
    mockSql.mockResolvedValue([profileRow]);

    const response = await GET(authenticatedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockVerifySessionCookie).toHaveBeenCalledWith("session-cookie", true);
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(body.session).toEqual({
      uid: "firebase-1",
      email: "user@example.com",
      displayName: "Usuario",
      emailVerified: true,
      sessionEmailVerified: true,
    });
    expect(body.user.id).toBe(1);
    expect(body.org.id).toBe(7);
  });

  it("rechaza la cookie revocada antes de consultar el perfil", async () => {
    mockVerifySessionCookie.mockRejectedValue({ code: "auth/session-cookie-revoked" });

    const response = await GET(authenticatedRequest());

    expect(response.status).toBe(401);
    expect(mockVerifySessionCookie).toHaveBeenCalledWith("session-cookie", true);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("sigue respondiendo para una organización EXPIRED", async () => {
    mockVerifySessionCookie.mockResolvedValue({
      uid: "firebase-1",
      email_verified: true,
    });
    mockGetUser.mockResolvedValue({
      uid: "firebase-1",
      email: "user@example.com",
      displayName: "Usuario",
      emailVerified: true,
      disabled: false,
    });
    mockSql.mockResolvedValue([{ ...profileRow, subscription_status: "EXPIRED" }]);

    const response = await GET(authenticatedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.subscription.status).toBe("EXPIRED");
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it("expone la fecha de gracia y conserva las features durante PAST_DUE", async () => {
    mockVerifySessionCookie.mockResolvedValue({
      uid: "firebase-1",
      email_verified: true,
    });
    mockGetUser.mockResolvedValue({
      uid: "firebase-1",
      email: "user@example.com",
      displayName: "Usuario",
      emailVerified: true,
      disabled: false,
    });
    mockSql.mockResolvedValue([{
      ...profileRow,
      subscription_status: "PAST_DUE",
      past_due_since: "2026-11-03T16:00:00.000Z",
      grace_ends_at: "2026-11-09T06:00:00.000Z",
      is_in_grace: true,
      plan_features: [{ key: "reports.sales", name: "Reporte de ventas", category: "REPORTS" }],
    }]);

    const response = await GET(authenticatedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.subscription).toMatchObject({
      status: "PAST_DUE",
      grace_ends_at: "2026-11-09T06:00:00.000Z",
      is_in_grace: true,
      is_degraded: false,
    });
    expect(body.features.REPORTS).toHaveLength(1);
  });

  it("bloquea a un miembro no dueño cuando la organización está degradada", async () => {
    mockVerifySessionCookie.mockResolvedValue({
      uid: "firebase-1",
      email_verified: true,
    });
    mockGetUser.mockResolvedValue({
      uid: "firebase-1",
      disabled: false,
    });
    mockSql.mockResolvedValue([{
      ...profileRow,
      owner_user_id: 99,
      role_is_owner: false,
      subscription_status: "PAST_DUE",
      plan_name: "Gratis",
      plan_slug: "free",
      is_degraded: true,
    }]);

    const response = await GET(authenticatedRequest());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("limitado al dueño");
  });

  it("expone un TRIAL vencido como Gratis sin bloquear al miembro", async () => {
    mockVerifySessionCookie.mockResolvedValue({
      uid: "firebase-1",
      email_verified: true,
    });
    mockGetUser.mockResolvedValue({
      uid: "firebase-1",
      email: "user@example.com",
      displayName: "Usuario",
      emailVerified: true,
      disabled: false,
    });
    mockSql.mockResolvedValue([{
      ...profileRow,
      owner_user_id: 99,
      role_is_owner: false,
      subscription_status: "TRIAL",
      plan_name: "Gratis",
      plan_slug: "free",
      contracted_plan_name: "Prueba",
      contracted_plan_slug: "trial",
      is_trial_expired: true,
    }]);

    const response = await GET(authenticatedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.subscription).toMatchObject({
      status: "TRIAL",
      plan: { slug: "free" },
      contracted_plan: { slug: "trial" },
      is_trial_expired: true,
      is_degraded: false,
    });
  });

  it("rechaza una cookie inválida sin consultar Neon", async () => {
    mockVerifySessionCookie.mockRejectedValue(new Error("invalid cookie"));

    const response = await GET(authenticatedRequest());

    expect(response.status).toBe(401);
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("mantiene bloqueada una cuenta deshabilitada en Firebase", async () => {
    mockVerifySessionCookie.mockResolvedValue({
      uid: "firebase-1",
      email_verified: true,
    });
    mockGetUser.mockResolvedValue({
      uid: "firebase-1",
      disabled: true,
    });
    mockSql.mockResolvedValue([profileRow]);

    const response = await GET(authenticatedRequest());

    expect(response.status).toBe(401);
  });
});
