import { cn } from "@/lib/utils";

export function HiKontaTitle({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="HiKonta"
      className={cn(
        // inline-block (not the div default of block) so this can sit
        // mid-sentence — e.g. "Tu día con <HiKontaTitle /> se verá así" —
        // without forcing a line break; flex containers ignore this and
        // treat it as a flex item either way, so existing usages are unaffected.
        "inline-block aspect-[467.52/158.73] shrink-0 align-middle bg-contain bg-left bg-no-repeat",
        "bg-[url('/title-black.svg')] dark:bg-[url('/title-white.svg')]",
        className
      )}
    />
  );
}
