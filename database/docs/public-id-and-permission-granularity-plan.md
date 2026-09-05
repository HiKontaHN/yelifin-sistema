# Plan: identificadores externos no adivinables, y permisos de rol más granulares

> Estado: **solo documentado**. Ninguna de las dos partes está implementada — nada se toca hasta que se pida explícitamente. Este documento es la referencia para retomarlo más adelante.

Este documento cubre dos iniciativas independientes y sin relación entre sí, surgidas en la misma sesión de planificación.

---

# Parte 1 — Columnas `public_id` (UUID) aditivas

## Contexto

Toda tabla de HiKonta usa llaves primarias `BIGINT`/`SERIAL` secuenciales. Reemplazarlas todas por UUID se consideró y se descartó explícitamente por ser demasiado invasivo para un código sin tests automatizados (entre 30 y 40 tablas, cada FK, cada ruta de API, cada tipo del frontend). En su lugar: agregar una columna `public_id UUID` solo a las tablas que hoy ya exponen su `id` entero secuencial al usuario (en una URL o como texto literal), dejando el `id` existente, cada FK y cada join completamente intactos. Este enfoque puramente aditivo tiene un riesgo casi nulo — no cambia ningún `ORDER BY id`, ningún join, ni el parseo de ningún parámetro de ruta.

**Fuga real confirmada que motiva esto**: `app/(dashboard)/inventory/[id]/page.tsx`, en su función `referenceLabel()`, imprime `` `Compra #${id}` `` usando el `purchase_batches.id` crudo — hoy no hay nada más que mostrar ahí. Otras tablas tienen exposición a nivel de URL (`/sales/[id]`, `/events/[id]`, `/finances/credit-cards/[id]`) sin fuga de texto.

## Alcance: qué tablas

| Tabla | ¿Incluir? | Por qué |
|---|---|---|
| `purchase_batches` | **Sí** | Fuga de texto confirmada (`Compra #${id}`); además es la prueba de concepto. |
| `sales` | **Sí** | 3 rutas de página exponen el id crudo (`sales/[id]`, `sales/[id]/edit`, `(print)/sales/[id]/invoice\|receipt`). Nota: `sales.sale_number` (formato `VTA-00001`, secuencial por org) ya existe como etiqueta *amigable para mostrar* — no resuelve el problema de "no adivinable", así que ambos pueden coexistir para propósitos distintos. |
| `events` | **Sí** | 1 ruta de página expone el id crudo; no existe ninguna etiqueta amigable alternativa. |
| `credit_cards` | **Sí, solo schema + API** | Fuga independiente por ruta de página propia (`finances/credit-cards/[id]`), separada del tema de etiquetas de cuentas/tarjetas de abajo. |
| `accounts` | **No, se pospone** | Su única exposición es `lib/import-labels.ts` (`buildAccountLabels()`, genera `"(Cuenta #7)"` en la plantilla de importación de Excel) — pero `parseAccountLabel()`, en el mismo archivo, **vuelve a leer ese mismo sufijo** al importar, para resolver qué cuenta se eligió. Cambiar esto no es un cambio aditivo de una sola línea; requiere tocar `buildAccountLabels()`, `parseAccountLabel()`, `lib/export-template.ts` y la ruta de importación, todo a la vez. Tratar como una tarea futura separada — y meter ahí también la misma fuga de `credit_cards` (no en esta pasada). |
| `products` | Se pospone | Ya tiene una alternativa parcial (`sku`); menor urgencia. |
| `customers` | Se pospone | No tiene ruta de página propia, ni fuga evidenciada hoy. |
| `users` / `subscription_plans` (panel admin) | Se pospone | `database/docs/admin-panel-architecture.md` dice que toda la superficie `app/(dashboard)/admin/*` se está migrando FUERA de este repo hacia un proyecto `hikonta-admin` separado — no vale la pena invertir aquí. |

## La migración

