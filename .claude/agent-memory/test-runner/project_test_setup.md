---
name: Test setup – Jest + ts-jest for HiKonta
description: Jest test infrastructure installed; how to run, mock, and structure tests in this Next.js App Router project
type: project
---

Jest (v30) + ts-jest (v29) + @types/jest installed as devDependencies (2026-05-04).

Test config: `jest.config.ts` in the project root.
Test script: `npm test` → `jest --config jest.config.ts`
Test location: `__tests__/inventory-sales.test.ts`

Key setup decisions:
- `testEnvironment: "node"` (no DOM needed for API route tests)
- `moduleNameMapper` maps `@/*` to project root (mirrors `tsconfig.json` paths)
- ts-jest overrides: `module: "CommonJS"`, `moduleResolution: "node"` (tsconfig uses bundler/esnext which breaks ts-jest)
- `testMatch: ["**/__tests__/**/*.test.ts?(x)"]`

**Why:** Next.js uses `module: esnext` + `moduleResolution: bundler` in tsconfig; ts-jest needs CommonJS. The override inside `jest.config.ts` handles this without changing tsconfig.

**How to apply:** When adding new test files, place them in `__tests__/` with `.test.ts` extension. No additional config needed.
