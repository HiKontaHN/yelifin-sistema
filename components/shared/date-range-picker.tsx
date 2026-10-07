"use client";

import { useMemo, useState } from "react";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarDays, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toLocalDateInput } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

export type DateRangeValue = { from: string; to: string };

export type DateRangePreset = {
  id: string;
  label: string;
  getRange: (today: Date) => DateRangeValue;
};

type DateRangePickerProps = {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  presets?: DateRangePreset[];
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  className?: string;
};

const cloneDate = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const shiftDays = (date: Date, days: number) => {
  const next = cloneDate(date);
  next.setDate(next.getDate() + days);
  return next;
};

const range = (from: Date, to: Date): DateRangeValue => ({
  from: toLocalDateInput(from),
  to: toLocalDateInput(to),
});

export const DEFAULT_DATE_RANGE_PRESETS: DateRangePreset[] = [
  { id: "today", label: "Hoy", getRange: (today) => range(today, today) },
  { id: "yesterday", label: "Ayer", getRange: (today) => range(shiftDays(today, -1), shiftDays(today, -1)) },
  {
    id: "this-week",
    label: "Esta semana",
    getRange: (today) => {
      const mondayOffset = (today.getDay() + 6) % 7;
      return range(shiftDays(today, -mondayOffset), today);
    },
  },
  { id: "last-7-days", label: "Últimos 7 días", getRange: (today) => range(shiftDays(today, -6), today) },
  {
    id: "this-month",
    label: "Este mes",
    getRange: (today) => range(
      new Date(today.getFullYear(), today.getMonth(), 1),
      new Date(today.getFullYear(), today.getMonth() + 1, 0),
    ),
  },
  { id: "last-30-days", label: "Últimos 30 días", getRange: (today) => range(shiftDays(today, -29), today) },
  { id: "this-year", label: "Este año", getRange: (today) => range(new Date(today.getFullYear(), 0, 1), new Date(today.getFullYear(), 11, 31)) },
  {
    id: "last-year",
    label: "Año pasado",
    getRange: (today) => range(new Date(today.getFullYear() - 1, 0, 1), new Date(today.getFullYear() - 1, 11, 31)),
  },
];

function parseLocalDate(value: string): Date | undefined {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date;
}

function formatDate(value: string) {
  const date = parseLocalDate(value);
  if (!date) return "Seleccionar fecha";
  return new Intl.DateTimeFormat("es-HN", { day: "2-digit", month: "short", year: "numeric" })
    .format(date)
    .replace(/\./g, "");
}

function formatCompactDate(value: string) {
  const date = parseLocalDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("es-HN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function toPickerRange(value: DateRangeValue): DateRange {
  return { from: parseLocalDate(value.from), to: parseLocalDate(value.to) };
}

export function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_DATE_RANGE_PRESETS,
  minDate,
  maxDate,
  disabled,
  className,
}: DateRangePickerProps) {
  const today = useMemo(() => cloneDate(new Date()), []);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>(() => toPickerRange(value));

  const selectedPreset = useMemo(
    () => presets.find((preset) => {
      const presetRange = preset.getRange(today);
      return presetRange.from === value.from && presetRange.to === value.to;
    }),
    [presets, today, value.from, value.to],
  );

  const handleCalendarOpen = (open: boolean) => {
    if (open) setDraft(toPickerRange(value));
    setCalendarOpen(open);
  };

  const applyDraft = () => {
    if (!draft.from || !draft.to) return;
    const [from, to] = draft.from <= draft.to ? [draft.from, draft.to] : [draft.to, draft.from];
    onChange(range(from, to));
    setCalendarOpen(false);
  };

  const updateDraftInput = (field: "from" | "to", nextValue: string) => {
    setDraft((current) => ({ ...current, [field]: parseLocalDate(nextValue) }));
  };

  const disabledDays = minDate && maxDate
    ? [{ before: minDate }, { after: maxDate }]
    : minDate
      ? { before: minDate }
      : maxDate
        ? { after: maxDate }
        : undefined;
  const draftIsValid = Boolean(
    draft.from
    && draft.to
    && (!minDate || (draft.from >= minDate && draft.to >= minDate))
    && (!maxDate || (draft.from <= maxDate && draft.to <= maxDate)),
  );

  return (
    <div className={cn("flex w-full max-w-full items-stretch sm:w-auto", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled} className="rounded-r-none border-r-0 px-3 shadow-xs" aria-label="Seleccionar período rápido">
            <span className="max-w-28 truncate sm:max-w-none">{selectedPreset?.label ?? "Personalizado"}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 rounded-xl p-1.5">
          {presets.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onSelect={() => onChange(preset.getRange(today))}
              className={cn("justify-between rounded-lg px-2.5 py-2", selectedPreset?.id === preset.id && "bg-primary text-primary-foreground focus:bg-primary/90 focus:text-primary-foreground")}
            >
              {preset.label}
              {selectedPreset?.id === preset.id && <Check className="size-4 text-current" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={calendarOpen} onOpenChange={handleCalendarOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled} className="w-0 min-w-0 flex-1 shrink justify-start rounded-l-none px-3 text-xs font-normal shadow-xs sm:w-auto sm:min-w-60 sm:text-sm" aria-label="Seleccionar rango de fechas">
            <CalendarDays className="hidden size-3.5 text-muted-foreground sm:block" />
            <span className="truncate tabular-nums sm:hidden">{formatCompactDate(value.from)}–{formatCompactDate(value.to)}</span>
            <span className="hidden truncate tabular-nums sm:inline">{formatDate(value.from)} — {formatDate(value.to)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="max-h-[var(--radix-popover-content-available-height)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-0">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 border-b p-3">
            <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
              Desde
              <Input type="date" value={draft.from ? toLocalDateInput(draft.from) : ""} min={minDate ? toLocalDateInput(minDate) : undefined} max={maxDate ? toLocalDateInput(maxDate) : undefined} onChange={(event) => updateDraftInput("from", event.target.value)} className="mt-1 h-8 min-w-0 px-2 text-xs text-foreground" />
            </label>
            <span className="pb-2 text-xs text-muted-foreground">a</span>
            <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
              Hasta
              <Input type="date" value={draft.to ? toLocalDateInput(draft.to) : ""} min={minDate ? toLocalDateInput(minDate) : undefined} max={maxDate ? toLocalDateInput(maxDate) : undefined} onChange={(event) => updateDraftInput("to", event.target.value)} className="mt-1 h-8 min-w-0 px-2 text-xs text-foreground" />
            </label>
          </div>

          <Calendar
            mode="range"
            locale={es}
            selected={draft}
            onSelect={(next) => setDraft(next ?? { from: undefined })}
            defaultMonth={draft.from ?? parseLocalDate(value.from) ?? today}
            disabled={disabledDays}
            className="mx-auto"
            classNames={{ range_middle: "rounded-none bg-primary/10", today: "bg-accent text-accent-foreground rounded-md font-semibold" }}
          />

          <div className="flex items-center justify-end gap-2 border-t p-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCalendarOpen(false)}>Cancelar</Button>
            <Button type="button" size="sm" onClick={applyDraft} disabled={!draftIsValid}>Aplicar rango</Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
