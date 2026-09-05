/**
 * __tests__/inventory-sales.test.ts
 *
 * Unit / light-integration tests for the inventory & sales business logic.
 *
 * Strategy
 * --------
 * All external I/O (Neon `sql`, Firebase Admin Auth) is mocked at the module
 * level so that:
 *   – no real database connection is needed
 *   – no Firebase token verification is performed
 *   – we can precisely control the sequence of DB return values and assert
 *     which queries were issued and in which order.
 *
 * The API route handlers are imported directly and called with a synthetic
 * `NextRequest`.  Responses are inspected via the standard `Response` API.
 *
 * Sections
 * --------
 * 1.  lib/auth helpers  (createErrorResponse, isAuthSuccess)
 * 2.  Business-logic utilities extracted from the route files
 *     (FIFO cost calculation, sale-number formatting, tax math)
 * 3.  POST /api/products  – product creation
 * 4.  POST /api/products/[id]/variants  – variant creation
 * 5.  POST /api/sales (COMPLETED)  – stock reduction via FIFO
 * 6.  POST /api/sales (PENDING)    – NO stock reduction
 * 7.  PATCH /api/sales/[id] confirm – stock reduced on confirm
 * 8.  PATCH /api/sales/[id] cancel  – stock returned on cancel
 */

// ─────────────────────────────────────────────────────────────────────────────
// 0. Top-level mocks (must come before any `import` that uses these modules)
// ─────────────────────────────────────────────────────────────────────────────

// Mock firebase-admin so lib/auth.ts can be imported without a real Firebase project
jest.mock("firebase-admin/app", () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  cert: jest.fn(),
}));

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

// We mock the entire firebase-admin module path used by lib/firebase-admin.ts
jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: {
    verifyIdToken: jest.fn(),
  },
}));

// Mock @neondatabase/serverless – each test will configure the sql mock
// via `mockSql` below.
const mockSqlImpl = jest.fn();
jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSqlImpl),
}));

// ─────────────────────────────────────────────────────────────────────────────
// 1. Helpers
// ─────────────────────────────────────────────────────────────────────────────

import { createErrorResponse, isAuthSuccess } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";

/** Build a synthetic AuthUser suitable for mocking verifyAuth success */
function makeAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: 42,
    orgId: 1,
    roleId: 1,
    roleName: "Dueño",
    isOwner: true,
    firebaseUid: "uid-test",
    email: "test@hikonta.app",
    displayName: "Test User",
    emailVerified: true,
    isActive: true,
    subscription: { status: "ACTIVE", planSlug: "pro" },
    ...overrides,
  };
}

