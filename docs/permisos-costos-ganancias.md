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
| **SALES** | `GET /api/sales` | ✅ **corregido** (+ doble validación con EVENTS) | ✅ **corregido** |
| **SALES** | `GET /api/sales/[id]` | ✅ **corregido** (+ doble validación con EVENTS) | ✅ **corregido** |
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

## Cambios aplicados — SALES + doble validación con EVENTS (esta sesión)

**Problema adicional detectado:** una venta puede estar ligada a un evento
(`sales.event_id`). Desde el detalle de evento se navega a `/sales/[id]`, que
es una pantalla del módulo **SALES** — protegida solo por `SALES.canView`, sin
mirar `EVENTS` en absoluto. Antes de esta sesión, además, `SALES` no filtraba
costos/ganancias del todo (gap ya anotado arriba como "❌ pendiente"): tanto
`GET /api/sales` como `GET /api/sales/[id]` devolvían `net_profit`/`unit_cost`
reales sin mirar `show_costs`/`show_profit`, aunque el frontend ya ocultaba
esas columnas visualmente en `sales/page.tsx`.

**Regla adoptada — doble validación (AND) para ventas de evento:** para que se
muestre ganancia/costo de una venta con `event_id` no basta con el permiso de
`SALES`; también se requiere `EVENTS.showProfit`. Gana el más restrictivo:

```
showProfit = SALES.showProfit AND (venta.event_id es null OR EVENTS.showProfit)
```

`SALES.showCosts` se evalúa aparte y solo a nivel de `SALES` (no hay concepto
de "costos" en `EVENTS` hoy — `fixed_cost` nunca se oculta, mismo criterio que
ya existía).

**Backend**

- `app/api/sales/route.ts` (`GET`, lista + stats) — se agrega
  `getModulePermissions('SALES')` y `getModulePermissions('EVENTS')`. La query
  de `stats.total_profit` excluye en SQL la ganancia de ventas con `event_id`
  cuando `!EVENTS.showProfit` (`AND (s.event_id IS NULL OR ${eventProfitOk})`
  en el `CASE`); si `!SALES.showProfit` se anula el stat completo. Por fila,
  `net_profit` se anula a `null` si falta `SALES.showProfit` o si la venta
  tiene `event_id` y falta `EVENTS.showProfit`.
- `app/api/sales/[id]/route.ts` (`GET`) — no había ningún cálculo de ganancia
  server-side; el frontend la deriva de `sale_items.unit_cost` /
  `sale_supplies.unit_cost`. Por eso el campo que se anula es `unit_cost`
  (items y supplies) cuando falta `SALES.showCosts` **o** falta el
  `showProfit` combinado (SALES AND EVENTS si aplica) — anular solo `showCosts`
  no hubiera bastado, porque con costos ocultos pero perfil de ganancia
  "permitido" igual se puede derivar el margen si el AND con EVENTS lo estaba
  bloqueando. También se anula `sale_supplies.line_total` (es costo, a
  diferencia de `sale_items.line_total` que es precio de venta y se mantiene
  visible).

**Frontend**

- `hooks/swr/use-sales.ts` — `Sale.net_profit`, `SalesStats.total_profit`,
  `SaleDetail.items[].unit_cost` y `SaleDetail.supplies[].unit_cost/line_total`
  ahora son `number | null`.
- `app/(dashboard)/sales/page.tsx` — las celdas/tarjetas de ganancia por fila
  ahora chequean `sale.net_profit != null` además del flag `showProfit` del
  módulo (una fila individual puede venir nula por el AND con EVENTS aunque el
  rol sí vea ganancias de `SALES` en general). El stat agregado de la cabecera
  no necesitó guard adicional: solo se muestra cuando `showProfit` (SALES) es
  `true`, y en ese caso el backend nunca lo devuelve `null`.
- `app/(dashboard)/sales/[id]/page.tsx` — nueva lógica `canSeeCosts =
  SALES.show_costs && SALES.show_profit && (!event_id || EVENTS.show_profit)`
  vía `useModulePermissions("SALES")` + `useModulePermissions("EVENTS")`.
  Oculta: la tarjeta de "Ganancia neta/estimada" (grid pasa de 2 a 1 columna),
  el costo/ganancia/margen por producto vendido, la tarjeta completa de
  "Suministros usados" (son costo, no ingreso), y el bloque de "Costo
  productos / Costo suministros / Ganancia neta" del desglose. Los cálculos
  (`productsCost`, `suppliesCost`) usan `?? 0` para tolerar `null` sin romper
  el render cuando el bloque está oculto.

**Nota:** no se corrió `npm run lint` / `tsc --noEmit` en esta sesión.
Pendiente correr antes de mergear.

## Siguiente paso sugerido

Aplicar el mismo patrón (backend + revisión de frontend) a, en este orden de
impacto/uso:

1. `app/api/inventory/route.ts` + `app/api/inventory/movements/route.ts`
2. `app/api/products/[id]/detail/route.ts`
3. `app/api/purchases/route.ts` (`with_items=true`)

En cada uno, replicar: agregar `getModulePermissions`/`nullifyKeysDeep` en el
handler, marcar los tipos de los hooks SWR afectados como `number | null`, y
revisar el componente de página/tarjeta correspondiente para que oculte —no
solo el dato ya reciba `null`— cualquier cálculo derivado (evitar `.toFixed()`
sobre `null`, sumas `NaN`, etc.), igual que se hizo aquí para `EVENTS` y
`SALES`. Si algún otro módulo también puede quedar "ligado" a otro (como
`SALES`↔`EVENTS`), evaluar si necesita la misma doble validación (AND).
