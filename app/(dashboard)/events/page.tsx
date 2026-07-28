// app/(dashboard)/events/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, TrendingUp, DollarSign, BarChart3, CalendarPlus } from "lucide-react";
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
  const { push }                      = useRouter();
  const { events, isLoading, mutate } = useEvents();
  const { format }                    = useCurrency();
  const { show_profit: showProfit, can_edit: canEdit, can_delete: canDelete } = useModulePermissions("EVENTS");

  const [createOpen,   setCreateOpen]   = useState(false);
  const [editEvent,    setEditEvent]    = useState<Event | null>(null);
  const [deleteEvent,  setDeleteEvent]  = useState<Event | null>(null);
  const [expenseEvent, setExpenseEvent] = useState<Event | null>(null);

  // ── Stats globales ──────────────────────────────────────────────────
  const totalSales  = events.reduce((s, e) => s + e.total_sales, 0);
  const totalProfit = events.reduce((s, e) => s + (e.net_profit ?? 0), 0);
  const avgRoi      = events.length
    ? events.reduce((s, e) => s + (e.roi ?? 0), 0) / events.length
    : 0;
  const activeCount = events.filter((e) => e.status === "ACTIVE").length;

  return (
    <div className="space-y-5 pb-24">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos y Ferias</h1>
        <p className="text-muted-foreground text-sm">
          {isLoading
            ? "Cargando..."
            : `${events.length} evento${events.length !== 1 ? "s" : ""} · ${activeCount} activo${activeCount !== 1 ? "s" : ""}`
          }
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { title: "Eventos",       value: String(events.length),    sub: `${activeCount} activos`,    icon: Calendar,   cls: "" },
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
            <Button className="mt-5 gap-2" onClick={() => setCreateOpen(true)}>
              <CalendarPlus className="size-4" />
              Crear evento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
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

      {/* FAB */}
      {canEdit && (
        <Fab
          actions={[
            { label: "Nuevo evento", icon: CalendarPlus, onClick: () => setCreateOpen(true) },
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