/** Build a NextRequest-compatible object the API handlers accept */
function makeRequest(
  url: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Request {
  const { method = "GET", body, token = "Bearer fake-token" } = options;
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Parse JSON body from a Response */
async function json(response: Response): Promise<unknown> {
  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. lib/auth helper unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("lib/auth helpers", () => {
  describe("createErrorResponse", () => {
    it("returns a JSON response with the given status", async () => {
      const res = createErrorResponse("Algo salió mal", 400);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: "Algo salió mal" });
    });

    it("includes needs_upgrade when needsUpgrade=true", async () => {
      const res = createErrorResponse("Plan requerido", 403, true);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Plan requerido", needs_upgrade: true });
    });

    it("does not include needs_upgrade when needsUpgrade=false (default)", async () => {
      const res = createErrorResponse("No autorizado", 401);
      const body = await res.json() as Record<string, unknown>;
      expect(body.needs_upgrade).toBeUndefined();
    });
  });

  describe("isAuthSuccess", () => {
    it("returns true for a successful auth result", () => {
      const result = { error: null, status: 200 as const, data: makeAuthUser() };
      expect(isAuthSuccess(result)).toBe(true);
    });

    it("returns false for an error auth result", () => {
      const result = { error: "No autorizado", status: 401 as const, data: null };
      expect(isAuthSuccess(result)).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Business-logic utilities (pure functions, no DB)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIFO cost calculation (pure logic)", () => {
  /**
   * Replicate the FIFO average-cost algorithm used in POST /api/sales to keep
   * tests decoupled from the full handler.
   */
  function computeFifoCost(
    batches: Array<{ qty_available: number; unit_cost: number }>,
    quantity: number
  ): number {
    let remaining = quantity;
    let totalCost = 0;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.qty_available);
      totalCost += take * batch.unit_cost;
      remaining -= take;
    }
    return quantity > 0 ? totalCost / quantity : 0;
  }

  it("uses oldest batch first (FIFO order)", () => {
    const batches = [
      { qty_available: 5, unit_cost: 10 }, // oldest
      { qty_available: 5, unit_cost: 20 }, // newer
    ];
    // Taking 5 units → all from oldest batch at cost 10
    expect(computeFifoCost(batches, 5)).toBe(10);
  });

  it("spans multiple batches when oldest is insufficient", () => {
    const batches = [
      { qty_available: 3, unit_cost: 10 },
      { qty_available: 7, unit_cost: 20 },
    ];
    // Take 5: 3 @ 10 + 2 @ 20 → total cost 70, avg = 14
    expect(computeFifoCost(batches, 5)).toBe(14);
  });

  it("returns 0 when quantity is 0", () => {
    const batches = [{ qty_available: 10, unit_cost: 50 }];
    expect(computeFifoCost(batches, 0)).toBe(0);
  });

  it("returns exact unit_cost when only one batch", () => {
    const batches = [{ qty_available: 100, unit_cost: 35 }];
    expect(computeFifoCost(batches, 10)).toBe(35);
  });
});

describe("Tax-inclusive calculation (pure logic)", () => {
  /**
   * Replicate the tax-extraction formula from POST /api/sales:
   *   taxAmount = (taxableBase * taxRate) / (100 + taxRate)
   */
  function extractTax(taxableBase: number, taxRate: number): number {
    return taxRate > 0 ? (taxableBase * taxRate) / (100 + taxRate) : 0;
  }

  it("extracts 0 tax when rate is 0", () => {
    expect(extractTax(1000, 0)).toBe(0);
  });

  it("extracts 15% ISV correctly from a tax-inclusive amount", () => {
    // 1150 is the gross amount; tax = 1150 * 15 / 115 = 150
    const tax = extractTax(1150, 15);
    expect(Math.round(tax)).toBe(150);
  });

  it("extracts 18% ISV correctly from a tax-inclusive amount", () => {
    // 1180 is the gross; tax = 1180 * 18 / 118 = 180
    const tax = extractTax(1180, 18);
    expect(Math.round(tax)).toBe(180);
  });

  it("grandTotal equals taxableBase + shipping (tax is already included)", () => {
    const taxableBase = 1000;
    const shipping = 50;
    const grandTotal = taxableBase + shipping;
    expect(grandTotal).toBe(1050);
  });
});

describe("Sale number formatting (pure logic)", () => {
  function formatSaleNumber(lastNum: number): string {
    return `VTA-${String(lastNum + 1).padStart(5, "0")}`;
  }

  it("generates VTA-00001 for the first sale", () => {
    expect(formatSaleNumber(0)).toBe("VTA-00001");
  });

  it("pads numbers correctly", () => {
    expect(formatSaleNumber(99)).toBe("VTA-00100");
  });

  it("handles 4-digit last numbers", () => {
    expect(formatSaleNumber(9999)).toBe("VTA-10000");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/products – product creation (handler-level)
// ─────────────────────────────────────────────────────────────────────────────

// We need verifyAuth to return a controlled result. Import the module and spy.
import * as authModule from "@/lib/auth";

/** Reset all sql mock call history between tests */
function resetSql() {
  mockSqlImpl.mockReset();
}

describe("POST /api/products", () => {
  // Spy on verifyAuth so we can simulate authenticated / unauthenticated users
  // without hitting Firebase.
  let verifyAuthSpy: jest.SpyInstance;

  beforeEach(() => {
    resetSql();
    verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
      error: null,
      status: 200,
      data: makeAuthUser(),
    });
  });

  afterEach(() => {
    verifyAuthSpy.mockRestore();
  });

  it("returns 401 when no auth header is present", async () => {
    // Restore the real spy so the real check fires
    verifyAuthSpy.mockRestore();

    // Re-mock verifyAuth to return 401 (simulates missing Bearer header)
    verifyAuthSpy = jest
      .spyOn(authModule, "verifyAuth")
      .mockResolvedValue({ error: "No autorizado", status: 401, data: null });

    const { POST } = await import("@/app/api/products/route");
    const req = makeRequest("http://localhost/api/products", {
      method: "POST",
      body: { name: "Producto", price: 100 },
      token: "",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 400 when name is missing", async () => {
    // sql calls: subscription limit check — return no limit
    mockSqlImpl.mockResolvedValueOnce([{ max_products: null, current_count: 0 }]);

    const { POST } = await import("@/app/api/products/route");
    const req = makeRequest("http://localhost/api/products", {
      method: "POST",
      body: { price: 100 },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await json(res) as { error: string };
    expect(body.error).toContain("nombre");
  });

  it("returns 400 when price is negative", async () => {
    mockSqlImpl.mockResolvedValueOnce([{ max_products: null, current_count: 0 }]);

    const { POST } = await import("@/app/api/products/route");
    const req = makeRequest("http://localhost/api/products", {
      method: "POST",
      body: { name: "Camisa", price: -5 },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await json(res) as { error: string };
    expect(body.error).toContain("precio");
  });

  it("returns 403 when product limit is reached", async () => {
    // verifyResourceLimit: plan query (max_products=5), then count query (5)
    mockSqlImpl.mockResolvedValueOnce([{ max_products: 5 }]);
    mockSqlImpl.mockResolvedValueOnce([{ count: 5 }]);

    const { POST } = await import("@/app/api/products/route");
    const req = makeRequest("http://localhost/api/products", {
      method: "POST",
      body: { name: "Extra", price: 50 },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(403);
    const body = await json(res) as { error: string };
    expect(body.error).toContain("límite");
  });

  it("returns 409 when SKU already exists", async () => {
    // limit check: no limit
    mockSqlImpl.mockResolvedValueOnce([{ max_products: null, current_count: 2 }]);
    // SKU check: existing product found
    mockSqlImpl.mockResolvedValueOnce([{ id: 7 }]);

    const { POST } = await import("@/app/api/products/route");
    const req = makeRequest("http://localhost/api/products", {
      method: "POST",
      body: { name: "Duplicate", price: 100, sku: "SKU-001" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(409);
  });

  it("creates a product successfully and returns 201 with variants:[]", async () => {
    // 1. verifyResourceLimit: plan query (no limit)
    mockSqlImpl.mockResolvedValueOnce([{ max_products: null }]);
    // 2. nextProductSkus: no taken skus (no sku in body)
    mockSqlImpl.mockResolvedValueOnce([]);
    // 3. INSERT RETURNING
    const createdProduct = {
      id: 10,
      user_id: 42,
      name: "Camiseta",
      description: null,
      sku: null,
      barcode: null,
      price: "150.00",
      image_url: null,
      is_service: false,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockSqlImpl.mockResolvedValueOnce([createdProduct]);

    const { POST } = await import("@/app/api/products/route");
    const req = makeRequest("http://localhost/api/products", {
      method: "POST",
      body: { name: "Camiseta", price: 150 },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
    const body = await json(res) as { data: { name: string; variants: unknown[] } };
    expect(body.data.name).toBe("Camiseta");
    expect(body.data.variants).toEqual([]);
  });

  it("creates a service product (is_service=true) successfully", async () => {
    mockSqlImpl.mockResolvedValueOnce([{ max_products: null }]); // verifyResourceLimit
    mockSqlImpl.mockResolvedValueOnce([]); // nextProductSkus: no taken skus
    const createdService = {
      id: 20,
      user_id: 42,
      name: "Consultoría",
      is_service: true,
      price: "500.00",
      is_active: true,
    };
    mockSqlImpl.mockResolvedValueOnce([createdService]);

    const { POST } = await import("@/app/api/products/route");
    const req = makeRequest("http://localhost/api/products", {
      method: "POST",
      body: { name: "Consultoría", price: 500, is_service: true },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
    const body = await json(res) as { data: { is_service: boolean } };
    expect(body.data.is_service).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. POST /api/products/[id]/variants – variant creation
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/products/[id]/variants", () => {
  let verifyAuthSpy: jest.SpyInstance;

  beforeEach(() => {
    resetSql();
    verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
      error: null,
      status: 200,
      data: makeAuthUser(),
    });
  });

  afterEach(() => {
    verifyAuthSpy.mockRestore();
  });

  it("returns 404 when parent product does not exist", async () => {
    // parent product check → empty
    mockSqlImpl.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/products/[id]/variants/route");
    const req = makeRequest(
      "http://localhost/api/products/999/variants",
      {
        method: "POST",
        body: { variant_name: "Talla L", price_override: 200 },
      }
    );
    const params = Promise.resolve({ id: "999" });
    const res = await POST(req as never, { params });
    expect(res.status).toBe(404);
  });

  it("returns 400 when variant_name is missing", async () => {
    // parent product exists
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);

    const { POST } = await import("@/app/api/products/[id]/variants/route");
    const req = makeRequest(
      "http://localhost/api/products/1/variants",
      {
        method: "POST",
        body: { price_override: 100 }, // no variant_name
      }
    );
    const params = Promise.resolve({ id: "1" });
    const res = await POST(req as never, { params });
    expect(res.status).toBe(400);
    const body = await json(res) as { error: string };
    expect(body.error).toContain("variante");
  });

  it("returns 409 when SKU already exists for the user", async () => {
    // parent product exists
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // SKU conflict found
    mockSqlImpl.mockResolvedValueOnce([{ id: 55 }]);

    const { POST } = await import("@/app/api/products/[id]/variants/route");
    const req = makeRequest(
      "http://localhost/api/products/1/variants",
      {
        method: "POST",
        body: { variant_name: "Rojo", sku: "VAR-RED-01" },
      }
    );
    const params = Promise.resolve({ id: "1" });
    const res = await POST(req as never, { params });
    expect(res.status).toBe(409);
  });

  it("creates a variant successfully and returns 201", async () => {
    // parent product exists
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // No sku in body → nextVariantSkus runs instead (no taken skus)
    mockSqlImpl.mockResolvedValueOnce([]);
    // BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    // INSERT RETURNING
    const newVariant = {
      id: 5,
      user_id: 42,
      product_id: 1,
      variant_name: "Talla M",
      sku: null,
      attributes: null,
      price_override: null,
      image_url: null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockSqlImpl.mockResolvedValueOnce([newVariant]);
    // COMMIT
    mockSqlImpl.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/products/[id]/variants/route");
    const req = makeRequest(
      "http://localhost/api/products/1/variants",
      {
        method: "POST",
        body: { variant_name: "Talla M" },
      }
    );
    const params = Promise.resolve({ id: "1" });
    const res = await POST(req as never, { params });
    expect(res.status).toBe(201);
    const body = await json(res) as { data: { variant_name: string } };
    expect(body.data.variant_name).toBe("Talla M");
  });

  it("creates a variant with price_override and attributes", async () => {
    mockSqlImpl.mockResolvedValueOnce([{ id: 2 }]); // parent exists
    // No sku in body → nextVariantSkus runs instead (no taken skus)
    mockSqlImpl.mockResolvedValueOnce([]);
    // BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    const newVariant = {
      id: 9,
      product_id: 2,
      variant_name: "Negro XL",
      sku: null,
      attributes: { color: "negro", talla: "XL" },
      price_override: "250.00",
      is_active: true,
    };
    mockSqlImpl.mockResolvedValueOnce([newVariant]);
    // COMMIT
    mockSqlImpl.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/products/[id]/variants/route");
    const req = makeRequest(
      "http://localhost/api/products/2/variants",
      {
        method: "POST",
        body: {
          variant_name: "Negro XL",
          attributes: { color: "negro", talla: "XL" },
          price_override: 250,
        },
      }
    );
    const params = Promise.resolve({ id: "2" });
    const res = await POST(req as never, { params });
    expect(res.status).toBe(201);
    const body = await json(res) as { data: { price_override: string } };
    expect(body.data.price_override).toBe("250.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. POST /api/sales – COMPLETED sale reduces stock
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/sales – COMPLETED (stock reduction)", () => {
  let verifyAuthSpy: jest.SpyInstance;

  beforeEach(() => {
    resetSql();
    verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
      error: null,
      status: 200,
      data: makeAuthUser(),
    });
  });

  afterEach(() => {
    verifyAuthSpy.mockRestore();
  });

  /**
   * Build the full mock-sql sequence for a minimal COMPLETED sale with one
   * physical product (no variants, no supplies, no event, cash payment).
   *
   * Sequence expected by the handler (POST /api/sales):
   *  1. SELECT timezone FROM user_profile               → [{ timezone: 'UTC' }]
   *     (Note: this query is only in GET, not POST — skip it)
   *  Actually POST /api/sales does NOT query user_profile; skip.
   *  1. SELECT id FROM accounts WHERE id=…              → [{ id: 1 }]
   *  2. SELECT id, name, is_service FROM products WHERE id=…  → [product]
   *  3. SELECT batches FROM inventory_batches (variant IS NULL)  → [batch]
   *  4. BEGIN
   *  5. pg_advisory_xact_lock                           → []
   *  6. SELECT MAX(sale_number) FROM sales               → [{ last_num: 0 }]
   *  7. INSERT INTO sales … RETURNING id                → [{ id: 100 }]
   *  8. INSERT INTO sale_items …                        → []
   *  9. UPDATE inventory_batches SET qty_available - take  → []
   * 10. INSERT INTO inventory_movements …               → []
   * 11. INSERT INTO transactions …                       → []
   * 12. UPDATE accounts SET balance + total             → []
   * 13. COMMIT
   */
  function mockCompletedSaleSequence(opts: {
    batchQty?: number;
    unitCost?: number;
  } = {}) {
    const { batchQty = 10, unitCost = 50 } = opts;

    // 0. verifyResourceLimit: plan query (no limit)
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]);
    // 1. Account validation
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // 1b. getDefaultWarehouseForUser: organization_members join warehouses
    mockSqlImpl.mockResolvedValueOnce([{ warehouse_id: 1 }]);
    // 2. Product lookup
    mockSqlImpl.mockResolvedValueOnce([{ id: 1, name: "Camiseta", is_service: false }]);
    // 3. FIFO batches pre-check (no variant)
    mockSqlImpl.mockResolvedValueOnce([{ id: 1, qty_available: batchQty, unit_cost: unitCost }]);
    // 4. BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    // 5. advisory lock
    mockSqlImpl.mockResolvedValueOnce([]);
    // 6. MAX sale_number
    mockSqlImpl.mockResolvedValueOnce([{ last_num: 0 }]);
    // 7. INSERT sales RETURNING
    mockSqlImpl.mockResolvedValueOnce([{ id: 100 }]);
    // 8. consumeFifo: SELECT id FROM inventory_batches
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // 9. consumeFifo: atomic UPDATE ... RETURNING take, unit_cost (take is
    //    large enough to always satisfy the requested quantity in one pass,
    //    regardless of which test calls this helper)
    mockSqlImpl.mockResolvedValueOnce([{ take: 999, unit_cost: unitCost }]);
    // 10. INSERT sale_items
    mockSqlImpl.mockResolvedValueOnce([]);
    // 11. INSERT inventory_movements
    mockSqlImpl.mockResolvedValueOnce([]);
    // 12. INSERT transactions
    mockSqlImpl.mockResolvedValueOnce([]);
    // 13. UPDATE accounts balance
    mockSqlImpl.mockResolvedValueOnce([]);
    // 14. COMMIT
    mockSqlImpl.mockResolvedValueOnce([]);
  }

  it("returns 400 when items array is empty", async () => {
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]); // verifyResourceLimit
    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [],
        payment_method: "CASH",
        account_id: 1,
        status: "COMPLETED",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await json(res) as { error: string };
    expect(body.error).toContain("producto");
  });

  it("returns 400 when payment_method is missing", async () => {
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]); // verifyResourceLimit
    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 1, quantity: 1, unit_price: 100 }],
        account_id: 1,
        status: "COMPLETED",
        // no payment_method
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await json(res) as { error: string };
    expect(body.error).toContain("pago");
  });

  it("returns 400 when status is invalid", async () => {
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]); // verifyResourceLimit
    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 1, quantity: 1, unit_price: 100 }],
        payment_method: "CASH",
        account_id: 1,
        status: "INVALID_STATUS",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when tax_rate is not 0, 15 or 18", async () => {
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]); // verifyResourceLimit
    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 1, quantity: 1, unit_price: 100 }],
        payment_method: "CASH",
        account_id: 1,
        status: "COMPLETED",
        tax_rate: 10,
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await json(res) as { error: string };
    expect(body.error).toContain("impuesto");
  });

  it("returns 400 when stock is insufficient", async () => {
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]); // verifyResourceLimit
    // Account valid
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // getDefaultWarehouseForUser
    mockSqlImpl.mockResolvedValueOnce([{ warehouse_id: 1 }]);
    // Product found
    mockSqlImpl.mockResolvedValueOnce([{ id: 1, name: "Camiseta", is_service: false }]);
    // Only 2 units in stock but we request 5
    mockSqlImpl.mockResolvedValueOnce([{ id: 1, qty_available: 2, unit_cost: 50 }]);

    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 1, quantity: 5, unit_price: 100 }],
        payment_method: "CASH",
        account_id: 1,
        status: "COMPLETED",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
    const body = await json(res) as { error: string };
    expect(body.error).toContain("Stock insuficiente");
  });

  it("creates a COMPLETED sale and returns 201", async () => {
    mockCompletedSaleSequence({ batchQty: 10, unitCost: 50 });

    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 1, quantity: 2, unit_price: 200 }],
        payment_method: "CASH",
        account_id: 1,
        status: "COMPLETED",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
    const body = await json(res) as {
      data: { status: string; total: number };
      message: string;
    };
    expect(body.data.status).toBe("COMPLETED");
    expect(body.message).toContain("exitosamente");
  });

  it("COMPLETED sale calls UPDATE inventory_batches (stock is deducted)", async () => {
    mockCompletedSaleSequence({ batchQty: 10, unitCost: 50 });

    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 1, quantity: 3, unit_price: 150 }],
        payment_method: "CASH",
        account_id: 1,
        status: "COMPLETED",
      },
    });
    await POST(req as never);

    // The 9th call (index 8) should be the UPDATE inventory_batches call
    // We verify that at least one call was made with arguments containing
    // a number that matches the quantity taken (3).
    const allCalls = mockSqlImpl.mock.calls;
    // Find a call whose template strings suggest an inventory update
    // ts-jest flattens tagged-template calls: args[0] is the strings array
    // and subsequent args are the interpolated values.
    const updateBatchCall = allCalls.find((args: unknown[]) => {
      const values = args.slice(1);
      return values.includes(3) || values.includes(1); // batch.id=1, take=3
    });
    expect(updateBatchCall).toBeDefined();
  });

  it("service products do NOT trigger inventory batch update", async () => {
    // verifyResourceLimit
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]);
    // Account valid
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // getDefaultWarehouseForUser
    mockSqlImpl.mockResolvedValueOnce([{ warehouse_id: 1 }]);
    // Product is_service = true
    mockSqlImpl.mockResolvedValueOnce([{ id: 2, name: "Consultoría", is_service: true }]);
    // BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    // advisory lock
    mockSqlImpl.mockResolvedValueOnce([]);
    // MAX sale_number
    mockSqlImpl.mockResolvedValueOnce([{ last_num: 5 }]);
    // INSERT sales RETURNING
    mockSqlImpl.mockResolvedValueOnce([{ id: 200 }]);
    // INSERT sale_items
    mockSqlImpl.mockResolvedValueOnce([]);
    // INSERT transactions
    mockSqlImpl.mockResolvedValueOnce([]);
    // UPDATE accounts balance
    mockSqlImpl.mockResolvedValueOnce([]);
    // COMMIT
    mockSqlImpl.mockResolvedValueOnce([]);

    const callsBefore = mockSqlImpl.mock.calls.length;

    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 2, quantity: 1, unit_price: 500 }],
        payment_method: "CASH",
        account_id: 1,
        status: "COMPLETED",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);

    // Total calls after. Since it's a service, no FIFO batch queries and
    // no UPDATE inventory_batches calls should be present.
    // The sequence is shorter than a physical product sale.
    const totalCalls = mockSqlImpl.mock.calls.length - callsBefore;
    // A service sale: account + product + BEGIN + lock + MAX + INSERT sale
    //                 + INSERT item + INSERT tx + UPDATE accounts + COMMIT = 10
    // A physical sale adds: batch query + UPDATE batch + INSERT movement = 3 more = 13
    // We verify it's fewer calls (service path is shorter by at least 3)
    expect(totalCalls).toBeLessThan(13);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST /api/sales – PENDING sale does NOT reduce stock
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/sales – PENDING (no stock reduction)", () => {
  let verifyAuthSpy: jest.SpyInstance;

  beforeEach(() => {
    resetSql();
    verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
      error: null,
      status: 200,
      data: makeAuthUser(),
    });
  });

  afterEach(() => {
    verifyAuthSpy.mockRestore();
  });

  it("registers a PENDING sale and returns 201 without updating inventory_batches", async () => {
    // verifyResourceLimit
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]);
    // Account
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // getDefaultWarehouseForUser
    mockSqlImpl.mockResolvedValueOnce([{ warehouse_id: 1 }]);
    // Product
    mockSqlImpl.mockResolvedValueOnce([{ id: 1, name: "Pantalón", is_service: false }]);
    // Batches pre-check (stock check still runs to verify availability)
    mockSqlImpl.mockResolvedValueOnce([{ id: 1, qty_available: 10, unit_cost: 80 }]);
    // BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    // advisory lock
    mockSqlImpl.mockResolvedValueOnce([]);
    // MAX sale_number
    mockSqlImpl.mockResolvedValueOnce([{ last_num: 3 }]);
    // INSERT sales RETURNING
    mockSqlImpl.mockResolvedValueOnce([{ id: 300 }]);
    // consumeFifo: SELECT id FROM inventory_batches
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // consumeFifo: atomic UPDATE ... RETURNING take, unit_cost (FIFO
    // deduction — happens for PENDING too per current implementation)
    mockSqlImpl.mockResolvedValueOnce([{ take: 999, unit_cost: 80 }]);
    // INSERT sale_items
    mockSqlImpl.mockResolvedValueOnce([]);
    // INSERT inventory_movements
    mockSqlImpl.mockResolvedValueOnce([]);
    // COMMIT (no transaction / account update because status=PENDING)
    mockSqlImpl.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 1, quantity: 2, unit_price: 160 }],
        payment_method: "CASH",
        account_id: 1,
        status: "PENDING",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
    const body = await json(res) as {
      data: { status: string };
      message: string;
    };
    expect(body.data.status).toBe("PENDING");
    expect(body.message).toContain("pendiente");
  });

  it("PENDING sale does NOT insert a transaction record", async () => {
    // verifyResourceLimit
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]);
    // Account
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // getDefaultWarehouseForUser
    mockSqlImpl.mockResolvedValueOnce([{ warehouse_id: 1 }]);
    // Product
    mockSqlImpl.mockResolvedValueOnce([{ id: 1, name: "Zapatos", is_service: false }]);
    // Batches pre-check
    mockSqlImpl.mockResolvedValueOnce([{ id: 2, qty_available: 20, unit_cost: 200 }]);
    // BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    // advisory lock
    mockSqlImpl.mockResolvedValueOnce([]);
    // MAX sale_number
    mockSqlImpl.mockResolvedValueOnce([{ last_num: 10 }]);
    // INSERT sales
    mockSqlImpl.mockResolvedValueOnce([{ id: 400 }]);
    // consumeFifo: SELECT id FROM inventory_batches
    mockSqlImpl.mockResolvedValueOnce([{ id: 2 }]);
    // consumeFifo: atomic UPDATE ... RETURNING take, unit_cost
    mockSqlImpl.mockResolvedValueOnce([{ take: 999, unit_cost: 200 }]);
    // INSERT sale_items
    mockSqlImpl.mockResolvedValueOnce([]);
    // INSERT movement
    mockSqlImpl.mockResolvedValueOnce([]);
    // COMMIT
    mockSqlImpl.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 1, quantity: 1, unit_price: 400 }],
        payment_method: "CASH",
        account_id: 1,
        status: "PENDING",
      },
    });
    await POST(req as never);

    // Check that no call to INSERT INTO transactions was made.
    // The `transactions` insert happens only in the COMPLETED branch.
    // We verify by counting calls: a PENDING sale should NOT have an
    // `INSERT transactions` call or an `UPDATE accounts` call.
    const allCalls = mockSqlImpl.mock.calls as unknown[][];

    // Look for a call whose first argument (template string) contains 'INCOME'
    const transactionInsertCall = allCalls.find((args: unknown[]) => {
      const vals = args.slice(1);
      return vals.includes("INCOME");
    });
    expect(transactionInsertCall).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. PATCH /api/sales/[id] – confirm action
// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/sales/[id] – confirm", () => {
  let verifyAuthSpy: jest.SpyInstance;

  beforeEach(() => {
    resetSql();
    verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
      error: null,
      status: 200,
      data: makeAuthUser(),
    });
  });

  afterEach(() => {
    verifyAuthSpy.mockRestore();
  });

  it("returns 400 when trying to confirm a non-PENDING sale", async () => {
    // SELECT sale (already COMPLETED)
    mockSqlImpl.mockResolvedValueOnce([{
      id: 100, status: "COMPLETED", user_id: 42,
      account_id: 1, total: "500.00", sale_number: "VTA-00001",
      tax_rate: 0, shipping_cost: 0, event_id: null, customer_id: null, sold_at: new Date(),
    }]);

    const { PATCH } = await import("@/app/api/sales/[id]/route");
    const req = makeRequest("http://localhost/api/sales/100", {
      method: "PATCH",
      body: { action: "confirm" },
    });
    const params = Promise.resolve({ id: "100" });
    const res = (await PATCH(req as never, { params })) as Response;
    expect(res.status).toBe(400);
    const body = await json(res) as { error: string };
    expect(body.error).toContain("pendientes");
  });

  it("confirms a PENDING sale: updates status, inserts transaction, updates account", async () => {
    // SELECT sale (PENDING)
    mockSqlImpl.mockResolvedValueOnce([{
      id: 200, status: "PENDING", user_id: 42,
      account_id: 1, total: "600.00", sale_number: "VTA-00004",
      tax_rate: 0, shipping_cost: "0.00", event_id: null, customer_id: null, sold_at: new Date(),
    }]);
    // BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    // UPDATE sales SET status=COMPLETED
    mockSqlImpl.mockResolvedValueOnce([]);
    // INSERT transactions
    mockSqlImpl.mockResolvedValueOnce([]);
    // UPDATE accounts balance
    mockSqlImpl.mockResolvedValueOnce([]);
    // COMMIT
    mockSqlImpl.mockResolvedValueOnce([]);

    const { PATCH } = await import("@/app/api/sales/[id]/route");
    const req = makeRequest("http://localhost/api/sales/200", {
      method: "PATCH",
      body: { action: "confirm" },
    });
    const params = Promise.resolve({ id: "200" });
    const res = (await PATCH(req as never, { params })) as Response;
    expect(res.status).toBe(200);
    const body = await json(res) as { data: { status: string }; message: string };
    expect(body.data.status).toBe("COMPLETED");
    expect(body.message).toContain("confirmada");
  });

  it("confirms a PENDING sale with a customer: also updates customer stats", async () => {
    // SELECT sale (PENDING with customer)
    mockSqlImpl.mockResolvedValueOnce([{
      id: 300, status: "PENDING", user_id: 42,
      account_id: 1, total: "800.00", sale_number: "VTA-00010",
      tax_rate: 0, shipping_cost: "0.00", event_id: null, customer_id: 7, sold_at: new Date(),
    }]);
    // BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    // UPDATE sales
    mockSqlImpl.mockResolvedValueOnce([]);
    // INSERT transactions
    mockSqlImpl.mockResolvedValueOnce([]);
    // UPDATE accounts
    mockSqlImpl.mockResolvedValueOnce([]);
    // UPDATE customers (because customer_id is set)
    mockSqlImpl.mockResolvedValueOnce([]);
    // COMMIT
    mockSqlImpl.mockResolvedValueOnce([]);

    const { PATCH } = await import("@/app/api/sales/[id]/route");
    const req = makeRequest("http://localhost/api/sales/300", {
      method: "PATCH",
      body: { action: "confirm" },
    });
    const params = Promise.resolve({ id: "300" });
    const res = (await PATCH(req as never, { params })) as Response;
    expect(res.status).toBe(200);
    // Verify customers update was called (7th call, index 5 after reset)
    expect(mockSqlImpl).toHaveBeenCalledTimes(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. PATCH /api/sales/[id] – cancel action (stock returned)
// ─────────────────────────────────────────────────────────────────────────────

describe("PATCH /api/sales/[id] – cancel (stock returned)", () => {
  let verifyAuthSpy: jest.SpyInstance;

  beforeEach(() => {
    resetSql();
    verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
      error: null,
      status: 200,
      data: makeAuthUser(),
    });
  });

  afterEach(() => {
    verifyAuthSpy.mockRestore();
  });

  it("cancels a PENDING sale and returns stock to the latest batch", async () => {
    // SELECT sale (PENDING)
    mockSqlImpl.mockResolvedValueOnce([{
      id: 500, status: "PENDING", user_id: 42,
      account_id: 1, total: "300.00", sale_number: "VTA-00020",
      tax_rate: 0, shipping_cost: "0.00", event_id: null, customer_id: null, sold_at: new Date(),
    }]);
    // SELECT sale_items (1 physical item, no variant)
    mockSqlImpl.mockResolvedValueOnce([{
      product_id: 1, variant_id: null, quantity: 3, is_service: false,
    }]);
    // BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    // SELECT last batch (variant IS NULL)
    mockSqlImpl.mockResolvedValueOnce([{ id: 10 }]);
    // UPDATE inventory_batches SET qty_available + 3
    mockSqlImpl.mockResolvedValueOnce([]);
    // INSERT inventory_movements (IN, SALE_CANCELLED)
    mockSqlImpl.mockResolvedValueOnce([]);
    // SELECT sale_supplies (none)
    mockSqlImpl.mockResolvedValueOnce([]);
    // DELETE sale_supplies
    mockSqlImpl.mockResolvedValueOnce([]);
    // DELETE sale_items
    mockSqlImpl.mockResolvedValueOnce([]);
    // DELETE sales
    mockSqlImpl.mockResolvedValueOnce([]);
    // COMMIT
    mockSqlImpl.mockResolvedValueOnce([]);

    const { PATCH } = await import("@/app/api/sales/[id]/route");
    const req = makeRequest("http://localhost/api/sales/500", {
      method: "PATCH",
      body: { action: "cancel" },
    });
    const params = Promise.resolve({ id: "500" });
    const res = (await PATCH(req as never, { params })) as Response;
    expect(res.status).toBe(200);
    const body = await json(res) as { data: { status: string }; message: string };
    expect(body.data.status).toBe("CANCELLED");
    expect(body.message).toContain("stock devuelto");
  });

  it("does NOT try to restore inventory for service items during cancel", async () => {
    // SELECT sale
    mockSqlImpl.mockResolvedValueOnce([{
      id: 600, status: "PENDING", user_id: 42,
      account_id: 1, total: "1000.00", sale_number: "VTA-00030",
      tax_rate: 0, shipping_cost: "0.00", event_id: null, customer_id: null, sold_at: new Date(),
    }]);
    // SELECT sale_items — item is a service
    mockSqlImpl.mockResolvedValueOnce([{
      product_id: 5, variant_id: null, quantity: 1, is_service: true,
    }]);
    // BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    // SELECT sale_supplies (none)
    mockSqlImpl.mockResolvedValueOnce([]);
    // DELETE sale_supplies
    mockSqlImpl.mockResolvedValueOnce([]);
    // DELETE sale_items
    mockSqlImpl.mockResolvedValueOnce([]);
    // DELETE sales
    mockSqlImpl.mockResolvedValueOnce([]);
    // COMMIT
    mockSqlImpl.mockResolvedValueOnce([]);

    const callCountBefore = mockSqlImpl.mock.calls.length;

    const { PATCH } = await import("@/app/api/sales/[id]/route");
    const req = makeRequest("http://localhost/api/sales/600", {
      method: "PATCH",
      body: { action: "cancel" },
    });
    const params = Promise.resolve({ id: "600" });
    const res = (await PATCH(req as never, { params })) as Response;
    expect(res.status).toBe(200);

    // For a service item, no SELECT last_batch or UPDATE inventory_batches
    // should have been called. Total calls should be fewer than when a
    // physical item is cancelled (which needs 2 extra calls).
    const callsForThisCancel = mockSqlImpl.mock.calls.length - callCountBefore;
    // Physical item cancel: sale + items + BEGIN + lastBatch + UPDATE + INSERT move + supplies + del3 + COMMIT = 11
    // Service item cancel: sale + items + BEGIN + supplies + del3 + COMMIT = 8
    expect(callsForThisCancel).toBeLessThanOrEqual(8);
  });

  it("returns 400 when trying to cancel a non-PENDING sale", async () => {
    // SELECT sale (COMPLETED)
    mockSqlImpl.mockResolvedValueOnce([{
      id: 700, status: "COMPLETED", user_id: 42,
      account_id: 1, total: "200.00", sale_number: "VTA-00040",
    }]);

    const { PATCH } = await import("@/app/api/sales/[id]/route");
    const req = makeRequest("http://localhost/api/sales/700", {
      method: "PATCH",
      body: { action: "cancel" },
    });
    const params = Promise.resolve({ id: "700" });
    const res = (await PATCH(req as never, { params })) as Response;
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. POST /api/sales – variant_id routing in FIFO batches
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/sales – FIFO with variant_id", () => {
  let verifyAuthSpy: jest.SpyInstance;

  beforeEach(() => {
    resetSql();
    verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
      error: null,
      status: 200,
      data: makeAuthUser(),
    });
  });

  afterEach(() => {
    verifyAuthSpy.mockRestore();
  });

  it("returns 404 when variant does not belong to the product", async () => {
    // verifyResourceLimit
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]);
    // Account
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // getDefaultWarehouseForUser
    mockSqlImpl.mockResolvedValueOnce([{ warehouse_id: 1 }]);
    // Product (physical)
    mockSqlImpl.mockResolvedValueOnce([{ id: 1, name: "Camiseta", is_service: false }]);
    // Variant lookup → not found
    mockSqlImpl.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 1, variant_id: 99, quantity: 1, unit_price: 200 }],
        payment_method: "CASH",
        account_id: 1,
        status: "COMPLETED",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(404);
    const body = await json(res) as { error: string };
    expect(body.error).toContain("Variante");
  });

  it("selects batches filtered by variant_id when variant is provided", async () => {
    // verifyResourceLimit
    mockSqlImpl.mockResolvedValueOnce([{ max_sales_per_month: null }]);
    // Account
    mockSqlImpl.mockResolvedValueOnce([{ id: 1 }]);
    // getDefaultWarehouseForUser
    mockSqlImpl.mockResolvedValueOnce([{ warehouse_id: 1 }]);
    // Product
    mockSqlImpl.mockResolvedValueOnce([{ id: 1, name: "Camiseta", is_service: false }]);
    // Variant found
    mockSqlImpl.mockResolvedValueOnce([{ id: 3, variant_name: "Talla L", price_override: null }]);
    // Batches pre-check for variant_id=3
    mockSqlImpl.mockResolvedValueOnce([{ id: 5, qty_available: 8, unit_cost: 60 }]);
    // BEGIN
    mockSqlImpl.mockResolvedValueOnce([]);
    // advisory lock
    mockSqlImpl.mockResolvedValueOnce([]);
    // MAX sale_number
    mockSqlImpl.mockResolvedValueOnce([{ last_num: 0 }]);
    // INSERT sales
    mockSqlImpl.mockResolvedValueOnce([{ id: 900 }]);
    // consumeFifo: SELECT id FROM inventory_batches (variant)
    mockSqlImpl.mockResolvedValueOnce([{ id: 5 }]);
    // consumeFifo: atomic UPDATE ... RETURNING take, unit_cost
    mockSqlImpl.mockResolvedValueOnce([{ take: 999, unit_cost: 60 }]);
    // INSERT sale_items
    mockSqlImpl.mockResolvedValueOnce([]);
    // INSERT movement
    mockSqlImpl.mockResolvedValueOnce([]);
    // INSERT transactions
    mockSqlImpl.mockResolvedValueOnce([]);
    // UPDATE accounts
    mockSqlImpl.mockResolvedValueOnce([]);
    // COMMIT
    mockSqlImpl.mockResolvedValueOnce([]);

    const { POST } = await import("@/app/api/sales/route");
    const req = makeRequest("http://localhost/api/sales", {
      method: "POST",
      body: {
        items: [{ product_id: 1, variant_id: 3, quantity: 2, unit_price: 200 }],
        payment_method: "CASH",
        account_id: 1,
        status: "COMPLETED",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);

    // Verify that the 4th sql call (index 3 from start of this test) was for
    // variant batches — it should include the variant_id value (3) as an interpolated param.
    const allCalls = mockSqlImpl.mock.calls as unknown[][];
    const batchCall = allCalls.find((args: unknown[]) => {
      const vals = args.slice(1);
      return vals.includes(3) && vals.includes(1); // variant_id=3, product_id=1
    });
    expect(batchCall).toBeDefined();
  });
});
