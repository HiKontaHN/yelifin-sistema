# Importación masiva por Excel — productos, inventario por lotes y compras individuales

> Análisis y plan de implementación. Estado: **implementado** (julio 2026) — falta el checklist de pruebas manuales y verificar los dropdowns en Excel de escritorio/web/LibreOffice.
> Fecha del análisis: julio 2026. Revisión 3: compras **individuales por fila** con columna `cuenta` (selector nativo en el Excel con cuentas, tarjetas de crédito y efectivo), inventario listo/pendiente, dos modos de exportación de plantilla, y uso obligatorio de los componentes de `components/shared`.

## Objetivo

Permitir desde un archivo Excel:

1. Crear productos en masa (con o sin inventario).
2. Agregar inventario a productos/variantes existentes.
3. Registrar cada lote como **listo** (en mano, disponible para venta) o **pendiente de llegar** (compra PENDING que se completa cuando llega).
4. Indicar por fila **la cuenta con la que se compró ese lote** — mediante un selector (dropdown) dentro del Excel que lista las cuentas del negocio (incluida efectivo) y las tarjetas de crédito registradas. Cada fila con cuenta genera **una compra individual** con su movimiento financiero, porque en un mismo archivo cada lote pudo pagarse con una cuenta distinta.
5. Descargar la plantilla **vacía** (solo productos nuevos) o **pre-llenada** seleccionando productos ya registrados (con sus variantes, una fila por variante).

## Qué ya está listo en el proyecto (se reutiliza tal cual)

| Pieza | Dónde | Nota |
|---|---|---|
| Parseo Excel | `xlsx` (SheetJS) v0.18.5 en `package.json` | Sirve para **parsear** en el servidor. NO sirve para el dropdown de la plantilla (ver dependencia nueva). |
| Feature flag | `products.bulk_import` en `system_features` | Con shortcut `canBulkImport` en `useFeatures()` y `requireFeature()` listo. La función nace gateada por plan. |
| Subida de archivos | `app/api/upload/route.ts` | Patrón `FormData → Buffer` para copiar. |
| Crear producto | `POST /api/products` | Autogenera SKU, valida duplicados. `UNIQUE(org_id, sku)` = clave natural para el matching. |
| Compra completa (1 ítem) | `POST /api/purchases` | Hace exactamente lo que necesita una fila `listo` + cuenta: `purchase_batches` + ítem + `inventory_batches` + `inventory_movements('IN','PURCHASE')` + transacción `EXPENSE` (o cargo CC) debitando la cuenta. La lógica se replica en el import con 1 ítem por compra. |
| Compra PENDING | `POST /api/purchases` con `status: 'PENDING'` | El dinero se debita **al crear** (semántica existente); el inventario se genera al confirmar llegada. |
| Confirmar llegada | `PATCH /api/purchases/[id]` | Genera los lotes; acepta `shipping` + `shipping_account_id` al llegar y lo prorratea. Con `account_id NULL` y sin envío, no toca finanzas. |
| Lote sin compra | `POST /api/inventory/existing` | Par `inventory_batches` + `inventory_movements('IN','INITIAL')`, sin finanzas. Es el camino de las filas **sin cuenta** (inventario inicial/histórico). Acepta `purchased_at` → `received_at` (orden FIFO). |
| Cuentas y tarjetas | `hooks/swr/use-accounts.ts`, `hooks/swr/use-credit-cards.ts` | Datos para construir el dropdown de la plantilla client-side. La cuenta de efectivo es una cuenta más del catálogo. |
| Límites del plan | `verifyResourceLimit(orgId, ...)` en `lib/auth.ts` | Productos nuevos vs `max_products`; y como el import ahora crea transacciones, validar también el límite de transacciones del plan (migración v4.6). |
| UI compartida | `components/shared/` | `responsive-modal`, `feature-gate`, `SearchableSelect`, `search-bar`, `confirm-dialog`, `pagination-controls`. El modal de import se arma SOLO con estas piezas + shadcn/ui — no crear primitivas nuevas. |
| Variantes | `product_variants` con `UNIQUE(org_id, sku)` | El SKU del Excel resuelve variantes existentes. `GET /api/products` ya devuelve `variants` (para la plantilla pre-llenada). |

