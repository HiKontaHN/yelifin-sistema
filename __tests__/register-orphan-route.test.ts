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
  sharedRateLimit: jest.fn(async () => ({ allowed: true, retryAfterSec: 0 })),
  getClientIP: jest.fn(() => "1.1.1.1"),
}));
jest.mock("@/lib/auth", () => ({ ensureOrgExists: mockEnsureOrg }));
jest.mock("@/lib/seed-default-categories", () => ({ seedDefaultCategories: jest.fn() }));
jest.mock("@/lib/partner-invites", () => ({ redeemPartnerInviteCode: jest.fn() }));
<<<<<<< Updated upstream
=======
jest.mock("@/lib/db-transaction", () => ({
  withTransaction: (callback: (sql: typeof mockSql) => unknown) => callback(mockSql),
}));
jest.mock("@/lib/request-origin", () => ({
  hasValidRequestOrigin: (request: Request) => request.headers.get("origin") === "http://localhost",
}));
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
=======

describe("POST /api/auth/register con Google", () => {
  function googleRequest(emailVerified = true, native = false) {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: "google-uid",
      email: "Google@example.com",
      email_verified: emailVerified,
      firebase: { sign_in_provider: "google.com" },
      auth_time: Math.floor(Date.now() / 1000),
    });
    return new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      headers: native ? { Authorization: "Bearer google-token" } : { Origin: "http://localhost" },
      body: JSON.stringify({
        ...(!native && { google_id_token: "google-token" }),
        email: "ignorado@example.com",
        display_name: "Nuevo",
        business_name: "Negocio",
        date_of_birth: "1990-01-01",
      }),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockSql.mockReset();
    mockEnsureOrg.mockResolvedValue({ orgId: 1 });
  });

  it("crea la cuenta con el UID y correo verificados del token", async () => {
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 42 }]).mockResolvedValueOnce([]);

    const response = await POST(googleRequest());

    expect(response.status).toBe(201);
    expect(mockSql.mock.calls[1].slice(1)).toEqual(["google-uid", "google@example.com", "Nuevo"]);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockEnsureOrg).toHaveBeenCalledWith(42, "Negocio", expect.any(String), "HNL", expect.any(String), mockSql);
  });

  it("protege la cuenta existente con el mismo correo", async () => {
    mockSql.mockResolvedValueOnce([{ id: 5 }]);

    expect((await POST(googleRequest())).status).toBe(409);
    expect(writes()).toHaveLength(0);
    expect(mockEnsureOrg).not.toHaveBeenCalled();
  });

  it("acepta el token de Firebase como Bearer para el registro nativo", async () => {
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 42 }]).mockResolvedValueOnce([]);

    expect((await POST(googleRequest(true, true))).status).toBe(201);
    expect(mockVerifyIdToken).toHaveBeenCalledWith("google-token", true);
  });

  it("rechaza el registro con un correo sin verificar", async () => {
    expect((await POST(googleRequest(false))).status).toBe(401);
    expect(mockSql).not.toHaveBeenCalled();
  });
});
>>>>>>> Stashed changes
