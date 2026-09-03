# Módulo Reportería — cuatro reportes, pantalla y exportación

> Estado verificado contra el código el **2026-09-03**.
> Cubre los cuatro reportes (ventas, rentabilidad, inventario, eventos), el
> patrón GET/export duplicado, las cuatro capas de permisos y los errores de
> cálculo detectados.

---

## 1. La idea central

**El módulo no tiene tablas propias.** No existe `reports`, ni tablas de
agregados, ni vistas materializadas, ni caché. Cada reporte es un puñado de
queries de agregación que se ejecutan al vuelo contra las tablas
transaccionales (`sales`, `sale_items`, `inventory_batches`,
`inventory_movements`, `events`, `transactions`, `products`).

Consecuencias directas:

1. Un reporte nunca puede "quedar desactualizado", pero tampoco hay un número
   canónico contra el cual validar: si dos queries de la misma cifra difieren,
   ambas parecen plausibles. Es exactamente lo que pasa hoy — ver §7.1.
2. El costo de un reporte crece con el volumen histórico. No hay `LIMIT` en la
   query de inventario y la paginación es en cliente.
3. Cambiar la forma de calcular una cifra exige tocar **dos** archivos por
   reporte (el GET y el export), que hoy están copiados a mano.

### Invariantes a respetar en cualquier cambio

1. **Nunca sumar `sales.total` sobre un JOIN a `sale_items`.** Es 1:N — el total
   se multiplica por el número de líneas. Ver §4; es el bug más caro del módulo.
2. Todo filtra por `org_id` (multi-tenant). `user_id` se desestructura en las 8
   rutas pero no se usa en ninguna.
3. Las cifras de costo/ganancia se anulan en el servidor con `nullifyKeysDeep`,
   nunca se filtran en el cliente (§3).
4. Si se cambia una query del GET, hay que cambiar su gemela del export.
   Mientras siga la duplicación (§7.7), esto es manual.

---

## 2. Superficie del módulo

| Reporte | Página | GET (pantalla) | POST (export) | Feature flag |
|---|---|---|---|---|
| Ventas | `reports/sales/page.tsx` | `api/reports/sales/route.ts` | `.../sales/export/route.ts` (1252 líneas) | `reports.sales` |
| Rentabilidad | `reports/profit/page.tsx` | `api/reports/profit/route.ts` | `.../profit/export/route.ts` | `reports.profit` |
| Inventario | `reports/inventory/page.tsx` | `api/reports/inventory/route.ts` | `.../inventory/export/route.ts` | `reports.inventory` |
| Eventos | `reports/events/page.tsx` | `api/reports/events/route.ts` | `.../events/export/route.ts` | `reports.events` |

Compartido:

- `components/reports/report-shell.tsx` — layout común: título, selector de
  rango con presets (`thisMonth` / `lastMonth` / `thisYear`), hook
  `useDateRange`, botón de exportar y `StatCard` (que respeta
  `usePrivacyMode()` difuminando las cifras).
- `hooks/swr/use-reports.ts` — un hook por reporte, todos con
  `revalidateOnFocus: false`. Solo tipos y fetch; ninguna lógica de negocio.
- `app/(dashboard)/reports/layout.tsx` — envuelve todo en
  `<ModuleGuard module="REPORTS">`.

**No existe** `app/(dashboard)/reports/page.tsx`. El sidebar declara
`url: "/reports"` (`app-sidebar.tsx:79`) pero como el ítem tiene `submenu` se
renderiza como `Collapsible` (`app-sidebar.tsx:186`) y nunca navega ahí. Entrar
por URL directa da 404.

### Defaults de rango por reporte

| Reporte | Rango por defecto (servidor) | Preset inicial (UI) |
|---|---|---|
| Ventas | mes actual | `useDateRange("month")` |
| Rentabilidad | año actual | `useDateRange("year")` |
| Eventos | año actual | `useDateRange("year")` |
| Inventario | *n/a* — es un snapshot, `showDateRange={false}` | — |

---

## 3. Las capas de permisos

Cada handler apila tres verificaciones, en este orden:

