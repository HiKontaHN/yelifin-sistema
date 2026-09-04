# LandingFlow slide height should grow at the same breakpoint its content does

Written against: c77dbf8

## Evidence chain

- Surface: `components/landing/landing-flow.tsx` (`LandingFlow`, the slide `<article>`, rendered from `app/page.tsx`)
- Problem: The article's height stays at `h-170` (680px) from 0 up to 1023px viewport width, but its children already scale up at `sm:` (≥640px) — title (`text-2xl`→`sm:text-4xl`), subtitle (`text-sm`→`sm:text-lg`), wrapper margin (`mt-6`→`sm:mt-7`), and the modal's own `max-h-[520px]`→`sm:max-h-[550px]` — pushing summed content to ~691px inside a still-680px, `overflow-hidden` box. That's an 11px+ clip into the modal's footer, larger if the title wraps a second line.
- Design evidence: The article's own `lg:h-[720px]` override (line 41) proves 720px is the value the author already judged sufficient for the grown content — it's gated behind the wrong breakpoint (`lg`, 1024px) instead of the one where the content actually grows (`sm`, 640px).
- Owner: `components/landing/landing-flow.tsx`
- Scope and affected surfaces: Same file only; both slides share the one article className template.
- Uncertainty: None — the fix reuses a value already present in the file. See Stop conditions for the one case that would widen it.

## Design decision

Move the article's larger height (`720px`) from the `lg:` breakpoint to the `sm:` breakpoint, so the container grows at the same point its children's `sm:` styles already do, closing the gap between 640px and 1023px where content currently exceeds the box.

## Reuse

- `720px` height value — already defined at `landing-flow.tsx:41` as `lg:h-[720px]`; no new value introduced.

No new primitive is required.

## Changes

1. `components/landing/landing-flow.tsx:41`
   - Change: In the `<article>` className template, replace `lg:h-[720px]` with `sm:h-[720px]`.
   - Preserve: `h-170` as the base (<640px) height, `lg:flex-1`, and every other class on the article unchanged.
   - Verify: At viewport widths from 640px up to (and including) the old 1024px boundary, the article is now 720px tall and the demo modal's full footer (buttons + footnote) renders without being cut by `overflow-hidden`. At ≥1024px, the article is unchanged (already 720px before this fix).

## Scope

- Inherit: Both slides in `LandingFlow` (they share the one article className template).
- Verify: If the companion plan (`landing-demo-modal-bottom-sheet-chrome.md`) lands too, re-check this height sum against the modal's new bottom-anchored variant.
- Exclude: The `lg:flex-1` width behavior and any other landing section — unrelated to this height/breakpoint mismatch.

## Validation

- Product: N/A — visual-only fix, no product behavior changes.
- Interface: `/` (landing) at 640px, ~768px, ~900px, and 1023px viewport widths, for both slides, including `ProductDemoModal`'s `isService` toggle (its "servicio" copy is the taller content case).
- System: Confirm no other landing surface depends on `h-170`'s `lg:` step specifically (`h-170` and `lg:h-[720px]` are unique to this one article template).
- Repository: `npm run lint` → no new errors in `components/landing/landing-flow.tsx`.

## Stop conditions

- Stop if manual measurement at 640-1023px shows the actual rendered content sum differs meaningfully from the estimate here (e.g., the title wraps to two lines at some width in this range in a way that still overflows 720px) — widen the fix to also adjust `sm:max-h-[550px]` on the modal itself, rather than only the container height.

## Design documentation

- After acceptance and validation: none.
