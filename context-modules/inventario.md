# Módulo Inventario — registro y compra de stock

> Estado verificado contra el código el **2026-09-01**.
> Cubre las cinco vías por las que entra stock al sistema, el modelo FIFO, el
> estado `PENDING` ("en camino") y los dos sistemas de importación por Excel.

---

## 1. La idea central

**El stock no se almacena en ninguna columna.** No existe `products.stock`. El
stock actual de un producto siempre se calcula al vuelo como:

```sql
SELECT COALESCE(SUM(qty_available), 0)
FROM inventory_batches
WHERE org_id = ? AND product_id = ? AND variant_id IS NOT DISTINCT FROM ?
```

`inventory_batches` es la tabla de **capas FIFO**: cada entrada de mercancía
crea una fila nueva con su propio `unit_cost` y su `received_at`. Las ventas
consumen esas capas en orden de `received_at ASC` (`lib/fifo.ts`), descontando
`qty_available`. El costo de venta (COGS) sale del `unit_cost` de la capa
consumida, no de un promedio.

Junto a eso, `inventory_movements` es una **bitácora append-only**: cada
entrada o salida deja un registro con `movement_type` (`IN`/`OUT`/`ADJUST`) y
`reference_type` (`PURCHASE`/`SALE`/`ADJUSTMENT`/`INITIAL`/`SALE_CANCELLED`/`SALE_EDITED`).
La bitácora es solo auditoría — **no participa en el cálculo del stock**. Si un
writer inserta la capa pero olvida el movimiento, el stock sigue correcto y el
historial queda incompleto.

### Invariantes a respetar en cualquier cambio

1. Toda entrada de stock = 1 fila en `inventory_batches` + 1 fila en `inventory_movements`.
2. Toda salida de stock pasa por `consumeFifo()` (`lib/fifo.ts:30`). Nunca hacer
   `UPDATE qty_available` a mano: el `CHECK (qty_available >= 0)` es la única
   defensa contra sobregiro y `consumeFifo` es lo que la respeta bajo concurrencia.
3. Los servicios (`products.is_service = TRUE`) **no tienen inventario**. Todas
   las rutas de entrada los rechazan explícitamente.
4. Todo filtra por `org_id` (multi-tenant). `user_id` es legacy y hoy es
   *nullable* — ver §7.

---

## 2. Las cinco vías de entrada de stock

| # | Vía | Endpoint | Crea compra | Mueve dinero | `reference_type` |
|---|---|---|---|---|---|
| 1 | Compra (producto nuevo o existente) | `POST /api/purchases` | Sí | Sí | `PURCHASE` |
| 2 | "Ya lo tengo" / existencia inicial | `POST /api/inventory/existing` | No | **No** | `INITIAL` |
| 3 | Ajuste manual positivo | `POST /api/inventory/adjust` (`type:"in"`) | No | No | `ADJUSTMENT` |
| 4 | Import Excel moderno | `POST /api/inventory/import` | Según fila | Según fila | `PURCHASE` o `INITIAL` |
| 5 | Confirmar llegada de compra pendiente | `PATCH /api/purchases/[id]` | Ya existía | Ajuste de envío | `PURCHASE` |

Salidas de stock: ventas (`app/api/sales/route.ts`), ajustes negativos
(`/api/inventory/adjust` con `type:"out"`) y eventos.

---

## 3. Modelo de datos

```
organizations
    │ org_id (NOT NULL en todas las tablas de abajo)
    ▼
products ──1:N──> product_variants
    │                    │
    │  (product_id)      │ (variant_id, nullable = fila "base")
    ▼                    ▼
purchase_batches ──1:N──> purchase_batch_items ──0:1──> inventory_batches
   (cabecera de compra)      (línea de compra)            (capa FIFO)
    │                                                          │
    │ account_id / shipping_account_id                         │ consumida por
    ▼                                                          ▼ lib/fifo.ts
transactions / credit_card_transactions              inventory_movements
   (el dinero)                                          (la bitácora)
```

### Tablas clave