```ts
const auth = await verifyAuth(request);                            // 1. ¿quién es?
if (!isAuthSuccess(auth)) return createErrorResponse(auth.error, auth.status);
const deny = await requireModule(auth.data, 'REPORTS', 'canView'); // 2. ¿el rol ve el módulo?
if (deny) return deny;
const denyFeature = await requireFeature(auth.data.orgId, 'reports.sales'); // 3. ¿el plan lo incluye?
if (denyFeature) return denyFeature;
```

Encima van los guards de UI: `ModuleGuard` en el layout (capa 2) y
`<FeatureGate feature="reports.x">` en cada página (capa 3).

### Cuarta capa: permisos atómicos de costo/ganancia

`getModulePermissions(auth.data, 'REPORTS')` devuelve `showCosts` y
`showProfit`. Los GET **no rechazan**: degradan la respuesta anulando llaves.

```ts
const payload = { summary, byDay, byProduct, detail, from, to };
if (!perms.showCosts)  nullifyKeysDeep(payload, new Set(["cogs"]));
if (!perms.showProfit) nullifyKeysDeep(payload, new Set(["profit", "gross_profit", "margin_pct"]));
```

Llaves anuladas por ruta:

| Ruta | `!showCosts` anula | `!showProfit` anula |
|---|---|---|
| `sales` | `cogs` | `profit`, `gross_profit`, `margin_pct` |
| `inventory` | `avg_cost`, `stock_value`, `total_stock_value` | `margin_pct` |
| `events` | `total_cogs` | `gross_profit`, `net_profit` |
| `profit` | **nada — ver §7.4** | 403 completo (la ruta entera es costos) |

Los **exports no degradan: son todo-o-nada** (403 si falta cualquiera de los
dos permisos). Esa asimetría, combinada con §7.3, produce el peor síntoma del
módulo: el botón no hace nada y no dice por qué.

En el cliente el hook es `useModulePermissions("REPORTS")`, que devuelve las
llaves en **snake_case** (`show_costs`, `show_profit`) mientras `lib/auth.ts`
las expone en camelCase. Durante `isLoading` devuelve `DENY_ALL`, así que las
columnas de costo aparecen después del primer render.

---

## 4. Cómo se calcula el COGS — el patrón correcto y el incorrecto

Esto es el corazón del módulo y la fuente de sus peores bugs.

`sale_items` es **1:N** con `sales`. Cualquier query que necesite a la vez el
total de la venta y el costo de sus líneas tiene que pre-agregar, o el total se
duplica.

### ✅ Correcto — CTE que agrega por `sale_id` antes de unir

```sql
WITH item_costs AS (
  SELECT sale_id, SUM(unit_cost * quantity) AS cogs
  FROM sale_items
  WHERE org_id = ${orgId}
  GROUP BY sale_id
)
SELECT
  COALESCE(SUM(s.total), 0)::float                AS total_revenue,
  COALESCE(SUM(ic.cogs), 0)::float                AS total_cogs,
  COALESCE(SUM(s.total) - SUM(ic.cogs), 0)::float AS gross_profit
FROM sales s
LEFT JOIN item_costs ic ON ic.sale_id = s.id
WHERE s.org_id = ${orgId} AND s.status = 'COMPLETED' ...
```

Cada venta aporta exactamente una fila. Lo usan `sales/route.ts:31,53` y
`profit/route.ts:37,64`.

### ❌ Incorrecto — JOIN directo con `SUM(s.total)`

```sql
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id AND si.org_id = ${orgId}
-- SUM(s.total) suma el total UNA VEZ POR LÍNEA de la venta
```

Una venta de L 1,000 con 3 productos aporta L 3,000. Lo usan los exports de
ventas y rentabilidad, y **ambas** rutas de eventos — ver §7.1.

### El caso que sí es válido

`sales/route.ts:102-125` (detalle) hace el JOIN directo pero pone `s.total` en
el `GROUP BY`, no en un `SUM`. Ahí no hay duplicación: cada venta es una fila
del resultado y `SUM(si.unit_cost * si.quantity)` agrega sus propias líneas.
Ese patrón es correcto y no debe "arreglarse".

### Por qué el bug es difícil de ver

El COGS **siempre queda bien**: cada fila `si` aparece una sola vez en el
producto cartesiano. Solo se inflan los campos que vienen de `sales`
(`total`, `discount`). Así que en un reporte roto los costos cuadran contra
finanzas y solo los ingresos están mal, lo que sugiere un problema de ventas
antes que un problema de reportería.

