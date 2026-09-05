// app/(dashboard)/events/page.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { addMonths, startOfMonth, endOfMonth, format as formatMonth } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

export default function EventsPage() {
  const { push, replace }              = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { events, isLoading, mutate } = useEvents();
  const { format }                    = useCurrency();
  const { show_profit: showProfit, can_edit: canEdit, can_delete: canDelete } = useModulePermissions("EVENTS");
  const { can_edit: salesCanEdit }    = useModulePermissions("SALES");

  const [createOpen,   setCreateOpen]   = useState(false);
  const [editEvent,    setEditEvent]    = useState<Event | null>(null);
  const [deleteEvent,  setDeleteEvent]  = useState<Event | null>(null);
  const [expenseEvent, setExpenseEvent] = useState<Event | null>(null);

  // null = "sin elección manual, usar el default" (mes actual, o si no
  // tiene eventos, el mes con registros más reciente). Restaurado desde
  // la URL para que "volver" desde /events/[id] (que usa router.back())
  // no resetee el mes/año que se estaba viendo.
  const [manualYear,  setManualYear]  = useState<number | null>(() => {
    const v = searchParams.get("y");
    return v ? Number(v) : null;
  });
  const [manualMonth, setManualMonth] = useState<number | null>(() => {
    const v = searchParams.get("m");
    return v ? Number(v) : null;
  }); // 0-11

  useEffect(() => {
    const params = new URLSearchParams();
    if (manualYear !== null) params.set("y", String(manualYear));
    if (manualMonth !== null) params.set("m", String(manualMonth));
    const qs = params.toString();
    replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [manualYear, manualMonth, pathname, replace]);

  // ── Meses/años que sí tienen eventos (un evento "pertenece" a todos los
  // meses con los que se solapa su rango de fechas) ─────────────────────
  const { monthsByYear, availableYears, latestYear, latestMonth } = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const e of events) {
      let cursor = startOfMonth(new Date(e.starts_at));
      const last = startOfMonth(new Date(e.ends_at));
      while (cursor <= last) {
        const y = cursor.getFullYear();
        if (!map.has(y)) map.set(y, new Set());
        map.get(y)!.add(cursor.getMonth());
        cursor = addMonths(cursor, 1);
      }
    }
    const years = Array.from(map.keys()).sort((a, b) => b - a);
    let latestYear: number | null = null;
    let latestMonth: number | null = null;
    if (years.length > 0) {
      latestYear = years[0];
      latestMonth = Math.max(...Array.from(map.get(latestYear)!));
    }
    return { monthsByYear: map, availableYears: years, latestYear, latestMonth };
  }, [events]);

  const now              = new Date();
  const currentYear       = now.getFullYear();
  const currentMonthIdx   = now.getMonth();
  const currentMonthHasEvents = monthsByYear.get(currentYear)?.has(currentMonthIdx) ?? false;

  const defaultYear  = currentMonthHasEvents ? currentYear     : (latestYear  ?? currentYear);
  const defaultMonth = currentMonthHasEvents ? currentMonthIdx : (latestMonth ?? currentMonthIdx);

  const selectedYear  = manualYear  ?? defaultYear;
  const selectedMonth = manualMonth ?? defaultMonth;
  const isDefaultView  = manualYear === null && manualMonth === null;
  const showingFallback = isDefaultView && !currentMonthHasEvents && latestYear !== null;

  const monthOptions = Array.from(monthsByYear.get(selectedYear) ?? []).sort((a, b) => a - b);

  const handleYearChange = (v: string) => {
    const y = Number(v);
    setManualYear(y);
    const monthsInYear = Array.from(monthsByYear.get(y) ?? []).sort((a, b) => b - a);
    setManualMonth(monthsInYear[0] ?? 0);
  };
  const handleMonthChange = (v: string) => setManualMonth(Number(v));
  const resetToDefault    = () => { setManualYear(null); setManualMonth(null); };

  // ── Eventos del mes/año seleccionado ──────────────────────────────────
  const displayedEvents = useMemo(() => {
    const monthStart = startOfMonth(new Date(selectedYear, selectedMonth, 1));
    const monthEnd   = endOfMonth(monthStart);
    return events.filter((e) => {
      const start = new Date(e.starts_at);
      const end   = new Date(e.ends_at);
      return start <= monthEnd && end >= monthStart;
    });
  }, [events, selectedYear, selectedMonth]);

  // El evento activo (hoy cae dentro de su rango) manda al FAB, sin
  // importar qué mes/año se esté viendo — es un dato relativo a "ahora".
  const activeEvent = events.find((e) => e.status === "ACTIVE") ?? null;

  // ── Stats del mes que se está viendo ──────────────────────────────────
  const totalSales  = displayedEvents.reduce((s, e) => s + e.total_sales, 0);
  const totalProfit = displayedEvents.reduce((s, e) => s + (e.net_profit ?? 0), 0);
  const avgRoi      = displayedEvents.length
    ? displayedEvents.reduce((s, e) => s + (e.roi ?? 0), 0) / displayedEvents.length
    : 0;
  const activeCount = events.filter((e) => e.status === "ACTIVE").length;

  return (
    <div className="space-y-5 pb-24">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eventos y Ferias</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading
              ? "Cargando..."
              : `${displayedEvents.length} evento${displayedEvents.length !== 1 ? "s" : ""} · ${activeCount} activo${activeCount !== 1 ? "s" : ""}`
            }
          </p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-2 shrink-0" onClick={() => setCreateOpen(true)}>
            <CalendarPlus className="size-4" />
            <span className="hidden sm:inline">Nuevo evento</span>
          </Button>
        )}
      </div>

      {/* Filtro por mes/año — solo lista meses y años que tienen eventos */}
      {!isLoading && events.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={String(selectedMonth)} onValueChange={handleMonthChange}>
            <SelectTrigger className="flex-1 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={String(m)} className="capitalize">
                  {formatMonth(new Date(selectedYear, m, 1), "MMMM", { locale: es })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={handleYearChange}>
            <SelectTrigger className="w-28 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isDefaultView && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={resetToDefault}>
              Hoy
            </Button>
          )}
        </div>
      )}

      {/* Nota de fallback — mes actual sin eventos, mostrando el mes con
          registros más reciente */}
      {showingFallback && (
        <p className="text-xs text-muted-foreground text-center -mt-2">
          Sin eventos en {formatMonth(now, "MMMM yyyy", { locale: es })} · mostrando{" "}
          {formatMonth(new Date(selectedYear, selectedMonth, 1), "MMMM yyyy", { locale: es })}, el mes con registros más reciente
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { title: "Eventos",       value: String(displayedEvents.length), sub: `${activeCount} activos`,    icon: Calendar,   cls: "" },
          { title: "Ventas",        value: format(totalSales),       sub: "total acumulado",           icon: DollarSign, cls: "" },
          { title: "Ganancia neta", value: format(totalProfit),      sub: "ingresos − gastos",         icon: TrendingUp, cls: totalProfit >= 0 ? "text-green-600" : "text-destructive", hidden: !showProfit },
          { title: "ROI promedio",  value: `${avgRoi.toFixed(1)}%`,  sub: "retorno sobre inversión",   icon: BarChart3,  cls: avgRoi >= 0 ? "text-green-600" : "text-destructive",        hidden: !showProfit },
        ].filter((s) => !(s as any).hidden).map((s) => (
          <Card key={s.title} >
            <CardContent>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">{s.title}</span>
                <s.icon className="size-3.5 text-muted-foreground shrink-0" />
              </div>
              <div className={`text-lg font-bold ${s.cls}`}>
                {isLoading ? <Skeleton className="h-6 w-20" /> : s.value}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Eventos grid / empty */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Calendar className="size-7 text-primary" />
            </div>
            <p className="text-base font-semibold">Sin eventos registrados</p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">
              Crea tu primer evento para rastrear ventas, gastos y rentabilidad de ferias.
            </p>
            {canEdit && (
              <Button className="mt-5 gap-2" onClick={() => setCreateOpen(true)}>
                <CalendarPlus className="size-4" />
                Crear evento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : displayedEvents.length === 0 ? (
        // Defensivo: en teoría no debería pasar, porque los selectores solo
        // ofrecen meses/años que sí tienen eventos.
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="size-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Calendar className="size-7 text-muted-foreground/50" />
            </div>
            <p className="text-base font-semibold">
              Sin eventos en {formatMonth(new Date(selectedYear, selectedMonth, 1), "MMMM yyyy", { locale: es })}
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={resetToDefault}
            >
              Volver a hoy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayedEvents.map((event) => (
            <EventCard
              canEdit={canEdit}
              canDelete={canDelete}
              showProfit={showProfit}
              key={event.id}
              event={event}
              onView={(e) => push(`/events/${e.id}`)}
              onEdit={setEditEvent}
              onDelete={setDeleteEvent}
              onAddExpense={setExpenseEvent}
            />
          ))}
        </div>
      )}

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