Un solo archivo combinado (sigue el precedente de `v4.1-add-org-id-to-data-tables.sql`, que agregó una columna idéntica a ~22 tablas de una vez — mismo tipo de cambio, sin ningún beneficio en partirlo en 4 archivos casi duplicados):

`database/migrations/v4.16-add-public-id-columns.sql`
```sql
-- ============================================================
-- MIGRACIÓN v4.16: PUBLIC_ID — IDENTIFICADOR EXTERNO NO SECUENCIAL
-- Fecha: 2026-09-04
-- ============================================================
-- Agrega una columna public_id (UUID) a las tablas cuyo id entero
-- secuencial se expone hoy en una URL o en texto visible al usuario.
-- No toca id, FKs ni JOINs existentes — cambio puramente aditivo.
--
-- gen_random_uuid() es nativo desde Postgres 13 (no requiere
-- extensión); el CREATE EXTENSION pgcrypto de abajo es un seguro
-- defensivo sin costo, igual al patrón ya usado 3x en este repo
-- para uuid-ossp (declarado pero nunca invocado).
--
-- DEFAULT gen_random_uuid() es VOLATILE, así que este ALTER reescribe
-- cada tabla para rellenar un valor único por fila existente (no es
-- el fast-path de metadata-only de un default constante). A este
-- tamaño de tablas es cuestión de milisegundos, pero toma un ACCESS
-- EXCLUSIVE lock mientras dura — correrlo fuera de hora pico.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE purchase_batches ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_batches_public_id ON purchase_batches(public_id);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_public_id ON sales(public_id);

ALTER TABLE events ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_public_id ON events(public_id);

ALTER TABLE credit_cards ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_cards_public_id ON credit_cards(public_id);
```
La unicidad es global por tabla (no por org, a diferencia de `sale_number`) — `public_id` está pensado como llave de búsqueda independiente a futuro, sin necesitar `org_id` al lado. Como ningún `INSERT` en ningún handler POST nombra `public_id` (verificado en `app/api/purchases|sales|events|credit-cards/route.ts`), cada fila nueva recibe una automáticamente — **no hace falta tocar código de escritura en ningún lado.**

## Cambios en rutas y tipos (solo lado de lectura)

El patrón se repite por tabla: agregar la columna a cada `SELECT` de listado/detalle, y agregar el campo del tipo en el `hooks/swr/use-*.ts` correspondiente. Algunas rutas ya devuelven la fila completa (`RETURNING *`, `SELECT s.*`, `...sale`) y no necesitan cambios — verificado directamente: `app/api/sales/[id]/route.ts` (hace spread de `...sale`), el POST de `app/api/events/route.ts` y los POST/PATCH de `app/api/credit-cards/*` (todos `RETURNING *`). Otras arman la respuesta campo por campo y necesitan una línea agregada — verificado directamente: el GET de listado de `app/api/events/route.ts` arma cada fila vía `rows.map((e) => { ...campos calculados... })`, así que necesita un `public_id: e.public_id,` explícito; igual en el GET de `app/api/events/[id]/route.ts`.

| Tabla | Archivos a tocar |
|---|---|
| `purchase_batches` | `app/api/purchases/route.ts` (GET listado: agregar `pb.public_id` al SELECT). `app/api/purchases/[id]/route.ts` — **se omite**, porque agrupa varios lotes cuando `import_batch_id` los vincula (`is_group`), así que un solo `public_id` no aplica limpio ahí. `hooks/swr/use-purchases.ts` — agregar `public_id: string;` a `Purchase`. |
| `sales` | `app/api/sales/route.ts` (GET listado: agregar `s.public_id` al SELECT). `app/api/sales/[id]/route.ts` — sin cambios (ya devuelve la fila completa). `hooks/swr/use-sales.ts` — agregar `public_id: string;` a `Sale`. |
| `events` | `app/api/events/route.ts` — agregar `e.public_id` al SELECT + `public_id: e.public_id,` al objeto armado a mano. `app/api/events/[id]/route.ts` (GET) — mismo cambio en dos puntos. `hooks/swr/use-events.ts` — agregar `public_id: string;` a `Event`. |
| `credit_cards` | `app/api/credit-cards/route.ts` (GET listado: agregar `public_id` al SELECT). `app/api/credit-cards/[id]/route.ts` (GET: agregar al SELECT, la respuesta ya hace spread de `...card`). `hooks/swr/use-credit-cards.ts` — agregar `public_id: string;` a `CreditCard`. |

