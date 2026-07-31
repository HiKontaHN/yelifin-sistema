# Importación masiva por Excel — registro de implementación

> Estado: **implementado y en pruebas manuales**. Fecha: julio 2026.
> Diseño completo en [`excel-import-plan.md`](./excel-import-plan.md) (revisión 3). Este documento registra lo construido, los ajustes surgidos en pruebas y lo que falta.

## Qué hace la funcionalidad

Desde la página de Inventario (FAB → "Importar Excel", roles con `canEdit`), un modal de 4 pasos permite:

1. **Plantilla** — descargar la plantilla vacía (productos nuevos) o pre-llenada seleccionando productos registrados (una fila por variante, solo entradas con SKU). Generada en el navegador con dropdowns nativos de Excel para `estado` y `cuenta`.
2. **Subir** el archivo `.xlsx` (máx. 500 filas / 5 MB).
3. **Preview (dry-run)** — sin escribir nada: acción resuelta por fila, errores, advertencias (p. ej. unidades ya pendientes en otra compra) y **resumen de cuánto se debitará por cuenta/tarjeta**.
4. **Confirmar → reporte** — diálogo de confirmación con el total a debitar; ejecución fila por fila; reporte final con filas ok/fallidas y link a compras pendientes si se crearon.

### Matriz de acciones por fila

| estado | cuenta | Resultado |
|---|---|---|
| `listo` | seleccionada | Compra individual COMPLETED (1 ítem) + lote FIFO + movimiento `'PURCHASE'` + transacción `EXPENSE` o cargo CC, debitando el saldo |
| `listo` | vacía | Inventario inicial: lote + movimiento `'INITIAL'`, **sin finanzas** |
| `pendiente` | seleccionada | Compra individual PENDING con débito/cargo **al importar**; el lote se genera al confirmar llegada (`PATCH /api/purchases/[id]`) |
| `pendiente` | vacía | Compra PENDING sin fuente de pago (`account_id NULL`), sin finanzas; lote al confirmar llegada |

Si el SKU no existe, la fila además crea el producto (nombre y precio requeridos). Fila sin cantidad = solo crear producto.

## Archivos creados

| Archivo | Rol |
|---|---|
| `lib/import-labels.ts` | Formato compartido cliente/servidor: columnas de la plantilla, labels de cuenta y su parser, límite de 500 filas. Sin dependencias pesadas (no arrastra `xlsx` al bundle del cliente). |
| `lib/import-inventory.ts` | `parseWorkbook` (xlsx, fechas `dd/mm/aaaa` y seriales, encabezados con acentos), `validateRows` (duplicados, números, costo requerido con cantidad), `resolveRows` (SKU→producto/variante, cuentas/tarjetas, advertencias de pendientes, error de producto-con-variantes+cantidad), `summarizeRows` (conteos + total a debitar por cuenta). Solo lectura de DB. |
| `app/api/inventory/import/route.ts` | Endpoint único. Guards: `verifyAuth` → `requireModule('INVENTORY','canEdit')` → `requireFeature('products.bulk_import')` → límite de productos y de transacciones del plan. `?dry_run=true` = preview. Ejecución secuencial autocontenida por fila (el driver HTTP de Neon no tiene transacciones reales; una fila fallida no afecta a las demás). |
| `lib/export-template.ts` | Plantillas con **exceljs** (client-side): hoja `Productos`, hoja oculta `_cuentas`, data validations (dropdowns) de `estado` y `cuenta`, hoja `Instrucciones`. exceljs porque SheetJS Community no puede escribir data validations. |
| `components/inventory/import-excel-modal.tsx` | Modal de 4 pasos sobre `ResponsiveModal`, gateado con `FeatureGate`. Selector de productos con `SearchBar` + checkboxes, preview con `PaginationControls`, confirmación con `ConfirmDialog`, reporte final. Fetch propio con FormData (el `useAuthFetch` de los hooks fuerza `Content-Type: application/json`). |

## Archivos modificados

- **`app/(dashboard)/inventory/page.tsx`** — acción "Importar Excel" en el FAB (solo `canEdit`), modal conectado; `handleSuccess` ahora también hace `mutate()` de tarjetas de crédito (los balances cambian al importar).
- **`app/api/purchases/[id]/route.ts`** (DELETE) — al cancelar un pendiente de importación sin fuente de pago ya no muestra el aviso falso de "no se encontró el cargo de tarjeta"; solo advierte cuando la compra era de tarjeta real con cargo vinculado (detección por `notes` que empiezan con "Importación Excel").
- **`components/shared/confirm-dialog.tsx`** — overlay de `z-50` → `z-[60]` + `pointer-events-auto` (ver bugs corregidos).
- **`package.json`** — dependencia nueva: `exceljs`.

## Ajustes surgidos en pruebas manuales

1. **Labels de cuenta sin id** — el dropdown mostraba `"Efectivo (Cuenta #4)"` (el `#4` era el id interno de la DB). Ahora muestra `"Efectivo (Cuenta)"` / `"Visa Oro (Tarjeta)"`; el `#id` solo se agrega si hay nombres duplicados dentro del mismo tipo. La resolución acepta: label completo, label con id, o el nombre a secas escrito a mano (nombre ambiguo o inexistente = error de fila en el dry-run).
2. **Botón "Importar" no hacía nada** — el `ConfirmDialog` quedaba tapado por el `ResponsiveModal` (ambos `z-50`, y Radix Dialog pone `pointer-events: none` en el body). Corregido en el componente compartido con `z-[60]` + `pointer-events-auto`.

## Estado de las pruebas manuales

- [x] Dropdowns de `estado` y `cuenta` funcionan en Excel.
- [x] Modal completo hasta el diálogo de confirmación.
- [ ] Fila `listo` + cuenta bancaria → compra COMPLETED, lote, transacción y balance debitado.
- [ ] Fila `listo` + tarjeta → cargo CC y balance de tarjeta actualizado.
- [ ] Fila `listo` + efectivo → débito a la cuenta de efectivo.
- [ ] Fila `listo` sin cuenta → lote `'INITIAL'` sin transacciones.
- [ ] Fila `pendiente` + cuenta → PENDING con débito inmediato; confirmar llegada genera el lote sin doble débito.
- [ ] Fila `pendiente` sin cuenta → PENDING sin finanzas; cancelar sin aviso falso de tarjeta.
- [ ] SKU de producto con variantes + cantidad → rechazada en dry-run.
- [ ] Advertencia de unidades ya pendientes visible en preview.
- [ ] Cuenta escrita a mano inválida → error de fila.
- [ ] Venta de producto importado consume FIFO por `fecha` más vieja.
- [ ] Fila inválida en medio → previas persisten, reintento no duplica.
- [ ] Plan sin `products.bulk_import` → pantalla de bloqueo y endpoint 403.

## Validación técnica

- `npx tsc --noEmit` limpio (importante: `next.config.mjs` tiene `ignoreBuildErrors: true`, el build no atrapa errores de TS).
- `npm run build` exitoso con `/api/inventory/import` registrada.
- `npm run lint` está **roto en el repo desde antes** (ESLint no está en `devDependencies` ni hay config) — pendiente ajeno a esta feature.

## Pendientes / ideas para después

- Completar el checklist de pruebas manuales de arriba.
- Verificar los dropdowns también en Excel web y LibreOffice.
- Badge "Importación" en la lista de compras (hoy los pendientes de import se distinguen solo por las notas y la cuenta vacía).
- v futura: creación de variantes desde el Excel; completar compras pendientes por tandas.
