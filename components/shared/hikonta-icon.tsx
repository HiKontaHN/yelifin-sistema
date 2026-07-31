import { cn } from "@/lib/utils";

export function HiKontaIcon({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="HiKonta"
      className={cn(
        "shrink-0 bg-[url('/icon.svg')] bg-contain bg-center bg-no-repeat",
        className
      )}
    />
  );
}
