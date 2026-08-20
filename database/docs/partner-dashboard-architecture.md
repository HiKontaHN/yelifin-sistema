# Partner Dashboard — Panel para Incubadoras/Aceleradoras

> **Estado:** En construcción — scaffold funcionando localmente con datos reales, sin desplegar.
> **Última revisión:** 18 de agosto de 2026
> **Origen:** Spec recibida en stack ajeno (NestJS + TypeORM + SQL Server, sobre "CRM-TVC").
> Este documento traduce esa idea a la arquitectura real de HiKonta (Next.js + Postgres/Neon,
> multi-org — ver [`multi-org-architecture.md`](./multi-org-architecture.md)).
>
> **Código:** repo separado `hikonta-partners` (carpeta hermana de `yelifin-sistema`), no vive en
> este repo. Se conecta directo a esta misma base de datos de Neon (mismo `DATABASE_URL`) y al
> mismo proyecto de Firebase — ver el `README.md` de ese repo para el detalle. Los scripts SQL en
> `database/partners/` de **este** repo siguen siendo la fuente de verdad del schema; el repo
> `hikonta-partners` no trae sus propias migraciones.

---

## Contexto (sin cambios respecto al spec original)

Incubadoras/aceleradoras necesitan monitorear a los emprendedores que usan HiKonta:

- Ver qué emprendedores están activos/inactivos
- Monitorear adopción de la plataforma
- Tomar decisiones de mentoring basadas en data real
- Reportar tracción a su directiva

**Usuarios objetivo:** coordinadores/directores de incubadoras.
**Alcance MVP:** panel de solo lectura sobre actividad y adopción.

---

## Por qué el spec original no aplica tal cual

El documento recibido asume un backend NestJS/TypeORM sobre SQL Server, con un modelo
`Partner → Users (emprendedores 1:1)`. HiKonta es distinto en tres puntos que cambian el diseño:

1. **Stack:** Next.js App Router + SQL directo sobre Postgres (Neon), no NestJS/TypeORM/SQL Server.
   No hay migraciones de TypeORM — el patrón del repo es DDL versionado en `database/` + `neon()` con
   el template tag `sql` (ver `lib/auth.ts` y cualquier ruta en `app/api/`).
2. **La unidad de negocio ya no es el usuario, es la organización.** Desde la migración multi-org
   (`v4`–`v4.4`), cada "emprendedor" (negocio) es una **`organizations`** row, no un `users` row. Un
   usuario puede ser miembro de una org sin ser su dueño (cajero, bodeguero, etc.), así que
   "Partner → Users" debe ser en realidad **"Partner → Organizations"**.
3. **No existe tracking de actividad/login hoy.** No hay `ActivityLog` ni `last_login` en `users`.
   Hay que decidir si se construye (instrumentación nueva) o se deriva de datos que ya existen
   (`sales.sold_at`, `transactions.occurred_at`, etc. — ver sección de métricas).

El resto de la idea (resumen, tabla de emprendedores, actividad reciente, reporte de adopción)
se traslada bien al modelo de HiKonta.

---

## Carpeta de migraciones

Los scripts de esta feature viven en `database/partners/` (numerados, uno por paso), separados de
`database/migrations/` porque son una feature propia, no parte del núcleo multi-org:

