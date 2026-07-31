import { cn } from "@/lib/utils";

export function HiKontaTitle({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="HiKonta"
      className={cn(
        "aspect-[467.52/158.73] shrink-0 bg-contain bg-left bg-no-repeat",
        "bg-[url('/title-black.svg')] dark:bg-[url('/title-white.svg')]",
        className
      )}
    />
  );
}
