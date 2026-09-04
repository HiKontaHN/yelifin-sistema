# Landing demo modals should wear the real bottom-sheet chrome, not a fixed centered card

Written against: c77dbf8

## Evidence chain

- Surface: `components/landing/landing-flow.tsx` (`LandingFlow`, rendered from `app/page.tsx`)
- Problem: `ProductDemoModal` and `CustomerDemoModal` reproduce the real dialogs' exact title copy and icons, but render only as a centered `rounded-2xl` card at every viewport width — never as the bottom-anchored sheet the real product shows below 640px.
- Design evidence: `components/shared/responsive-modal.tsx` (`ResponsiveModal`) is the shared owner behind every real dialog in the app (31 consumers), and its bottom-sheet/centered-dialog composition is documented as the confirmed pattern in `.claude/agent-memory/ui-consistency-auditor/feedback_dialog_layout.md`.
- Owner: `components/shared/responsive-modal.tsx`
- Scope and affected surfaces: `components/landing/landing-flow.tsx` only (`DemoModal`, `ProductDemoModal`, `CustomerDemoModal`) — no other landing component renders a modal-like surface.
- Uncertainty: `DemoModal` is presentation-only — always mounted inline inside its slide, with no `open`/`onOpenChange`, no Radix `Dialog`, no dismiss affordance that works. That's intentional (it's a static marketing visual, not a real dialog instance), and this plan does not change it. The plan borrows `ResponsiveModal`'s visual chrome (markup/classes) only, not its drag-to-close gesture or open/close state. If a chrome-only port reads as an uncanny half-implementation once built, see Stop conditions.

## Design decision

Below the `sm` breakpoint (matching `ResponsiveModal`'s own `SHEET_MEDIA_QUERY: (max-width: 639px)`), restyle `DemoModal` to render with the real bottom-sheet chrome — full-width and bottom-anchored within its slide, top-only rounded corners, a drag-handle bar — and keep the current centered `rounded-2xl` card treatment at `sm:` and above, switching at the exact breakpoint `ResponsiveModal` itself switches on. This makes the "Tu día con HiKonta se verá así" preview visually match the real dialog it already copies verbatim in content, on the device (mobile) this landing page's own copy targets.

## Reuse

- Exemplar: `components/shared/responsive-modal.tsx` lines 226-230 (drag-handle markup) and lines 204-219 (bottom-sheet/centered-dialog class recipe on `DialogContent`)
- Breakpoint convention: `sm:` (640px) — same as `responsive-modal.tsx:33`'s `SHEET_MEDIA_QUERY`

No new primitive is required: `DemoModal` stays a plain `div`, not a real `Dialog` — this is a visual port of existing classes/markup, not a new interaction.

## Changes

1. `components/landing/landing-flow.tsx` — `DemoModal` (function at line 60, outer container at line 68)
   - Change: Replace the outer container's className (currently `mx-auto flex max-h-[520px] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white ... shadow-[...] sm:max-h-[550px] xl:max-w-lg`) with a base (<640px) state that reads as a bottom sheet — full width of its slide, anchored to the slide's bottom edge, `rounded-t-2xl rounded-b-none`, `border-t` only (no side/bottom border) — matching `responsive-modal.tsx:204-213`'s base recipe. Apply the current centered-card look (`rounded-2xl`, all-side border, `mx-auto`, `max-w-md`) as an `sm:` variant, exactly as `responsive-modal.tsx:209-213` layers it.
   - Change: Insert the drag-handle bar (`responsive-modal.tsx:226-230`'s markup — a centered `w-10 h-1 rounded-full bg-muted-foreground/30` pill) as the first child, visible only below `sm:` (`sm:hidden`), matching the real component.
   - Preserve: The header (icon + title + `X`), scrollable body, and footer (Cancelar/action buttons + optional footnote) exactly as they render today — only the outer container's shape/anchoring changes, not its content or the two callers' props.
   - Preserve: The slide `<article>`'s own layout (lines 39-43) and `SlideArt` decorations — unrelated, must not change.
   - Verify: At a mobile viewport (<640px), the modal reads as a sheet anchored to the bottom of its slide card, top-only rounded corners, drag-handle bar visible — visually consistent with opening "Nuevo producto"/"Nuevo cliente" in the real app at the same width. At `sm:` and above, the modal still renders as today's centered card, unchanged.

## Scope

- Inherit: Both slides in `LandingFlow` (`ProductDemoModal`, `CustomerDemoModal`) — they share `DemoModal`, so both update together.
- Verify: Re-check the article height math from the companion plan (`landing-flow-slide-height-clipping.md`) against this modal's new bottom-anchored variant if both land together — anchoring to the bottom changes how the modal's edge meets the card's edge.
- Exclude: `ResponsiveModal` itself and every real dialog that consumes it — this plan changes only the landing's static recreation. No drag-to-close gesture, no Radix `Dialog`, no `open`/`onOpenChange` wiring — the modal stays permanently visible and non-dismissible, as today.

## Validation

- Product: N/A — marketing-only surface, no product behavior changes.
- Interface: `/` (landing) at <640px, at exactly 640px, and at ≥1024px — both `ProductDemoModal` (including its `isService` toggle) and `CustomerDemoModal`.
- System: Confirm the bottom-sheet variant reuses `responsive-modal.tsx`'s exact class recipe (border/radius/positioning) rather than inventing a parallel bottom-sheet pattern local to the landing page.
- Repository: `npm run lint` → no new errors in `components/landing/landing-flow.tsx`.

## Stop conditions

- Stop if reproducing the bottom-sheet chrome without the real drag-to-close/open-close behavior reads as an uncanny half-implementation rather than a convincing preview — that would call for a product decision (e.g., wiring a real dismiss/reopen interaction into the slide), which is beyond a chrome-only visual fix.

## Design documentation

- After acceptance and validation: none — no `DESIGN.md` exists for this surface to update.
