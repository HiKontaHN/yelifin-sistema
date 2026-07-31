# Multi-organización / Multi-usuario por negocio

> **Estado:** Exploración futura. No implementado.  
> **Última revisión:** 29 de mayo de 2026 (análisis contra schema v3 real)

---

## Contexto

Hoy HiKonta tiene arquitectura **1 usuario = 1 negocio**. Cada tabla usa `user_id` como clave de aislamiento (tenant key). El objetivo es convertir el modelo a **1 organización = N usuarios con roles**, donde una empresa puede tener un dueño, admins, cajeros y empleados de solo lectura.

---

## Arquitectura actual (schema v3)

```
users (Firebase UID)
  └── user_id ──► 24 tablas de datos de negocio:
                  products, product_variants, suppliers,
                  purchase_batches, purchase_batch_items,
                  inventory_batches, inventory_movements,
                  accounts, transactions, transaction_categories,
                  credit_cards, credit_card_transactions,
                  customers, loyalty_policies,
                  sales, sale_items, sale_supplies,
                  supplies, supply_purchases, supply_purchase_items,
                  supply_movements,
                  events, event_inventory,
                  user_subscriptions (→ pasaría a org_subscriptions)

users (plataforma)
  └── user_profile (business_name, timezone, currency, locale)
      → estos campos migran a organizations
```

La suscripción hoy es por usuario (`user_subscriptions.user_id`).  
Los planes y features son tablas de plataforma: `subscription_plans`, `system_features`, `plan_features`.

---

## Modelo objetivo

```
organizations
  ├── organization_members (user → org, con rol)
  ├── org_subscriptions (la suscripción es de la org, la paga el OWNER)
  └── [24 tablas de negocio migran de user_id → org_id]

users (Firebase UID)
  └── user_profile (solo datos personales: display_name, photo_url)
  └── pertenece a una o más organizations con un rol
```

### Flujo de autenticación nuevo

```
Firebase token
  → userId (via firebase_uid)
  → organization_members (¿a qué org activa pertenece? ¿qué rol tiene?)
  → { orgId, role }
  → datos de la org (timezone, currency, locale, plan)
  → permisos del rol sobre features
```

---

## Tablas nuevas necesarias

### `organizations`
```sql
CREATE TABLE organizations (
  id             BIGSERIAL PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,
  slug           VARCHAR(100) UNIQUE,
  logo_url       TEXT,
  timezone       VARCHAR(64)  NOT NULL DEFAULT 'America/Tegucigalpa',
  currency       VARCHAR(3)   NOT NULL DEFAULT 'HNL',
  locale         VARCHAR(16)  NOT NULL DEFAULT 'es-HN',
  owner_user_id  BIGINT       NOT NULL REFERENCES users(id),
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_owner ON organizations(owner_user_id);
```

> **Nota de migración:** Los campos `business_name`, `timezone`, `currency`, `locale` de `user_profile` se convierten en `name`, `timezone`, `currency`, `locale` de esta tabla.

---

### `organization_members`
```sql
CREATE TABLE organization_members (
  id          BIGSERIAL PRIMARY KEY,
  org_id      BIGINT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     BIGINT    NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  role        VARCHAR(30) NOT NULL CHECK (role IN ('OWNER','ADMIN','CASHIER','VIEWER')),
  is_active   BOOLEAN   NOT NULL DEFAULT TRUE,
  invited_at  TIMESTAMP,
  joined_at   TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_org  ON organization_members(org_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
```

---

### `org_role_permissions`
Reutiliza `system_features` (ya tiene las categorías correctas):
```sql
CREATE TABLE org_role_permissions (
  id          BIGSERIAL PRIMARY KEY,
  org_id      BIGINT      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role        VARCHAR(30) NOT NULL,
  feature_key VARCHAR(100) NOT NULL REFERENCES system_features(feature_key),
  can_view    BOOLEAN     NOT NULL DEFAULT TRUE,
  can_edit    BOOLEAN     NOT NULL DEFAULT FALSE,
  UNIQUE (org_id, role, feature_key)
);

CREATE INDEX idx_org_role_perms ON org_role_permissions(org_id, role);
```

