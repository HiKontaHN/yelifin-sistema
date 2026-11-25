const mockSql = jest.fn();
const mockTx = jest.fn();

jest.mock("@neondatabase/serverless", () => ({ neon: () => mockSql }));
jest.mock("@/lib/db-transaction", () => ({
  withTransaction: (callback: (tx: typeof mockTx) => unknown) => callback(mockTx),
}));
jest.mock("@/lib/auth", () => ({
  verifyAuth: jest.fn(async () => ({ data: { orgId: 7, userId: 11, timezone: "America/Tegucigalpa" } })),
  isAuthSuccess: jest.fn(() => true),
  requireModule: jest.fn(async () => null),
  requireFeature: jest.fn(async () => null),
  createErrorResponse: (error: string, status: number) => Response.json({ error }, { status }),
}));

import { NextRequest, NextResponse } from "next/server";
import { DELETE as cancelReceivable } from "@/app/api/accounts-receivable/[id]/route";
import { GET as listReceivables } from "@/app/api/accounts-receivable/route";
import { POST as registerReceivablePayment } from "@/app/api/accounts-receivable/[id]/payments/route";
import { DELETE as cancelPayable } from "@/app/api/accounts-payable/[id]/route";
import { GET as listPayables } from "@/app/api/accounts-payable/route";
import { requireModule } from "@/lib/auth";
import { matchesAccountStatus, type AccountStatusFilter } from "@/lib/receivables-payables-status";

const routeParams = { params: Promise.resolve({ id: "42" }) };
const request = (type: "receivable" | "payable") =>
  new NextRequest(`http://localhost/api/accounts-${type}/42`, { method: "DELETE" });
const query = (call: unknown[]) => (call[0] as TemplateStringsArray).join("?").replace(/\s+/g, " ").trim();

beforeEach(() => {
  mockSql.mockReset();
  mockTx.mockReset();
  jest.clearAllMocks();
});

it("cancela una cuenta por cobrar vinculada a una transacción y conserva el historial", async () => {
  mockTx
    .mockResolvedValueOnce([{ status: "PARTIAL", source_type: "PERSONAL_LOAN", source_id: 90 }])
    .mockResolvedValueOnce([]);

  expect((await cancelReceivable(request("receivable"), routeParams)).status).toBe(200);
  expect(mockTx).toHaveBeenCalledTimes(2);
  expect(query(mockTx.mock.calls[0])).toContain("WHERE id = ? AND org_id = ? FOR UPDATE");
  expect(query(mockTx.mock.calls[1])).toBe("UPDATE accounts_receivable SET status = 'CANCELLED', updated_by = ?, updated_at = NOW() WHERE id = ? AND org_id = ?");
  expect(mockTx.mock.calls[1].slice(1)).toEqual([11, 42, 7]);
});

it("protege una cuenta vinculada a una venta activa", async () => {
  mockTx
    .mockResolvedValueOnce([{ status: "PENDING", source_type: "CREDIT_SALE", source_id: 90 }])
    .mockResolvedValueOnce([{ id: 90 }]);

  expect((await cancelReceivable(request("receivable"), routeParams)).status).toBe(409);
  expect(mockTx).toHaveBeenCalledTimes(2);
  expect(query(mockTx.mock.calls[1])).toContain("FROM sales WHERE id = ? AND org_id = ? AND status <> 'CANCELLED'");
});

it("permite cancelar una cuenta cuyo vínculo ya no apunta a una venta activa", async () => {
  mockTx
    .mockResolvedValueOnce([{ status: "PENDING", source_type: "INSTALLMENT_SALE", source_id: 90 }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);

  expect((await cancelReceivable(request("receivable"), routeParams)).status).toBe(200);
  expect(query(mockTx.mock.calls[2])).toContain("UPDATE accounts_receivable SET status = 'CANCELLED'");
});

it("impide nuevos cobros para una cuenta cancelada", async () => {
  mockTx
    .mockResolvedValueOnce([{ status: "CANCELLED", outstanding_amount: 100 }])
    .mockResolvedValueOnce([{ id: 10, is_active: true }]);
  const payment = new NextRequest("http://localhost/api/accounts-receivable/42/payments", {
    method: "POST",
    body: JSON.stringify({ account_id: 10, amount: 10, payment_date: "2026-11-25" }),
  });

  const response = await registerReceivablePayment(payment, routeParams);
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "La cuenta por cobrar está cancelada" });
  expect(mockTx).toHaveBeenCalledTimes(2);
});

it.each([
  { type: "receivable", alias: "ar", list: listReceivables },
  { type: "payable", alias: "ap", list: listPayables },
])("incluye cuentas canceladas de tipo $type solo si se solicitan", async ({ type, alias, list }) => {
  mockSql.mockResolvedValueOnce([]);
  mockSql.mockResolvedValueOnce([]);

  const url = `http://localhost/api/accounts-${type}`;
  expect((await list(new NextRequest(url)))?.status).toBe(200);
  expect((await list(new NextRequest(`${url}?include_cancelled=true`)))?.status).toBe(200);
  expect(query(mockSql.mock.calls[0])).toContain(`WHERE ${alias}.org_id = ? AND (? OR ${alias}.status <> 'CANCELLED')`);
  expect(mockSql.mock.calls[0]?.slice(1, 3)).toEqual([7, false]);
  expect(mockSql.mock.calls[1]?.slice(1, 3)).toEqual([7, true]);
});

it("desactiva el abono automático cuando cancela una cuenta por pagar", async () => {
  mockSql.mockResolvedValueOnce([{ id: 42 }]);

  expect((await cancelPayable(request("payable"), routeParams)).status).toBe(200);
  expect(mockSql).toHaveBeenCalledTimes(1);
  expect(query(mockSql.mock.calls[0])).toContain("UPDATE accounts_payable SET status = 'CANCELLED', auto_payment_enabled = FALSE, auto_payment_next_date = NULL");
  expect(mockSql.mock.calls[0]?.slice(1)).toEqual([11, 42, 7]);
});

it("exige permiso de eliminación en ambas rutas", async () => {
  jest.mocked(requireModule).mockResolvedValueOnce(new NextResponse(null, { status: 403 }));
  jest.mocked(requireModule).mockResolvedValueOnce(new NextResponse(null, { status: 403 }));

  expect((await cancelReceivable(request("receivable"), routeParams)).status).toBe(403);
  expect((await cancelPayable(request("payable"), routeParams)).status).toBe(403);
  expect(requireModule).toHaveBeenCalledWith(expect.anything(), "FINANCES", "canDelete", "ACCOUNTS");
  expect(mockTx).not.toHaveBeenCalled();
  expect(mockSql).not.toHaveBeenCalled();
});

const statuses = ["PENDING", "PARTIAL", "OVERDUE", "PAID", "CANCELLED"];
it.each<[AccountStatusFilter, string[]]>([
  ["pending", ["PENDING", "PARTIAL", "OVERDUE"]],
  ["completed", ["PAID"]],
  ["cancelled", ["CANCELLED"]],
  ["all", statuses],
])("muestra los estados correctos para el filtro %s", (filter, expected) => {
  expect(statuses.filter((status) => matchesAccountStatus(status, filter))).toEqual(expected);
});
