# Floating navbar background should reuse the page's dark-neutral token, not a hardcoded hex

Written against: c77dbf8

## Evidence chain

- Surface: `components/landing/landing-header.tsx` (`LandingHeader`, rendered from `app/page.tsx`)
- Problem: The navbar `<nav>` background is `bg-[#2A2A2FCC]`, an arbitrary hex that matches no other dark-neutral value used on this same page.
- Design evidence: `landing-footer.tsx:7` (`bg-zinc-900`), `landing-pricing.tsx:190` (`bg-slate-900`), `landing-error-relief.tsx:58` (`text-zinc-900`), plus repeated `text-slate-900`/`text-slate-950` in `landing-tools.tsx`, `landing-faq.tsx`, `landing-flow.tsx`, and `app/page.tsx`'s `<main>` — every dark-neutral value on this surface is a named Tailwind palette token; `#2A2A2F` (neither `zinc-900` `#18181b` nor `slate-900` `#0f172a`) is the only exception.
- Owner: No formal shared "dark chrome" token exists yet — the closest same-role exemplar is `landing-footer.tsx`'s `bg-zinc-900`, the only other dark-*background* (not just dark-text) chrome element on this page.
- Scope and affected surfaces: `components/landing/landing-header.tsx` only.
- Uncertainty: The token choice is well-evidenced (zinc-900 is the only same-role dark-background exemplar on this page). The exact opacity is preserved via Tailwind's `/80` modifier (today's `CC` suffix ≈ 80% alpha) — confirm visually that `zinc-900/80` over the header's `backdrop-blur` reads with the same contrast/legibility as today's `#2A2A2FCC`, since the two hex values, while both dark, aren't identical (see Stop conditions).

## Design decision

Replace the navbar's hardcoded `bg-[#2A2A2FCC]` with `bg-zinc-900/80`, reusing the same token the footer already uses for its own dark chrome background, instead of a one-off value with no other reference point on the page.

## Reuse

- `zinc-900` — already used as a dark chrome background at `landing-footer.tsx:7`
- Exemplar: `components/landing/landing-footer.tsx:7`

No new primitive is required — this is a token substitution, not a new color.

## Changes

1. `components/landing/landing-header.tsx:26`
   - Change: Replace `bg-[#2A2A2FCC]` with `bg-zinc-900/80` in the `<nav>` className.
   - Preserve: `rounded-xl`, `shadow-[0_16px_45px_rgba(15,23,42,0.18)]`, height/padding classes, and the parent `<header>`'s own `bg-white/95 backdrop-blur` — none of these are part of this change.
   - Preserve: All text/icon colors inside the nav (currently tuned for a near-black background — e.g. `text-white/90`, `text-white`) — verify they still read correctly against `zinc-900/80` (very close in value to the current `#2A2A2FCC`, so unlikely to need adjustment, but confirm before treating this as done).
   - Verify: The pill's background is visibly the same near-black family as the footer, at the same translucency/blur effect it has today.

## Scope

- Inherit: The single `<nav>` element in `LandingHeader` (desktop and mobile share the same className — no responsive variant on this property today).
- Verify: The mobile menu dropdown (`landing-header.tsx:76`, `bg-white`) is a separate, already-light-colored element — confirm it's untouched and still reads correctly next to the adjusted pill above it.
- Exclude: The footer itself and any other `zinc-900`/`slate-900` usage — this plan only points the navbar at the existing token, it doesn't touch the token's other consumers.

## Validation

- Product: N/A — visual-only change, no behavior affected.
- Interface: `/` (landing) header in both logged-out and logged-in states (`isLoggedIn` branch, `loading` skeleton branch), at mobile and desktop widths, scrolled and at top of page.
- System: Confirm no second, different arbitrary dark hex remains elsewhere that should have been part of the same cleanup (grep for `bg-[#` hex chrome backgrounds in `components/landing/` after the change).
- Repository: `npm run lint` → no new errors in `components/landing/landing-header.tsx`.

## Stop conditions

- Stop if `zinc-900/80` visibly reduces contrast/legibility for the white nav text/icons compared to today's `#2A2A2FCC` — that would call for a different opacity value or token, not a blind swap.

## Design documentation

- After acceptance and validation: none — no `DESIGN.md` exists for this surface to update.
