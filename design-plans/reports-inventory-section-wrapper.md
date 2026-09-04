# Wrap Inventory report tables in ReportSection to match sibling reports

Written against: e7748717d1fa3b294c416cdc4ae90994a9ebb455

## Evidence chain

- Surface: `app/(dashboard)/reports/inventory/page.tsx` (Reporte de inventario, "Stock por producto" and "Movimientos (30 días)" tables)
- Problem: Every other report page (Ventas, Rentabilidad, Eventos) wraps its data table in the shared `ReportSection` component, which renders a card with a titled, icon-labeled header above the table. The Inventory report's two tables instead render inside a bare `<div className="rounded-xl border overflow-hidden">`, with no title or icon — the only report page that departs from this treatment.
- Design evidence:
  - `components/reports/report-shell.tsx:189-192` — `ReportSection`'s own source comment: *"Envoltorio consistente para bloques de gráfico o tabla con título e ícono... agrega una línea divisoria bajo el encabezado"* (consistent wrapper for chart/table blocks with title and icon) — an explicit, documented design decision for this exact use case.
  - `app/(dashboard)/reports/sales/page.tsx:129` — `<ReportSection title="Productos más vendidos" icon={Package} noPadding>` wrapping its product table.
  - `app/(dashboard)/reports/profit/page.tsx:138` — `<ReportSection title="Rentabilidad por producto" icon={Package} noPadding>` wrapping its product table.
  - `app/(dashboard)/reports/events/page.tsx:147` — `<ReportSection title="Detalle por evento" icon={CalendarDays} noPadding>` wrapping its events table.
  - `app/(dashboard)/reports/inventory/page.tsx:11` — imports only `{ ReportShell, StatCard }` from `report-shell`; `ReportSection` is never imported or used. Tables are rendered raw at lines 139 (stock) and 199 (movements).
- Owner: `components/reports/report-shell.tsx` (`ReportSection`).
- Scope and affected surfaces: `app/(dashboard)/reports/inventory/page.tsx` only — both its "stock" tab table and its "movements" tab table.
- Uncertainty: None. The table markup itself (columns, header row styling `border-b bg-muted/10 text-xs text-muted-foreground`, row styling `border-b last:border-0 hover:bg-muted/20 transition-colors`) is already identical in structure to the sibling pages' tables — only the surrounding wrapper differs.

## Design decision

Wrap both the stock table and the movements table in `ReportSection`, using its `noPadding` variant (the same variant every sibling report table already uses) and a title + icon per tab, so Inventory's tables receive the same titled-card treatment as every other report's tables. This resolves the root problem: a viewer scanning across report pages currently sees an unlabeled, differently-chromed block specifically on Inventory, breaking the otherwise-uniform "every table lives in a titled ReportSection card" pattern documented in the shell itself.

## Reuse

- Component: `ReportSection` from `@/components/reports/report-shell`, `noPadding` variant — exemplar at `app/(dashboard)/reports/events/page.tsx:147-197` (a table-only ReportSection with no summary rows above it, structurally closest to Inventory's case).
- Icons: `Package` (already imported in `inventory/page.tsx:18`, currently used only for the tab button and a StatCard) and `ArrowLeftRight` (already imported in `inventory/page.tsx:18`, currently used only for the tab button) — no new imports required.
- No new primitive needed.

## Changes

1. `app/(dashboard)/reports/inventory/page.tsx`
   - Change: Add `ReportSection` to the import from `@/components/reports/report-shell` (line 11).
   - Change: Replace the stock table's wrapper (currently `<div className="rounded-xl border overflow-hidden"><div className="overflow-x-auto">...</div></div>` starting at line 139) with `<ReportSection title="Stock por producto" icon={Package} noPadding><div className="overflow-x-auto">...</div></ReportSection>`, keeping the inner `<table>` markup unchanged.
   - Change: Replace the movements table's wrapper (currently the same pattern starting at line 199) with `<ReportSection title="Movimientos (30 días)" icon={ArrowLeftRight} noPadding><div className="overflow-x-auto">...</div></ReportSection>`, keeping the inner `<table>` markup unchanged.
   - Preserve: The tab buttons above the tables (which already show "Stock por producto" / "Movimientos (30 días)" as button labels — the ReportSection titles duplicate this label into the card header, matching how e.g. Sales shows "Productos más vendidos" as both context and card title), the search input, `PaginationControls`, and all table cell content/columns.
   - Verify: Both tabs render a card with a header row (icon + title + bottom divider) above the table, visually matching the card chrome used on Ventas/Rentabilidad/Eventos table sections.

## Scope

- Inherit: `app/(dashboard)/reports/inventory/page.tsx` stock tab and movements tab only.
- Verify: The `PaginationControls` block below each table still renders directly beneath the `ReportSection` (outside of it, as `space-y-2` siblings) exactly as it does on the other three report pages — do not move pagination inside the `ReportSection`.
- Exclude: The StatCard grid, the tab buttons themselves, and the search input — none of these are tables and none use `ReportSection` on any sibling page either.

## Validation

- Product: Open Reporte de inventario, switch between "Stock por producto" and "Movimientos (30 días)" tabs, and confirm each table now appears inside a titled card matching the visual weight of the other report pages' tables.
- Interface: Check the empty states (no products matching search; no movements in 30 days) still render correctly inside the new wrapper's `CardContent`; check narrow viewports where `overflow-x-auto` must still allow horizontal table scroll inside the card.
- System: Confirm no second, parallel "titled card" pattern was invented — the change must use the existing `ReportSection` component and its existing `noPadding` variant exactly as used elsewhere, not a new local wrapper.
- Repository: `npx tsc --noEmit` → no new type errors from the added import or JSX changes.

## Stop conditions

- Stop if `ReportSection`'s fixed header height or divider styling visually clashes with the tab buttons sitting directly above it (e.g. redundant double-labeling of "Stock por producto") once rendered — if so, surface this back rather than removing the tab button labels, since that naming decision is outside this plan's scope.

## Design documentation

- After acceptance and validation: none — this brings the surface into conformance with the decision already documented in `report-shell.tsx:189-192`; no new decision is being introduced.