## Prueba de concepto: arreglar la fuga de `purchase_batches`

`referenceLabel()` en `app/(dashboard)/inventory/[id]/page.tsx:184-193` recibe `product.movements`, que viene del query de movimientos de inventario en `app/api/products/[id]/detail/route.ts` — ese query ya hace `LEFT JOIN` con `sales` para resolver `sale_number` en filas tipo `SALE`, pero no tiene un join equivalente para filas `PURCHASE`. Agregar uno:

```sql
LEFT JOIN purchase_batches pb
  ON  pb.id = im.reference_id
  AND im.reference_type = 'PURCHASE'
  AND pb.org_id = ${orgId}
```
...y seleccionar `pb.public_id AS purchase_public_id`.

Luego en `inventory/[id]/page.tsx`: agregar `purchase_public_id: string | null` a `MovementRow`, y cambiar la rama `PURCHASE` de `referenceLabel()`:
```ts
if (type === "PURCHASE") {
  const shortId = purchasePublicId ? purchasePublicId.slice(0, 8) : (id ?? "");
  return `Compra #${shortId}`;
}
```

**Formato de exhibición: los primeros 8 caracteres hex, no el UUID completo.** Un UUID de 36 caracteres es inusable dentro de una celda de tabla de un dashboard; 8 caracteres son exactamente el primer grupo separado por guion del UUID (no necesita parseo extra) — la misma convención que un hash corto de git. Esto es puramente cosmético (la etiqueta no es una llave de búsqueda — la fila se sigue resolviendo por el id entero existente), así que el riesgo de colisión por truncar no importa aquí como sí importaría si fuera una llave real.

## Explícitamente fuera de alcance: cambiar las URLs `[id]` para usar `public_id`

Este plan no toca eso. Cada ruta `/sales/[id]`, `/inventory/[id]`, `/events/[id]`, `/finances/credit-cards/[id]` sigue parseando `Number(id)` + `isNaN` exactamente igual que hoy. Cambiar el esquema de URL en sí es una decisión materialmente más grande y separada: los links guardados/compartidos existentes (sobre todo las páginas de imprimir factura/recibo, que se envían por correo o se imprimen) darían 404, y el parseo de cada handler de ruta `[id]` tendría que volverse consciente de UUID. Si se retoma más adelante, debe planearse aparte, cubriendo la estrategia de redirección/compatibilidad con links viejos.

## Verificación (sin suite de tests automatizada — chequeo manual)

1. Antes de aplicar: confirmar versión de Postgres ≥13 (`SELECT version();`); aplicar primero en un branch de Neon si hay uno disponible.
2. Después de aplicar: `SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE column_name = 'public_id';` → se esperan exactamente 4 filas, todas `NO`. Luego `SELECT COUNT(*), COUNT(DISTINCT public_id) FROM sales;` (repetir por tabla) → los conteos deben coincidir.
3. Por tabla, abrir la página de listado + la de detalle, confirmar que nada cambia visualmente, e inspeccionar la respuesta de red en devtools para confirmar que `public_id` está presente.
4. Prueba de concepto: abrir `/inventory/[id]` de un producto con al menos una compra completada en su historial — confirmar que "Movimientos recientes" muestra `Compra #xxxxxxxx` (8 caracteres hex) en vez de un entero pequeño, y que las filas tipo `SALE` no se ven afectadas (chequeo de regresión sobre el join existente).
5. Correr `npx tsc --noEmit` después de los cambios de tipos — `next.config.mjs` tiene `ignoreBuildErrors: true`, así que un desajuste de tipos en `hooks/swr/use-*.ts` no aparecería en el build de otra forma.

