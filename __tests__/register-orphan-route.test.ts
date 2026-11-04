const mockSql = jest.fn();
const mockCreateUser = jest.fn();
const mockGetUser = jest.fn();
const mockEnsureOrg = jest.fn();

jest.mock("@neondatabase/serverless", () => ({ neon: jest.fn(() => mockSql) }));
jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: {
    createUser: mockCreateUser,
    getUser: mockGetUser,
    deleteUser: jest.fn(),
  },
}));
jest.mock("@/lib/rate-limit", () => ({
  rateLimit: jest.fn(async () => ({ allowed: true, retryAfterSec: 0 })),
  getClientIP: jest.fn(() => "1.1.1.1"),
}));
jest.mock("@/lib/auth", () => ({ ensureOrgExists: mockEnsureOrg }));
jest.mock("@/lib/seed-default-categories", () => ({ seedDefaultCategories: jest.fn() }));
jest.mock("@/lib/partner-invites", () => ({ redeemPartnerInviteCode: jest.fn() }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/register/route";

function registerRequest() {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: "viejo@example.com",
      password: "secret123",
      display_name: "Nuevo",
      business_name: "Negocio",
      date_of_birth: "1990-01-01",
    }),
  });
}

const writes = () =>
  mockSql.mock.calls
    .map((c) => (c[0] as TemplateStringsArray).join(" "))
    .filter((q) => /UPDATE users|INSERT INTO/i.test(q));

describe("POST /api/auth/register con correo ya existente en users", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockRejectedValue({ code: "auth/user-not-found" });
    mockCreateUser.mockResolvedValue({ uid: "new-uid" });
    mockEnsureOrg.mockResolvedValue({ orgId: 1 });
  });

  it("rechaza (409) un huérfano de Firebase que ya tuvo organización y no reasigna la fila", async () => {
    mockSql.mockResolvedValueOnce([
      { id: 5, firebase_uid: "old-uid", is_active: true, had_org: true },
    ]);

    const res = await POST(registerRequest());

    expect(res.status).toBe(409);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
    expect(mockEnsureOrg).not.toHaveBeenCalled();
  });

  it("rechaza (409) una fila desactivada aunque no tenga organización", async () => {
    mockSql.mockResolvedValueOnce([
      { id: 5, firebase_uid: "old-uid", is_active: false, had_org: false },
    ]);

    const res = await POST(registerRequest());

    expect(res.status).toBe(409);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("sigue re-vinculando un huérfano de registro fallido que nunca tuvo organización", async () => {
    mockSql
      .mockResolvedValueOnce([
        { id: 5, firebase_uid: "old-uid", is_active: true, had_org: false },
      ])
      .mockResolvedValue([]);

    const res = await POST(registerRequest());

    expect(res.status).toBe(201);
    expect(mockCreateUser).toHaveBeenCalled();
    expect(writes().some((q) => /UPDATE users/i.test(q))).toBe(true);
  });
});
