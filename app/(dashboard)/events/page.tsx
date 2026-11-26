// app/(dashboard)/events/page.tsx
"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { addMonths, format as formatMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SummaryStats } from "@/components/shared/summary-stats";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { DataTableTimeSection } from "@/components/shared/data-table-time-section";
import { SearchBar } from "@/components/shared/search-bar";
import { DateRangePicker, DEFAULT_DATE_RANGE_PRESETS, type DateRangePreset, type DateRangeValue } from "@/components/shared/date-range-picker";
import {
  Calendar, TrendingUp, DollarSign, BarChart3, CalendarPlus, ShoppingCart,
} from "lucide-react";
import { useEvents, Event } from "@/hooks/swr/use-events";
import { useCurrency }      from "@/hooks/swr/use-currency";
import { useModulePermissions } from "@/hooks/use-module-permissions";

import { EventCard }           from "@/components/events/event-card";
import { CreateEventDialog }   from "@/components/events/create-event-dialog";
import { EditEventDialog }     from "@/components/events/edit-event-dialog";
import { DeleteEventDialog }   from "@/components/events/delete-event-dialog";
import { AddExpenseDialog }    from "@/components/events/add-expense-dialog";
import { Fab }                 from "@/components/ui/fab";
import { todayInTimeZone } from "@/lib/date-utils";
import { ALL_EVENT_DATES, defaultEventDateRange, eventMonthRange, eventOverlapsDateRange, readEventDateRange } from "@/lib/event-date-range";
import { filterEventsBySearch } from "@/lib/event-search";
import { useTimezone } from "@/hooks/swr/use-timezone";

const calendarDateObject = (value: string) => new Date(`${value}T12:00:00`);
const EVENTS_PER_PAGE = 6;
const EVENT_DATE_PRESETS: DateRangePreset[] = [
  { id: "this-month", label: "Este mes", getRange: eventMonthRange },
  { id: "last-month", label: "Mes pasado", getRange: (today) => eventMonthRange(addMonths(today, -1)) },
  ...DEFAULT_DATE_RANGE_PRESETS.filter(({ id }) => id === "this-year"),
  { id: "all", label: "Todos", getRange: () => ALL_EVENT_DATES },
];