**`inventory_batches`** — la capa FIFO (`database/ddl.v3.sql:231`)

| Columna | Notas |
|---|---|
| `product_id`, `variant_id` | `variant_id NULL` = stock del producto base |
| `purchase_batch_item_id` | `NULL` cuando el stock no vino de una compra (existencia inicial, ajuste, import sin cuenta) |
| `qty_in` | cantidad original, nunca cambia |
| `qty_available` | lo que queda; `CHECK (qty_available >= 0)` |
| `unit_cost` | costo local **con envío prorrateado**; es el que alimenta el COGS |
| `received_at` | **clave de ordenamiento FIFO** |

No tiene `created_at` ni `updated_at`, solo `received_at`.

**`purchase_batches`** — cabecera de compra (`database/ddl.v3.sql:195`)

`status`: `'PENDING' | 'COMPLETED'` (default `COMPLETED`), `currency`,
`exchange_rate`, `subtotal`, `shipping`, `total`, `account_id`,
`shipping_account_id`, `purchased_at`.

**`purchase_batch_items`** — línea de compra (`database/ddl.v3.sql:215`)

⚠️ `unit_cost_usd` **es un mal nombre**: guarda el costo unitario *en la moneda
de compra* (USD **o** HNL, según `purchase_batches.currency`), no siempre USD.
`unit_cost` es el costo ya convertido a moneda local **más** la parte
proporcional del envío.

**`inventory_movements`** — bitácora (`database/ddl.v3.sql:247`)

`quantity` siempre positivo; la dirección vive en `movement_type`.
`reference_id` es **polimórfico y sin FK**: su significado depende de
`reference_type` (id de venta, de compra, de capa…). Ver §8.3 para la
inconsistencia actual.

### No existe

- Tabla de categorías de producto (solo `transaction_categories`, de finanzas).
- Columna `min_stock`/punto de reorden en `products` (sí existe en `supplies`,
  que es otro módulo y usa un contador simple, no FIFO).
- Triggers, vistas o funciones de inventario en la base. **Todo el FIFO y todo
  el registro de movimientos es lógica de aplicación.**

---

## 4. Flujo individual (un producto)

### 4.1 Producto nuevo con stock inicial

Orquestado **en el cliente**, en dos llamadas:
`components/products/create-product-dialog.tsx:142-217`.

```
1. POST /api/products                 → crea la fila del producto (sin stock)
2a. modo "purchase"  → POST /api/purchases         (compra + capa + dinero)
2b. modo "existing"  → POST /api/inventory/existing (capa, sin dinero)
2c. is_service = true → no hay paso 2
```

El selector de modo está en `components/products/inventory-section/index.tsx`
("Compra" vs "Ya lo tengo").

`POST /api/products` (`app/api/products/route.ts:74`) solo inserta en
`products`. Si no mandas SKU, lo autogenera con las iniciales del nombre
(`PHK-001`, `PHK-002`…, rellenando huecos) vía `nextProductSkus()` (`lib/sku.ts`).

### 4.2 Agregar stock a un producto existente

`components/products/add-inventory-dialog.tsx` → `useCreatePurchase()` →
`POST /api/purchases`. Soporta varias líneas (base + una por variante), pago
con cuenta o tarjeta, cuenta separada para el envío, y el switch de "pendiente".

### 4.3 Existencia inicial sin compra

`POST /api/inventory/existing` (`app/api/inventory/existing/route.ts`) — la vía
para cargar lo que el negocio ya tenía antes de usar el sistema. Crea la capa
con `purchase_batch_item_id = NULL` y un movimiento `INITIAL`. **No toca cuentas
ni genera transacción financiera.**

### 4.4 Ajuste manual

`POST /api/inventory/adjust` (`app/api/inventory/adjust/route.ts`). Requiere
`notes` (motivo) obligatorio.
- `type:"in"` → nueva capa con el `unit_cost` indicado.
- `type:"out"` → `consumeFifo()`; si otro proceso vació el stock en paralelo,
  responde **409** en lugar de dejar stock negativo.

---

