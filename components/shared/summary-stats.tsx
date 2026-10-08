import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface SummaryStat {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  inlineNote?: ReactNode;
  inlineNoteClassName?: string;
  detail?: ReactNode;
  valueClassName?: string;
  hideOnMobile?: boolean;
  compact?: boolean;
}

export function SummaryStats({
  items, ariaLabel, isLoading = false, compact = false, columns: columnLayout = "auto",
}: {
  items: readonly SummaryStat[];
  ariaLabel: string;
  isLoading?: boolean;
  compact?: boolean;
  columns?: "auto" | "two";
}) {
  const visibleOnMobile = items.filter((item) => !item.hideOnMobile);
  const columns = columnLayout === "two"
    ? "grid-cols-2"
    : items.length === 4
      ? "grid-cols-2 lg:grid-cols-4"
    : items.length === 3
      ? "grid-cols-2 sm:grid-cols-3"
      : visibleOnMobile.length === 1
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-2";
  const width = columnLayout === "two"
    ? "w-full"
    : items.length === 4 ? "max-w-6xl" : items.length === 3 ? "max-w-4xl" : "max-w-2xl";

  return (
    <dl
      aria-label={ariaLabel}
      aria-busy={isLoading}
      className={cn("grid", compact ? "py-0.5 sm:py-1" : "py-1 sm:py-2", columns, width)}
    >
      {items.map((item, index) => {
        const mobileIndex = visibleOnMobile.indexOf(item);
        const onMobileSecondRow = mobileIndex >= 2;
        const lastMobileItem = visibleOnMobile.length % 2 === 1 && mobileIndex === visibleOnMobile.length - 1 && mobileIndex > 0;
        const desktopBreakpoint = items.length === 4 && columnLayout !== "two" ? "lg" : "sm";
        const alignmentBreakpoint = columnLayout === "two" ? "md" : "sm";
        const itemCompact = item.compact ?? compact;

        return (
          <div
            key={item.label}
            className={cn(
              itemCompact
                ? columnLayout === "two"
                  ? "min-w-0 space-y-1 px-2 py-0.5 text-center md:px-4 md:py-1 md:text-left"
                  : "min-w-0 space-y-1 px-2 py-0.5 text-center sm:px-4 sm:py-1 sm:text-left"
                : columnLayout === "two"
                  ? "min-w-0 space-y-2 px-3 py-1 text-center md:px-8 md:py-2 md:text-left"
                  : "min-w-0 space-y-2 px-3 py-1 text-center sm:px-8 sm:py-2 sm:text-left",
              index === 0 && (columnLayout === "two" ? "md:pl-4" : "sm:pl-4"),
              item.hideOnMobile && "hidden sm:block",
              (columnLayout === "two" ? index % 2 === 1 : mobileIndex % 2 === 1) && "border-l",
              onMobileSecondRow && "border-t",
              columnLayout === "two" && index >= 2 && "border-t",
              lastMobileItem && "col-span-2 sm:col-span-1",
              desktopBreakpoint === "lg"
                ? (index > 0 && "lg:border-l")
                : (index > 0 && columnLayout !== "two" && "sm:border-l"),
              columnLayout !== "two" && (desktopBreakpoint === "lg" ? "lg:border-t-0" : "sm:border-t-0"),
            )}
          >
            <dt className={cn(
              "flex items-center justify-center gap-2 text-muted-foreground",
              itemCompact
                ? (columnLayout === "two" ? "min-h-8 text-xs md:min-h-0 md:justify-start" : "min-h-8 text-xs sm:min-h-0 sm:justify-start")
                : (columnLayout === "two" ? "min-h-10 text-sm md:min-h-0 md:justify-start" : "min-h-10 text-sm sm:min-h-0 sm:justify-start"),
            )}>
              <item.icon className={cn("shrink-0", itemCompact ? "size-3.5" : "size-4")} aria-hidden="true" />
              {item.label}
            </dt>
            <dd className={cn(
              "flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1",
              columnLayout === "two" ? "md:justify-start" : "sm:justify-start",
            )}>
              {isLoading ? <Skeleton className="h-7 w-24 sm:h-8" /> : (
                <>
                  <span className={cn(
                    "min-w-0 max-w-full break-words font-bold tabular-nums tracking-tight",
                    itemCompact ? "text-sm sm:text-base" : "text-xl sm:text-2xl",
                    item.valueClassName,
                  )}>
                    {item.value}
                  </span>
                  {item.inlineNote && (
                    <span className={cn("text-sm text-muted-foreground", item.inlineNoteClassName)}>
                      {item.inlineNote}
                    </span>
                  )}
                </>
              )}
              {item.detail && <span className="basis-full text-xs text-muted-foreground">{item.detail}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
