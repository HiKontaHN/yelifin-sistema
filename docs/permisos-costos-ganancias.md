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

## Cambios aplicados — Cuentas seleccionables sin acceso a FINANZAS (sesión siguiente)

**Problema encontrado:** `GET /api/accounts` exigía `FINANCES.canView` de forma
dura (`requireModule`). Un rol con acceso a SALES/INVENTORY/EVENTS pero sin
acceso a FINANZAS recibía 403 al intentar listar cuentas, por lo que el
selector de "Cuenta" se quedaba vacío/roto al registrar una venta, una compra
de inventario/insumos o un gasto de evento — aunque esos módulos sí necesitan
elegir a qué cuenta entra/sale el dinero.

**Backend**

- `lib/auth.ts` — nuevo helper `verifyAnyModuleAccess(auth, modules[], permission)`:
  igual que `verifyModuleAccess` pero concede acceso si CUALQUIERA de los
  módulos indicados otorga el permiso (una sola query con `module = ANY(...)`).
- `app/api/accounts/route.ts` (`GET`) — reemplaza el gate único de FINANZAS por
  `verifyAnyModuleAccess(..., ['FINANCES','SALES','INVENTORY','PRODUCTS','EVENTS'], 'canView')`.
  El `balance` de cada cuenta se anula (`nullifyKeysDeep`) si el rol no tiene
  `FINANCES.canView` — el id/nombre/tipo sí viajan siempre para poder
  seleccionar la cuenta, pero el saldo (dato financiero) sigue oculto a roles
  sin acceso a FINANZAS. `POST /api/accounts` (crear cuenta) no cambió: sigue
  exigiendo `FINANCES.canEdit`, porque gestionar cuentas es una operación de
  FINANZAS, no de selección.

**Frontend**

- `hooks/swr/use-accounts.ts` — `Account.balance` ahora es `number | null`.
- Selectores de cuenta que mostraban el saldo junto al nombre (solo se
  visitan desde flujos de INVENTORY/PRODUCTS, donde el saldo puede venir
  `null`): `components/products/inventory-section/purchase-form.tsx`,
  `components/products/add-inventory-dialog.tsx` (2 selectores),
  `components/products/confirm-purchase-arrival-dialog.tsx`,
  `components/supplies/add-supply-purchase-dialog.tsx` — ahora ocultan el
  `<span>` del saldo cuando es `null`, en vez de mostrar "$0" (que se leía
  como saldo real y no como dato oculto).
- `components/transactions/edit-transaction-modal.tsx` y
  `create-transaction-modal.tsx` — el tipo local de `accounts` prop se
  actualizó a `balance: number | null` para que coincida con el tipo
  compartido (estas vistas están detrás de `ModuleGuard module="FINANCES"`,
  así que en la práctica siempre reciben el saldo real).

`npx tsc --noEmit` corrió limpio tras el cambio. `npm run lint` no se pudo
ejecutar en este entorno (eslint no resuelto en PATH), pendiente correr antes
de mergear.

## Cambios aplicados — SALES (esta sesión)

**Backend**

- `app/api/sales/route.ts` (lista) — se agrega `getModulePermissions`/`nullifyKeysDeep`.
  Si `!perms.showProfit`, se anula `net_profit` en cada fila y `stats.total_profit`
  agregado. (El frontend de la lista ya ocultaba estos campos en UI — esto cierra
  la fuga en la respuesta de red.)
- `app/api/sales/[id]/route.ts` (detalle) — cambio más grande: antes el endpoint
  devolvía `unit_cost` crudo por item y el frontend calculaba costo/ganancia/margen
  en el cliente. Ahora:
  - El backend calcula `products_cost`, `supplies_cost`, `net_profit`, `margin_pct`
    (a nivel venta) y `item_profit`/`item_margin` (por item) con la misma fórmula
    que antes vivía en el frontend.
  - Si `!showCosts`: anula `items[].unit_cost`, `supplies[].unit_cost`,
    `supplies[].line_total`, `products_cost`, `supplies_cost`.
  - Si `!showProfit`: anula `items[].item_profit`, `items[].item_margin`,
    `net_profit`, `margin_pct`.
  - `items[].line_total` (precio de venta, no costo) nunca se anula — por eso
    costo y ganancia se filtran en llamadas separadas de `nullifyKeysDeep` en
    vez de una sola pasada con las mismas claves.

**Frontend**

