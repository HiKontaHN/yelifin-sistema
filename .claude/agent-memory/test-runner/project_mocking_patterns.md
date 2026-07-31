---
name: Mocking patterns for API route tests in HiKonta
description: How to mock Neon sql, Firebase Auth, and verifyAuth for unit testing API route handlers
type: project
---

All API routes depend on two external services: Neon `sql` (tagged-template DB calls) and Firebase Admin Auth (`verifyAuth`).

**Mocking Neon sql**
```ts
const mockSqlImpl = jest.fn();
jest.mock("@neondatabase/serverless", () => ({
  neon: jest.fn(() => mockSqlImpl),
}));
```
Each `await sql\`...\`` call becomes a `mockSqlImpl(...)` call. Mock responses sequentially with `mockSqlImpl.mockResolvedValueOnce([...])`. The sequence must match the exact order of queries in the handler.

**Mocking Firebase Admin**
```ts
jest.mock("@/lib/firebase-admin", () => ({
  adminAuth: { verifyIdToken: jest.fn() },
}));
```

**Mocking verifyAuth (recommended for most tests)**
```ts
import * as authModule from "@/lib/auth";
const verifyAuthSpy = jest.spyOn(authModule, "verifyAuth").mockResolvedValue({
  error: null, status: 200, data: makeAuthUser(),
});
```
Restore with `verifyAuthSpy.mockRestore()` in `afterEach`.

**Important behavior discovered:**
- POST /api/sales has a dead-code `const [product] = await sql\`SELECT name...\`` inside the `if (totalAvailable < item.quantity)` guard. Even though the variable is unused, the query fires, so you must mock it.
- Handlers return `Response | undefined` from TypeScript's perspective. Cast results: `const res = (await POST(...)) as Response;`
- `if (sku)` in the variants handler gates the SKU uniqueness check — no mock needed when sku is absent from the request body.

**Why:** Discovery from writing the first test suite (2026-05-04). These patterns are non-obvious from reading the handlers.