### Otras fuentes de cifras

- **Inventario** no toca ventas: el valor sale de `inventory_batches`
  (`SUM(qty_available * unit_cost)`) y el costo promedio de
  `SUM(qty * cost) / SUM(qty)` — coherente con el modelo FIFO descrito en
  `inventario.md §1`. Excluye servicios (`is_service = FALSE`) e inactivos.
- **Eventos** cruza `events` → `sales` (por `event_id`) → `sale_items`, y suma
  aparte los gastos con `reference_type = 'EVENT'` mediante subconsulta
  correlacionada. `net_profit = ingresos − COGS − fixed_cost − gastos extra`.
- **Rentabilidad** suma además todas las transacciones `type = 'EXPENSE'` del
  período — con el problema de doble conteo de §7.2.

---

## 5. Rango de fechas

Patrón usado en las queries con rango:

```sql
AND s.sold_at >= ${from}::date
AND s.sold_at <  (${to}::date + INTERVAL '1 day')
```

Semiabierto por la derecha, así que `to` es inclusivo — correcto. `sold_at`,
`occurred_at` y `starts_at` son `TIMESTAMP` **sin zona**
(`database/ddl-clean.sql:443,168,397`), así que no hay corrimiento de día por
UTC: el rango se compara en la misma zona en que se guardó.

Las fechas se parametrizan vía el template tag de Neon, así que **no hay riesgo
de inyección**. Sí falta validación de forma y de orden — §7.8.

En el cliente, `report-shell.tsx` genera los presets con `toLocalDateInput()`
(`lib/date-utils.ts`), no con `toISOString()`, evitando el corrimiento de día.
Las páginas formatean con el truco `new Date(from + "T12:00:00")` por la misma
razón. `defaultRange()` en el servidor **sí** usa `toISOString().slice(0,10)`,
pero solo aplica cuando el cliente no manda rango, cosa que nunca ocurre desde
la UI.

---

## 6. Exportación

Cuatro endpoints `POST` (POST, no GET, para recibir `from`/`to`/`symbol` en el
body). Todos devuelven un buffer con `Content-Disposition: attachment`.

- **PDF**: `jspdf` + `jspdf-autotable`, importados dinámicamente dentro de
  `generatePDF()`. Es la única ruta de exportación viva.
- **Excel**: existe solo en ventas y **está muerto** — ver §7.6.

El cliente repite el mismo bloque en las cuatro páginas: pedir token, `fetch`,
`res.blob()`, `<a download>`, `click()`, `revokeObjectURL()`. Sin manejo de
error (§7.3) y con `revokeObjectURL()` inmediato (§7.9).

---

## 7. Deuda técnica detectada

Ordenada por severidad. Todo verificado en el código, no son sospechas.

### 7.1 🔴 Fan-out de JOIN: los ingresos exportados están inflados

Aplicación directa del antipatrón de §4. Los GET de ventas y rentabilidad usan
la CTE; **sus exports usan el JOIN directo**, así que el PDF no cuadra con la
pantalla que lo generó.

| Archivo | Campos inflados |
|---|---|
| `app/api/reports/sales/export/route.ts:1150` | `total_revenue`, `total_discount`, `gross_profit` |
| `app/api/reports/sales/export/route.ts:1165` (byDay) | `revenue`, `profit`, y `sales_count` — `COUNT(*)` cuenta líneas, no ventas |
| `app/api/reports/profit/export/route.ts:354` | `revenue`, `total_discount`, `gross_profit`, `margin_pct` |
| `app/api/reports/profit/export/route.ts:374` (byMonth) | `revenue`, `profit` |

**Eventos está mal en ambos lados**, no solo en el export:

- `app/api/reports/events/route.ts:76-77`
- `app/api/reports/events/export/route.ts:338-339`

Ahí `sales_count` sí es correcto (`COUNT(DISTINCT s.id)`), lo que produce filas
internamente contradictorias: un evento puede mostrar "3 ventas / L 9,000"
cuando vendió L 3,000. `total_revenue` y `net_profit` quedan inflados; el
`total_cogs` es correcto.

