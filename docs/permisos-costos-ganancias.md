# Permisos de costos/ganancias — progreso

## Problema

Los roles de organización tienen flags `show_costs` / `show_profit` por módulo
(`org_role_permissions`), y `lib/auth.ts` expone las utilidades para aplicarlos:

- `getModulePermissions(auth, module)` — trae `{ canView, canEdit, canDelete, showCosts, showProfit }` del rol.
- `nullifyKeysDeep(payload, keys)` — anula (pone `null`) recursivamente las claves indicadas en la respuesta.

El patrón correcto en un endpoint `GET` es:

```ts
const perms = await getModulePermissions(auth.data, 'MODULO');
const payload = { ...datos };
if (!perms.showCosts)  nullifyKeysDeep(payload, new Set([...claves de costo]));
if (!perms.showProfit) nullifyKeysDeep(payload, new Set([...claves de ganancia]));
return Response.json(payload);
```

Esto ya estaba aplicado en los endpoints de **reportes** (`/api/reports/*`), pero
faltaba en los endpoints "operativos" que también devuelven costos/ganancias
en su JSON. Antes de la corrección, esos endpoints solo validaban `canView`
—no filtraban el contenido— por lo que un usuario sin `show_costs`/`show_profit`
podía ver los valores reales inspeccionando la respuesta de red (aunque el
frontend ocultara la columna visualmente).

## Estado por endpoint

| Módulo | Endpoint | Backend filtra costos/ganancias | Frontend oculta si no hay permiso |
|---|---|---|---|
| REPORTS | `GET /api/reports/sales(+/export)` | ✅ (ya existía) | ✅ |
| REPORTS | `GET /api/reports/profit(+/export)` | ✅ (ya existía) | ✅ |
| REPORTS | `GET /api/reports/inventory(+/export)` | ✅ (ya existía) | ✅ |
| REPORTS | `GET /api/reports/events(+/export)` | ✅ (ya existía) | ✅ |
| **EVENTS** | `GET /api/events` | ✅ **corregido** | ✅ **corregido** |
| **EVENTS** | `GET /api/events/[id]` | ✅ **corregido** | ✅ **corregido** |
| SALES | `GET /api/sales` | ❌ pendiente | ⚠️ parcial (`sales/page.tsx` oculta ganancia en UI, pero el JSON trae `net_profit`/`stats.total_profit` igual) |
| SALES | `GET /api/sales/[id]` | ❌ pendiente | ⚠️ no verificado |
| INVENTORY | `GET /api/inventory` | ❌ pendiente | ⚠️ parcial (`inventory/page.tsx` oculta columna con `showCosts`, pero el JSON trae `avg_unit_cost`/`total_value` igual) |
| INVENTORY | `GET /api/inventory/movements` | ❌ pendiente | ⚠️ no verificado |
| INVENTORY | `GET /api/purchases?with_items=true` | ❌ pendiente | ⚠️ no verificado |
| PRODUCTS | `GET /api/products/[id]/detail` | ❌ pendiente | ⚠️ no verificado |

## Cambios aplicados — EVENTS (esta sesión)

**Backend**

- `app/api/events/route.ts` — se agrega `getModulePermissions` + `nullifyKeysDeep`.
  Si `!perms.showProfit`, se anulan `total_expenses`, `net_profit`, `roi` en cada
  evento de la lista.
- `app/api/events/[id]/route.ts` — mismo patrón. Si `!perms.showProfit`, se anulan
  `total_profit`, `total_expenses`, `net_profit`, `roi` (en `summary`), `profit`
  (por venta) y `amount` (por gasto adicional).
- `fixed_cost` **no** se oculta (es un dato que el propio usuario ingresó al crear
  el evento, mismo criterio ya usado en `/api/reports/events`).

**Frontend**

- `hooks/swr/use-events.ts` — los campos anulables ahora son `number | null`
  (`total_expenses`, `net_profit`, `roi`, `total_profit`, `profit` de venta,
  `amount` de gasto).
- `components/events/event-card.tsx` — nueva prop `showProfit`; oculta el bloque
  "Gastos" y el bloque "Ganancia neta / ROI" cuando es `false`. Ajusta el grid
  de 2 a 1 columna cuando corresponde.
- `app/(dashboard)/events/page.tsx` — pasa `showProfit` a `EventCard`; sumas
  agregadas (`totalProfit`, `avgRoi`) usan `?? 0` para tolerar `null`.
- `app/(dashboard)/events/[id]/page.tsx` — usa `useModulePermissions("EVENTS")`
  para leer `show_profit` y:
  - oculta las tarjetas "Gastos totales" y "Ganancia neta" del resumen,
  - oculta "Ganancia de ventas", "Costo fijo del evento", "Gastos adicionales"
    y "Ganancia neta" del desglose financiero,
  - oculta la ganancia por venta en la lista de ventas del evento,
  - oculta por completo la tarjeta "Gastos adicionales" (montos de gasto),
  - todos los usos de `net_profit`/`roi`/`total_expenses`/`total_profit` ahora
    toleran `null` con `?? 0` para no romper el render.

**Nota:** no se corrió `npm run lint` / `tsc --noEmit` en esta sesión porque el
proyecto no tiene `node_modules` instalado en este entorno. Pendiente correr
antes de mergear.

## Siguiente paso sugerido

Aplicar el mismo patrón (backend + revisión de frontend) a, en este orden de
impacto/uso:

1. `app/api/sales/route.ts` + `app/api/sales/[id]/route.ts`
2. `app/api/inventory/route.ts` + `app/api/inventory/movements/route.ts`
3. `app/api/products/[id]/detail/route.ts`
4. `app/api/purchases/route.ts` (`with_items=true`)

En cada uno, replicar: agregar `getModulePermissions`/`nullifyKeysDeep` en el
handler, marcar los tipos de los hooks SWR afectados como `number | null`, y
revisar el componente de página/tarjeta correspondiente para que oculte —no
solo el dato ya reciba `null`— cualquier cálculo derivado (evitar `.toFixed()`
sobre `null`, sumas `NaN`, etc.), igual que se hizo aquí para `EVENTS`.