### Archivos críticos
`database/migrations/v4.16-add-public-id-columns.sql` (nuevo) · `app/api/products/[id]/detail/route.ts` + `app/(dashboard)/inventory/[id]/page.tsx` (prueba de concepto) · `app/api/{purchases,sales,events,credit-cards}/route.ts` + sus `[id]/route.ts` · `hooks/swr/use-{purchases,sales,events,credit-cards}.ts`

---

# Parte 2 — Granularidad de permisos de rol por subitem

## Contexto

Hoy `org_role_permissions` otorga acceso solo a nivel de MÓDULO (una fila por `{rol, módulo}`, 9 módulos × 5 flags: `can_view/can_edit/can_delete/show_costs/show_profit`). La UI de edición de permisos en `/settings/roles` ya **muestra** subitems más finos como texto plano (ej. bajo "Inventario": "Inventario, Movimientos, En camino, Suministros"; bajo "Finanzas": "Cuentas, Transacciones, Tarjetas de crédito") — pero son solo decorativos. Un solo checkbox controla todos a la vez; no hay forma de otorgar "Movimientos" sin otorgar todo INVENTORY. Este plan hace del subitem la unidad real de permiso, dejando el módulo como un concepto puramente de agrupación visual.

Vale la pena nombrar una alternativa histórica descartada: un documento de diseño temprano (`database/docs/multi-org-architecture.md:113-127`) proponía reusar la tabla `system_features` (que hoy alimenta el sistema separado de features por plan de suscripción) para esto. **Verificado y descartado**: la lista CHECK de `system_features.category` no tiene `DASHBOARD` e incluye `INTEGRATIONS` (no calza 1 a 1 con `OrgModule`), sus filas `feature_key` ya sembradas no cubren los subitems que se necesitan (no hay key de tarjetas de crédito, ni de movimientos, etc.) — y, más importante, mezclaría dos sistemas estructuralmente separados: `system_features`/`plan_features` responden "qué puede hacer el **plan** de esta org" (sin dimensión de rol), mientras `org_role_permissions` responde "qué puede hacer este **rol**" (por miembro). Ambos ya se chequean de forma independiente en los mismos puntos del código (ej. `app/api/customers/route.ts:11-14` llama `requireModule(...)` y después `requireFeature(...)`) — fusionar su almacenamiento haría que futuros cambios al catálogo de planes pudieran romper silenciosamente los datos de permisos de rol.

**También verificado**: no existe ni un solo `requireModule(auth.data, 'ADMIN', ...)` en todo el código — `organization/roles/*` y `organization/members/*` se protegen directamente con `auth.data.isOwner`. O sea que los checkboxes de permisos del módulo ADMIN en la UI actual ya no tienen ningún efecto real. Este plan conserva eso tal cual (no lo arregla ni lo rompe en silencio) y lo señala explícitamente en vez de disimularlo.

## Modelo de datos objetivo: ampliar la tabla existente, no agregar una paralela

**Enfoque elegido**: agregar una columna `subitem` a la tabla `org_role_permissions` existente, cambiando su grano de `{role_id, module}` a `{role_id, module, subitem}`. Mismas 5 columnas de flags, misma tabla.

*Descartado: una segunda tabla paralela.* Solo pospone la misma migración de una vez, y agrega un problema permanente de sincronización (¿editar un subitem actualiza automáticamente una fila "resumen de módulo" en otro lado?) sin ningún beneficio real para un único consumidor de primera parte de estos datos.

### El catálogo de subitems (fuente única de verdad, 18 filas totales por rol — antes eran 9)

