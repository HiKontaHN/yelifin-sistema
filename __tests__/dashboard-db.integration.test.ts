jest.mock("firebase-admin/app", () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn(),
}));
jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: jest.fn() })),
}));
const mockVerifySessionCookie = jest.fn();
const mockGetUser = jest.fn();
jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: {
    verifyIdToken: jest.fn(),
    verifySessionCookie: mockVerifySessionCookie,
    getUser: mockGetUser,
  },
}));

import { NextRequest } from "next/server";
import type { AuthUser } from "@/lib/auth";

const describeDatabase = process.env.RUN_DB_INTEGRATION === "1"
  ? describe
  : describe.skip;

describeDatabase("dashboard — integración con la base de desarrollo", () => {
  jest.setTimeout(45_000);

  it("ejecuta los tres bloques consolidados y devuelve el contrato esperado", async () => {
    const authModule = await import("@/lib/auth");
    const { withTransaction } = await import("@/lib/db-transaction");
    const [scope] = await withTransaction(async (tx) => tx<{
      org_id: number;
      user_id: number;
      role_id: number;
      role_name: string;
      is_owner: boolean;
      firebase_uid: string;
      email: string;
      display_name: string;
    }>`
      SELECT
        o.id AS org_id,
        u.id AS user_id,
        r.id AS role_id,
        r.name AS role_name,
        (r.is_owner = TRUE OR o.owner_user_id = u.id) AS is_owner,
        u.firebase_uid,
        u.email,
        u.display_name
      FROM users u
      JOIN organization_members om ON om.user_id = u.id AND om.is_active = TRUE
      JOIN organizations o ON o.id = om.org_id AND o.is_active = TRUE
      JOIN org_roles r ON r.id = om.role_id
      JOIN org_subscriptions os ON os.org_id = o.id
      JOIN subscription_plans sp ON sp.id = os.plan_id
      WHERE u.is_active = TRUE
      ORDER BY om.joined_at, u.id
      LIMIT 1
    `);

    expect(scope).toBeDefined();

    const authUser: AuthUser = {
      userId: Number(scope.user_id),
      orgId: Number(scope.org_id),
      roleId: Number(scope.role_id),
      roleName: scope.role_name,
      isOwner: scope.is_owner,
      firebaseUid: scope.firebase_uid,
      email: scope.email,
      displayName: scope.display_name,
      emailVerified: true,
      isActive: true,
      subscription: { status: "ACTIVE", planSlug: "pro" },
    };

    const verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
      error: null,
      status: 200,
      data: authUser,
    });
    const requireModuleSpy = jest.spyOn(authModule, "requireModule").mockResolvedValue(null);
    const permissionsSpy = jest.spyOn(authModule, "getModulePermissions").mockResolvedValue({
      canView: true,
      canEdit: true,
      canDelete: true,
      showCosts: true,
      showProfit: true,
    });
    const timezoneSpy = jest.spyOn(authModule, "getOrgTimezone")
      .mockResolvedValue("America/Tegucigalpa");

    mockVerifySessionCookie.mockResolvedValue({
      uid: scope.firebase_uid,
      email_verified: true,
    });
    mockGetUser.mockResolvedValue({
      uid: scope.firebase_uid,
      email: scope.email,
      displayName: scope.display_name,
      emailVerified: true,
      disabled: false,
    });

    try {
      const { GET: getMe } = await import("@/app/api/auth/me/route");
      const meResponse = await getMe(new NextRequest("http://localhost/api/auth/me", {
        headers: { cookie: "hikonta_auth=integration-session" },
      }));
      const meBody = await meResponse.json();

      expect(meResponse.status).toBe(200);
      expect(meBody).toMatchObject({
        user: expect.any(Object),
        org: expect.any(Object),
        permissions: expect.any(Object),
        features: expect.any(Object),
      });
      expect(Number(meBody.user.id)).toBe(Number(scope.user_id));
      expect(Number(meBody.org.id)).toBe(Number(scope.org_id));

      const { GET } = await import("@/app/api/dashboard/route");
      for (const testCase of [
        { query: "month=10&year=2026", period: { month: 10, year: 2026 } },
        { query: "period=today", period: "today" },
      ]) {
        const response = await GET(new NextRequest(
          `http://localhost/api/dashboard?${testCase.query}`,
        ));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.data).toMatchObject({
          period: testCase.period,
          periods: expect.any(Array),
          metrics: {
            inventory: expect.any(Object),
            credit_card_debt: expect.any(Object),
          },
          sales_chart: expect.any(Array),
          payment_methods: expect.any(Array),
          top_products: expect.any(Array),
          recent_sales: expect.any(Array),
          low_stock: expect.any(Array),
        });
      }
    } finally {
      verifyAuthSpy.mockRestore();
      requireModuleSpy.mockRestore();
      permissionsSpy.mockRestore();
      timezoneSpy.mockRestore();
    }
  });
});
