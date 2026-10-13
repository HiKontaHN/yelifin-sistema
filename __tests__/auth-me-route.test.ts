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
  plan_id: 4,
  plan_name: "Pro",
  plan_slug: "pro",
  price_usd: 20,
  billing_interval: "MONTHLY",
  max_products: null,
  max_sales_per_month: null,
  max_storage_mb: null,
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