- `hooks/swr/use-sales.ts` — `Sale.net_profit`, `SalesStats.total_profit`,
  `SaleDetail.{products_cost,supplies_cost,margin_pct}`,
  `items[].{unit_cost,item_profit,item_margin}` y `supplies[].{unit_cost,line_total}`
  ahora son `number | null`.
- `app/(dashboard)/sales/page.tsx` — los dos usos de `sale.net_profit - sale.discount`
  y el cálculo de `%` de ganancia agregada ahora toleran `null` con `?? 0`
  (ya estaban condicionados a `showProfit` en el render; esto es solo para que
  TypeScript no truene).
- `app/(dashboard)/sales/[id]/page.tsx` — usa `useModulePermissions("SALES")`:
  - la tarjeta "Ganancia neta/estimada" del resumen financiero se oculta si
    `!showProfit` (grid pasa de 2 a 1 columna),
  - cada card de producto oculta "Costo: X/u" si `!showCosts` y oculta la
    ganancia (+X) / margen (%) si `!showProfit`,
  - la tarjeta "Desglose" completa se oculta si falta `showCosts` **o**
    `showProfit` (mezcla costo y ganancia; así lo pidió el usuario en vez de
    filtrar línea por línea),
  - ya no recalcula costo/ganancia/margen en el cliente — usa directamente
    `sale.products_cost` / `sale.supplies_cost` / `sale.net_profit` / `sale.margin_pct`
    que llegan pre-calculados (y ya filtrados) del backend.

`npx tsc --noEmit` corrió limpio. `npm run lint` sigue sin poder ejecutarse en
este entorno (eslint no resuelto en PATH).

**Pendiente relacionado (no tocado esta sesión):** `app/(dashboard)/sales/new/page.tsx`
y `app/(dashboard)/sales/[id]/edit/page.tsx` también referencian `unit_cost`/margen
al armar el carrito (para mostrarle al vendedor una ganancia estimada mientras
registra la venta) — no se tocaron porque el pedido de esta sesión fue puntual
sobre el detalle ya registrado; revisar si esos flujos de creación/edición deben
seguir el mismo criterio de `showCosts`/`showProfit`.

## Cambios aplicados — Configuración solo-propietario (esta sesión)

Este no es un bug de `show_costs`/`show_profit`, sino de acceso por **isOwner**:
cualquier miembro de la organización (sin importar su rol) podía ver y navegar
a "Mi Negocio", "Categorías" y "Suscripción" dentro de Configuración — el
sidebar los mostraba a todos y las páginas no verificaban `isOwner`.

**Frontend**

- `components/shared/owner-guard.tsx` — nuevo, mismo patrón visual que
  `ModuleGuard` ("Sin acceso" + botón volver), pero basado en `useMe().isOwner`
  en vez de permisos por módulo.
- `app/(dashboard)/settings/organization/page.tsx`,
  `.../settings/categories/page.tsx`, `.../settings/billing/page.tsx` — el
  contenido de cada página se movió a un componente interno
  (`*Content`/`*PageContent`) envuelto en `<OwnerGuard>`, así que entrar por
  URL directa también bloquea a quien no es dueño (antes solo se ocultaba el
  link del sidebar).
- `components/app-sidebar.tsx` — "Mi Negocio", "Categorías" y "Suscripción" se
  movieron de `settingsNavBase` (visible a todos) a `settingsNavOwner`
  (ya usado por "Equipo"/"Roles", solo visible si `isOwner`).
- `components/nav-user-menu.tsx` — el atajo "Plan X" del menú de usuario
  (enlazaba directo a `/settings/billing`) ahora solo es clicable si
  `isOwner`; si no, se muestra como texto informativo sin link.

**Backend — qué se dejó igual a propósito**

- `PATCH /api/organization` ya exigía `auth.data.isOwner` server-side — sin
  cambios, ya estaba correcto.
- `GET/POST/PATCH/DELETE /api/transaction-categories(/[id])` **no** se tocó:
  sigue gateado por `FINANCES.canEdit/canDelete`, no por `isOwner`. Es a
  propósito — ese mismo endpoint alimenta el selector de categoría en
  `create-transaction-modal.tsx`/`edit-transaction-modal.tsx`/tarjetas de
  crédito, usados por cualquier rol con acceso a FINANZAS (no solo el dueño).
  Restringirlo a `isOwner` habría repetido el mismo bug que se corrigió antes
  para `/api/accounts` (roles no-dueño quedando sin poder seleccionar algo que
  sí necesitan para registrar sus movimientos). Lo que se restringió a dueño
  fue únicamente la **página de gestión** en Configuración (crear/editar/
  eliminar categorías desde ahí), no el listado que consumen los formularios.