---

### `org_subscriptions` (renombrada de `user_subscriptions`)
```sql
CREATE TABLE org_subscriptions (
  id                       BIGSERIAL PRIMARY KEY,
  org_id                   BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id                  BIGINT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status                   VARCHAR(20) NOT NULL DEFAULT 'TRIAL'
                             CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','CANCELLED','EXPIRED')),
  trial_start_date         TIMESTAMP,
  trial_end_date           TIMESTAMP,
  current_period_start     TIMESTAMP,
  current_period_end       TIMESTAMP,
  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at             TIMESTAMP,
  provider                 VARCHAR(30) CHECK (provider IN ('STRIPE','PAYPAL','MANUAL','NONE')),
  provider_customer_id     TEXT,
  provider_subscription_id TEXT,
  created_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (org_id)
);
```

---

## Roles sugeridos

| Rol | Descripción | Restricciones |
|-----|-------------|---------------|
| `OWNER` | Creó la org. Acceso total. | Gestiona suscripción, invita miembros, elimina la org. |
| `ADMIN` | Acceso total operativo. | No puede cancelar suscripción ni eliminar la org. |
| `CASHIER` | Solo ventas. | Crear ventas, ver clientes, ver inventario (no editar). |
| `VIEWER` | Solo lectura. | En los módulos que el ADMIN le asigne. |

---

## Inventario completo de tablas a migrar

Las siguientes **24 tablas** tienen `user_id` como tenant key y deben agregar `org_id`:

| # | Tabla | Notas de migración |
|---|-------|--------------------|
| 1 | `products` | `user_id` → `org_id`; columnas: `price`, `sku`, `barcode`, `is_service` |
| 2 | `product_variants` | tiene su propio `user_id` además del `product_id` |
| 3 | `suppliers` | nueva en v3, no estaba en análisis anterior |
| 4 | `purchase_batches` | `purchased_at` (timestamp), `exchange_rate`, `account_id`, `shipping_account_id` |
| 5 | `purchase_batch_items` | tiene su propio `user_id`; FK a `purchase_batches` |
| 6 | `inventory_batches` | `qty_in`, `qty_available` (v3 usa distinto naming que v2) |
| 7 | `inventory_movements` | tipos: `IN`, `OUT`, `ADJUST` (v3 difiere de v2 que tenía `PURCHASE`,`SALE`) |
| 8 | `accounts` | tipos: `CASH`,`BANK`,`WALLET`,`OTHER` (v3 agrega `WALLET`/`OTHER`) |
| 9 | `transactions` | tipos: `INCOME`,`EXPENSE`,`TRANSFER`; campo es `account_id` (no `from_account_id`) |
| 10 | `transaction_categories` | nueva en v3, no estaba en análisis anterior |
| 11 | `credit_cards` | nueva en v3, no estaba en análisis anterior |
| 12 | `credit_card_transactions` | nueva en v3, FK a `credit_cards` y `transactions` |
| 13 | `customers` | tiene `total_orders` (no `total_purchases` como en v2) |
| 14 | `loyalty_policies` | v3 reemplazó `loyalty_settings` de v2 por tiers más flexibles |
| 15 | `sales` | `sold_at`, `tax_rate`, `status`, `event_id`, `credit_card_id`, `shipping_cost` |
| 16 | `sale_items` | tiene su propio `user_id`; `line_total` (no `subtotal`) |
| 17 | `sale_supplies` | tiene su propio `user_id`; cantidad es `NUMERIC` (no INT) |
| 18 | `supplies` | `unit`, `stock`, `min_stock`, `unit_cost`; tipos simplificados vs v2 |
| 19 | `supply_purchases` | `purchased_at`, `account_id` |
| 20 | `supply_purchase_items` | tiene su propio `user_id` |
| 21 | `supply_movements` | tipos: `IN`,`OUT`,`ADJUST` (v3) |
| 22 | `events` | `starts_at`/`ends_at` (timestamp, no DATE); `fixed_cost` (un solo campo) |
| 23 | `event_inventory` | tiene su propio `user_id`; `planned_qty`/`actual_qty`/`sold_qty`/`returned_qty` |
| 24 | `user_subscriptions` | se convierte en `org_subscriptions` con `org_id` |

