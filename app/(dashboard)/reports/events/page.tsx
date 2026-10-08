// app/(dashboard)/reports/events/page.tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useEventsReport } from "@/hooks/swr/use-reports";
import { useCurrency }     from "@/hooks/swr/use-currency";
import { useAuth }         from "@/hooks/use-auth";
import { fmtN } from "@/lib/export";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { ReportShell, StatCard, ReportSection, ReportTableSection, ReportEmptyState, useDateRange } from "@/components/reports/report-shell";
import { FeatureGate } from "@/components/shared/feature-gate";
import { DataTableTimeSection, DEFAULT_DATA_TABLE_PAGE_SIZE, type DataTableTimeSectionColumn } from "@/components/shared/data-table-time-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge }    from "@/components/ui/badge";
import { Calendar, DollarSign, Receipt, TrendingUp, BarChart3, CalendarDays } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const STATUS_LABEL: Record<string, string> = {
  PLANNED:   "Planificado",
  ONGOING:   "En curso",
  COMPLETED: "Completado",
};
const STATUS_COLOR: Record<string, string> = {
  PLANNED:   "bg-blue-100 text-blue-700 border-blue-200",
  ONGOING:   "bg-amber-100 text-amber-700 border-amber-200",
  COMPLETED: "bg-green-100 text-green-700 border-green-200",
};

export default function EventsReportPage() {
  return (
    <FeatureGate feature="reports.events">
      <EventsReportPageInner />
    </FeatureGate>
  );
}

function EventsReportPageInner() {
  const { from, to, setFrom, setTo } = useDateRange("year");
  const { format, symbol }           = useCurrency();
  const { firebaseUser }             = useAuth();
  const { summary, events, isLoading } = useEventsReport(from, to);
  const [eventPage, setEventPage] = useState(1);
  const [eventPageSize, setEventPageSize] = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);
  const { show_profit: showProfit } = useModulePermissions("REPORTS", "EVENTS");

  useEffect(() => { setEventPage(1); }, [from, to]);

  const periodLabel = `${new Date(from + "T12:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })} — ${new Date(to + "T12:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })}`;

  // ── Exportación via servidor ──────────────────────────────────────
  const handlePDFExport = async () => {
    try {
      const res = await fetch("/api/reports/events/export", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ from, to, symbol }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al exportar el reporte");
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `Eventos_${from}_${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      toast.error(err.message || "Error al exportar el reporte");
    }
  };

  // Chart data
  const chartData = events
    .filter(e => e.status === "COMPLETED" || e.sales_count > 0)
    .slice(0, 12)
    .map(e => ({
      name:    e.name.length > 14 ? e.name.slice(0, 14) + "…" : e.name,
      ingresos: Number(e.total_revenue),
      gastos:   Number(e.fixed_cost) + Number(e.extra_expenses) + Number(e.total_cogs),
      utilidad: Number(e.net_profit),
    }))
    .reverse();

  const eventColumns: DataTableTimeSectionColumn<(typeof events)[number]>[] = [
    { id: "event", header: "Evento", width: showProfit ? "25%" : "41%", cell: (event) => <div className="min-w-0"><p className="truncate font-medium" title={event.name}>{event.name}</p>{event.location && <p className="truncate text-xs text-muted-foreground">{event.location}</p>}</div> },
    { id: "date", header: "Fecha", width: "16%", className: "whitespace-nowrap text-muted-foreground", cell: (event) => <span suppressHydrationWarning>{new Date(event.starts_at).toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })}</span> },
    { id: "sales", header: "Ventas", width: "10%", align: "right", cell: (event) => event.sales_count },
    { id: "revenue", header: "Ingresos", width: "15%", align: "right", cell: (event) => <span className="font-medium">{format(event.total_revenue)}</span> },
    ...(showProfit ? [
      { id: "expenses", header: "Gastos", width: "14%", align: "right" as const, cell: (event: (typeof events)[number]) => <span className="text-muted-foreground">{format(Number(event.fixed_cost) + Number(event.extra_expenses))}</span> },
      { id: "profit", header: "Utilidad neta", width: "14%", align: "right" as const, cell: (event: (typeof events)[number]) => <span className={`font-semibold ${Number(event.net_profit) >= 0 ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>{Number(event.net_profit) < 0 ? "−" : ""}{format(Math.abs(Number(event.net_profit)))}</span> },
    ] : []),
    { id: "status", header: "Estado", width: showProfit ? "6%" : "18%", align: "center", cell: (event) => <Badge className={`${STATUS_COLOR[event.status] ?? ""} border text-xs`}>{STATUS_LABEL[event.status] ?? event.status}</Badge> },
  ];
  const eventRows = events.slice((eventPage - 1) * eventPageSize, eventPage * eventPageSize);

  return (
    <ReportShell
      title="Reporte de eventos"
      subtitle={periodLabel}
      from={from} to={to}
      onFromChange={setFrom} onToChange={setTo}
      onExportPDF={handlePDFExport}
      isLoading={isLoading}
    >
      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}{/* skeleton - index key ok */}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Eventos"           value={String(summary.total_events)}   icon={Calendar} />
          <StatCard label="Ingresos totales"  value={format(summary.total_revenue)}  accent="blue" icon={DollarSign} />
          {showProfit && <StatCard label="Gastos totales"    value={format(summary.total_expenses)} accent="red" icon={Receipt} />}
          {showProfit && (
            <StatCard label="Utilidad neta"     value={format(summary.net_profit)}
              accent={summary.net_profit >= 0 ? "green" : "red"}
              icon={TrendingUp}
              sub={`${summary.total_sales} ventas`}
            />
          )}
        </div>
      )}

      {/* Chart */}
      {!isLoading && chartData.length > 0 && (
        <ReportSection title="Ingresos vs. gastos por evento" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 10 }} width={65}
                tickFormatter={v => `${symbol}${Number(v).toLocaleString("es-HN", { maximumFractionDigits: 0 })}`}
              />
              <Tooltip formatter={(v: any, name: string) => [format(Number(v)), name === "ingresos" ? "Ingresos" : name === "gastos" ? "Gastos" : "Utilidad"]} />
              <Bar dataKey="ingresos" fill="var(--primary)" radius={[4,4,0,0]} />
              {showProfit && <Bar dataKey="gastos"   fill="hsl(0 84% 60%)"       radius={[4,4,0,0]} />}
              {showProfit && <Bar dataKey="utilidad" fill="hsl(142 76% 36%)"     radius={[4,4,0,0]} />}
            </BarChart>
          </ResponsiveContainer>
        </ReportSection>
      )}

      {/* Events table */}
      {!isLoading && events.length > 0 && (
        <div className="space-y-2">
          <ReportTableSection title="Detalle por evento" icon={CalendarDays}>
            <DataTableTimeSection
              columns={eventColumns} data={eventRows} getRowKey={(event) => event.id}
              pagination={{ page: eventPage, pageSize: eventPageSize, total: events.length, onPageChange: setEventPage, onPageSizeChange: setEventPageSize }}
              recordLabel="eventos" minWidth="100%" ariaLabel="Detalle por evento"
              emptyState="No hay eventos para mostrar" showFooterPagination={false}
            />
          </ReportTableSection>
        </div>
      )}

      {!isLoading && events.length === 0 && (
        <ReportEmptyState icon={Calendar} message="Sin eventos en el período seleccionado." />
      )}
    </ReportShell>
  );
}
