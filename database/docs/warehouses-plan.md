# Bodegas — stock separado por ubicación física

Implementado en la migración `v4.20-warehouses.sql`. Este documento resume el
alcance acordado, para no tener que reconstruirlo leyendo el código.

## Motivación

Antes de esto, todo el inventario de una org vivía en un solo pool sin
noción de "dónde" está físicamente. El dueño quería registrar más de un
local/bodega ("Bodega 1", "Local Principal") con stock genuinamente
separado entre ellos — no solo una etiqueta decorativa.

## Modelo de datos

- `warehouses` (org_id, name, is_active, is_default) — una fila por bodega.
  Cada org existente recibió una bodega "Local Principal" (`is_default =
  TRUE`) en la migración, y todo su inventario/ventas/compras actuales
  quedó asignado a ella — nada se rompe para las orgs de hoy.
- `inventory_batches.warehouse_id` (NOT NULL) — cada lote de stock
  pertenece a una sola bodega.
- `inventory_movements.warehouse_id` (nullable — es un log histórico).
- `sales.warehouse_id` (NOT NULL) — de qué bodega descontó esa venta.
- `purchase_batches.warehouse_id` (NOT NULL) — a qué bodega llegó esa compra.
- `organization_members.default_warehouse_id` (nullable) — bodega asignada
  a cada miembro del equipo.
- `subscription_plans.max_warehouses` — límite por plan (mismo patrón que
  `max_users`, ver `v4.19-plan-user-limits.sql`): Trial/Básico = 1,
  Pro = 3 (uno por cada uno de sus 3 usuarios posibles), Original/Admin
  = sin límite.
- `warehouse_transfers` + `warehouse_transfer_items` — mover stock de una
  bodega a otra (ver abajo).

## Decisión clave: selector condicional según el flujo

- **Ventas: nunca hay selector.** La venta descuenta automáticamente de la
  bodega asignada al usuario que la registra
  (`organization_members.default_warehouse_id`), y si no tiene ninguna
  asignada (el dueño, o una org con una sola bodega) cae a la bodega
  `is_default` de la org. `lib/warehouses.ts` →
  `getDefaultWarehouseForUser()`.
- **Compras (individual y por Excel), ajuste manual de inventario:** sí
  muestran un selector de bodega, pero **solo si la org tiene 2+ bodegas
  activas** — con una sola bodega, el selector no aparece y todo se asigna
  a esa única bodega en silencio. `lib/warehouses.ts` →
  `resolveWarehouseId()`.

## Motor FIFO

`lib/fifo.ts` (`consumeFifo`/`restoreTakes`) recibe `warehouseId` y filtra
los lotes candidatos por bodega, además de por producto/variante — una
venta en la Bodega 2 nunca puede agotar el stock de la Bodega 1.

## Transferencias entre bodegas

`app/api/organization/warehouses/transfers/route.ts` — consume FIFO en la
bodega de origen (mismo mecanismo atómico que una venta) y crea un lote
nuevo en el destino con el costo promedio ponderado de lo consumido.
Necesario porque, una vez el stock está genuinamente separado, alguien
tiene que poder mover unidades de una bodega recién creada (que nace
vacía) hacia/desde la bodega existente.

## Explícitamente fuera de alcance

Nada de estantes/sub-ubicaciones dentro de una bodega — jerarquía plana
(solo bodega), sin bodega→estante. Se puede agregar después con el mismo
patrón si hace falta.

## UI

- `/settings/warehouses` — crear/renombrar/activar/desactivar bodegas,
  marcar cuál es la default de la org, y registrar transferencias. Solo
  visible para el dueño (mismo nivel que Equipo/Roles en el sidebar).
- `/settings/members` — al crear o editar un miembro, selector de bodega
  asignada (solo visible si hay 2+ bodegas).
- Selector condicional (2+ bodegas) en: `AddInventoryDialog` (compra
  individual), `ImportExcelModal` (compra masiva), `AdjustInventoryDialog`
  (ajuste manual).