| Módulo | Subitems | Rutas existentes a las que corresponde |
|---|---|---|
| DASHBOARD | `DASHBOARD` (único) | `dashboard/*` |
| PRODUCTS | `PRODUCTS` (único) | `products/*` |
| INVENTORY | `STOCK`, `MOVEMENTS`, `INCOMING`, `SUPPLIES` | base de `inventory/*` · `inventory/movements/*` · `purchases/*` · `supplies/*` + `supply-purchases/*` |
| SALES | `SALES` (único) | `sales/*` — ver decisión pendiente A2 abajo |
| CUSTOMERS | `CUSTOMERS` (único) | `customers/*` |
| FINANCES | `ACCOUNTS`, `TRANSACTIONS`, `CREDIT_CARDS` | `accounts/*` · `transactions*/*` · `credit-cards*/*` |
| EVENTS | `EVENTS` (único) | `events/*` |
| REPORTS | `SALES`, `INVENTORY`, `PROFIT`, `EVENTS` | los 4 árboles `reports/*/route.ts` |
| ADMIN | `TEAM`, `ROLES` | ninguna ruta lo aplica hoy (ver arriba) |

Expresado una sola vez, en un nuevo `lib/permissions.ts` (deliberadamente sin imports exclusivos de servidor — seguro tanto para rutas de API como para componentes de cliente) como `MODULE_SUBITEMS: Record<OrgModule, {code, label}[]>`, reemplazando la lista de módulos hoy duplicada entre `lib/auth.ts`, `app/api/organization/roles/route.ts`, `app/api/organization/roles/[id]/route.ts`, `app/api/auth/me/route.tsx`, y el arreglo solo-de-anotación en `settings/roles/page.tsx`.

## Retrocompatibilidad: los roles existentes conservan el mismo acceso

Regla: otorgar el módulo X hoy = otorgar **todos** los subitems de X inmediatamente después de migrar, con los mismos valores de flags. Los módulos de subitem único (DASHBOARD/PRODUCTS/SALES/CUSTOMERS/EVENTS) solo reciben `subitem = module`, sin cambio de comportamiento. Los módulos que se dividen (INVENTORY/FINANCES/REPORTS/ADMIN): la fila existente se reutiliza como un subitem *default* elegido a propósito (`STOCK`, `ACCOUNTS`, `SALES`, `TEAM` respectivamente), y los subitems restantes son filas nuevas que **copian exactamente los mismos valores de flags**. Esto es verificable mecánicamente: los 5 flags de cada fila nueva deben ser iguales a los de su fila origen (query de verificación en la sección de Verificación).

## Aplicación: `requireModule` gana un 4to argumento opcional

```ts
// lib/auth.ts — antes
export async function requireModule(auth, module: OrgModule, permission: keyof ModulePermissions)
// después — por defecto usa el subitem índice 0 del módulo, así la mayoría de los usos no necesitan cambio
export async function requireModule(auth, module: OrgModule, permission: keyof ModulePermissions, subitem: string = MODULE_SUBITEMS[module][0].code)
```
Mismo patrón de 4to argumento opcional para `verifyModuleAccess` y `getModulePermissions`; el SQL solo agrega `AND subitem = ${subitem}` a la cláusula WHERE existente.

**Los defaults de índice 0 se eligieron a propósito** para que las rutas ya existentes y "sin calificar" de cada módulo dividido sigan funcionando sin cambios: `INVENTORY→STOCK` calza con la base de `inventory/route.ts`, `inventory/adjust`, `inventory/existing`; `FINANCES→ACCOUNTS` calza con `accounts/route.ts`; `REPORTS→SALES` calza con `reports/sales/*`. Solo las rutas de los *otros* subitems necesitan el 4to argumento explícito — concretamente:
- INVENTORY: `inventory/movements/*` → `'MOVEMENTS'`; `purchases/*` → `'INCOMING'`; `supplies/*` + `supply-purchases/*` → `'SUPPLIES'`.
- FINANCES: `transactions*/*`, `transaction-categories*/*` → `'TRANSACTIONS'`; `credit-cards*/*`, `credit-card-transactions/*` → `'CREDIT_CARDS'`.
- REPORTS: `reports/inventory/*` → `'INVENTORY'`; `reports/profit/*` → `'PROFIT'`; `reports/events/*` → `'EVENTS'`.
- Los `getModulePermissions(...)` correspondientes, usados para redactar costos/ganancia en esos mismos archivos, necesitan el mismo argumento de subitem agregado al lado.