- `GET /api/organization` no se tocó — la info que expone (nombre, logo,
  timezone, moneda) ya la recibe cualquier miembro vía `/api/auth/me`, así
  que no hay dato nuevo que se esté filtrando.

`npx tsc --noEmit` corrió limpio.

## Cambios aplicados — Detalle de producto en Inventario (esta sesión)

`app/api/products/[id]/detail/route.ts` no filtraba nada — devolvía costo
promedio, último costo, costo por lote, costo de historial de compras,
ganancia total y costo promedio de venta siempre en crudo. Se aplicó el
mismo patrón que en EVENTS/SALES/PRODUCTS, con dos particularidades:

- **Se usa el módulo `INVENTORY`** (no `PRODUCTS`) para `show_costs`/
  `show_profit`, porque esta vista solo se llega desde `/inventory` y la
  lista de inventario ya usa `INVENTORY` para ocultar su columna de costo —
  mismo criterio, para no tener dos módulos distintos controlando la misma
  sección. El `canView` de acceso a la página se dejó como estaba
  (`PRODUCTS.canView`, sin tocar).
- **Margen ahora se calcula en el backend** (`margin_pct` a nivel producto y
  por variante), igual que se hizo con `net_profit`/`margin_pct` en SALES —
  así se puede ocultar la ganancia sin depender de que el cliente reciba el
  costo real.

**Backend — nulling**
- `!showCosts` → anula `avg_cost`, `last_cost`, `unit_cost` (batches +
  purchase_history), `unit_cost_usd`, `avg_unit_cost` (sales_stats); además
  `cost_history` se manda como `[]` en vez de anular cada punto, para que el
  frontend (que solo dibuja el gráfico si hay >1 punto) lo oculte solo.
- `!showProfit` → anula `total_profit` (sales_stats) y `margin_pct`
  (producto + cada variante).

**Frontend (`app/(dashboard)/inventory/[id]/page.tsx`)** — usa
`useModulePermissions("INVENTORY")`:
- tarjetas resumen "Costo promedio" (`showCosts`) y "Margen" (`showProfit`)
  se ocultan individualmente,
- tabla de Variantes: columna "Costo prom." (`showCosts`) y "Margen"
  (`showProfit`) se ocultan por separado,
- **"Análisis de rentabilidad"**: tarjeta completa oculta si falta
  `showCosts` **o** `showProfit` (así lo pidió el usuario, igual que
  "Desglose" en SALES),
- **Batches de inventario**: columna "Costo unitario" oculta sin
  `showCosts`; el resto de la tabla (fecha, variante, compradas,
  disponibles) se mantiene visible,
- **Gráfico "Evolución del precio de entrada"**: oculto sin `showCosts`
  (ya viene vacío del backend; el `showCosts &&` en el frontend es solo
  defensa adicional),
- **Historial de compras** (no pedido explícitamente, pero misma clase de
  dato): columnas "Costo USD"/"Costo local" ocultas sin `showCosts`; fecha,
  proveedor y cantidad se mantienen,
- **Movimientos recientes**: sin cambios — no muestra costo ni ganancia, tal
  como pidió el usuario ("solo los movimientos recientes dependiendo del
  permiso que tenga" — ya estaba correcto, gateado solo por `canView` del
  módulo al entrar a la página).
- se eliminó el cálculo de margen en el cliente (`calcMargin`) — ahora usa
  directamente `product.margin_pct` / `variant.margin_pct` del backend.

`npx tsc --noEmit` corrió limpio.

## Cambios aplicados — Lista de inventario (esta sesión)

Este cerraba el pendiente original de `GET /api/inventory` (nunca filtraba
nada) y además un bug de UI que no tenía que ver con el backend: la columna
**"Valor total"** nunca estuvo condicionada a `showCosts` en el frontend —
solo "Costo prom." lo estaba. Pasaba en las 6 vistas del listado (fila
principal, fila de producto base expandida, fila de variante — cada una en
su versión desktop/tabla y mobile/card): un rol sin `show_costs` no veía
"Costo prom." pero sí veía "Valor total" (que es `stock × costo`, la misma
información con un paso extra).

**Backend** (`app/api/inventory/route.ts`)
- Se agrega `getModulePermissions`/`nullifyKeysDeep`. Sin `showCosts` se
  anulan `avg_unit_cost`, `total_value`, `base_avg_unit_cost`,
  `base_total_value` — a nivel de fila, dentro de `variants_stock[]` (json
  agregado por SQL) y en `stats.total_value`. Una sola pasada de
  `nullifyKeysDeep` sobre toda la respuesta cubre los tres niveles porque los
  nombres de clave no se repiten con otro significado en este endpoint.