**Tablas de plataforma (no migran, son compartidas):**
- `users`, `user_profile` (se recorta: business_name/timezone/currency/locale van a org)
- `subscription_plans`, `system_features`, `plan_features`
- `subscription_payments` (se actualizaría el FK de `user_id` a `org_id`)

---

## Rutas API a actualizar

Hay **58 archivos** en `app/api/`. Todos los que hoy filtran por `user_id` pasarían a filtrar por `org_id`. El cambio es mecánico pero voluminoso.

```
app/api/
  accounts/               (route.ts, [id]/route.ts)
  credit-cards/           (route.ts, [id]/...)
  credit-card-transactions/ (route.ts, [id]/..., periods/)
  customers/              (route.ts, [id]/..., loyalty/...)
  dashboard/              (route.ts, periods/)
  events/                 (route.ts, [id]/route.ts)
  finances/               (summary/, periods/)
  inventory/              (route.ts, adjust/, existing/, movements/...)
  products/               (route.ts, [id]/..., variants/...)
  purchases/              (route.ts, [id]/route.ts)
  reports/                (events/, inventory/, profit/, sales/ + exports)
  sales/                  (route.ts, [id]/route.ts)
  supplies/               (route.ts, [id]/route.ts)
  supply-purchases/       (route.ts)
  transaction-categories/ (route.ts, [id]/route.ts)
  transactions/           (route.ts, [id]/..., periods/)
  auth/login/             (crea user + subscription → creará user + org + org_subscription)
  admin/                  (stats/, users/, plans/, storage/)
```

---

## Plan de migración por fases

### Fase 0 — Preparación (sin tocar producción)

1. Crear tablas nuevas (`organizations`, `organization_members`, `org_role_permissions`, `org_subscriptions`) sin romper nada existente.
2. Diseñar y probar en staging.

```sql
-- Crear org por cada usuario existente (toma business_name de user_profile)
INSERT INTO organizations (name, slug, timezone, currency, locale, owner_user_id, created_at)
SELECT 
  COALESCE(up.business_name, u.display_name, u.email),
  LOWER(REPLACE(COALESCE(up.business_name, u.email), ' ', '-')) || '-' || u.id,
  COALESCE(up.timezone, 'America/Tegucigalpa'),
  COALESCE(up.currency, 'HNL'),
  COALESCE(up.locale, 'es-HN'),
  u.id,
  u.created_at
FROM users u
LEFT JOIN user_profile up ON up.user_id = u.id;

-- Cada usuario es OWNER de su org
INSERT INTO organization_members (org_id, user_id, role, joined_at)
SELECT o.id, o.owner_user_id, 'OWNER', NOW()
FROM organizations o;

-- Migrar suscripciones a org_subscriptions
INSERT INTO org_subscriptions (org_id, plan_id, status, trial_start_date, trial_end_date,
  current_period_start, current_period_end, cancel_at_period_end, cancelled_at,
  provider, provider_customer_id, provider_subscription_id, created_at, updated_at)
SELECT 
  (SELECT id FROM organizations WHERE owner_user_id = us.user_id),
  us.plan_id, us.status, us.trial_start_date, us.trial_end_date,
  us.current_period_start, us.current_period_end, us.cancel_at_period_end, us.cancelled_at,
  us.provider, us.provider_customer_id, us.provider_subscription_id, us.created_at, us.updated_at
FROM user_subscriptions us;
```

---

### Fase 1 — Agregar `org_id` a todas las tablas (nullable, sin romper queries actuales)