Como los resúmenes de eventos se calculan en JS sumando las filas
(`events/route.ts:87-91`), el error se propaga tal cual al `summary`.

### 7.2 🔴 Doble conteo de gastos en Rentabilidad

`profit/route.ts:115` y `profit/export/route.ts:417` suman **todas** las
transacciones `type = 'EXPENSE'` del período, sin filtrar por `reference_type`.
Eso incluye tres cosas que no son gasto operativo del período:

| Origen | Dónde se crea | `reference_type` | Por qué no debe ir |
|---|---|---|---|
| Compra de inventario | `purchases/route.ts:220-255` | `PURCHASE`, `PURCHASE_SHIPPING` | Ya se cuenta como COGS al vender |
| Compra de suministros | `supply-purchases/route.ts:160` | `SUPPLY_PURCHASE` | Idem, es adquisición de activo |
| Pago de tarjeta | `credit-cards/[id]/payment/route.ts:73` | — | Es traslado de deuda, no gasto |

La cifra se presenta como "Gastos registrados en el período"
(`profit/page.tsx:91-96`) justo debajo de la utilidad bruta, invitando a
restarla — lo que descuenta el inventario dos veces. Las compras de inventario
son identificables también por `category = INVENTORY_PURCHASE_CATEGORY`
(ver `inventario.md §8`).

### 7.3 🟠 Los exports fallan en silencio

Las cuatro páginas descartan el error:

```ts
if (!res.ok) return;
```

`sales/page.tsx:52` · `profit/page.tsx:51` · `events/page.tsx:62` · `inventory/page.tsx:62`

No es hipotético. Los exports exigen `showCosts && showProfit`
(`sales/export:1137`, `inventory/export:285`, `events/export:297`) mientras la
página se renderiza con solo `canView`. Un usuario con rol restringido ve el
reporte, presiona PDF, el spinner de `ReportShell` gira y se detiene, y **no
pasa nada**. El 403 trae un mensaje útil que se tira a la basura.

### 7.4 🟠 `profit` no respeta `showCosts`

`profit/route.ts:24-27` valida únicamente `showProfit`, pero la respuesta
incluye `summary.cogs` (línea 46) y `byProduct[].cogs` (línea 95) sin pasar por
`nullifyKeysDeep` — a diferencia de las otras tres rutas. Un rol con
`showProfit: true, showCosts: false` recibe costos que no debería ver.

Relacionado: la asimetría GET-degrada / export-rechaza (§3) deja sin salida a
un rol con `showProfit` pero sin `showCosts` — ve el reporte y nunca puede
exportarlo.

### 7.5 🟡 Umbral de "stock bajo": cuatro valores para el mismo concepto

Extiende lo ya documentado en `inventario.md §9.3` con un cuarto valor y un bug:

| Lugar | Umbral |
|---|---|
| `reports/inventory/route.ts:19` | param `low_stock`, default 5 |
| `reports/inventory/page.tsx:146` (color de fila) | 5 hardcodeado |
| `reports/inventory/export/route.ts:340` | 5 hardcodeado — **ignora el param** |
| `api/inventory/route.ts:37`, `dashboard/route.ts:124` | `< 10` |

Dos problemas adicionales:

- El parámetro `low_stock` **nunca se envía desde la UI**, así que es
  configuración muerta.
- `Number(searchParams.get("low_stock") ?? "5")` produce `NaN` con input
  inválido. Todas las comparaciones contra `NaN` dan `false`, así que
  `low_stock_count` queda en 0 en silencio — la tarjeta "Stock bajo / agotado"
  reporta cero productos en riesgo.

No hay columna de punto de reorden por producto: `products` **no tiene**
`min_stock` en ninguna versión del schema (`ddl.v1`, `ddl.v3`, `ddl-clean`). La
columna `min_stock` que aparece en las tres pertenece a `supplies`, que es otro
módulo. Unificar el umbral por producto exige migración.

### 7.6 🟡 ~600 líneas de generador de Excel inalcanzable

`sales/export/route.ts` dedica aproximadamente la mitad de sus 1252 líneas a un
generador de Excel que nunca se ejecuta: `generateExcel()` (línea 649),
`buildDashboardSheet`, `buildChartSheet`, `buildProductsSheet`,
`buildDetailSheet`, `buildByDaySheet`, más el sistema de estilos `COLORS` /
`cell()` / `headerCell()` / `marginColor()`.

