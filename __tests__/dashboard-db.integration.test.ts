jest.mock("firebase-admin/app", () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn(),
}));
jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({ verifyIdToken: jest.fn() })),
}));
jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifyIdToken: jest.fn() },
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
    }>`
      SELECT id AS org_id, owner_user_id AS user_id
      FROM organizations
      WHERE is_active = TRUE
      ORDER BY id
      LIMIT 1
    `);

    expect(scope).toBeDefined();

    const authUser: AuthUser = {
      userId: Number(scope.user_id),
      orgId: Number(scope.org_id),
      roleId: 0,
      roleName: "Dueño",
      isOwner: true,
      firebaseUid: "dashboard-integration",
      email: "dashboard-integration@example.com",
      displayName: "Dashboard integration",
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

    try {
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