## Dependencia nueva requerida

**`exceljs`** — la plantilla necesita validación de datos tipo lista (el dropdown de cuentas) y `xlsx` Community Edition **no puede escribir data validations** (es función de SheetJS Pro). `exceljs` sí (`worksheet.dataValidations`, tipo `list`) y corre en el navegador. Se usa **solo para generar la plantilla** client-side; el parseo del archivo subido sigue con `xlsx` en el servidor (el valor del dropdown llega como texto plano).

## Restricción técnica clave

El driver HTTP de Neon (`@neondatabase/serverless`) **no tiene transacciones reales** — `BEGIN`/`COMMIT` van en conexiones distintas. Un import de N filas puede fallar a mitad. El diseño lo asume: proceso fila por fila + reporte por fila + reintentos idempotentes. Que cada fila con cuenta sea una compra **autocontenida** (compra + lote + transacción) juega a favor: una fila fallida no deja compras a medias de otras filas.

> Nota: los `BEGIN`/`COMMIT` de las rutas existentes (`purchases`, `inventory/existing`) usan este mismo driver, así que su "transacción atómica" tampoco es real hoy. No bloquea este plan, pero es deuda técnica conocida del proyecto.

## Plantilla única

Columnas: `sku` (opcional), `nombre`, `descripcion` (opcional), `precio`, `cantidad` (opcional), `costo_unitario` (requerido si hay cantidad), `fecha` (opcional), `estado` (dropdown: `listo` | `pendiente`, default `listo`), `cuenta` (dropdown, opcional).

### La columna `cuenta` (dropdown nativo de Excel)

- Al generar la plantilla (vacía o pre-llenada) se crea una hoja auxiliar oculta `_cuentas` con una opción por línea, y la columna `cuenta` recibe data validation tipo `list` apuntando a ese rango. Así el usuario **selecciona**, no escribe.
- Formato de las opciones: `"{nombre} (Cuenta)"` / `"{nombre} (Tarjeta)"`. Solo si hay nombres duplicados dentro del mismo tipo se agrega el id (`"{nombre} (Cuenta #{id})"`) para que la resolución nunca sea ambigua.
- El import resuelve por id cuando el label lo trae, y si no por nombre + tipo (también acepta el nombre a secas escrito a mano). Verifica que exista, esté activa y pertenezca al `org_id`; nombre ambiguo o inexistente → error de fila en dry-run.
- Fila **sin cuenta** = inventario inicial/histórico: crea el lote sin compra y **sin movimiento financiero** (camino de `/api/inventory/existing`). Este es el escape para cargar inventario viejo sin descuadrar las cuentas de hoy.

### Matriz de acciones por fila

| estado | cuenta | Resultado |
|---|---|---|
| `listo` | seleccionada | **Compra individual COMPLETED**: `purchase_batches` (1 ítem, `purchased_at = fecha`) + `purchase_batch_items` + `inventory_batches` + `inventory_movements('IN','PURCHASE')` + transacción `EXPENSE` debitando la cuenta (o cargo CC si es tarjeta). |
| `listo` | vacía | **Inventario inicial**: `inventory_batches` (`purchase_batch_item_id = NULL`, `received_at = fecha`) + `inventory_movements('IN','INITIAL')`. Sin finanzas. |
| `pendiente` | seleccionada | **Compra individual PENDING**: compra + ítem + débito/cargo **inmediato** (misma semántica que el módulo de Compras: el dinero sale al crear). El lote se genera al confirmar llegada. |
| `pendiente` | vacía | **Compra individual PENDING sin fuente de pago** (`account_id NULL`): sin finanzas; al confirmar llegada solo genera el lote. |

Si además el SKU no existe, la fila primero crea el producto y luego aplica la matriz (`crear`, `crear_con_stock`, `crear_pendiente`, etc.). Fila sin cantidad = solo crear producto (las demás columnas de inventario se ignoran).