## 5. Flujo por lotes (compra multi-línea)

Todo pasa por **`POST /api/purchases`** (`app/api/purchases/route.ts:8`), que es
el mismo endpoint del flujo individual — la diferencia es cuántos elementos trae
`items[]`. No hay un endpoint "batch" separado para compras.

### Payload

```jsonc
{
  "account_id": 12,            // XOR con credit_card_id
  "credit_card_id": 3,
  "shipping_account_id": 5,    // opcional: el envío se paga de otra cuenta
  "currency": "USD",           // o la moneda local del negocio
  "exchange_rate": 24.89,
  "shipping": 350,             // SIEMPRE en moneda local
  "purchased_at": "2026-09-01T00:00:00Z",
  "status": "COMPLETED",       // o "PENDING"
  "notes": "…",
  "items": [
    { "product_id": 42, "variant_id": 7, "quantity": 10, "unit_cost_usd": 3.5 }
  ]
}
```

### Cómo aterriza el costo (`app/api/purchases/route.ts:89-123`)

```
unitCostLocal      = isUSD ? unit_cost_usd * exchange_rate : unit_cost_usd
shippingPerUnit    = shipping / (suma de todas las cantidades)
unit_cost (guardado) = unitCostLocal + shippingPerUnit
```

⚠️ El envío se prorratea **por unidad, no por valor**. Comprar 100 tornillos y
1 motor en la misma compra le carga al tornillo el mismo envío que al motor.

### Qué escribe (cuando `status = "COMPLETED"`)

1. `purchase_batches` (cabecera)
2. `purchase_batch_items` (una por línea)
3. `inventory_batches` (una capa FIFO por línea) — **solo si COMPLETED**
4. `inventory_movements` `IN`/`PURCHASE` — **solo si COMPLETED**
5. El dinero: `transactions` (`EXPENSE`, `reference_type='PURCHASE'`) + débito a
   `accounts.balance`, **o** `credit_card_transactions` (`CHARGE`) + aumento de
   `credit_cards.balance`. Si hay `shipping_account_id`, el envío sale como una
   segunda transacción `PURCHASE_SHIPPING`. Todas se etiquetan con
   `category = 'Compra de Inventario'` (ver §8).

### Validaciones previas

Cuenta/tarjeta existe, activa y de la misma org; cada producto existe, activo y
**no es servicio**; cada variante pertenece a su producto.

---

## 6. El estado `PENDING` ("en camino")

Semántica: **el dinero ya salió, la mercancía todavía no llegó.**

```
POST /api/purchases (status: PENDING)
   ├── purchase_batches (status=PENDING) + purchase_batch_items   ✅
   ├── transactions / credit_card_transactions + saldo debitado   ✅  ← el dinero SÍ se mueve
   └── inventory_batches / inventory_movements                    ❌  ← NO hay stock todavía
                    │
                    ▼
   PATCH /api/purchases/[id]  ("confirmar llegada")
       ├── permite corregir el envío → recalcula unit_cost de cada item
       ├── ajusta la transacción financiera por el delta del envío
       ├── inserta las capas FIFO + movimientos                   ✅
       └── status = COMPLETED

   DELETE /api/purchases/[id]  ("cancelar", solo mientras PENDING)
       ├── borra transacciones y devuelve el saldo a la cuenta
       ├── revierte el cargo de tarjeta (vía credit_card_transactions.purchase_batch_id, v4.5)
       └── borra items + cabecera (no hay stock que revertir)
```

**Superficie de UI:** página `/purchases/pending`, banner ámbar en la página de
inventario (`app/(dashboard)/inventory/page.tsx:645-661`), item "En camino" del
sidebar (`components/app-sidebar.tsx:54`).

`PATCH` es la **única** ruta que convierte una compra pendiente en stock.

---

## 7. Importación por Excel

Un solo importador, en el FAB de inventario como **"Importar Excel"**:
`POST /api/inventory/import` + `lib/import-inventory.ts` + `lib/export-template.ts`.

