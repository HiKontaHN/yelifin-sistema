# SalesCharts card headers should match the dashboard's established recipe

Written against: 0869688

## Evidence chain

- Surface: `components/dashboard/sales-charts.tsx` (`SalesCharts`, rendered from `app/(dashboard)/dashboard/page.tsx`)
- Problem: Both cards in `SalesCharts` ("Ventas vs Ganancias" and "Métodos de Pago") style their `CardHeader`/`CardTitle`/`CardDescription` differently from every other dashboard content card.
- Design evidence: `sales-charts.tsx:35` and `:91` both use `CardHeader className="pb-3 pt-5 px-5"`, `CardTitle className="text-lg font-bold tracking-tight"`, `CardDescription className="text-sm font-medium"`. Three independently-authored sibling components disagree with this and agree with each other: `components/dashboard/top-products-stock.tsx:19-21`, `components/dashboard/stock-alerts-card.tsx:102-106`, and `components/dashboard/recent-sales-table.tsx:33-35` all use `CardHeader className="pb-2 pt-4 px-4"` with a plain `CardTitle className="text-base"` (`StockAlertsCard`'s adds only `flex items-center gap-2` for its inline icon — no size/weight override) and an unstyled `CardDescription` (base primitive classes only).
- Owner: No shared "dashboard card header" component exists — each card composes `CardHeader`/`CardTitle`/`CardDescription` directly from `components/ui/card.tsx`, but three of four sibling components agree on identical classes.
- Scope and affected surfaces: `components/dashboard/sales-charts.tsx` only (both of its two cards).
- Uncertainty: None on the target recipe (three components already agree on it exactly). `StockAlertsCard` has no `CardDescription`, so the exemplar for that specific element is `TopProductsStock`/`RecentSalesTable` (both pair `CardTitle` with a plain `CardDescription`, matching `SalesCharts`' own Title+Description composition).

## Design decision

Change both of `SalesCharts`' `CardHeader`/`CardTitle`/`CardDescription` usages to the `pb-2 pt-4 px-4` / plain `text-base` / unstyled-description recipe that `TopProductsStock`, `StockAlertsCard`, and `RecentSalesTable` already share, so all dashboard content-card headers read at one consistent size and density.

## Reuse

- `CardHeader className="pb-2 pt-4 px-4"`, `CardTitle className="text-base"`, unstyled `CardDescription` — already used identically by three sibling components.
- Exemplar: `components/dashboard/top-products-stock.tsx:19-21` (closest match: Title + Description, same composition as `SalesCharts`' own headers)

No new primitive is required.

## Changes

1. `components/dashboard/sales-charts.tsx:35` ("Ventas vs Ganancias" card)
   - Change: `CardHeader className="pb-3 pt-5 px-5"` → `"pb-2 pt-4 px-4"`; `CardTitle className="text-lg font-bold tracking-tight"` → `"text-base"`; `CardDescription className="text-sm font-medium"` → remove the className prop entirely (use the base primitive styling, as `TopProductsStock`/`RecentSalesTable` do).
   - Preserve: The title/description copy, the `CardContent className="px-2 pb-1"` below it (chart-specific padding, out of scope), and the chart itself.
   - Verify: The "Ventas vs Ganancias" header now reads at the same size/density as "Top productos", "Alertas de stock", and "Últimas ventas".
2. `components/dashboard/sales-charts.tsx:91` ("Métodos de Pago" card)
   - Change: Same three class replacements as above, applied to this card's `CardHeader`/`CardTitle`/`CardDescription`.
   - Preserve: `CardContent className="px-5 pb-0"` below it and the pie chart itself.
   - Verify: Same visual match as the first card.

## Scope

- Inherit: Both cards inside `SalesCharts` — they currently share the same non-conforming recipe, so both change together.
- Verify: `SalesCharts` renders in a `grid gap-4 lg:grid-cols-7` row (`lg:col-span-4` / `lg:col-span-3`) — confirm the shorter header doesn't visually unbalance the row against `TopProductsStock`'s row directly below it (which already uses the target recipe).
- Exclude: `TopProductsStock`, `StockAlertsCard`, `RecentSalesTable` — already correct, not part of this change. `CardContent` padding on both `SalesCharts` cards (chart-specific, unrelated to the header inconsistency).

## Validation

- Product: N/A — visual-only change, no behavior affected.
- Interface: `/dashboard` at `lg:` and above (where `SalesCharts` renders its full two-card layout) and below `lg` (single-column stack) — both the loading-skeleton and loaded states of both cards.
- System: Confirm all four dashboard content-card headers (`SalesCharts` ×2, `TopProductsStock`, `StockAlertsCard`, `RecentSalesTable`) now use the same `CardHeader`/`CardTitle`/`CardDescription` recipe.
- Repository: `npx tsc --noEmit` → no new errors. (`npm run lint` is currently unavailable in this environment — `eslint` isn't installed in `node_modules` despite the `lint` script referencing it.)

## Stop conditions

- Stop if `showProfit=false` (title text becomes "Ventas" instead of "Ventas vs Ganancias") reveals a length/wrapping issue at the smaller `text-base` size that the current larger title doesn't have — check both title states before treating this as done.

## Design documentation

- After acceptance and validation: none — no `DESIGN.md` exists for this surface to update.