Ejemplo — antes/después para una ruta de subitem de FINANCES (`app/api/credit-cards/route.ts`):
```ts
// antes
const deny = await requireModule(auth.data, 'FINANCES', 'canView');
// después
const deny = await requireModule(auth.data, 'FINANCES', 'canView', 'CREDIT_CARDS');
```

### Decisiones pendientes (señaladas, no resueltas todavía — resolver cuando se retome esto)

- **SALES se queda de subitem único** (no se divide en "ver historial" vs "usar POS") — la separación existente `canView`/`canEdit` en ese módulo ya cubre esa distinción. Revisar solo si aparece una necesidad real de un tercer eje; el schema soporta agregarle subitems a SALES después con el mismo patrón de migración.
- **`finances/summary`/`finances/periods` son resúmenes** que cruzan ACCOUNTS+TRANSACTIONS. Dejarlos en el default (`requireModule(..., 'FINANCES', 'canView')` → `ACCOUNTS`) bloquearía a un rol que solo tiene `TRANSACTIONS.canView`. Dos opciones: aceptar ese default, o agregar un helper chico `verifyAnySubitemAccess(auth, module, subitems[], permission)` solo para estas 2 rutas. Necesita una decisión, no es un mapeo mecánico.
- **Los subitems de ADMIN se quedan sin efecto** (igual que hoy — `isOwner` protege esas rutas directamente, no `requireModule`). Conectar de verdad los permisos de ADMIN para proteger `organization/members`/`organization/roles` sería una decisión aparte y más grande (¿pueden los no-dueños administrar roles?) — explícitamente fuera de alcance aquí.
- **`app/api/inventory/import/route.ts`** (importación masiva de Excel) toca varios subitems de INVENTORY en una sola petición; se recomienda dejar su chequeo en el default (`STOCK`) en vez de exigir STOCK+INCOMING a la vez, como simplificación deliberada para un endpoint de bajo tráfico.

## Cambios de UI — `app/(dashboard)/settings/roles/page.tsx`

`PermState` pasa de `Record<OrgModule, ModulePermissions>` (9 entradas) a `Record<OrgModule, Record<subitemCode, ModulePermissions>>` (18 hojas). La cantidad de filas en la grilla casi se duplica (45 → 90 checkboxes), así que el layout se reestructura, no solo se alarga:
- Los módulos de subitem único (5 de 9) se renderizan **exactamente igual que hoy** — sin cambio visual para la mayoría de la grilla.
- Los módulos con varios subitems (INVENTORY/FINANCES/REPORTS/ADMIN) se renderizan como **fila de encabezado de grupo + filas de subitem indentadas**. La fila de encabezado tiene un checkbox "seleccionar todo" de tres estados por columna (marcado/indeterminado/desmarcado) que activa/desactiva todos los subitems de ese módulo con un clic — reproduciendo el comportamiento actual de "otorgar todo el módulo de un clic" para dueños que no quieren entrar en detalle. El `Checkbox` de shadcn/Radix ya soporta estado indeterminado, así que no hace falta ninguna dependencia nueva.
- La vista mobile hoy solo imprime las etiquetas de subitem como texto estático sin ningún control — pasa a ser una lista agrupada/acordeón real, una adición interactiva genuina para mobile.
- El formato de guardado cambia de `{module: ModulePermissions}` a `{module: {subitem: ModulePermissions}}` — un cambio de formato que rompe compatibilidad, pero seguro porque los únicos consumidores son esta misma página y sus dos rutas de API (confirmado que ningún otro archivo lee/escribe este formato).

## Archivo de migración — `database/migrations/v4.17-subitem-role-permissions.sql`

(v4.16 está reservado por el plan de la Parte 1, todavía no es un archivo real — v4.17 es el siguiente número libre.)