### Ejemplos

| sku | nombre | precio | cantidad | costo_unitario | fecha | estado | cuenta | Acción resuelta |
|---|---|---|---|---|---|---|---|---|
| `CAM-001` (existe) | *(ignorado)* | *(ignorado)* | 50 | 120 | 2026-03-15 | listo | Banco Atlántida (Cuenta #4) | Compra COMPLETED + lote |
| `CAM-001-M` (variante) | *(ignorado)* | *(ignorado)* | 20 | 120 | 2026-03-15 | listo | *(vacía)* | Lote inicial a la variante, sin finanzas |
| `CAM-002` (existe) | *(ignorado)* | *(ignorado)* | 100 | 95 | 2026-07-01 | pendiente | Visa Oro (Tarjeta #2) | Compra PENDING con cargo a la tarjeta |
| `NUEVO-01` (no existe) | Camisa azul | 250 | 30 | 110 | | listo | Efectivo (Cuenta #1) | Crea producto + compra COMPLETED |
| `NUEVO-02` (no existe) | Camisa roja | 250 | 40 | 110 | | pendiente | *(vacía)* | Crea producto + compra PENDING sin pago |
| *(vacío)* | Gorra negra | 180 | *(vacío)* | | | | | Crea producto sin stock |

### Notas de columnas

- **`fecha`** → `purchased_at` de la compra y `received_at` del lote (orden FIFO). Vacía = hoy. En pendientes es la fecha de compra; el `received_at` real lo pone la confirmación de llegada.
- **`costo_unitario` es el costo final aterrizado** por unidad, **en moneda local**, con envío/importación incluidos. El import no convierte moneda ni prorratea envío. Compras en USD o con envío a repartir → usar el módulo de Compras. En tarjetas, el cargo va en HNL al `balance` local (no `balance_usd`). En pendientes, el envío puede agregarse al confirmar llegada (el PATCH existente lo prorratea).
- La descripción de la transacción sigue el patrón del módulo de Compras: `"Compra — {producto} ({sku})"`, con `reference_type 'PURCHASE'` y `reference_id` = id de la compra creada.

### Dos modos de exportación de la plantilla (client-side)

1. **Plantilla vacía** — encabezados + dropdowns (`estado`, `cuenta`) + hoja "Instrucciones" (significado de columnas, matriz de acciones, nota de costo aterrizado). Para productos nuevos.
2. **Plantilla pre-llenada** — el usuario busca y selecciona productos registrados. Producto **sin** variantes: una fila con `sku`/`nombre`/`precio` llenos (informativos) y el resto vacío. Producto **con** variantes: **una fila por variante activa** con el SKU de la variante y nombre `"{producto} — {variante}"`; no se emite fila del padre (stock por SKU padre es inválido, ver validaciones). Ambos modos llevan los mismos dropdowns. Datos: `useProducts()` (incluye `variants`), `useAccounts()`, `useCreditCards()` — todo ya en el cliente; la generación es con `exceljs` en el navegador.

## Backend — `POST /api/inventory/import` (endpoint único)

Guards: `verifyAuth` → `requireModule('INVENTORY', 'canEdit')` → `requireFeature(orgId, 'products.bulk_import')` → `verifyResourceLimit(orgId, 'products')` con el conteo de filas `crear_*` → validar el límite de transacciones del plan (v4.6) contra el conteo de filas con cuenta.

Matching del SKU: primero `products`, si no `product_variants` (→ `product_id` + `variant_id`). Cuentas/tarjetas: por `#{id}` del label del dropdown, verificando org y activa. Todo filtrado por `org_id`.

### `?dry_run=true` — valida todo sin escribir y devuelve preview

- SKUs duplicados dentro del archivo.
- Números inválidos (precio/cantidad/costo negativos o no numéricos), fechas inválidas o futuras, `estado` fuera de `listo`/`pendiente`.
- `cuenta` que no resuelve (id inexistente, inactiva, de otra org, o texto manual que no matchea el formato) → error de fila.
- Conteo de productos nuevos vs `max_products`; conteo de compras a crear vs límite de transacciones del plan.
- **Error de producto con variantes**: SKU que resuelve a producto con variantes activas + cantidad → fila rechazada (un lote con `variant_id NULL` es invisible para ventas por variante; el mensaje pide usar el SKU de la variante — la plantilla pre-llenada ya lo resuelve).
- **Advertencia de compras pendientes**: fila `listo` de un producto/variante con unidades en compras `PENDING` → *"tiene N unidades pendientes en la compra #X — no las incluyas aquí o se duplicarán al completarla"*. Advertencia, no error. En filas `pendiente`, informativa.
- **Resumen financiero del preview**: total a debitar por cuenta/tarjeta (Σ `cantidad × costo_unitario` de sus filas), para que el usuario confirme el impacto en balances **antes** de ejecutar.
- Por fila: acción resuelta o error con motivo.

### Sin `dry_run` — ejecución

Re-valida y ejecuta **secuencialmente fila por fila**; cada fila es autocontenida. Reporte por fila (creados / compras registradas / pendientes / lotes iniciales / fallidos). Si falla la fila 37, las anteriores quedan y el reporte dice qué reintentar (idempotente: reintentar una `crear_*` cuyo producto ya existe la resuelve como `agregar_*`; las compras no se duplican porque solo se reintentan filas reportadas como fallidas).

Por fila, según la matriz:
1. Crear producto si el SKU no existe (reutilizar la autogeneración de SKU de `POST /api/products`).
2. Con cuenta: crear `purchase_batches` (1 ítem, status según `estado`) + `purchase_batch_items` + movimiento financiero (transacción `EXPENSE` + `UPDATE accounts.balance`, o `credit_card_transactions 'CHARGE'` + `UPDATE credit_cards.balance`) — replicando la lógica de `POST /api/purchases` con `shipping = 0`, `currency = 'HNL'`, `rate = 1`.
3. `listo`: crear `inventory_batches` + `inventory_movements` (`'PURCHASE'` si hubo compra, `'INITIAL'` si no). `pendiente`: no crear lote (lo hará el PATCH al confirmar).

Límite: rechazar archivos de más de 500 filas (constante configurable). Nota aceptada: 200 filas con cuenta = 200 compras y 200 transacciones — es el requerimiento (cada lote pudo pagarse distinto) y mantiene la trazabilidad 1:1 compra↔lote.

## Frontend

Construido **exclusivamente** con piezas de `components/shared/` + shadcn/ui:

- Botón "Importar Excel" en la página de inventario, dentro de `<FeatureGate feature="products.bulk_import">` (`components/shared/feature-gate.tsx`).
- Modal sobre `ResponsiveModal` (`components/shared/responsive-modal.tsx`) con pasos:
  1. **Plantilla**: elegir vacía o "Con mis productos" → selector de productos con `search-bar` + lista con checkboxes (expansión de variantes) → descargar `.xlsx` con dropdowns.
  2. **Subir archivo** (dropzone / input file, patrón de upload existente).
  3. **Preview del dry-run**: tabla de filas con badge por acción, advertencias en ámbar, errores en rojo; `pagination-controls` si supera ~50 filas; **resumen financiero por cuenta** al pie.
  4. **Confirmar** con `confirm-dialog` (muestra el total a debitar por cuenta) → ejecución → reporte final por fila + links a compras pendientes creadas; `mutate()` de SWR de productos, inventario, compras, cuentas y tarjetas al cerrar (los balances cambiaron).
- Si algún selector puntual de una sola cuenta hiciera falta en el flujo (p. ej. filtro del preview), usar `SearchableSelect` — no crear selects nuevos.

## Decisiones de diseño (v3)

1. **Compra individual por fila** — cada lote pudo pagarse con una cuenta distinta, así que cada fila con cuenta genera su propia `purchase_batches` con 1 ítem y su movimiento financiero. No se agrupan filas por cuenta ni por archivo.
2. **Fila sin cuenta = sin finanzas** — es el camino "inventario inicial/histórico" (`'INITIAL'`) para `listo`, o compra PENDING sin fuente de pago para `pendiente`. El import solo mueve dinero cuando el usuario seleccionó cuenta.
3. **El débito de pendientes es al crear** — misma semántica que el módulo de Compras hoy (el PATCH de llegada solo genera lotes y ajusta envío). Explicarlo en la hoja de instrucciones.
4. **Solo moneda local (HNL)** — sin conversión ni prorrateo de envío en el import; compras USD o con envío → módulo de Compras.
5. **Sin creación de variantes** — solo matching por SKU de variantes existentes. Queda para v4 si hace falta.
6. Filas con SKU existente: `nombre`/`precio` del archivo se **ignoran** (no se actualiza el producto).
7. **Ajuste menor requerido en `DELETE /api/purchases/[id]`**: hoy trata `account_id NULL` como "pagada con tarjeta" y al cancelar avisa "no se encontró el cargo de tarjeta; ajústalo manualmente". Para pendientes de import sin fuente de pago ese aviso es falso — solo advertir si realmente existía cargo CC. ~5 líneas, sin migración. (La cancelación de pendientes CON cuenta ya revierte bien: borra la transacción y restaura el balance.)

**Sin migraciones** — el esquema soporta todo (`purchase_batches.account_id` nullable, `'INITIAL'` en los constraints, `credit_card_transactions.purchase_batch_id` desde v4.5).

## Plan de implementación por pasos

### Fase 1 — Helper de dominio: `lib/import-inventory.ts` (~250 líneas)

1. Tipos: `ImportRow` (crudo), `ResolvedRow` (acción + product/variant + account/cc + errores/advertencias), `ImportReport`.
2. `parseWorkbook(buffer)`: parseo con `xlsx`, normalización de encabezados (case/acentos), coerción de números/fechas, default `estado = listo`, extracción de `#{id}` y tipo del label de `cuenta`.
3. `validateRows(rows)`: validaciones puras (duplicados internos, números, fechas, estado, costo requerido si hay cantidad, formato de cuenta).
4. `resolveRows(rows, orgId, sql)`: matching SKU → producto/variante; verificación de cuenta/tarjeta (org, activa); error "producto con variantes + cantidad"; advertencias de pendientes existentes; acción final por fila; agregado del resumen financiero por cuenta.

**Criterio de salida**: `tsc --noEmit` limpio; parseo probado con archivo de ejemplo (incluyendo labels de cuenta escritos a mano e inválidos).

### Fase 2 — Endpoint: `app/api/inventory/import/route.ts` (~350 líneas)

1. Guards en orden (incluye límite de productos y de transacciones del plan).
2. `FormData → Buffer` → Fase 1.
3. Rama `?dry_run=true`: preview por fila + totales + resumen financiero, sin escribir.
4. Rama de ejecución secuencial según la matriz (crear producto → compra individual con movimiento financiero → lote/movimiento). Reporte por fila, nunca abortar el archivo completo por una fila.
5. Límite 500 filas.

**Criterio de salida**: probar con curl los 8 caminos de la matriz (4 combinaciones × SKU nuevo/existente); verificar en DB compras, lotes, movimientos, transacciones y balances (cuenta y tarjeta) fila por fila; reintento sin duplicados.

### Fase 3 — Ajuste a cancelación de compras (archivo existente, ~5 líneas)

`DELETE /api/purchases/[id]`: solo avisar de cargo CC no revertido cuando la compra era realmente de tarjeta con cargo vinculado. Verificar que cancelar un pendiente de import CON cuenta revierte transacción y balance (camino existente), y SIN cuenta cancela limpio sin avisos falsos.

### Fase 4 — Plantillas client-side: `lib/export-template.ts` (~180 líneas) + dependencia

1. `npm install exceljs`.
2. `buildTemplate({ mode, selection, accounts, creditCards })`: hoja "Productos" (vacía o pre-llenada, una fila por variante), hoja oculta `_cuentas` con los labels, data validations de `estado` y `cuenta`, hoja "Instrucciones" (matriz de acciones, costo aterrizado, semántica del débito en pendientes).
3. Descarga en el navegador (`workbook.xlsx.writeBuffer()` → blob).

**Criterio de salida**: los dropdowns funcionan en Excel de escritorio, Excel web y LibreOffice (verificar los tres — la data validation varía entre ellos); el archivo re-importa sin errores de parseo con `xlsx`.

### Fase 5 — UI: modal de importación (~400 líneas)

1. `components/inventory/import-excel-modal.tsx` con los 4 pasos sobre `ResponsiveModal`, botón gateado con `FeatureGate`.
2. Paso 1: selector de productos con `search-bar` + checkboxes + variantes expandibles.
3. Paso 3: tabla del dry-run con `pagination-controls` y resumen financiero por cuenta.
4. Paso 4: `confirm-dialog` con totales a debitar → reporte final + links; `mutate()` de productos, inventario, compras, cuentas y tarjetas.

**Criterio de salida**: flujo completo en dev; responsive verificado (drag-to-close del modal en móvil).

### Fase 6 — Validación final

1. `npm run lint` y `tsc --noEmit` (el build no atrapa errores de TS por `ignoreBuildErrors: true`).
2. `npm run build`.
3. Checklist manual completo.

### Checklist de pruebas manuales

- [ ] Plantilla vacía: dropdowns de `estado` y `cuenta` funcionan; la lista incluye cuentas (con efectivo) y tarjetas.
- [ ] Plantilla pre-llenada: producto con variantes genera una fila por variante con SKU de variante.
- [ ] Fila `listo` + cuenta bancaria → compra COMPLETED, lote, transacción y balance debitado.
- [ ] Fila `listo` + tarjeta → cargo CC y `credit_cards.balance` actualizado.
- [ ] Fila `listo` + efectivo → débito a la cuenta de efectivo.
- [ ] Fila `listo` sin cuenta → lote `'INITIAL'` sin transacciones ni cambio de balances.
- [ ] Fila `pendiente` + cuenta → compra PENDING con débito inmediato; confirmarla genera el lote sin doble débito; agregar envío al confirmar prorratea y debita solo el envío.
- [ ] Fila `pendiente` sin cuenta → PENDING sin finanzas; confirmar genera lote; cancelar no muestra aviso falso de tarjeta.
- [ ] Fila con SKU de producto con variantes + cantidad → rechazada en dry-run.
- [ ] Fila `listo` de producto con unidades en PENDING → advertencia en preview.
- [ ] Cuenta escrita a mano que no matchea → error de fila en dry-run.
- [ ] Preview muestra el total a debitar por cuenta y coincide con los balances tras ejecutar.
- [ ] Vender producto importado → FIFO consume el lote con `fecha` más vieja primero.
- [ ] Fila inválida en medio del archivo → previas persisten, reintento no duplica compras.
- [ ] Plan sin `products.bulk_import` → botón gateado y endpoint 403; límites de productos y transacciones respetados.

## Esfuerzo estimado

- `lib/import-inventory.ts` (~250 líneas) + `lib/export-template.ts` (~180 líneas).
- 1 route nueva `app/api/inventory/import/route.ts` (~350 líneas).
- Ajuste menor a `DELETE /api/purchases/[id]` (~5 líneas).
- 1 modal (~400 líneas) + botón con gate.
- 1 dependencia nueva: `exceljs` (solo client-side para plantillas).
- **Sin migraciones**.

## Preguntas abiertas al retomar

- ¿Confirmado que una fila `pendiente` con cuenta debita al crear (semántica actual de Compras)? La alternativa (debitar al confirmar llegada) requeriría cambiar el PATCH y desalinearía el import del módulo de Compras.
- ¿Confirmado sin creación de variantes en esta versión?
- ¿Límite de filas por archivo? (sugerido: 500)
- ¿Las compras creadas por import deberían distinguirse en la lista de compras (badge "Importación" basado en `notes`)?