**Frontend** (`app/(dashboard)/inventory/page.tsx`)
- `hooks/swr/use-inventory.ts` — los 5 campos anulables ahora son
  `number | null`.
- Se corrigió la columna/celda "Valor total" para que dependa de `showCosts`
  igual que "Costo prom.", en los 6 lugares: fila principal (desktop +
  mobile), `BaseTableRow`/`BaseCard` (producto base expandido) y
  `VariantTableRow`/`VariantCard` (variante expandida). Se ajustaron
  `colSpan`/conteo de skeleton de la tabla desktop (`7`/`5` en vez de
  `7`/`6`) y las clases `grid-cols-3`/`grid-cols-1` de las cards mobile
  (antes `grid-cols-2`, ya no aplica porque ahora también "Valor total" se
  oculta, dejando solo "Precio venta").
- La tarjeta de stats "Valor" (agregado, arriba de la lista) ya estaba
  correctamente gateada por `showCosts` desde antes — solo se ajustó el
  `format()` para tolerar `null`.

`npx tsc --noEmit` corrió limpio.

## Cambios aplicados — "En camino" / compras pendientes (esta sesión)

Cierra el último pendiente de la tabla original (`PURCHASES`). A diferencia
de SALES/EVENTS, esta página no tiene concepto de "ganancia" — una compra es
100% costo (lo que se pagó por adquirir inventario), así que solo aplica
`show_costs`. Además el pedido esta vez fue más amplio ("filtrar por los
permisos de los roles", no solo costos/ganancias): los botones "Confirmar
llegada"/"Cancelar" no tenían ningún guard en el frontend — el backend ya
exigía `canEdit`/`canDelete` (`PATCH`/`DELETE /api/purchases/[id]`), pero
cualquier usuario con solo `canView` los veía igual y se topaba con un 403 al
usarlos.

**Backend** (`app/api/purchases/route.ts`, `GET`)
- Se agrega `getModulePermissions`/`nullifyKeysDeep`. Sin `showCosts` se
  anulan `subtotal`, `shipping`, `total` (por lote) y `unit_cost`/
  `unit_cost_usd` (por item). Este mismo endpoint alimenta tanto
  `usePurchases()` (todas) como `usePendingPurchases()` (pendientes,
  `with_items=true`), así que el filtro cubre ambos usos.
- `POST`/`PATCH`/`DELETE` no se tocaron — crear, confirmar y cancelar compras
  siguen exigiendo `canEdit`/`canDelete` en INVENTORY como ya estaba.

**Frontend** (`app/(dashboard)/purchases/pending/page.tsx`)
- `hooks/swr/use-purchases.ts` — `Purchase.{subtotal,shipping,total}` y
  `PurchaseItemDetail.{unit_cost,unit_cost_usd}` ahora son `number | null`.
- Usa `useModulePermissions("INVENTORY")`:
  - stat "Inversión" oculta sin `showCosts` (grid pasa de 3 a 2 columnas),
  - en cada card: el total+moneda (esquina superior derecha) y la línea
    "Envío: X" se ocultan sin `showCosts`; el costo unitario por producto en
    la lista de items también se oculta (cantidad y nombre se mantienen),
  - botón **"Cancelar"** ahora requiere `canDelete` (antes sin gate),
  - botón **"Confirmar llegada"** ahora requiere `canEdit`, y si además falta
    `showCosts` se reemplaza por una nota ("Necesitas permiso de costos para
    confirmar la llegada") en vez del botón — esta acción implica ingresar/
    revisar el costo real de envío y ajustar el balance de una cuenta, así
    que no tiene sentido dejarla completar a ciegas sin `showCosts`; sí queda
    disponible si el rol tiene ambos permisos.
- `components/products/confirm-purchase-arrival-dialog.tsx` — todos los usos
  de `purchase.subtotal/shipping/total` ahora toleran `null` con `?? 0` (en
  la práctica siempre reciben valor real, porque el botón que abre este
  diálogo ya está condicionado a `showCosts`).
- `components/products/cancel-purchase-dialog.tsx` — el texto de
  confirmación omite la frase "por $X" cuando `purchase.total` es `null`, en
  vez de mostrar un monto falso de "$0.00".

`npx tsc --noEmit` corrió limpio.

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
