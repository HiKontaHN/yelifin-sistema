# Multi-Org Migration — Estado del Trabajo

> **Rama:** `feat/multi-org-migration`  
> **Última sesión:** 30 de mayo de 2026  
> **Estado global:** ✅ Migración completa y funcional. Solo quedan tareas futuras opcionales.

---

## Resumen ejecutivo

La arquitectura pasó de **1 usuario = 1 negocio** a **1 organización = N usuarios con roles**.  
Todos los datos del tenant usan `org_id` como clave de aislamiento.  
Los permisos se verifican en cada ruta API. La UI de gestión de equipo está construida.  
La rama está lista para merge a `main` cuando se valide en staging.

---

## Arquitectura implementada

```
Firebase Auth (UID)
  └─► users (id, firebase_uid, is_active)
        └─► organization_members (org_id, role_id)
              ├─► organizations (id, name, owner_user_id, timezone, currency, locale, logo_url)
              │     └─► org_subscriptions (plan_id, status)
              └─► org_roles (id, name, is_owner)
                    └─► org_role_permissions (module, can_view, can_edit, can_delete, show_costs, show_profit)
```

**Módulos con permisos:** `PRODUCTS` · `INVENTORY` · `SALES` · `CUSTOMERS` · `FINANCES` · `EVENTS` · `REPORTS` · `ADMIN`

---

## ✅ Completado

### Base de datos

| Script | Descripción |
|--------|-------------|
| `database/migrations/v4-multi-org-infrastructure.sql` | Crea las 5 tablas nuevas. Migra usuarios existentes a su propia org con rol "Dueño" y suscripción. |
| `database/migrations/v4.1-add-org-id-to-data-tables.sql` | Agrega `org_id NOT NULL` a las 24 tablas de datos. Popula desde `user_id`. |
| `database/migrations/v4.2-add-audit-fields.sql` | Agrega `created_by` y `updated_by` a las 24 tablas. Backfill desde `user_id`. |

Todos ejecutados en Neon ✅.

---

### `lib/auth.ts`

| Función | Descripción |
|---------|-------------|
| `verifyAuth(request)` | Resuelve usuario + org + rol en un JOIN. Devuelve `{ userId, orgId, roleId, roleName, isOwner }`. |
| `verifySubscription(orgId)` | Usa `org_subscriptions`. |
| `verifyFeatureAccess(orgId, featureKey)` | Usa `org_subscriptions`. |
| `verifyResourceLimit(orgId, type)` | Cuenta por `org_id`. |
| `verifyModuleAccess(auth, module, permission)` | Verifica permiso del rol. OWNER → bypass inmediato sin DB. |
| `getModulePermissions(auth, module)` | Devuelve los 5 flags del rol en un módulo. |
| `requireModule(auth, module, permission)` | Helper: devuelve `Response 403 \| null`. Uso en routes: `const deny = await requireModule(auth.data, 'SALES', 'canEdit'); if (deny) return deny;` |
| `getOrgTimezone(orgId)` | Reemplaza la consulta a `user_profile`. |
| `ensureOrgExists(userId, name, ...)` | Crea org + rol + membership + suscripción. Usado en login y creación de usuarios. |

---

### API Routes

**58 rutas de negocio** migradas de `user_id` → `org_id` + `requireModule` en cada handler:

| Rutas | Módulo |
|-------|--------|
| `/api/products/*` | `PRODUCTS` |
| `/api/inventory/*`, `/api/purchases/*`, `/api/supplies/*`, `/api/supply-purchases/*` | `INVENTORY` |
| `/api/sales/*` | `SALES` |
| `/api/customers/*` | `CUSTOMERS` |
| `/api/transactions/*`, `/api/accounts/*`, `/api/credit-cards/*`, `/api/credit-card-transactions/*`, `/api/transaction-categories/*`, `/api/finances/*` | `FINANCES` |
| `/api/events/*` | `EVENTS` |
| `/api/reports/*` | `REPORTS` |

