// components/reports/report-shell.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivacyMode } from "@/context/privacy-mode-context";
import { Button }  from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { Loader2, FileText, ArrowLeft, CalendarDays, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { addCalendarDays, DEFAULT_TIMEZONE, todayInTimeZone } from "@/lib/date-utils";
import { useTimezone } from "@/hooks/swr/use-timezone";

// ── Date presets ───────────────────────────────────────────────────────

export function thisMonth(timezone = DEFAULT_TIMEZONE) {
  const [year, month] = todayInTimeZone(timezone).split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return {
    from: `${year}-${String(month).padStart(2, "0")}-01`,
    to: addCalendarDays(next, -1),
  };
}
export function lastMonth(timezone = DEFAULT_TIMEZONE) {
  const [year, month] = todayInTimeZone(timezone).split("-").map(Number);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const thisMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  return {
    from: `${previousYear}-${String(previousMonth).padStart(2, "0")}-01`,
    to: addCalendarDays(thisMonthStart, -1),
  };
}
export function thisYear(timezone = DEFAULT_TIMEZONE) {
  const year = todayInTimeZone(timezone).slice(0, 4);
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

// ── useDateRange hook ──────────────────────────────────────────────────

export function useDateRange(defaultPreset: "month" | "year" = "month") {
  const timezone = useTimezone();
  const init  = defaultPreset === "year" ? thisYear(timezone) : thisMonth(timezone);
  const [from, setFrom] = useState(init.from);
  const [to,   setTo]   = useState(init.to);
  const previousInit = useRef(init);
  useEffect(() => {
    const previous = previousInit.current;
    setFrom((current) => current === previous.from ? init.from : current);
    setTo((current) => current === previous.to ? init.to : current);
    previousInit.current = init;
  }, [init.from, init.to]);
  return { from, to, setFrom, setTo };
}

// ── ReportShell ───────────────────────────────────────────────────────

type Props = {
  title:          string;
  subtitle?:      string;
  from:           string;
  to:             string;
  onFromChange:   (v: string) => void;
  onToChange:     (v: string) => void;
  showDateRange?: boolean;
  onExportExcel?: () => Promise<void>;
  onExportPDF:    () => Promise<void>;
  isLoading?:     boolean;
  children:       React.ReactNode;
};

export function ReportShell({
  title, subtitle, from, to, onFromChange, onToChange,
  showDateRange = true, onExportPDF,
  isLoading, children,
}: Props) {
  const { back } = useRouter();
  const timezone = useTimezone();
  const [exportingPDF, setExportingPDF] = useState(false);

  const handlePDF = async () => {
    setExportingPDF(true);
    try { await onExportPDF(); } finally { setExportingPDF(false); }
  };

  const busy = isLoading || exportingPDF;

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => back()} className="shrink-0">
          <ArrowLeft className="size-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground" suppressHydrationWarning>
              {showDateRange && <CalendarDays className="size-3.5 shrink-0" />}
              {subtitle}
            </p>
          )}
        </div>

        {/* Export buttons */}
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline" size="sm"
            className="gap-1.5"
            onClick={handlePDF}
            disabled={busy}
          >
            {exportingPDF
              ? <Loader2 className="size-3.5 animate-spin" />
              : <FileText className="size-3.5 text-red-500" />
            }
            PDF
          </Button>
        </div>
      </div>

      {/* Date range filter */}
      {showDateRange && (
        <div className="flex justify-end rounded-xl border bg-muted/20 p-3">
          <DateRangePicker
            value={{ from, to }}
            today={todayInTimeZone(timezone)}
            onChange={(range) => {
              onFromChange(range.from);
              onToChange(range.to);
            }}
          />
        </div>
      )}

      {children}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────

type Accent = "green" | "red" | "blue" | "amber";

export function StatCard({
  label, value, sub, accent, icon: Icon,
}: { label: string; value: string; sub?: string; accent?: Accent; icon?: LucideIcon }) {
  const { isPrivate } = usePrivacyMode();
  const bg = {
    green: "border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20",
    red:   "border-red-200   bg-red-50/60   dark:border-red-900   dark:bg-red-950/20",
    blue:  "border-blue-200  bg-blue-50/60  dark:border-blue-900  dark:bg-blue-950/20",
    amber: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20",
  };
  const iconColor = {
    green: "text-green-600 dark:text-green-400",
    red:   "text-red-600   dark:text-red-400",
    blue:  "text-blue-600  dark:text-blue-400",
    amber: "text-amber-600 dark:text-amber-400",
  };
  return (
    <div className={`rounded-xl border p-4 space-y-0.5 transition-shadow hover:shadow-sm ${accent ? bg[accent] : "bg-card border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className={`size-3.5 shrink-0 ${accent ? iconColor[accent] : "text-muted-foreground"}`} />}
      </div>
      <p className={`text-xl font-bold leading-tight tabular-nums transition-all ${isPrivate ? "blur-sm select-none" : ""}`}>
        {value}
      </p>
      {sub && (
        <p className={`text-xs text-muted-foreground transition-all ${isPrivate ? "blur-sm select-none" : ""}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── ReportSection ─────────────────────────────────────────────────────
// Envoltorio consistente para bloques de gráfico o tabla con título e ícono.
// `noPadding` quita el padding horizontal del contenido (tablas de ancho
// completo) y agrega una línea divisoria bajo el encabezado.

export function ReportSection({
  title, icon: Icon, noPadding, className, children,
}: { title: string; icon?: LucideIcon; noPadding?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <Card className={`${noPadding ? "gap-0 py-0" : ""} ${className ?? ""}`}>
      <CardHeader className={noPadding ? "py-3" : "pb-2"}>
        <CardTitle className="text-base flex items-center gap-2 font-semibold">
          {Icon && <Icon className="size-4 text-muted-foreground" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={noPadding ? "px-0 py-0 border-t" : undefined}>
        {children}
      </CardContent>
    </Card>
  );
}

/** A lightweight heading for sections whose content is already a bordered table. */
export function ReportTableSection({
  title, icon: Icon, children,
}: { title: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 px-1 text-base font-semibold tracking-tight">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── ReportEmptyState ─────────────────────────────────────────────────

export function ReportEmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
      <Icon className="size-8 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