> Existió un segundo flujo ("Exportar plantilla" / "Cargar lote",
> `api/inventory/batch/*`) que nunca se migró a multi-org y fallaba en el 100%
> de las filas. Se eliminó el 2026-09-01 junto con sus diálogos y
> `types/inventory-batch.ts`. Su única capacidad no cubierta aquí —compras en
> otra moneda con tipo de cambio— vive en el módulo de Compras.

- Columnas: `sku, nombre, descripcion, precio, cantidad, costo_unitario, fecha, estado, cuenta`
  (alias: `costo` → `costo_unitario`).
- Plantilla generada **en el navegador** con ExcelJS (SheetJS CE no escribe
  validaciones de datos), con dropdowns para `estado` y `cuenta`.
- Máximo 1800 filas / 5 MB. Gated por el feature `products.bulk_import`.
- `?dry_run=true` devuelve preview sin escribir; la ejecución va **por chunks**
  de 100 filas (`offset`/`limit`) para no chocar con el timeout serverless.
- Matriz de acciones por fila:

  | `estado` | `cuenta` | Resultado |
  |---|---|---|
  | `listo` | con cuenta | Compra `COMPLETED` + capa FIFO + movimiento `PURCHASE` + débito |
  | `listo` | vacía | Existencia inicial: capa + movimiento `INITIAL`, **sin finanzas** |
  | `pendiente` | con cuenta | Compra `PENDING` + débito ahora; la capa se crea al confirmar llegada |
  | `pendiente` | vacía | Compra `PENDING` sin fuente de pago, sin finanzas |

- Valida SKUs duplicados dentro del archivo, rechaza fechas futuras, resuelve
  cuentas/tarjetas por etiqueta o nombre, y avisa si hay unidades ya pendientes
  en otra compra (doble conteo).
- Docs de diseño: `docs/excel-import-plan.md`, `docs/excel-import-implementacion.md`.

**Limitaciones deliberadas:** el costo unitario se captura ya en moneda local y
con el envío incluido — este importador no convierte moneda ni prorratea envío.
Para eso está el módulo de Compras. Tampoco admite nota por fila (fija
`"Importación Excel"`) ni variantes sin SKU, que se cargan desde "Agregar stock".

---

## 8. Reglas transversales

**Autenticación y permisos** — toda ruta hace:

```ts
const auth = await verifyAuth(request);          // saca userId + orgId del Bearer token
if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
const deny = await requireModule(auth.data, 'INVENTORY', 'canEdit');
if (deny) return deny;
```

Módulos usados: `INVENTORY` (stock, compras, movimientos) y `PRODUCTS` (catálogo).
Acciones: `canView` / `canEdit` / `canDelete`.

**Ocultamiento de costos** — los roles sin `showCosts` no deben ver lo que costó
adquirir el inventario. El patrón es anular las llaves en la respuesta con
`nullifyKeysDeep(payload, new Set([...]))` (`app/api/purchases/route.ts:350-355`),
no filtrar en el cliente.

**Categoría de gasto** — toda transacción generada por una compra de inventario
se etiqueta con `category = 'Compra de Inventario'`, usando la constante
`INVENTORY_PURCHASE_CATEGORY` de `lib/seed-default-categories.ts`. Aplica a las
transacciones de cuenta (`PURCHASE` y `PURCHASE_SHIPPING`) y a los cargos de
tarjeta. Ojo: `transactions.category` y `credit_card_transactions.category` son
**texto libre con el nombre** de la categoría — no hay FK contra
`transaction_categories` — así que renombrar la categoría exige una migración
que actualice también las transacciones existentes (precedente:
`database/migrations/v4.14-inventory-purchase-category.sql`). Las compras de
insumos (`supply_purchases`) quedan fuera: son otro módulo y siguen sin categoría.

**Moneda** — `currency` + `exchange_rate` por compra. El envío siempre se captura
en moneda local. La tasa por defecto está **hardcodeada** en el front
(`TASA_DEFAULT = 24.89`) en dos archivos distintos.

