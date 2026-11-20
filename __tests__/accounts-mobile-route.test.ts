import { NextRequest } from "next/server";

const mockSql = jest.fn();
const mockAuth = jest.fn();
const mockRequireFeature = jest.fn();
const mockCanList = jest.fn();
const mockPermissions = jest.fn();
const mockRequireModule = jest.fn();
const mockResourceLimit = jest.fn();

jest.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

jest.mock("@/lib/auth", () => ({
  verifyAuthAndSubscription: (...args: unknown[]) => mockAuth(...args),
  isAuthSuccess: (result: { error: string | null }) => !result.error,
  requireFeature: (...args: unknown[]) => mockRequireFeature(...args),
  verifyAnyModuleAccess: (...args: unknown[]) => mockCanList(...args),
  getModulePermissions: (...args: unknown[]) => mockPermissions(...args),
  requireModule: (...args: unknown[]) => mockRequireModule(...args),
  verifyResourceLimit: (...args: unknown[]) => mockResourceLimit(...args),
  createErrorResponse: (error: string, status: number) => Response.json({ error }, { status }),
}));

import { GET, POST } from "@/app/api/accounts/route";
import { PATCH, DELETE } from "@/app/api/accounts/[id]/route";

const account = { id: 2, name: "Caja", balance: 1000, type: "CASH", is_active: true };
const authData = { orgId: 7 };
const endpoint = "http://localhost/api/accounts";
const mobile = (path = "", init: { method?: string; body?: string } = {}) => new NextRequest(endpoint + path, {
  ...init, headers: { authorization: "Bearer mobile-token" },
});

beforeEach(() => {
  jest.resetAllMocks();
  mockSql.mockResolvedValue([account]);
  mockAuth.mockResolvedValue({ error: null, data: authData });
  mockRequireFeature.mockResolvedValue(null);
  mockCanList.mockResolvedValue(true);
  mockPermissions.mockResolvedValue({ canView: true });
  mockRequireModule.mockResolvedValue(null);
  mockResourceLimit.mockResolvedValue({ withinLimit: true });
});

it("limits authenticated mobile reads to active account names and IDs", async () => {
  const request = mobile();
  const response = await GET(request);

  expect(mockAuth).toHaveBeenCalledWith(request, { allowMobileRead: true });
  expect(mockRequireFeature).toHaveBeenCalledWith(7, "finances.accounts");
  expect(mockCanList).toHaveBeenCalledWith(authData, expect.arrayContaining(["SALES"]), "canView");
  expect(mockSql.mock.calls[0][0].join(" ")).toMatch(/org_id =\s+AND is_active = TRUE/);
  expect(mockSql.mock.calls[0][1]).toBe(7);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: [{ id: 2, name: "Caja" }], total: 1 });
});

it("denies mobile accounts when the user lacks module access", async () => {
  mockCanList.mockResolvedValue(false);
  expect((await GET(mobile())).status).toBe(403);
  expect(mockSql).not.toHaveBeenCalled();
});

it("preserves the full web response for an authorized finance session", async () => {
  const request = new NextRequest(endpoint, { headers: { cookie: "hikonta_auth=web-session" } });
  expect(await (await GET(request)).json()).toEqual({ data: [account], total: 1 });
});

it("blocks an invalid bearer token before writing an account", async () => {
  mockAuth.mockResolvedValue({ error: "No autorizado", status: 401 });
  const request = mobile("", { method: "POST" });
  expect((await POST(request)).status).toBe(401);
  expect(mockAuth).toHaveBeenCalledWith(request, { mobileWriteMethod: "POST" });
  expect(mockSql).not.toHaveBeenCalled();
});

it("requires the Accounts permission before returning balances to a mobile session", async () => {
  mockRequireModule.mockResolvedValueOnce(Response.json({ error: "Sin acceso" }, { status: 403 }));
  expect((await GET(mobile("?details=true"))).status).toBe(403);
  expect(mockSql).not.toHaveBeenCalled();

  const response = await GET(mobile("?details=true"));
  expect(mockRequireModule).toHaveBeenCalledWith(authData, "FINANCES", "canView", "ACCOUNTS");
  expect(await response.json()).toEqual({ data: [account], total: 1 });
});

it("uses the existing account creation limit for mobile writes", async () => {
  mockResourceLimit.mockResolvedValueOnce({ withinLimit: false, status: 403, error: "Límite alcanzado" });
  const request = mobile("", { method: "POST", body: JSON.stringify({ name: "Caja", type: "CASH" }) });
  expect((await POST(request)).status).toBe(403);
  expect(mockRequireModule).toHaveBeenCalledWith(authData, "FINANCES", "canEdit");
  expect(mockResourceLimit).toHaveBeenCalledWith(7, "accounts");
  expect(mockSql).not.toHaveBeenCalled();
});

it.each([
  ["PATCH", "canEdit", PATCH],
  ["DELETE", "canDelete", DELETE],
] as const)("requires %s permission before changing an account over mobile", async (method, permission, handler) => {
  mockRequireModule.mockResolvedValueOnce(Response.json({ error: "Sin acceso" }, { status: 403 }));
  const request = mobile("/2", { method });
  expect((await handler(request, { params: Promise.resolve({ id: "2" }) })).status).toBe(403);
  expect(mockAuth).toHaveBeenCalledWith(request, { mobileWriteMethod: method });
  expect(mockRequireModule).toHaveBeenCalledWith(authData, "FINANCES", permission);
  expect(mockSql).not.toHaveBeenCalled();
});