export default function EventsPage() {
  const { push, replace }              = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { events, isLoading, mutate } = useEvents();
  const timezone = useTimezone();
  const { format }                    = useCurrency();
  const { show_profit: showProfit, can_edit: canEdit, can_delete: canDelete } = useModulePermissions("EVENTS");
  const { can_edit: salesCanEdit }    = useModulePermissions("SALES");

  const [createOpen,   setCreateOpen]   = useState(false);
  const [editEvent,    setEditEvent]    = useState<Event | null>(null);
  const [deleteEvent,  setDeleteEvent]  = useState<Event | null>(null);
  const [expenseEvent, setExpenseEvent] = useState<Event | null>(null);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const gridRef = useRef<HTMLDivElement>(null);

  const organizationToday = todayInTimeZone(timezone);
  const currentMonth = useMemo(() => eventMonthRange(calendarDateObject(organizationToday)), [organizationToday]);
  const manualRange = useMemo(() => readEventDateRange(searchParams), [searchParams]);
  const selectedRange = useMemo(
    () => manualRange ?? defaultEventDateRange(events, currentMonth),
    [manualRange, events, currentMonth],
  );
  const showingFallback = !manualRange && selectedRange.from !== currentMonth.from;

  const changeRange = ({ from, to }: DateRangeValue) => {
    const params = new URLSearchParams(window.location.search);
    for (const key of ["y", "m", "from", "to", "range", "page"]) params.delete(key);
    if (from && to) {
      params.set("from", from);
      params.set("to", to);
    } else {
      params.set("range", "all");
    }
    replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    const url = new URL(window.location.href);
    url.searchParams.delete("page");
    if (value.trim()) url.searchParams.set("q", value.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  };
  const rangeEvents = useMemo(
    () => events.filter((event) => eventOverlapsDateRange(event, selectedRange)),
    [events, selectedRange],
  );
  const displayedEvents = useMemo(() => filterEventsBySearch(rangeEvents, search), [rangeEvents, search]);
  const requestedPage = Number(searchParams.get("page"));
  const totalPages = Math.max(1, Math.ceil(displayedEvents.length / EVENTS_PER_PAGE));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, totalPages)
    : 1;
  const pageEvents = displayedEvents.slice((page - 1) * EVENTS_PER_PAGE, page * EVENTS_PER_PAGE);
  const changePage = (nextPage: number) => {
    if (page === nextPage) return;
    const params = new URLSearchParams(window.location.search);
    if (nextPage === 1) params.delete("page");
    else params.set("page", String(nextPage));
    const query = params.toString();
    replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // El evento activo (hoy cae dentro de su rango) manda al FAB, sin
  // importar qué mes/año se esté viendo — es un dato relativo a "ahora".
  const activeEvent = events.find((e) => e.status === "ACTIVE") ?? null;

  // ── Resumen del rango seleccionado ───────────────────────────────────
  const totalSales  = rangeEvents.reduce((s, e) => s + e.total_sales, 0);
  const totalProfit = rangeEvents.reduce((s, e) => s + (e.net_profit ?? 0), 0);
  const avgRoi      = rangeEvents.length
    ? rangeEvents.reduce((s, e) => s + (e.roi ?? 0), 0) / rangeEvents.length
    : 0;
  const activeCount = rangeEvents.filter((e) => e.status === "ACTIVE").length;

  const filters = (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchBar
          value={search}
          onChange={changeSearch}
          placeholder="Buscar por nombre o ubicación..."
          className="min-w-0 lg:max-w-sm lg:flex-1"
        />
        <div className="flex min-w-0 items-center justify-between gap-2 lg:ml-auto lg:flex-none">
          <div className="min-w-0 flex-1">
            <DateRangePicker
              value={selectedRange}
              onChange={changeRange}
              presets={EVENT_DATE_PRESETS}
              today={organizationToday}
            />
          </div>
          {canEdit && (
            <Button size="sm" className="shrink-0 gap-1.5 px-2 sm:px-3" onClick={() => setCreateOpen(true)}>
              <CalendarPlus className="size-4" />
              Registrar Evento
            </Button>
          )}
        </div>
      </div>
      {showingFallback && (
        <p className="text-center text-xs text-muted-foreground">
          Sin eventos en {formatMonth(calendarDateObject(currentMonth.from), "MMMM yyyy", { locale: es })} · mostrando{" "}
          {formatMonth(calendarDateObject(selectedRange.from), "MMMM yyyy", { locale: es })}, el mes con registros más reciente
        </p>
      )}
    </div>
  );

  const renderEvent = (event: Event) => (
    <EventCard
      key={event.id}
      canEdit={canEdit}
      canDelete={canDelete}
      showProfit={showProfit}
      event={event}
      onView={(selectedEvent) => push(`/events/${selectedEvent.id}`)}
      onEdit={setEditEvent}
      onDelete={setDeleteEvent}
      onAddExpense={setExpenseEvent}
    />
  );

  const emptyContent = events.length === 0 ? (
    <>
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <Calendar className="size-7 text-primary" />
      </div>
      <p className="text-base font-semibold text-foreground">Sin eventos registrados</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        Crea tu primer evento para rastrear ventas, gastos y rentabilidad de ferias.
      </p>
      {canEdit && (
        <Button className="mt-5 gap-2" onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="size-4" />
          Crear evento
        </Button>
      )}
    </>
  ) : (
    <>
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted">
        <Calendar className="size-7 text-muted-foreground/50" />
      </div>
      <p className="text-base font-semibold text-foreground">
        {search.trim() ? "No se encontraron eventos con esa búsqueda" : "Sin eventos en el rango seleccionado"}
      </p>
      <Button
        variant="outline"
        className="mt-5"
        onClick={() => search.trim() ? changeSearch("") : changeRange(ALL_EVENT_DATES)}
      >
        {search.trim() ? "Limpiar búsqueda" : "Ver todos los eventos"}
      </Button>
    </>
  );

  return (
    <div className="space-y-5 pb-24">

      <h1 className="text-2xl font-semibold tracking-tight">Eventos y Ferias</h1>
      {/* Stats */}
      <SummaryStats
        ariaLabel="Resumen de eventos"
        isLoading={isLoading}
        items={[
          { label: "Eventos", icon: Calendar, value: rangeEvents.length, detail: `${activeCount} activos` },
          { label: "Ventas", icon: DollarSign, value: format(totalSales), detail: "total acumulado" },
          ...(showProfit ? [
            {
              label: "Ganancia neta", icon: TrendingUp, value: format(totalProfit), detail: "ingresos − gastos",
              valueClassName: totalProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive",
            },
            {
              label: "ROI promedio", icon: BarChart3, value: `${avgRoi.toFixed(1)}%`, detail: "retorno sobre inversión",
              valueClassName: avgRoi >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive",
            },
          ] : []),
        ]}
      />

      <DataTableTimeSection
        columns={[]}
        data={pageEvents}
        getRowKey={(event) => event.id}
        recordLabel={displayedEvents.length === 1 ? "evento" : "eventos"}
        headerTopContent={filters}
        renderMobileRow={renderEvent}
        pagination={totalPages > 1 ? { page, pageSize: EVENTS_PER_PAGE, total: displayedEvents.length, onPageChange: changePage } : undefined}
        isLoading={isLoading}
        emptyState={emptyContent}
        showFooterPagination={false}
        ariaLabel="Eventos"
        className="lg:hidden"
      />

      <div className="hidden space-y-5 overflow-y-clip lg:block">
        <div className="sticky -top-2 z-10 bg-background pt-1 pb-2">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-full h-6 bg-background" />
          {filters}
        </div>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full rounded-xl" />
            ))}
          </div>
        ) : displayedEvents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              {emptyContent}
            </CardContent>
          </Card>
        ) : (
          <div ref={gridRef} className="scroll-mt-20 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {pageEvents.map(renderEvent)}
            </div>
            <PaginationControls
              page={page}
              totalPages={totalPages}
              total={displayedEvents.length}
              label="eventos"
              onPageChange={(nextPage) => {
                if (nextPage === page) return;
                changePage(nextPage);
                gridRef.current?.scrollIntoView({ block: "start" });
              }}
            />
          </div>
        )}
      </div>

      {/* FAB — solo cuando hay un evento activo hoy (dentro de su rango de
          fechas), y solo lleva a registrar una venta para ese evento */}
      {activeEvent && salesCanEdit && (
        <Fab
          actions={[
            {
              label:   `Vender en ${activeEvent.name}`,
              icon:    ShoppingCart,
              onClick: () => push(`/sales/new?event_id=${activeEvent.id}`),
            },
          ]}
        />
      )}

      {/* Dialogs */}
      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => mutate()}
      />
      <EditEventDialog
        event={editEvent}
        open={!!editEvent}
        onOpenChange={(open) => !open && setEditEvent(null)}
        onSuccess={() => mutate()}
      />
      <DeleteEventDialog
        event={deleteEvent}
        open={!!deleteEvent}
        onOpenChange={(open) => !open && setDeleteEvent(null)}
        onSuccess={() => mutate()}
      />
      <AddExpenseDialog
        event={expenseEvent}
        open={!!expenseEvent}
        onOpenChange={(open) => !open && setExpenseEvent(null)}
        onSuccess={() => mutate()}
      />
    </div>
  );
}
