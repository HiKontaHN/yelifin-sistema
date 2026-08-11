---
name: ESLint not installed – environment issue
description: npm run lint fails because eslint is not in node_modules; Next.js built-in lint also fails
type: project
---

`npm run lint` runs `eslint .` but ESLint is not installed as a package in node_modules (no `eslint` package present as of 2026-05-04).

Running `npx eslint .` tries to install ESLint v10 from npm but then fails because no `eslint.config.js` exists (the project was likely set up for ESLint v8/legacy config format).

`next lint` also fails with "Invalid project directory" when run from bash — seems to be a path resolution issue on Windows with the next binary shebang.

**Pre-existing tsc error:** `app/(dashboard)/admin/users/[id]/page.tsx:149` — `Type 'string | null' is not assignable to type 'string'` (user.currency / user.timezone fields). This exists in the codebase before our test work.

**XLSX package note:** `xlsx@^0.18.5` is in `dependencies` (not devDependencies). It ships its own type declarations; no `@types/xlsx` is needed. `XLSX.SSF.parse_date_code` is available at runtime. The `!dataValidations` property is not part of the SheetJS public type surface — cast to `any[]` is intentional and correct.

**How to apply:** Do not attempt `npm run lint` as a quality gate — it will always fail until ESLint is properly installed. Use `npx tsc --noEmit` as the primary static analysis gate instead.
