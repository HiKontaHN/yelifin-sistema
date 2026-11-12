# Repository Guidelines

## Project Structure & Module Organization

HiKonta is a small-business inventory, sales, and finance application built with Next.js App Router, React, and TypeScript.

- `app/`: pages, layouts, and API handlers; `(auth)` contains authentication pages and `(dashboard)` contains protected business screens.
- `components/`: feature components, shared components, and shadcn/ui primitives in `ui/`.
- `hooks/`, `hooks/swr/`, `context/`, and `context-modules/`: client hooks, data fetching, and state providers.
- `lib/` and `types/`: business logic, server utilities, and shared types.
- `database/`: SQL schemas and migrations. `public/` holds static assets; `docs/` holds implementation notes.
- `__tests__/` and feature-local `__tests__/` directories contain automated tests.

## Build, Test, and Development Commands

Use the pinned package manager, `pnpm@10.34.9`.

- `pnpm install --frozen-lockfile`: install dependencies from the lockfile.
- `pnpm dev`: start the local development server.
- `pnpm build` / `pnpm start`: build and serve the production application.
- `pnpm exec tsc --noEmit`: check TypeScript independently of the build.
- `pnpm test --runInBand`: run Jest tests serially.
- `pnpm test --runInBand __tests__/inventory-sales.test.ts`: run a targeted suite.

`pnpm lint` invokes ESLint, but no ESLint dependency or configuration is currently checked in; resolve that tooling gap before relying on it.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, and `@/` imports for project-root paths. Match nearby quote and semicolon conventions; no shared formatter configuration is present. Use PascalCase for React components, camelCase for functions and variables, and kebab-case filenames such as `cart-margin-summary.tsx`. Follow Next.js filenames such as `page.tsx` and `route.ts`. Keep business rules in `lib/` and server state in SWR hooks. Preserve Spanish UI copy and existing locale formatting.

## Testing Guidelines

Tests use Jest with ts-jest and a Node environment. Name tests `*.test.ts` or `*.test.tsx` inside `__tests__/`. Add regression coverage for changed business rules and API behavior. No coverage threshold is configured. Database suites use `*.integration.test.ts` and require `RUN_DB_INTEGRATION=1`; run them only against a configured development database.

## Commit & Pull Request Guidelines

Recent commits use `feat:` and `fix:`, optionally scoped, for example `fix(ventas): ...`. Keep subjects concise; Spanish is common. Pull requests should explain the behavior change, link relevant issues, report validation, and include screenshots for UI changes. Call out SQL migrations and configuration requirements.

## Security & Configuration

Keep secrets out of Git; use `.env.example` as the configuration reference. Preserve authentication, subscription checks, and organization scoping in protected API queries. Never include credentials or personal data in logs or analytics.
