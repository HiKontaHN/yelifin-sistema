# MobileSummary's recent-sales empty state should match its desktop counterpart's padding

Written against: 0869688

## Evidence chain

- Surface: `components/dashboard/mobile-summary.tsx` (`MobileSummary`, rendered from `app/(dashboard)/dashboard/page.tsx`, visible only below `lg` via its `lg:hidden` wrapper)
- Problem: The "Últimas ventas" empty state shows `py-3` vertical padding, while its desktop counterpart and every other dashboard empty-state uses `py-8`.
- Design evidence: `components/dashboard/recent-sales-table.tsx:60-62` (visible only `hidden lg:block`, receives the same `recentSales` prop from the same page) renders the identical string *"Sin ventas en este período"* with `py-8`. The same `py-8` value is also used by `components/dashboard/stock-alerts-card.tsx:61` (`EmptyState`) and `components/dashboard/top-products-stock.tsx:25`.
- Owner: No shared "empty state" component exists — each dashboard card renders its own inline empty-state markup, but all four independently agree on `py-8` except this one.
- Scope and affected surfaces: `components/dashboard/mobile-summary.tsx` only — the single `<p>` at line 61.
- Uncertainty: None — the desktop counterpart of this exact message already uses `py-8`.

## Design decision

Change the "Últimas ventas" empty-state paragraph's `py-3` to `py-8`, matching its own desktop counterpart in `RecentSalesTable` and the `py-8` convention already shared by `StockAlertsCard` and `TopProductsStock`.

## Reuse

- `py-8` — already used for this exact copy at `recent-sales-table.tsx:61`, and for dashboard empty-states generally at `stock-alerts-card.tsx:61` and `top-products-stock.tsx:25`.
- Exemplar: `components/dashboard/recent-sales-table.tsx:60-62`

No new primitive is required.

## Changes

1. `components/dashboard/mobile-summary.tsx:61`
   - Change: Replace `py-3` with `py-8` in the empty-state `<p>`'s className (`"text-sm text-muted-foreground text-center py-3"` → `"text-sm text-muted-foreground text-center py-8"`).
   - Preserve: The rest of the className, the conditional logic (`!recentSales.length`), and every other empty/loading state in this file (the low-stock alert section's skeleton, the sales-list skeleton) — unrelated to this change.
   - Verify: With `recentSales` empty, the message now sits with the same breathing room as the desktop table's equivalent empty state, and matches the other two dashboard cards' empty states at the same viewport.

## Scope

- Inherit: Only the "Últimas ventas" empty state inside `MobileSummary` (the low-stock alert section above it has its own, separate skeleton/list — not empty-state text — and is unaffected).
- Verify: The card's overall height when empty (one line of text with more padding makes the card slightly taller) doesn't crowd other mobile-only dashboard sections — check against `MetricsGrid` and `CreditCardDebtWidget`, which render above it on mobile.
- Exclude: `RecentSalesTable`, `StockAlertsCard`, `TopProductsStock` — already correct, not part of this change.

## Validation

- Product: N/A — visual-only change, no behavior affected.
- Interface: `/dashboard` at a mobile viewport (<1024px, where `MobileSummary` renders), with a period selected that has zero sales (e.g., a future month or a brand-new account) to trigger the empty state.
- System: Confirm the four dashboard empty-states (`MobileSummary`, `RecentSalesTable`, `StockAlertsCard`, `TopProductsStock`) now all use `py-8`.
- Repository: `npx tsc --noEmit` → no new errors. (`npm run lint` is currently unavailable in this environment — `eslint` isn't installed in `node_modules` despite the `lint` script referencing it.)

## Stop conditions

- Stop if `MobileSummary`'s card, once taller, visibly crowds the sections above or below it on a small device — that would call for a broader mobile-layout look rather than this single padding fix.

## Design documentation

- After acceptance and validation: none — no `DESIGN.md` exists for this surface to update.
