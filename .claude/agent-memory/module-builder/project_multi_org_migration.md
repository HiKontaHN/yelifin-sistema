---
name: project-multi-org-migration
description: HiKonta está migrando de single-user (user_id) a multi-org (org_id). Reglas de migración en API routes.
metadata:
  type: project
---

El proyecto HiKonta está en proceso de migración de arquitectura single-user a multi-org.

**Reglas aplicadas en todos los API routes:**

1. `const { userId } = auth.data` → `const { userId, orgId } = auth.data`
2. En WHERE/JOIN de queries de LECTURA: `user_id = ${userId}` → `org_id = ${orgId}`
3. En INSERT: columna `user_id` → `org_id`, agregar `created_by = ${userId}`
4. En UPDATE (cambios de usuario): agregar `updated_by = ${userId}` en SET; WHERE `user_id` → `org_id`
5. En UPDATE de balance/stock del sistema: solo cambiar WHERE, NO agregar `updated_by`
6. En subqueries con `t.user_id = e.user_id`: cambiar a `t.org_id = e.org_id`
7. En JOIN conditions con `AND s.user_id = e.user_id`: cambiar a `AND s.org_id = e.org_id`

**Archivos ya migrados (lote 1):**
- app/api/credit-cards/route.ts
- app/api/credit-cards/[id]/route.ts
- app/api/credit-cards/[id]/transactions/route.ts
- app/api/credit-cards/[id]/periods/route.ts
- app/api/credit-cards/[id]/payment/route.ts
- app/api/credit-card-transactions/route.ts
- app/api/credit-card-transactions/[id]/route.ts
- app/api/credit-card-transactions/periods/route.ts
- app/api/reports/events/route.ts
- app/api/reports/inventory/route.ts
- app/api/reports/profit/route.ts
- app/api/reports/sales/route.ts
- app/api/reports/events/export/route.ts
- app/api/reports/inventory/export/route.ts
- app/api/reports/profit/export/route.ts
- app/api/reports/sales/export/route.ts
- app/api/dashboard/route.ts
- app/api/dashboard/periods/route.ts

**Why:** Migración a multi-tenancy por organización (multi-org) en lugar de por usuario individual.
**How to apply:** Al crear o modificar cualquier API route, usar `orgId` en las queries SQL y `userId` solo para `created_by`/`updated_by`. No tocar app/api/admin/ que mantiene user_id intencionalmente.
