---
name: Bottom-sheet dialog layout pattern
description: How to correctly compose mobile bottom-sheet / desktop centered dialogs in Konta — avoids the grid/flex conflict on DialogContent
type: feedback
---

`DialogContent` in `components/ui/dialog.tsx` has `grid` as its default display class (via `cn()`). Adding `flex flex-col` directly to `DialogContent`'s className creates a grid/flex conflict where neither wins reliably — do NOT put flex layout or `max-h-*` constraints on `DialogContent` itself.

The correct pattern (confirmed in `add-inventory-dialog.tsx` and the batch dialogs after fix):

1. `DialogContent` className receives only: positioning overrides, border/radius overrides, `p-0`, and animation classes. No `flex`, no `max-h-*`.
2. An immediate child `div` carries all flex layout: `className="flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden"`.
3. Inside that wrapper: mobile handle bar (`sm:hidden`), `DialogHeader` with `shrink-0`, scrollable region (`ScrollArea` with `flex-1 min-h-0`), and footer with `shrink-0`.

Footer background should be `bg-background` — not the verbose `bg-transparent xl:bg-transparent md:bg-transparent sm:bg-background` pattern (which was noise, not intentional).

**Why:** Radix UI `DialogPrimitive.Content` renders as a `div`; the shadcn wrapper applies `grid` via its base className. Appending `flex flex-col` as a second display utility doesn't reliably override it in Tailwind v4 without explicit layer precedence.

**How to apply:** Any time a new dialog needs a scrollable body, use the two-layer pattern above. Never put `flex` or `max-h` on `DialogContent` directly.
