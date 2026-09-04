# Unify the "Margen" KPI color threshold between Sales and Profit reports

Written against: e7748717d1fa3b294c416cdc4ae90994a9ebb455

## Evidence chain

- Surface: `app/(dashboard)/reports/sales/page.tsx` (Reporte de ventas, "Margen" StatCard)
- Problem: The Sales report's aggregate "Margen" StatCard colors any margin below 20% as "amber," with no "red" tier — so a negative or very low (e.g. -30%) margin renders identically to a healthy-but-not-great 15% margin. The sibling Profit report's equivalent "Margen bruto" StatCard, showing the same underlying metric (gross margin %), uses a three-tier scheme (green ≥20%, amber ≥10%, red otherwise) that correctly flags low/negative margins as red.
- Design evidence:
  - `components/reports/report-shell.tsx` — `StatCard` component accepts an `accent` prop (`"green" | "red" | "blue" | "amber"`) with pre-defined background/icon color tokens for each; no card-specific styling is invented here, only the accent choice differs.
  - `app/(dashboard)/reports/sales/page.tsx:99` — `accent={marginPct >= 20 ? "green" : "amber"}` (two-tier, no red).
  - `app/(dashboard)/reports/profit/page.tsx:92-98` — `accent={summary.margin_pct >= 20 ? "green" : summary.margin_pct >= 10 ? "amber" : "red"}` (three-tier, includes red).
  - `app/(dashboard)/reports/sales/page.tsx:156` — the Sales report's own per-product margin `Badge` already uses a three-tier scheme (`>=30` green, `>=10` amber, else red) for the identical `margin_pct` field, so the three-tier idiom for this exact metric is already established inside the Sales page itself, just not applied to its own aggregate StatCard.
  - Corroborating (not in scope to change, cited only as evidence the split is systemic, not a typo): `app/api/reports/sales/export/route.ts:925-926` and `:230` replicate the two-tier (no red) scheme for the same "Margen bruto" KPI in Excel/PDF exports; `app/api/reports/profit/export/route.ts:180-181` replicates the three-tier scheme in its PDF export.
- Owner: `components/reports/report-shell.tsx` (`StatCard`'s `accent` prop contract — unchanged); the threshold logic itself lives inline in each consuming page, not in the shared component.
- Scope and affected surfaces: `app/(dashboard)/reports/sales/page.tsx` only (the on-screen "Reporte de ventas" page). The export routes (`app/api/reports/sales/export/route.ts`) share the same visual contradiction but are a separate surface (server-generated documents, not the audited UI surface) — excluded from this plan.
- Uncertainty: None. Both pages compute `margin_pct` the same way (gross_profit / revenue × 100) and both already use identical Badge-level threshold semantics.

## Design decision

Change the accent logic for the "Margen" `StatCard` in `sales/page.tsx` from two-tier to the three-tier scheme already used by (a) the sibling Profit report's equivalent StatCard and (b) the Sales page's own per-product margin Badge. This resolves the root problem — the same metric getting a weaker/inconsistent risk signal depending on which report page is showing it — by making both report pages, and both component types on the same page, agree on what counts as "healthy," "caution," and "risk" margin.

## Reuse

- Pattern: `accent >= 20 ? "green" : marginPct >= 10 ? "amber" : "red"`, taken verbatim from `app/(dashboard)/reports/profit/page.tsx:92-98`.
- Exemplar: `app/(dashboard)/reports/profit/page.tsx:92-98` (StatCard three-tier accent) and `app/(dashboard)/reports/sales/page.tsx:156` (Badge three-tier threshold, same page).
- No new primitive needed — `StatCard`'s existing `accent="red"` already has full styling defined in `report-shell.tsx:163,169` (border/background) and `:169` (icon color); it is simply unused today in `sales/page.tsx`.

## Changes

1. `app/(dashboard)/reports/sales/page.tsx`
   - Change: On the "Margen" `StatCard` (currently line 99), replace `accent={marginPct >= 20 ? "green" : "amber"}` with `accent={marginPct >= 20 ? "green" : marginPct >= 10 ? "amber" : "red"}`.
   - Preserve: The `sub` prop (`Descuentos: ${format(summary.total_discount)}`), the `label`, `value`, and `icon` props, and the surrounding stats grid layout — none of these change.
   - Verify: With a period where `total_revenue > 0` and `gross_profit` negative or small enough that `marginPct < 10`, the "Margen" StatCard renders with the same red border/background/icon treatment already visible on the Profit report's "Margen bruto" card and on this page's own product-table margin badges.

## Scope

- Inherit: Only the "Margen" `StatCard` on `app/(dashboard)/reports/sales/page.tsx`.
- Verify: The Sales report's own per-product margin `Badge` column (line ~156) still uses its existing thresholds unchanged — confirm no accidental edit there since it sits a few lines away in the same render tree.
- Exclude: `app/api/reports/sales/export/route.ts` (Excel/PDF export KPI coloring) and `app/api/reports/inventory/export/route.ts` — these are a separate surface (generated documents) and are not touched by this plan, even though they share the same two-tier pattern today.

## Validation

- Product: Open Reporte de ventas for a date range with a loss-making or very-low-margin period (or temporarily mock `summary.gross_profit` to a negative value) and confirm the "Margen" card shows red, not amber.
- Interface: Check both a healthy margin (≥20%, expect green), a mid margin (10–19%, expect amber), and a low/negative margin (<10%, expect red); check both light and dark mode, since `StatCard`'s red accent has separate dark-mode classes (`report-shell.tsx:163` `dark:border-red-900 dark:bg-red-950/20`).
- System: Confirm no new accent value or color token was introduced — only the existing `"red"` branch of the already-defined `Accent` type is now reachable from this call site.
- Repository: `npx tsc --noEmit` → no new type errors (the `accent` prop already accepts `"red"` per its `Accent` type in `report-shell.tsx:153`).

## Stop conditions

- Stop if `summary.gross_profit` or `summary.total_revenue` turns out to be computed differently from `profit/page.tsx`'s `summary.margin_pct` (e.g. a different tax or discount treatment) — in that case the two metrics are not actually the same and this unification would misrepresent the Sales report's number.

## Design documentation

- After acceptance and validation: none — no design documentation exists for this surface to update (see audit: no `DESIGN.md`); the three-tier threshold becomes self-evident from the two sibling pages agreeing.