```sql
-- Tablas de datos de negocio
ALTER TABLE products               ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE product_variants       ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE suppliers              ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE purchase_batches       ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE purchase_batch_items   ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE inventory_batches      ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE inventory_movements    ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE accounts               ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE transactions           ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE transaction_categories ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE credit_cards           ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE credit_card_transactions ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE customers              ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE loyalty_policies       ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE sales                  ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE sale_items             ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE sale_supplies          ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE supplies               ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE supply_purchases       ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE supply_purchase_items  ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE supply_movements       ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE events                 ADD COLUMN org_id BIGINT REFERENCES organizations(id);
ALTER TABLE event_inventory        ADD COLUMN org_id BIGINT REFERENCES organizations(id);
```

---

### Fase 2 — Poblar `org_id` desde `user_id` existente

```sql
-- Patrón repetible: buscar la org donde owner_user_id = user_id del registro
UPDATE products p
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = p.user_id);

UPDATE product_variants pv
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = pv.user_id);

UPDATE suppliers s
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = s.user_id);

UPDATE purchase_batches pb
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = pb.user_id);

UPDATE purchase_batch_items pbi
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = pbi.user_id);

UPDATE inventory_batches ib
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = ib.user_id);

UPDATE inventory_movements im
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = im.user_id);

UPDATE accounts a
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = a.user_id);

UPDATE transactions t
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = t.user_id);

UPDATE transaction_categories tc
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = tc.user_id);

UPDATE credit_cards cc
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = cc.user_id);

UPDATE credit_card_transactions cct
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = cct.user_id);

UPDATE customers c
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = c.user_id);

UPDATE loyalty_policies lp
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = lp.user_id);

UPDATE sales s
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = s.user_id);

UPDATE sale_items si
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = si.user_id);

UPDATE sale_supplies ss
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = ss.user_id);

UPDATE supplies s
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = s.user_id);

UPDATE supply_purchases sp
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = sp.user_id);

UPDATE supply_purchase_items spi
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = spi.user_id);

UPDATE supply_movements sm
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = sm.user_id);

UPDATE events e
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = e.user_id);

UPDATE event_inventory ei
SET org_id = (SELECT id FROM organizations WHERE owner_user_id = ei.user_id);
```

---

### Fase 3 — Hacer `org_id NOT NULL` y agregar índices

```sql
-- Verificar primero que no haya NULLs
SELECT COUNT(*) FROM products WHERE org_id IS NULL;
-- (repetir para cada tabla)

-- Luego hacer NOT NULL
ALTER TABLE products               ALTER COLUMN org_id SET NOT NULL;
-- ... repetir para las 23 tablas restantes

-- Agregar índices de org_id en las tablas principales
CREATE INDEX idx_products_org               ON products(org_id);
CREATE INDEX idx_product_variants_org       ON product_variants(org_id);
CREATE INDEX idx_suppliers_org              ON suppliers(org_id);
CREATE INDEX idx_purchase_batches_org       ON purchase_batches(org_id);
CREATE INDEX idx_purchase_batch_items_org   ON purchase_batch_items(org_id);
CREATE INDEX idx_inventory_batches_org      ON inventory_batches(org_id);
CREATE INDEX idx_inventory_movements_org    ON inventory_movements(org_id);
CREATE INDEX idx_accounts_org              ON accounts(org_id);
CREATE INDEX idx_transactions_org          ON transactions(org_id);
CREATE INDEX idx_transaction_categories_org ON transaction_categories(org_id);
CREATE INDEX idx_credit_cards_org          ON credit_cards(org_id);
CREATE INDEX idx_credit_card_transactions_org ON credit_card_transactions(org_id);
CREATE INDEX idx_customers_org             ON customers(org_id);
CREATE INDEX idx_loyalty_policies_org      ON loyalty_policies(org_id);
CREATE INDEX idx_sales_org                 ON sales(org_id);
CREATE INDEX idx_sale_items_org            ON sale_items(org_id);
CREATE INDEX idx_sale_supplies_org         ON sale_supplies(org_id);
CREATE INDEX idx_supplies_org              ON supplies(org_id);
CREATE INDEX idx_supply_purchases_org      ON supply_purchases(org_id);
CREATE INDEX idx_supply_purchase_items_org ON supply_purchase_items(org_id);
CREATE INDEX idx_supply_movements_org      ON supply_movements(org_id);
CREATE INDEX idx_events_org               ON events(org_id);
CREATE INDEX idx_event_inventory_org      ON event_inventory(org_id);
```

