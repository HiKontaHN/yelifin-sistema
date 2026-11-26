const mockSql = jest.fn();
const mockTx = jest.fn();

jest.mock("@neondatabase/serverless", () => ({ neon: () => mockSql }));
jest.mock("@/lib/db-transaction", () => ({
  withTransaction: (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
}));
jest.mock("@/lib/auth", () => ({
  verifyAuthAndSubscription: async () => ({ data: { orgId: 7, userId: 11 } }),
  isAuthSuccess: () => true,
  requireFeature: jest.fn(async () => null),
  requireModule: jest.fn(async () => null),
  createErrorResponse: (error: string, status: number) => Response.json({ error }, { status }),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET, PATCH } from "@/app/api/transaction-categories/route";
import { requireModule } from "@/lib/auth";

const url = "http://localhost/api/transaction-categories";
const reorder = (ids: number[]) => PATCH(new NextRequest(url, {
  method: "PATCH",
  body: JSON.stringify({ type: "EXPENSE", ids }),
}));
const query = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ").trim();

beforeEach(() => {
  mockSql.mockReset();
  mockTx.mockReset();
  jest.clearAllMocks();
});

it("guarda todas las categorías activas en la secuencia recibida y dentro de su negocio y tipo", async () => {
  mockTx.mockResolvedValueOnce([{ id: "2" }, { id: "5" }]).mockResolvedValueOnce([]);

  expect((await reorder([5, 2])).status).toBe(200);
  expect(query(mockTx.mock.calls[0])).toContain("WHERE org_id = ? AND type = ? AND is_active = TRUE ORDER BY id FOR UPDATE");
  expect(mockTx.mock.calls[0].slice(1)).toEqual([7, "EXPENSE"]);
  expect(query(mockTx.mock.calls[1])).toContain("FROM unnest(?::bigint[]) WITH ORDINALITY");
  expect(mockTx.mock.calls[1].slice(1)).toEqual([11, [5, 2], 7, "EXPENSE"]);
});

it("rechaza un orden obsoleto o con categorías de otra lista antes de modificar filas", async () => {
  mockTx.mockResolvedValueOnce([{ id: "2" }, { id: "5" }]);

  expect((await reorder([5, 9])).status).toBe(409);
  expect(mockTx).toHaveBeenCalledTimes(1);
});

it("rechaza IDs repetidos", async () => {
  expect((await reorder([2, 2])).status).toBe(400);
  expect(mockTx).not.toHaveBeenCalled();
});

it("exige permiso de edición para ordenar categorías", async () => {
  jest.mocked(requireModule).mockResolvedValueOnce(new NextResponse(null, { status: 403 }));

  expect((await reorder([2, 5])).status).toBe(403);
  expect(requireModule).toHaveBeenCalledWith(expect.anything(), "ADMIN", "canEdit", "CATEGORIES");
  expect(mockTx).not.toHaveBeenCalled();
});

it("usa el orden guardado para el listado sin paginar de los selectores", async () => {
  mockSql.mockResolvedValueOnce([{ count: 2 }]).mockReturnValueOnce({}).mockResolvedValueOnce([
    { id: 5, name: "Ventas", display_order: 1 },
    { id: 2, name: "Compras", display_order: 2 },
  ]);

  const response = await GET(new NextRequest(`${url}?type=EXPENSE`));
  expect(response.status).toBe(200);
  expect(query(mockSql.mock.calls[2])).toContain("ORDER BY type, display_order NULLS LAST, name, id");
  const body = await response.json();
  expect(body.data.map(({ id }: { id: number }) => id)).toEqual([5, 2]);
});
