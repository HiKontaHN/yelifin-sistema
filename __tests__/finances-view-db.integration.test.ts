const mockVerifyAuth = jest.fn();

jest.mock("@/lib/auth", () => ({
  verifyAuth: (...args: unknown[]) => mockVerifyAuth(...args),
  isAuthSuccess: jest.fn((result) => result?.error === null && result?.data),
  createErrorResponse: jest.fn((message: string, status: number) =>
    Response.json({ error: message }, { status }),
  ),
}));

import { NextRequest } from "next/server";

const describeDatabase = process.env.RUN_DB_INTEGRATION === "1"
  ? describe
  : describe.skip;

describeDatabase("vista financiera — integración con la base de desarrollo", () => {
  jest.setTimeout(45_000);

  it("ejecuta los tres bloques consolidados sin modificar datos", async () => {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL!);
    const [scope] = await sql`
      SELECT
        o.id AS org_id,
        u.id AS user_id,
        r.id AS role_id,
        r.name AS role_name,
        u.firebase_uid,
        u.email,
        u.display_name
      FROM users u
      JOIN organization_members om ON om.user_id = u.id AND om.is_active = TRUE
      JOIN organizations o ON o.id = om.org_id AND o.is_active = TRUE
      JOIN org_roles r ON r.id = om.role_id
      WHERE u.is_active = TRUE
      ORDER BY om.joined_at, u.id
      LIMIT 1
    `;

    expect(scope).toBeDefined();
    mockVerifyAuth.mockResolvedValue({
      error: null,
      status: 200,
      data: {
        userId: Number(scope.user_id),
        orgId: Number(scope.org_id),
        roleId: Number(scope.role_id),
        roleName: scope.role_name,
        isOwner: true,
        firebaseUid: scope.firebase_uid,
        email: scope.email,
        displayName: scope.display_name,
        emailVerified: true,
        isActive: true,
        subscription: { status: "ACTIVE", planSlug: "pro" },
      },
    });

    const { GET } = await import("@/app/api/finances/view/route");
    const response = await GET(new NextRequest(
      "http://localhost/api/finances/view?month=10&year=2026&tz_offset=360",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      summary: {
        accounts: expect.any(Array),
        period: { income: expect.any(Number), expense: expect.any(Number) },
        today: {
          income: expect.any(Number),
          expense: expect.any(Number),
          count: expect.any(Number),
        },
        cash_flow: expect.any(Array),
        today_transactions: expect.any(Array),
      },
      periods: expect.any(Array),
      accounts: expect.any(Array),
      credit_cards: expect.any(Array),
    });
  });
});
