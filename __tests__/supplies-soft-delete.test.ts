const mockSql = jest.fn();

jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSql),
}));

jest.mock("@/lib/auth", () => ({
  verifyAuth: jest.fn(async () => ({
    error: null,
    status: 200,
    data: { userId: 11, orgId: 7 },
  })),
  isAuthSuccess: jest.fn(() => true),
  requireModule: jest.fn(async () => null),
  verifyResourceLimit: jest.fn(async () => ({ withinLimit: true })),
  createErrorResponse: jest.fn((message: string, status: number) =>
    Response.json({ error: message }, { status }),
  ),
}));

import { NextRequest } from "next/server";
import { DELETE } from "@/app/api/supplies/[id]/route";
import { GET } from "@/app/api/supplies/route";

function queryText(call: unknown[]) {
  return (call[0] as TemplateStringsArray).join(" ").replace(/\s+/g, " ").trim();
}

function deleteRequest() {
  return new NextRequest("http://localhost/api/supplies/42", { method: "DELETE" });
}

const routeParams = { params: Promise.resolve({ id: "42" }) };

describe("soft delete de suministros", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("desactiva el suministro cuando ya fue utilizado", async () => {
    mockSql
      .mockResolvedValueOnce([{ is_used: true }])
      .mockResolvedValueOnce([{ id: 42 }]);

    const response = await DELETE(deleteRequest(), routeParams);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: "Suministro eliminado" });
    const statements = mockSql.mock.calls.map(queryText);
    expect(statements[0]).toContain("FROM sale_supplies");
    expect(statements[0]).toContain("FROM supply_purchase_items");
    expect(statements[0]).toContain("FROM supply_movements");
    expect(statements[1]).toContain("UPDATE supplies SET is_active = FALSE, updated_by =");
    expect(statements[1]).toContain("AND is_active = TRUE RETURNING id");
  });

  it("borra físicamente el suministro cuando nunca fue utilizado", async () => {
    mockSql
      .mockResolvedValueOnce([{ is_used: false }])
      .mockResolvedValueOnce([{ id: 42 }]);

    const response = await DELETE(deleteRequest(), routeParams);

    expect(response.status).toBe(200);
    expect(queryText(mockSql.mock.calls[1])).toContain(
      "DELETE FROM supplies WHERE id = AND org_id = AND is_active = TRUE RETURNING id",
    );
  });

  it("responde 404 si el suministro ya no está activo o no existe", async () => {
    mockSql
      .mockResolvedValueOnce([{ is_used: true }])
      .mockResolvedValueOnce([]);

    const response = await DELETE(deleteRequest(), routeParams);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Suministro no encontrado" });
  });

  it("filtra los inactivos en el conteo y en el listado", async () => {
    mockSql
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ id: 1, name: "Caja" }]);

    const response = await GET(new NextRequest("http://localhost/api/supplies"));

    expect(response.status).toBe(200);
    const statements = mockSql.mock.calls.map(queryText);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("WHERE org_id = AND is_active = TRUE");
    expect(statements[1]).toContain("WHERE org_id = AND is_active = TRUE");
  });
});
