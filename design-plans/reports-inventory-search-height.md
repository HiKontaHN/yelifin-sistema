# Match Inventory report search input height to the reports filter-bar standard

Written against: e7748717d1fa3b294c416cdc4ae90994a9ebb455

## Evidence chain

- Surface: `app/(dashboard)/reports/inventory/page.tsx` (Reporte de inventario, product search input above the stock table)
- Problem: The search input renders at the base `Input` component's default height (`h-9`), while the only other filter control in the same reports shell — the "Desde"/"Hasta" date inputs in `ReportShell` — is explicitly sized down to `h-8` to match the compact scale of the report toolbar's other controls (preset buttons and `size="sm"` buttons, both `h-8`). The search input is the odd one out in the reports surface's filter-control sizing.
- Design evidence:
  - `components/ui/input.tsx:16` — base `Input` className includes `h-9` as its only height class (no size variants exist on this primitive).
  - `components/reports/report-shell.tsx:136` and `:140` — the date-range `Input`s are explicitly overridden: `className="h-8 text-xs w-36"`.
  - `components/reports/report-shell.tsx:122-126` — the date-preset `Button`s use `size="sm"` (`h-8` per `components/ui/button.tsx:25`) with an additional explicit `h-8 text-xs` override, reinforcing `h-8` as this surface's toolbar-control scale.
  - `app/(dashboard)/reports/inventory/page.tsx:128-132` — the search `<Input placeholder="Buscar producto o SKU..." value={search} onChange={...} className="pl-8" />` has no height override, so it resolves to the base `h-9`.
- Owner: `components/ui/input.tsx` (base height contract); the local override pattern is owned by `report-shell.tsx`.
- Scope and affected surfaces: `app/(dashboard)/reports/inventory/page.tsx` only — the single search input above the stock table.
- Uncertainty: The search input sits in its own row below the tab buttons, not directly inline beside an `h-8` control, so the mismatch is a same-surface convention deviation rather than a control literally touching a differently-sized neighbor. Flagged as such (Medium confidence in the audit) rather than a hard pixel-alignment break.

## Design decision

Add the same explicit height/type-scale override already used for every other filter-row control on this surface (`h-8 text-xs`) to the Inventory search input, so all report-page filter controls share one control height instead of the search input alone defaulting to the primitive's base size.

## Reuse

- Pattern: `h-8 text-xs`, taken verbatim from `components/reports/report-shell.tsx:136,140` (date-range `Input`s).
- Exemplar: `components/reports/report-shell.tsx:136` (`<Input type="date" ... className="h-8 text-xs w-36" />`).
- No new primitive needed — this reuses the existing override string already applied twice in the same shell file.

## Changes

1. `app/(dashboard)/reports/inventory/page.tsx`
   - Change: On the search `Input` (line 128-132), change `className="pl-8"` to `className="h-8 text-xs pl-8"`.
   - Preserve: The `Search` icon overlay positioning (`absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2`), the `placeholder`, `value`, and `onChange` wiring, and the `max-w-xs` width constraint on the parent `div`.
   - Verify: The search input renders at the same height as the tab buttons and the report toolbar's other `h-8` controls, with proportionally smaller placeholder/input text (`text-xs`) matching the date inputs.

## Scope

- Inherit: Only the search `Input` in `app/(dashboard)/reports/inventory/page.tsx`.
- Verify: The `Search` icon's vertical centering (`top-1/2 -translate-y-1/2`) still aligns correctly at the new `h-8` height — recheck since the icon position is computed relative to input height.
- Exclude: All other `Input` usages elsewhere in the app outside the reports surface (e.g. forms in customers/products/sales) — this plan does not assert a global input-height rule, only a reports-filter-row convention already established by `report-shell.tsx`.

## Validation

- Product: Open Reporte de inventario, stock tab, and visually compare the search input's height against the "Stock por producto" / "Movimientos" tab buttons directly above it.
- Interface: Type a search query and confirm text remains legible at `text-xs`; check the clear/backspace interaction still works; check narrow viewports where `max-w-xs` may already constrain width more than height.
- System: Confirm no new height value was invented — `h-8 text-xs` is copied character-for-character from the existing `report-shell.tsx` override.
- Repository: `npx tsc --noEmit` → no new type errors (className string change only).

## Stop conditions

- Stop if visual inspection shows `text-xs` makes the placeholder "Buscar producto o SKU..." feel too small relative to the table content below it (which renders at `text-sm`) — if so, keep `h-8` but drop the `text-xs` override and report the discrepancy rather than silently deviating from the exemplar.

## Design documentation

- After acceptance and validation: none — no design documentation exists for this surface to update; the override is copied from an existing, unambiguous exemplar in the same file family.