**Multi-tenancy** — `org_id NOT NULL` en las 8 tablas del módulo desde la
migración `v4.1`. `created_by`/`updated_by` desde `v4.2`. `user_id` quedó
*nullable* en `v4.4` y **ya no debe usarse**: en registros creados después de esa
migración viene `NULL`.

---

## 9. Deuda técnica detectada

Ordenada por severidad. Todo verificado en el código, no son sospechas.

### 9.1 🔴 `BEGIN`/`COMMIT` no da atomicidad con el driver HTTP de Neon

Diez rutas usan el patrón `await sql\`BEGIN\`` … `await sql\`COMMIT\`` con
`ROLLBACK` en el catch. Con `neon()` (driver **HTTP**, que es lo que usa todo el
proyecto — no hay `Pool` en ningún lado) **cada query es una petición HTTP
independiente en autocommit**: el `BEGIN` no abre nada y el `ROLLBACK` no
revierte nada.

El propio código ya lo documenta en la ruta más nueva:

> *"el driver HTTP de Neon, que no soporta transacciones reales entre queries"*
> — `app/api/inventory/import/route.ts:92-94`

Rutas afectadas del módulo: `purchases/route.ts`, `purchases/[id]/route.ts`,
`inventory/adjust/route.ts`, `inventory/existing/route.ts`.

**Impacto real:** si `POST /api/purchases` falla a mitad (p. ej. tras insertar la
compra pero antes de la transacción financiera), queda una compra con stock pero
sin el gasto registrado, y nada lo revierte.

**Recomendación:** o migrar esas rutas a `Pool` de `@neondatabase/serverless`
(que sí soporta transacciones), o adoptar el patrón que ya usa el importador
moderno: operaciones idempotentes por fila y compensación explícita en caso de
fallo (como hace `restoreTakes()` en `lib/fifo.ts:103`).

### 9.2 🟡 Creación de producto sin compensación

En `create-product-dialog.tsx:164-183`, si `POST /api/products` tiene éxito pero
la llamada siguiente (`/api/purchases` o `/api/inventory/existing`) falla, el
producto queda creado con stock cero y el usuario solo ve un toast de error. Al
reintentar suele crear un producto duplicado.

### 9.3 🟡 Umbral de "stock bajo" hardcodeado y divergente

Tres valores distintos para el mismo concepto: `< 10` en el dashboard y en la
página de inventario (hardcodeado en el SQL), y `<= 5` por defecto en
`/api/reports/inventory` (parámetro `low_stock`). No hay columna de punto de
reorden por producto, así que el umbral no puede ajustarse por negocio ni por
producto.

### 9.4 🟢 Menores

- **Envío prorrateado por unidad, no por valor** (§5) — distorsiona el costo en
  compras con productos de precios muy distintos.
- **`reference_id` histórico inconsistente** — el importador "lote" eliminado
  guardaba en `inventory_movements.reference_id` el id de la capa en vez del
  `purchase_batch_id`. El código ya no existe, pero pueden quedar filas viejas
  (anteriores a `v4.1`) con ese valor. La columna no tiene FK, así que nada lo
  detecta: cuidado al hacer join por ahí sobre datos históricos.
- **`unit_cost_usd` mal nombrado** — guarda la moneda de compra, no siempre USD.
- **`TASA_DEFAULT = 24.89` hardcodeada** en `add-inventory-dialog.tsx:27` y
  `inventory-section/purchase-form.tsx:16`.
- **Doble verificación de límite de plan** en `POST /api/products`:
  `verifyResourceLimit()` (línea 80) y luego una consulta manual equivalente
  (líneas 101-127).
- **Falta índice para el acceso FIFO**: no hay índice sobre
  `(org_id, product_id, received_at)`, que es exactamente el patrón de lectura de
  `consumeFifo`.
- **`inventory_batches` sin `created_at`** — solo `received_at`, que es editable
  por el usuario. No hay forma de saber cuándo se registró realmente una capa.
- **Código muerto**: `components/products/product-grid.tsx` y `product-card.tsx`
  solo se importan entre sí; ninguna página los usa.