---

### Fase 4 — Migrar el código (módulo a módulo)

Cambiar todos los queries de `WHERE user_id = ${userId}` a `WHERE org_id = ${orgId}`.

**Prioridad de migración por impacto:**
1. `sales` + `sale_items` + `sale_supplies` (más usado)
2. `products` + `product_variants` (base del sistema)
3. `inventory_batches` + `inventory_movements`
4. `accounts` + `transactions` + `transaction_categories`
5. `customers` + `loyalty_policies`
6. `purchase_batches` + `purchase_batch_items`
7. `supplies` + `supply_purchases` + `supply_purchase_items` + `supply_movements`
8. `events` + `event_inventory`
9. `credit_cards` + `credit_card_transactions`
10. `suppliers`
11. `reports` (todos los endpoints en `app/api/reports/`)
12. `dashboard`

---

### Fase 5 — Retirar `user_id` como tenant key

Una vez que todo el código filtra por `org_id`, eliminar las columnas `user_id` de las tablas migradas (o conservarlas como auditoría de "quién creó el registro", renombrando a `created_by_user_id`).

```sql
-- Opción A: borrar (limpio, irreversible)
ALTER TABLE products DROP COLUMN user_id;

-- Opción B: renombrar (mantiene auditoría)
ALTER TABLE products RENAME COLUMN user_id TO created_by_user_id;
-- (y agregar un created_by_user_id donde no exista)
```

---

## Cambios en el código

### `lib/auth.ts` — `verifyAuth()`

Hoy devuelve `{ userId, subscription }`. Necesitaría devolver también `{ orgId, role }`.

```typescript
// Tipo actualizado
export type AuthUser = {
  userId: number;
  orgId: number;          // ← nuevo
  role: 'OWNER' | 'ADMIN' | 'CASHIER' | 'VIEWER';  // ← nuevo
  firebaseUid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  isActive: boolean;
  subscription: {
    status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
    planSlug: string;
  };
};

// Nuevo bloque en verifyAuth() después de identificar al usuario:
const [membership] = await sql`
  SELECT om.org_id, om.role, os.status AS sub_status, sp.slug AS plan_slug
  FROM organization_members om
  JOIN organizations o         ON o.id = om.org_id
  JOIN org_subscriptions os    ON os.org_id = om.org_id
  JOIN subscription_plans sp   ON sp.id = os.plan_id
  WHERE om.user_id = ${user.id}
    AND om.is_active = TRUE
    AND o.is_active  = TRUE
  ORDER BY om.joined_at ASC
  LIMIT 1
`;
```

> **Nota:** Si un usuario puede pertenecer a múltiples orgs, habría que pasar `orgId` como header o cookie en el request para seleccionar cuál está activa.

---

### Todos los API routes

Hoy: `WHERE user_id = ${userId}`  
Futuro: `WHERE org_id = ${orgId}`

Son **58 archivos** en `app/api/`. El patrón es idéntico en todos, el cambio es mecánico.

---

### `verifyFeatureAccess()` y `verifyResourceLimit()`

Hoy consultan `user_subscriptions` por `user_id`. Pasarían a consultar `org_subscriptions` por `orgId`. El resto de la lógica no cambia.

---

### `app/api/auth/login/route.ts`

Hoy crea: `users` → `user_profile` → `user_subscriptions`.  
Futuro crearía: `users` → `user_profile` → `organizations` → `organization_members` (OWNER) → `org_subscriptions` (TRIAL).

---

### Middleware

`middleware.ts` no necesita cambios fundamentales — sigue verificando el Firebase JWT. La resolución de `orgId` ocurriría en `verifyAuth()`.

---

### Hook `useMe()` (cliente)

Hoy expone `userId` y datos del usuario. Necesitaría exponer también `orgId` y `role` para que los componentes puedan mostrar/ocultar funcionalidades según el rol.

---

## UI necesaria (nueva)

