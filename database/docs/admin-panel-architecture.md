# Admin Panel — Panel de administración de plataforma

> **Estado:** En construcción.
> **Origen:** migración de `app/(dashboard)/admin/*` y `app/api/admin/*` (yelifin-sistema) a un
> repo separado, mismo patrón que ya se hizo con el panel de partners — ver
> [`partner-dashboard-architecture.md`](./partner-dashboard-architecture.md).
>
> **Código:** repo separado `hikonta-admin` (carpeta hermana de `yelifin-sistema`), no vive en
> este repo. Se conecta directo a esta misma base de datos de Neon (mismo `DATABASE_URL`) y al
> mismo proyecto de Firebase.

---

## Por qué se saca del repo principal

Mismas razones que motivaron `hikonta-partners`:

1. **Subdominio propio** (`admin.hikonta.com`), despliegue independiente en Vercel.
2. **Superficie de ataque separada.** El panel de admin es god-mode sobre toda la plataforma
   (crea/desactiva cualquier usuario, cambia contraseñas, edita cualquier suscripción, ve tamaño
   de la BD). Sacarlo del bundle del producto principal reduce lo que un usuario normal puede
   siquiera *ver* en el JS que se le sirve.
3. **Nadie necesita loguearse dos veces** — mismo proyecto Firebase, mismo patrón que partners:
   un administrador es un usuario de Firebase normal, vinculado vía `admins.user_id`.

---

## El problema que esto corrige: "admin" era un plan-hack no versionado

Hoy, `verifyAdmin()` en `yelifin-sistema/lib/auth.ts` funciona así:

```ts
export async function verifyAdmin(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (auth.data.subscription.planSlug !== "admin") { /* 403 */ }
  return auth;
}
```

Es decir: "admin" es un **`subscription_plans` row con `slug = 'admin'`**, y cualquier org cuyo
dueño tenga ese plan ve el panel `/admin`. Ese row **no existe en ningún script SQL versionado**
del repo (`database/ddl*.sql`, `database/migrations/*.sql`) — se insertó a mano directo en Neon en
algún momento. Riesgos:

- Nadie puede reconstruir el schema desde los scripts y tener un admin funcional.
- Es un "plan" de negocio (con precio, límites, billing_interval) usado como bandera de acceso de
  plataforma — dos conceptos distintos mezclados en una sola fila.
- Cualquier cambio accidental a ese plan (o a quién se lo asignan) es un cambio de superficie de
  seguridad silencioso, sin auditoría.

**Este panel usa una tabla dedicada `admins`** (`database/admin/01-admin-infrastructure.sql`),
mismo patrón que `partners`:

```sql
CREATE TABLE admins (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

El script de migración siembra `admins` automáticamente a partir de quien hoy tenga el plan
`admin`, para no perder acceso en la transición.

**Lo que esto NO cambia:** dentro de `yelifin-sistema`, `planSlug === 'admin'` se sigue usando
para el bypass de feature-gating del producto (`feature-gate.tsx`, `use-plan-guard.ts`,
`app-sidebar.tsx` — "el plan admin ve todo"). Eso es una decisión de producto separada y no se
toca. `admins` es exclusivamente la puerta de entrada a `hikonta-admin`.

---

## Alcance migrado (paridad con `yelifin-sistema`)

| Origen (yelifin-sistema) | Destino (hikonta-admin) |
|---|---|
| `lib/auth.ts` → `verifyAdmin()` | `lib/auth.ts` → `verifyAdmin()` (contra `admins`, no `planSlug`) |
| `app/api/admin/stats/route.ts` | `app/api/admin/stats/route.ts` |
| `app/api/admin/storage/route.ts` | `app/api/admin/storage/route.ts` |
| `app/api/admin/users/route.ts` (GET+POST) | igual |
| `app/api/admin/users/[id]/route.ts` (GET+PATCH) | igual |
| `app/api/admin/plans/route.ts` (GET+POST) | igual |
| `app/api/admin/plans/[id]/route.ts` (PATCH+DELETE) | igual |
| `app/api/admin/plans/[id]/features/route.ts` (GET+PUT) | igual |
| `app/(dashboard)/admin/page.tsx` | `app/(admin)/dashboard/page.tsx` |
| `app/(dashboard)/admin/users/page.tsx` + `[id]` | `app/(admin)/users/page.tsx` + `[id]` |
| `app/(dashboard)/admin/plans/page.tsx` + `[id]` | `app/(admin)/plans/page.tsx` + `[id]` |

La lógica SQL de cada ruta es prácticamente idéntica — el único cambio real es la fuente de
identidad (`admins` en vez de `planSlug`). El frontend usa el mismo stack que ya usaba en
`yelifin-sistema` para estas pantallas específicamente: **shadcn/ui + Radix + lucide-react +
recharts** (a diferencia de `hikonta-partners`, que deliberadamente no usa shadcn — este panel es
mucho más pesado en formularios/diálogos/toggles, así que portar el mismo kit reduce riesgo de
reescritura).

**No migrado a `hikonta-admin`:** creación de usuarios sigue creando una `organization` completa
(`ensureOrgExists()`, portado también) — un admin puede seguir dando de alta un negocio nuevo
manualmente desde el panel, igual que hoy.

---

## Pendiente

- [ ] Correr `database/admin/01-admin-infrastructure.sql` en Neon y verificar el sembrado.
- [ ] Decidir si se apaga `/admin` en `yelifin-sistema` (rutas + páginas) una vez que
      `hikonta-admin` esté validado en producción, o se deja como fallback temporal.
- [ ] Deploy: proyecto en Vercel + dominio `admin.hikonta.com` + variables de entorno.
- [ ] UI de gestión de la propia tabla `admins` (agregar/quitar administradores) — hoy es un
      `INSERT`/`UPDATE` manual en Neon, igual que la aprobación de partners.
- [ ] Considerar 2FA o allowlist de IP para este panel — es el único con capacidad de resetear
      contraseñas de cualquier usuario de la plataforma.
