# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Next.js dev server
npm run build    # Production build
npm run lint     # Run ESLint
npm start        # Start production server
```

No test runner is configured.

## Architecture Overview

**HiKonta** is a SaaS web app for small-business inventory, sales, and financial management. Stack: Next.js 16 (App Router), React 19, PostgreSQL via Neon serverless, Firebase Auth, Tailwind CSS v4 + shadcn/ui, SWR for data fetching, React Hook Form + Zod for forms.

### Route Groups

- `app/(auth)/` — Public auth pages (login, register, verify-email, onboarding)
- `app/(dashboard)/` — Protected routes: sales, inventory, finances, events, customers, reports
- `app/api/` — RESTful API endpoints with direct SQL queries

### Request Lifecycle

1. `middleware.ts` (`proxy.ts`) intercepts requests, verifies the Firebase JWT, and redirects unauthenticated users away from protected paths.
2. API routes call `verifyAuth()` from `lib/auth.ts` to extract `userId` from the Bearer token.
3. `verifySubscription()` / `verifyFeatureAccess()` / `verifyResourceLimit()` in `lib/auth.ts` gate access per plan.
4. Queries hit PostgreSQL via the Neon `sql` template tag (no ORM — direct SQL throughout).
5. SWR hooks in `hooks/swr/` fetch from the API routes and cache responses client-side.

### Key Conventions

- **Auth**: Every API handler must call `verifyAuth()` first. The resulting `userId` is the tenant key on every table.
- **Multi-tenancy**: Every DB table has a `user_id` FK; all queries must filter by `user_id`.
- **API responses**: Collections return `{ data: T[], total?: number }`; mutations return `Response.json()` directly.
- **Error handling**: Use `createErrorResponse()` from `lib/auth.ts` for consistent error shapes.
- **Database**: Schema versioned in `database/` (v1, v2, v3 DDL files). FIFO inventory via `inventory_batches`. Inventory movements tracked in `inventory_movements`.
- **Locale**: App defaults to `es-HN` (Honduran Spanish). Date/currency formatting follows user preferences stored in `user_profile`.

### State Management

- No Redux or Zustand. SWR handles all server state; React state handles local UI state.
- Authentication state lives in the `useAuth()` hook (wraps Firebase Auth).
- User profile/subscription data fetched via the `useMe()` SWR hook and threaded through context.

### Component Organization

- `components/ui/` — shadcn/ui primitives (do not edit directly).
- `components/shared/` — Cross-feature components.
- `components/[feature]/` — Feature-scoped components (products, sales, finances, etc.).
- Pages under `app/(dashboard)/` are `"use client"` when they require interactivity.

### Path Aliases

`@/*` maps to the project root (configured in `tsconfig.json`). Use `@/components`, `@/lib`, `@/hooks`, `@/types`, etc.

### Notable Config

- `next.config.mjs` has `ignoreBuildErrors: true` — TypeScript build errors are suppressed in production builds; catch them in development with `tsc --noEmit`.
- Firebase client config is in `firebase.config.ts`; Admin SDK (server-side) is in `lib/firebase-admin.ts`.