| Pantalla | Descripción |
|----------|-------------|
| **Perfil de organización** | Editar nombre, logo, timezone, moneda |
| **Miembros** | Listar miembros, invitar por email, asignar roles, revocar acceso |
| **Invitación** | Email de invitación + link con token → registro/login → join org |
| **Selector de org** | Si el usuario pertenece a múltiples orgs, selector en el header |
| **Permisos por rol** | (opcional) permitir al ADMIN personalizar qué puede ver cada rol |

---

## Implicaciones en suscripción

La suscripción pasa de `user_subscriptions.user_id` a `org_subscriptions.org_id`. El **OWNER** es quien paga.

Modelos posibles para miembros adicionales:
- **Incluidos en el plan** (límite de N miembros, ya existe `max_users` en `subscription_plans`)
- **Con costo por asiento** (modelo seat-based — requiere cambios en el flujo de pago)

El campo `max_users` ya existe en `subscription_plans` desde v2 pero actualmente no se verifica en el código. Se activaría al implementar multi-org.

---

## Esfuerzo estimado (revisado)

| Área | Complejidad | Notas |
|---|---|---|
| DDL: tablas nuevas + migración datos | Alta | 24 tablas, SQL de migración ya documentado arriba |
| `lib/auth.ts` + middleware | Media | Añadir `orgId`/`role` al flujo |
| 58 API routes → filtrar por `org_id` | Muy Alta | Mecánico pero voluminoso; ~2 semanas si se hace 1 módulo/día |
| `app/api/auth/login` — crear org en registro | Media | Lógica transaccional nueva |
| UI: gestión de organización y miembros | Media | 3-4 pantallas nuevas |
| UI: flujo de invitación por email (Firebase) | Media | Email + link de invitación |
| Hook `useMe()` + contexto de org en UI | Baja | Agregar `orgId`/`role` al contexto existente |
| Actualizar `verifyFeatureAccess()` / `verifyResourceLimit()` | Baja | Cambiar de `user_id` a `org_id` en 2 funciones |
| **Total estimado** | | **4–6 semanas** |

---

## Lo que ya está bien posicionado

- `system_features` con `feature_key` por categoría → base perfecta para permisos por rol
- `verifyFeatureAccess()` y `verifyResourceLimit()` ya existen, el cambio es puntual
- Firebase Auth es flexible para múltiples cuentas por org
- El patrón `user_id` es 100% consistente en toda la DB → migración predecible aunque voluminosa
- `subscription_plans.max_users` ya existe y está listo para activarse

---

## Riesgos y consideraciones

| Riesgo | Mitigación |
|--------|-----------|
| Usuario en múltiples orgs (futuro) | Diseñar el header `X-Org-ID` desde el inicio para selección de org activa |
| `product_variants` tiene `user_id` propio (redundante con FK a products) | Migrar a `org_id` también; a largo plazo considerar eliminar el `user_id` redundante |
| `sale_items`, `sale_supplies`, `purchase_batch_items`, `supply_purchase_items` tienen `user_id` propio | Mismo patrón — migrar aunque técnicamente son redundantes con el FK al padre |
| UNIQUE constraints que incluyen `user_id` | Actualizar a `org_id`: ej. `UNIQUE(user_id, name)` en `accounts` → `UNIQUE(org_id, name)` |
| Índices compuestos que incluyen `user_id` | Recrear con `org_id`: ej. `idx_sales_user_date(user_id, sold_at)` → `(org_id, sold_at)` |

---

## Próximos pasos cuando se decida implementar

1. Validar modelo de roles con usuarios reales: ¿qué necesita ver/hacer un cajero vs. un admin?
2. Decidir modelo de precios: ¿por org (actual) o por asiento (seat-based)?
3. Decidir si usuarios pueden pertenecer a múltiples orgs (cambia el flujo de auth)
4. Ejecutar Fase 0 en staging: crear tablas + migrar datos, verificar integridad
5. Migrar API routes de a módulo — empezar por `sales` (más impacto en demos)
6. Agregar UI de gestión de organización
7. Implementar flujo de invitación por email
