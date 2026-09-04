# Header CTA buttons should inherit the button system's own radius

Written against: c77dbf8

## Evidence chain

- Surface: `components/landing/landing-header.tsx` (`LandingHeader`, rendered from `app/page.tsx`)
- Problem: The header's two CTA buttons ("Ir al panel" / "Empieza Gratis") hardcode `rounded-lg`, overriding the shared `Button` primitive's own `rounded-xl` default — the only CTA buttons on the landing page that do.
- Design evidence: `components/ui/button.tsx:8` — `buttonVariants`'s base class includes `rounded-xl` for every variant; only the `sm`/`lg` **size** variants (lines 25-26) override it to `rounded-md`. The `default` size (used here — no `size` prop is passed at either callsite) does not override it. CLAUDE.md documents `components/ui/` as primitives that should not be edited directly, making this the binding source for button radius app-wide.
- Owner: `components/ui/button.tsx`
- Scope and affected surfaces: `components/landing/landing-header.tsx` only (2 `<Button>` usages, lines 44 and 56).
- Uncertainty: None — `landing-hero.tsx` (2 buttons) and `landing-pricing.tsx` (3 plan buttons) already explicitly keep `rounded-xl`, confirming this is the page's own established practice, not just the primitive's unexercised default.

## Design decision

Remove the `rounded-lg` override from both header `<Button>` classNames, letting them inherit `rounded-xl` from `components/ui/button.tsx` — matching the nav pill that contains them (`landing-header.tsx:26`, already `rounded-xl`) and every other CTA button already on this page.

## Reuse

- `rounded-xl` — the `Button` primitive's own base radius (`components/ui/button.tsx:8`), already relied on unmodified by `landing-hero.tsx` and `landing-pricing.tsx`.
- Exemplar: `components/landing/landing-hero.tsx`'s CTA buttons (pass no radius override at all).

No new primitive is required.

## Changes

1. `components/landing/landing-header.tsx:44`
   - Change: Remove `rounded-lg` from the `<Button>` className (`"h-9 gap-2 rounded-lg bg-[#8cff00] px-4 text-base font-bold text-black hover:bg-[#7ce600]"` → drop `rounded-lg`).
   - Preserve: Height (`h-9`), gap, background, text, and hover colors — unrelated to this change.
   - Verify: "Ir al panel" button now renders with the same corner radius as the Hero/Pricing CTA buttons and the nav pill around it.
2. `components/landing/landing-header.tsx:56`
   - Change: Remove `rounded-lg` from the `<Button>` className (`"h-9 gap-2 rounded-lg bg-[#8cff00] px-3 text-base font-bold text-black hover:bg-[#7ce600] sm:px-4"` → drop `rounded-lg`).
   - Preserve: Height, gap, padding, background, text, and hover colors.
   - Verify: "Empieza Gratis" button matches the same radius as above.

## Scope

- Inherit: Both header CTA buttons (logged-in "Ir al panel" and logged-out "Empieza Gratis" branches) — the only two `<Button>`s in this file with an explicit radius override.
- Verify: The `loading` skeleton (`landing-header.tsx:41`, `rounded-lg` on a plain `div`, not a `Button`) and the mobile menu toggle `<Button variant="ghost" size="icon">` (line 62, no radius override, already inherits base `rounded-xl`) — confirm neither needs to change; the skeleton in particular is a placeholder shape, not a real button, and is out of scope unless it's meant to mirror the button it precedes.
- Exclude: `components/ui/button.tsx` itself, and every other consumer of `Button` — this plan changes only these two call sites' overrides.

## Validation

- Product: N/A — visual-only change, no behavior affected.
- Interface: `/` (landing) header in logged-in and logged-out states, mobile and desktop widths.
- System: Confirm the rendered radius now matches `landing-hero.tsx` and `landing-pricing.tsx`'s CTA buttons and the nav pill, with no remaining `rounded-` override at either call site.
- Repository: `npm run lint` → no new errors in `components/landing/landing-header.tsx`.

## Stop conditions

- Stop if the loading skeleton (line 41) turns out to be intended to mirror a button shape the design expects to also change — that would widen scope beyond this file's two `Button` overrides.

## Design documentation

- After acceptance and validation: none.