```sql
-- ============================================================
-- MIGRACIÓN v4.17: PERMISOS DE ROL A NIVEL DE SUBITEM
-- Fecha: 2026-09-04
-- ============================================================
-- org_role_permissions pasa de {role, module} (9 filas/rol) a
-- {role, module, subitem} (18 filas/rol). Cada fila existente se
-- conserva o se abre en N filas con los MISMOS flags — ningún rol
-- pierde acceso que ya tenía. Antes de correr: confirmar el nombre
-- real de la UNIQUE constraint existente con \d org_role_permissions.
-- ============================================================

ALTER TABLE org_role_permissions ADD COLUMN IF NOT EXISTS subitem VARCHAR(50);

UPDATE org_role_permissions SET subitem = module
WHERE module IN ('DASHBOARD','PRODUCTS','SALES','CUSTOMERS','EVENTS') AND subitem IS NULL;

-- INVENTORY → STOCK (reusa fila), + MOVEMENTS, INCOMING, SUPPLIES (copian flags)
UPDATE org_role_permissions SET subitem = 'STOCK' WHERE module = 'INVENTORY' AND subitem IS NULL;
INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
SELECT p.role_id, 'INVENTORY', v.subitem, p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
FROM org_role_permissions p CROSS JOIN (VALUES ('MOVEMENTS'),('INCOMING'),('SUPPLIES')) AS v(subitem)
WHERE p.module = 'INVENTORY' AND p.subitem = 'STOCK';

-- FINANCES → ACCOUNTS (reusa), + TRANSACTIONS, CREDIT_CARDS
UPDATE org_role_permissions SET subitem = 'ACCOUNTS' WHERE module = 'FINANCES' AND subitem IS NULL;
INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
SELECT p.role_id, 'FINANCES', v.subitem, p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
FROM org_role_permissions p CROSS JOIN (VALUES ('TRANSACTIONS'),('CREDIT_CARDS')) AS v(subitem)
WHERE p.module = 'FINANCES' AND p.subitem = 'ACCOUNTS';

-- REPORTS → SALES (reusa), + INVENTORY, PROFIT, EVENTS
UPDATE org_role_permissions SET subitem = 'SALES' WHERE module = 'REPORTS' AND subitem IS NULL;
INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
SELECT p.role_id, 'REPORTS', v.subitem, p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
FROM org_role_permissions p CROSS JOIN (VALUES ('INVENTORY'),('PROFIT'),('EVENTS')) AS v(subitem)
WHERE p.module = 'REPORTS' AND p.subitem = 'SALES';

-- ADMIN → TEAM (reusa), + ROLES — solo por paridad con la UI, no aplicado hoy
UPDATE org_role_permissions SET subitem = 'TEAM' WHERE module = 'ADMIN' AND subitem IS NULL;
INSERT INTO org_role_permissions (role_id, module, subitem, can_view, can_edit, can_delete, show_costs, show_profit)
SELECT p.role_id, 'ADMIN', 'ROLES', p.can_view, p.can_edit, p.can_delete, p.show_costs, p.show_profit
FROM org_role_permissions p WHERE p.module = 'ADMIN' AND p.subitem = 'TEAM';

UPDATE org_role_permissions SET subitem = module WHERE subitem IS NULL; -- red de seguridad

ALTER TABLE org_role_permissions ALTER COLUMN subitem SET NOT NULL;

-- Verificar el nombre real antes de correr:
-- SELECT conname FROM pg_constraint WHERE conrelid = 'org_role_permissions'::regclass AND contype = 'u';
ALTER TABLE org_role_permissions DROP CONSTRAINT IF EXISTS org_role_permissions_role_id_module_key;
ALTER TABLE org_role_permissions ADD CONSTRAINT org_role_permissions_role_module_subitem_key UNIQUE (role_id, module, subitem);

ALTER TABLE org_role_permissions DROP CONSTRAINT IF EXISTS org_role_permissions_module_check;
ALTER TABLE org_role_permissions ADD CONSTRAINT org_role_permissions_module_subitem_check CHECK (
  (module = 'DASHBOARD' AND subitem = 'DASHBOARD') OR
  (module = 'PRODUCTS'  AND subitem = 'PRODUCTS')  OR
  (module = 'SALES'     AND subitem = 'SALES')     OR
  (module = 'CUSTOMERS' AND subitem = 'CUSTOMERS') OR
  (module = 'EVENTS'    AND subitem = 'EVENTS')    OR
  (module = 'INVENTORY' AND subitem IN ('STOCK','MOVEMENTS','INCOMING','SUPPLIES')) OR
  (module = 'FINANCES'  AND subitem IN ('ACCOUNTS','TRANSACTIONS','CREDIT_CARDS'))  OR
  (module = 'REPORTS'   AND subitem IN ('SALES','INVENTORY','PROFIT','EVENTS'))     OR
  (module = 'ADMIN'     AND subitem IN ('TEAM','ROLES'))
);

CREATE INDEX IF NOT EXISTS idx_org_role_perms_role_module ON org_role_permissions(role_id, module);
```