Por qué está muerto:

- `ReportShell` declara `onExportExcel` en `Props` (`report-shell.tsx:56`) pero
  **no lo desestructura** (línea 63) ni renderiza botón. Solo existe el de PDF.
- El único llamador es `handlePDFExport = () => triggerExport("pdf")`
  (`sales/page.tsx:64`).
- El default del body es `"xlsx"` (línea 1147), contradiciendo al único cliente
  que existe.

Además, aunque se conectara no funcionaría como se espera:
`XLSX.write(..., { cellStyles: true })` (línea 672) no aplica estilos en el
build comunitario de `xlsx` — es función de la versión pro. Saldría sin
formato. Si el Excel se quiere de verdad, `exceljs` ya está en
`package.json:51` y sí soporta estilos; `xlsx` seguiría siendo necesario de
todos modos porque `lib/export.ts:17` y `lib/import-inventory.ts:4` lo usan.

### 7.7 🟡 Queries duplicadas — la causa raíz de 7.1

Cada reporte tiene su lógica escrita dos veces, en el GET y en el export, y ya
divergieron: los GET de ventas y rentabilidad se corrigieron con la CTE y los
exports se quedaron con el JOIN directo. También divergen los `LIMIT`
(`byProduct` es 50 en el GET y 100 en el export de ventas) y el umbral de stock
bajo (§7.5).

Extraer las queries a `lib/reports/queries.ts` y consumirlas desde ambos
handlers elimina la clase entera de bug, no solo las instancias actuales.

### 7.8 🟢 Sin validación de rango

`from` y `to` se toman crudos del query string o del body. No hay validación de
formato, de orden ni de amplitud:

- Input basura → error de Postgres al castear `::date` → 500 genérico
  ("Error al generar reporte"). Sin riesgo de inyección: va parametrizado.
- `from > to` devuelve resultados vacíos sin avisar que el rango es inválido.
- No hay tope de amplitud: nada impide pedir 20 años en una sola query.

### 7.9 🟢 Menores

- **Meses en inglés** — `TO_CHAR(s.sold_at, 'Mon YYYY')` (`profit/route.ts:73`,
  `profit/export:377`) devuelve "Jan 2026" en una app cuyo locale es `es-HN`.
  Es la etiqueta del eje X del gráfico mensual.
- **Inventario sin `LIMIT`** (`inventory/route.ts:22`) — trae el catálogo
  completo y pagina en cliente (`PRODUCT_PAGE_SIZE = 10`). El payload crece
  linealmente con el catálogo. Mismo caso en el export.
- **`userId` desestructurado sin usar** en las 8 rutas del módulo.
- **React key colisionable** — `${m.product_name}-${m.created_at}-${m.movement_type}`
  (`inventory/page.tsx:200`): dos movimientos del mismo producto y tipo en el
  mismo timestamp comparten key.
- **`revokeObjectURL()` inmediato tras `a.click()`** en las cuatro páginas — en
  algunos navegadores alcanza a cancelar la descarga. Conviene diferirlo.
- **`<a>` sin adjuntar al DOM** antes de `click()` — funciona en navegadores
  actuales, pero es frágil.
- **Typo** — `COLORS.barBlue: "DBEAFe"` (`sales/export:59`), casing
  inconsistente. Inofensivo, y de todos modos es código muerto (§7.6).
- **`/reports` da 404** por URL directa: no hay `page.tsx` en la raíz del grupo
  (§2). Desde el sidebar no se alcanza.

---

## 8. Orden sugerido de corrección

1. **§7.1 + §7.7 juntos** — extraer las queries compartidas ya corregidas con la
   CTE. Resuelve el bug y su causa raíz de una sola vez.
2. **§7.2** — filtrar los `reference_type` de adquisición y renombrar la
   etiqueta de la tarjeta.
3. **§7.3 + §7.4** — son los que más soporte generan: el usuario no entiende por
   qué el botón no responde.

§7.1 y §7.2 son errores de cifras que el usuario final no puede detectar sin
auditar a mano, y que hoy salen impresos en un PDF con apariencia de documento
formal.