**Rutas nuevas de organización:**
- `GET/PATCH /api/organization` — perfil de la org
- `GET /api/organization/members` — listar miembros
- `POST /api/organization/members/create-user` — crear usuario nuevo y agregarlo al equipo (OWNER only; crea en Firebase + PostgreSQL)
- `PATCH/DELETE /api/organization/members/[id]` — cambiar rol / revocar acceso
- `GET/POST /api/organization/roles` — listar / crear roles con permisos
- `PATCH/DELETE /api/organization/roles/[id]` — editar / eliminar roles

---

### Frontend

**Hooks:**
- `useMe()` — expone `orgId`, `roleId`, `isOwner`, `org`, `role`, `permissions`, `getModulePermissions(module)`
- `useModulePermissions(module)` — hook standalone con los 5 flags + `isLoading`
- `hooks/swr/use-organization.ts` — CRUD completo para org, miembros y roles

**Tipos nuevos en `types/index.ts`:**
`OrgModule` · `ModulePermissions` · `OrgInfo` · `OrgRole` · `OrgMember` · `OrgPermissions`

**Páginas nuevas/actualizadas:**
- `/settings/organization` — edita nombre, logo, timezone, moneda (solo owner)
- `/settings/members` — lista miembros, crea usuarios nuevos con email + contraseña, cambia rol, revoca acceso
- `/settings/roles` — crea/edita/elimina roles; grilla de permisos 8 módulos × 5 flags

**Sidebar:**
- "Equipo" y "Roles" aparecen solo cuando `isOwner = true`
- Muestra `org.name` y `org.logo_url` como fallback para miembros sin `business_name`

**`/api/auth/me`:**
- Migrado a `org_subscriptions`
- Respuesta incluye `org`, `role`, `permissions` (todos los módulos)

---

## ⬜ Pendiente (futuro — no bloquea)

### ~~1. Sidebar dinámico por permisos de rol~~ ✅ Completado
Cada ítem del nav ahora tiene `module?: OrgModule`. El sidebar filtra con `getModulePermissions(module).can_view` antes de renderizar. Durante la carga (`meIsLoading`) se muestran todos los ítems para evitar layout shift. Dashboard no tiene módulo y siempre es visible.

---

### 2. Flujo de invitación por email
Para cuando el usuario ya tiene cuenta en otra plataforma y quiere unirse a una org sin que el dueño le cree las credenciales.

**Diseño:**
```sql
CREATE TABLE org_invitations (
  id          BIGSERIAL PRIMARY KEY,
  org_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id     BIGINT NOT NULL REFERENCES org_roles(id)     ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  token       VARCHAR(255) UNIQUE NOT NULL,
  invited_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**APIs necesarias:**
- `POST /api/organization/invite` — genera token, envía email (requiere Resend / SendGrid)
- `POST /api/organization/invite/accept` — verifica token, crea membership
- `GET /invite/[token]` — página landing para aceptar

---

### 3. Selector de org (multi-org)
Cuando un usuario sea miembro de múltiples orgs. `verifyAuth()` hoy toma la primera por `joined_at ASC`.

**Cómo retomarlo:** Agregar `X-Org-ID` header en los requests del cliente; `verifyAuth()` lo lee si existe, sino usa el primero.

---

### 4. DROP de `user_id` como tenant key
Las 24 tablas de datos aún tienen la columna `user_id` original. Ya no se usa como filtro, pero existe.

**Cuándo hacerlo:** Una vez que la rama esté en producción estable por 1–2 semanas. Crear `v5-drop-user-id.sql`.

---

## Decisiones de diseño tomadas

| Decisión | Razón |
|----------|-------|
| Roles personalizados por org (no roles fijos del sistema) | Cada negocio nombra sus roles como quiere (Cajero, Bodeguero, etc.) |
| OWNER tiene bypass total sin consulta a DB | Performance — la mayoría de usuarios son owners |
| "Agregar usuario existente por email" fue eliminado | Brecha de seguridad — un owner podría agregar a cualquier usuario sin consentimiento |
| Los miembros se crean con credenciales completas (email + password) | Control total del owner; no requiere servicio de email |
| `user_id` se mantiene en tablas de datos como `created_by` | Auditoría de quién creó cada registro |
| `org_subscriptions` tiene `UNIQUE (org_id)` — una suscripción por org | El dueño paga por la org, no por cada miembro |