| # | Script | Estado |
|---|--------|--------|
| 01 | `01-migrate-subscription-payments.sql` | ✅ ejecutado en Neon — migra `subscription_payments` a `org_id`/`org_subscription_id` |
| 02 | `02-partners-infrastructure.sql` | ✅ ejecutado en Neon — crea `partners` + `partner_organizations` (con `share_financials`) + `paid_by_partner_id` en `subscription_payments` |
| 03 | `03-seed-test-data.sql` | ✅ ejecutado — **solo dev**, vincula el partner de prueba `id=1` a 6 organizaciones reales existentes |
| 04 | `04-invite-codes.sql` | ⬜ pendiente de ejecutar en Neon — crea `partner_invite_codes` (resuelve la pregunta abierta #6 de más abajo) |

`verifyPartner()` y las rutas `app/api/partner/*` (código, no SQL) también están escritos — ver
`hikonta-partners/README.md`.

---

## Modelo de datos propuesto (Postgres, sigue el estilo de `database/migrations/`)

```sql
-- ============================================================
-- v5: PARTNER DASHBOARD (borrador — no ejecutado)
-- ============================================================

-- Partners = incubadoras/aceleradoras (tabla de plataforma, como subscription_plans)
CREATE TABLE partners (
  id             BIGSERIAL    PRIMARY KEY,
  name           VARCHAR(255) NOT NULL,             -- "Aceleradora Terra"
  contact_name   VARCHAR(255),
  email          VARCHAR(255) NOT NULL UNIQUE,
  phone          VARCHAR(30),
  user_id        BIGINT       REFERENCES users(id),  -- login del coordinador (Firebase, igual que todos)
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_partners_user ON partners(user_id);

-- Relación N:N — una org puede ser monitoreada por 1+ partners (ej. un emprendedor
-- graduado de una incubadora y luego aceptado en otra); un partner ve N orgs.
CREATE TABLE partner_organizations (
  id           BIGSERIAL PRIMARY KEY,
  partner_id   BIGINT    NOT NULL REFERENCES partners(id)      ON DELETE CASCADE,
  org_id       BIGINT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  linked_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (partner_id, org_id)
);

CREATE INDEX idx_partner_orgs_partner ON partner_organizations(partner_id);
CREATE INDEX idx_partner_orgs_org     ON partner_organizations(org_id);
```

**Por qué no `ALTER TABLE Users ADD partnerID`:** el spec original asume 1 usuario = 1 emprendedor.
En HiKonta el emprendedor es la *organización* (puede tener varios usuarios). `partner_organizations`
además permite N:N sin forzar cambios en `organizations`, y no rompe el aislamiento multi-tenant
existente (`org_id` sigue siendo la única tenant key en las 24 tablas de negocio).

**Partner como "login":** igual que el admin de plataforma hoy se identifica con
`subscription.planSlug === 'admin'` (ver `verifyAdmin()` en `lib/auth.ts`), un coordinador de partner
inicia sesión con Firebase como cualquier usuario; su fila en `users` se vincula 1:1 vía
`partners.user_id`. No necesita pertenecer a ninguna `organization_members` — es un rol de
plataforma, no un rol de org.

### Actividad — dos caminos, elegir uno

**Opción A (recomendada para el MVP): derivar de datos existentes, sin instrumentar nada nuevo.**
"Última actividad" de una org = `MAX(sold_at)` en `sales` UNION `MAX(occurred_at)` en `transactions`
UNION `MAX(created_at)` en `products`/`inventory_movements`, filtrado por `org_id`. Esto es más
representativo de uso real de HiKonta que un login (alguien puede loguearse y no hacer nada), y
sale gratis con los índices que ya existen (`idx_sales_org`, etc. de `v4.1`).

**Opción B: tabla `activity_log` real**, si a futuro se necesita granularidad tipo "exportó un
reporte" o "inició sesión":

```sql
CREATE TABLE activity_log (
  id         BIGSERIAL   PRIMARY KEY,
  org_id     BIGINT      NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50) NOT NULL, -- 'LOGIN','CREATE_SALE','EXPORT_REPORT',...
  details    JSONB,
  created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_activity_log_org ON activity_log(org_id, created_at DESC);
```

Requeriría escribir un `logActivity()` en cada endpoint relevante — costo real, no MVP.

---

## Suscripciones compradas — pagos, meses y patrocinio por partner

`subscription_payments` existe en el schema desde `ddl.v2`/`v3` pero **nunca se migró al modelo
multi-org ni la usa ningún endpoint hoy** (apunta a `user_id` + `user_subscriptions`, el modelo
viejo). Arreglarla es la base tanto para llevar historial de pagos en general como para que un
partner pueda "patrocinar" meses de plan a una org de su portafolio — **es el mismo mecanismo**, no
dos sistemas separados.

**Columnas nuevas sobre `subscription_payments`** (ver `database/partners/01-migrate-subscription-payments.sql`
y `02-partners-infrastructure.sql`, ambos ejecutados en Neon):

- `org_id`, `org_subscription_id` — repuntan la tabla a `organizations`/`org_subscriptions` (paso 01).
- `months_purchased INT` — cuántos meses cubre el pago. Necesario porque no todo pago sigue el
  `billing_interval` del plan: un pago manual (admin extendiendo trial, o patrocinio de partner)
  puede ser cualquier cantidad de meses.
- `covers_period_start` / `covers_period_end` — qué período cubrió *ese* pago puntual. Sin esto se
  pierde el historial cuando `org_subscriptions.current_period_end` se sobrescribe en cada renovación.
- `paid_by_partner_id` (paso 02, referencia a `partners(id)`, `ON DELETE SET NULL`) — `NULL` en un
  pago normal del dueño; con valor cuando la incubadora patrocinó el plan de esa org.

**Aplicar un pago a la suscripción** — falta el pegamento entre "se registró un pago `PAID`" y
"extender `org_subscriptions.current_period_end`". Se resuelve con un helper nuevo, p. ej.
`applySubscriptionPayment(orgId, monthsPurchased, opts)` en `lib/auth.ts` (o `lib/billing.ts` si se
prefiere separarlo): si el período actual no ha vencido, acumula los meses sobre
`current_period_end`; si ya venció, arranca desde hoy. Inserta la fila en `subscription_payments`
con `covers_period_start/end` calculados y deja `status = 'ACTIVE'` en `org_subscriptions`.

Uso:
- `POST /api/admin/organizations/[id]/payments` — registro manual desde el panel admin de HiKonta.
- `POST /api/partner/organizations/[id]/sponsor` — mismo helper, pasando `paidByPartnerId`.

**Reporte de meses patrocinados por partner:**

```sql
SELECT org_id, SUM(months_purchased) AS meses_patrocinados
FROM subscription_payments
WHERE paid_by_partner_id = ${partnerId}
GROUP BY org_id;
```

---

## Backend — rutas API (Next.js, patrón `app/api/admin/*`)

Nuevo helper en `lib/auth.ts`, análogo a `verifyAdmin()`:

```typescript
export async function verifyPartner(request: NextRequest) {
  const auth = await verifyAuth(request); // reutiliza el JOIN de siempre, no hace falta que tenga org
  // ... o una variante propia que solo valida el Firebase token y busca en `partners` por user_id,
  // ya que un coordinador de partner puede no tener ninguna organization_members.
  const [partner] = await sql`
    SELECT id, name, is_active FROM partners WHERE user_id = ${userId} AND is_active = TRUE
  `;
  if (!partner) return { error: "Acceso denegado — no eres un partner", status: 403, data: null };
  return { error: null, status: 200, data: { partnerId: partner.id, partnerName: partner.name } };
}
```

Rutas (solo lectura, sin `can_edit`/`can_delete` — no hay concepto de rol dentro del partner en el MVP):

```
app/api/partner/dashboard/route.ts        GET  resumen (5 métricas)
app/api/partner/organizations/route.ts    GET  lista de orgs monitoreadas + estado
app/api/partner/organizations/[id]/route.ts GET detalle de una org
app/api/partner/activity/route.ts         GET  actividad reciente (opción A o B)
app/api/partner/reports/adoption/route.ts GET  % adopción
```

Toda query filtra con:

```sql
WHERE o.id IN (SELECT org_id FROM partner_organizations WHERE partner_id = ${partnerId})
```

— el mismo principio de aislamiento por tenant que ya usa el resto del sistema, solo que la
tenant key aquí es un `partner_id` sobre un *conjunto* de orgs en vez de una sola.

### Ejemplo — `GET /api/partner/dashboard` (opción A de actividad)

```typescript
const orgs = await sql`
  SELECT o.id, o.name, o.created_at,
    GREATEST(
      COALESCE((SELECT MAX(sold_at)     FROM sales         WHERE org_id = o.id), o.created_at),
      COALESCE((SELECT MAX(occurred_at) FROM transactions  WHERE org_id = o.id), o.created_at)
    ) AS last_activity_at
  FROM organizations o
  WHERE o.id IN (SELECT org_id FROM partner_organizations WHERE partner_id = ${partnerId})
`;

const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
const active = orgs.filter(o => new Date(o.last_activity_at) >= thirtyDaysAgo);

return Response.json({
  summary: {
    totalOrganizations: orgs.length,
    activeOrganizations: active.length,
    adoptionRate: orgs.length ? (active.length / orgs.length * 100).toFixed(2) : "0",
    inactiveOrganizations: orgs.length - active.length,
  },
});
```

**Importante — nada de ingresos/costos sin permiso explícito.** El spec original suma
`totalIncomeReported` libremente. En HiKonta eso choca con `show_costs`/`show_profit` del modelo
de permisos por rol (ver `multi-org-architecture.md`). Para un partner, esto debe ser una decisión
consciente de negocio (¿el emprendedor consintió compartir sus finanzas con la incubadora?), no un
`SUM(amount)` automático. Sugerido: campo `share_financials BOOLEAN DEFAULT FALSE` en
`partner_organizations`, y solo agregar montos si está en `TRUE`.

---

## Frontend

El spec usa Ant Design + axios. HiKonta usa **shadcn/ui + Tailwind v4 + SWR** en todo el resto de la
app — mantener consistencia (ver `ui-consistency-auditor`):

- `app/(partner)/dashboard/page.tsx` — nuevo *route group*, paralelo a `(dashboard)`, con su propio
  layout/sidebar (un coordinador de partner no debe ver el sidebar de un negocio).
- `hooks/swr/use-partner.ts` — sigue el patrón de `use-organization.ts`.
- Tablas con el `DataTable` compartido de `components/shared/`, no una tabla de Ant Design nueva.
- Paginación a 10 registros, como el resto de la app ([[feedback_pagination_limit]]).

---

## Seguridad

- Un partner nunca debe poder editar datos de la org — todas las rutas son `GET`.
- `middleware.ts` debe reconocer `app/(partner)` como protegido igual que `(dashboard)`, pero el
  Firebase UID que entra ahí debe resolver a una fila en `partners`, no a `organization_members` —
  si un usuario normal intenta entrar a `/partner/...`, `verifyPartner()` lo rechaza con 403.
- Nunca exponer contraseñas ni tokens — eso ya lo garantiza el patrón actual (nunca se seleccionan
  esas columnas en ningún query existente).
- Ingresos/costos solo si `share_financials = TRUE` por org (ver arriba).

---

## Diferencias clave vs. el spec original (resumen)

| Spec original | HiKonta real |
|---|---|
| NestJS + TypeORM + SQL Server | Next.js API routes + SQL directo (Neon/Postgres) |
| `Partner → Users` (1 emprendedor = 1 usuario) | `Partner → Organizations` (N:N vía `partner_organizations`) |
| `ActivityLog` nueva, todo instrumentado | Opción A: derivar de `sales`/`transactions` existentes, sin tocar nada más |
| JWT con `partnerId` embebido | `partners.user_id → users.id`, resuelto en cada request como el resto del sistema |
| Ant Design + axios | shadcn/ui + Tailwind + SWR |
| Ingresos sumados libremente | Requiere opt-in (`share_financials`) por org — cuestión de privacidad del emprendedor |

---

## Preguntas abiertas antes de construir (igual que el spec original, sin resolver aún)

1. ¿Quiénes acceden al panel — director, coordinador, mentor? ¿Un partner puede tener varios
   coordinadores (multi-usuario, como `organization_members` pero para partners)?
2. ¿Qué métricas son realmente críticas para las incubadoras?
3. ¿Se necesitan alertas automáticas de inactividad? (requeriría cron/job — no existe hoy en el repo)
4. ¿Exportar a Excel? (ya existe patrón — ver agente `excel-report-analyst`)
5. **Nueva, específica de HiKonta:** ¿el emprendedor debe *consentir* explícitamente que su
   incubadora vea sus datos (y cuáles)? Afecta si `partner_organizations` se crea desde admin
   (asignación directa) o requiere aceptación del owner de la org.
6. ~~¿Cómo se vincula una org a un partner?~~ **Resuelto (2026-08-19):** códigos de invitación —
   ver `04-invite-codes.sql` (tabla `partner_invite_codes`) y `lib/partner-invites.ts` en este
   repo. El partner genera el código desde `hikonta-partners` ("Agregar organización" en
   `/organizations`); el emprendedor lo canjea acá, en `/register?ref=CODIGO` (cuenta nueva, ver
   `app/api/auth/register`) o en Configuración → Organización (cuenta existente, ver
   `app/api/organization/link-partner`). El emprendedor SIEMPRE es quien confirma el vínculo —
   responde también, de paso, la pregunta 5: es opt-in explícito, igual que `share_financials`.

---

## Esfuerzo estimado (orden de magnitud, sin comprometer)

| Área | Notas |
|---|---|
| DDL: `partners` + `partner_organizations` | Baja — 2 tablas, sin migrar datos existentes |
| `verifyPartner()` en `lib/auth.ts` | Baja |
| 5 rutas API de solo lectura | Media — la mayoría son agregaciones sobre tablas existentes |
| Route group `(partner)` + layout propio | Media |
| UI: dashboard, tabla de orgs, actividad, reporte adopción | Media-Alta — 4 vistas nuevas con shadcn/ui |
| Flujo de vinculación org↔partner + consentimiento | Media — depende de la respuesta a la pregunta 5/6 |
| Tracking de actividad real (Opción B) | Alta — instrumentar cada endpoint; **no es MVP** |
