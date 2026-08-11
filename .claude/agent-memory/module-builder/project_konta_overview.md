---
name: Konta SaaS — project overview
description: Stack, auth pattern, DB conventions, module structure, and key patterns for the Konta codebase
type: project
---

## Stack
Next.js 16 App Router, React 19, Neon serverless PostgreSQL (no ORM — raw SQL via `neon()` template tag), Firebase Auth, Tailwind CSS v4, shadcn/ui, SWR, React Hook Form + Zod.

## Auth pattern
Every API handler imports `verifyAuth`, `isAuthSuccess`, `createErrorResponse` from `@/lib/auth`. Pattern:
```ts
const auth = await verifyAuth(request);
if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
const { userId } = auth.data;
```
`userId` is a `number` (BIGSERIAL). Every SQL query must filter by `user_id = ${userId}`.

## DB schema highlights
- `users.id` BIGSERIAL — tenant key
- `products` — has `sku` (UNIQUE per user), `is_service BOOLEAN`, `image_url`
- `product_variants` — has `sku` (UNIQUE per user), `variant_name`, `attributes JSONB`, `price_override`
- `inventory_batches` — `qty_in`, `qty_available`, `unit_cost` (HNL), `received_at`; links to `purchase_batch_items`
- `inventory_movements` — `movement_type` IN/OUT/ADJUST, `reference_type` includes PURCHASE/SALE/ADJUSTMENT/INITIAL/SALE_CANCELLED/SALE_EDITED
- `accounts` — `type` CASH/BANK/WALLET/OTHER
- `purchase_batches` — has `status` PENDING/COMPLETED, `currency`, `exchange_rate`, `account_id`, `credit_card_id`

## API response conventions
- Collections: `{ data: T[], total?: number }`
- Single item mutations: `Response.json(item)` directly
- Errors: `createErrorResponse(message, status, needsUpgrade?)`

## SWR hook pattern
All hooks live in `hooks/swr/`. They use an internal `useAuthFetch()` that gets the Firebase token via `useAuth().firebaseUser.getIdToken()`. No global fetcher — each hook file has its own `useAuthFetch`.

## UI conventions
- shadcn/ui primitives from `components/ui/` — never edit directly
- Feature-scoped components in `components/[feature]/`
- Cross-feature in `components/shared/`
- All UI text in Spanish (es-HN)
- Dialog style: bottom sheet on mobile → centered modal on sm+, with `cn()` of long class lists

## Excel export/import
- `lib/export.ts` already has `exportToExcel()` using dynamic `import("xlsx")` for client-side exports
- Server-side xlsx usage: `import * as XLSX from "xlsx"` at the top of API routes (available as a dependency)
- File download from API: `new Response(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ... } })`
- File upload to API: FormData with `formData.get("file")` as File, then `file.arrayBuffer()`

**Why:** The batch import/export feature (2026-05-07) established these patterns for server-side xlsx in API routes.
**How to apply:** Use `import * as XLSX from "xlsx"` in API routes; use `lib/export.ts` for client-side exports from UI components.