*Nota de trade-off*: el CHECK constraint necesita una migración de seguimiento cada vez que se agrega un subitem a un módulo — aceptable dado que este repo ya publica migraciones chicas y frecuentes. Una tabla de referencia normalizada evitaría eso pero no tiene precedente en este schema (todo otro vocabulario controlado aquí usa CHECK inline).

## Verificación (sin suite de tests automatizada)

**Antes de migrar, en un branch de Neon si hay uno disponible:**
1. Sacar una foto de `org_role_permissions` antes de correr nada.
2. Correr la migración, y luego comparar: cada par `(role_id, module)` debe producir filas de subitem con flags idénticos a la fila original de ese par — demuestra que no hay pérdida silenciosa de acceso.
3. Confirmar que cada rol termina con exactamente 18 filas.

**Después de desplegar, chequeo manual:**
4. Regresión: un rol que tenía `INVENTORY.canView=true` antes de migrar — confirmar que Inventario/Movimientos/En camino/Suministros siguen cargando para un miembro con ese rol.
5. Mismo chequeo de regresión para FINANCES y REPORTS (las 4 páginas de reportes + sus exports).
6. La nueva restricción funciona de verdad: como dueño, desmarcar solo "Movimientos" `canView` en un rol de prueba (dejar el resto de INVENTORY marcado); confirmar que ese rol pierde el link de Movimientos en el sidebar y que `GET /api/inventory/movements` da 403, mientras Inventario/En camino/Suministros siguen funcionando para el mismo rol/sesión.
7. Independencia de costos/ganancia (el bug de fondo que esto arregla): poner `INVENTORY.MOVEMENTS.show_costs=false` pero `INVENTORY.STOCK.show_costs=true` en un rol — confirmar que Movimientos oculta costos mientras Inventario los sigue mostrando, para el mismo rol.
8. El bypass de dueño no se ve afectado (el dueño nunca lee `org_role_permissions`).
9. Crear un rol nuevo siembra exactamente 18 filas, todas en `FALSE`; borrar un rol borra en cascada las 18.
10. El checkbox "seleccionar todo" de una columna activa/desactiva todos los subitems de ese módulo juntos y guarda correctamente.
11. Chequeo en viewport mobile de la grilla de permisos rediseñada.

### Archivos críticos
`database/migrations/v4.17-subitem-role-permissions.sql` (nuevo) · `lib/auth.ts` (`requireModule`, `verifyModuleAccess`, `verifyAnyModuleAccess`, `getModulePermissions`, `ensureOrgExists`) · `lib/permissions.ts` (nuevo — catálogo `MODULE_SUBITEMS`) · `app/api/organization/roles/route.ts` + `[id]/route.ts` · `app/api/auth/me/route.tsx` · `app/(dashboard)/settings/roles/page.tsx` · `components/app-sidebar.tsx` (el filtrado del nav debe volverse consciente de subitems)
