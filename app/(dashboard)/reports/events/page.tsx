// app/(dashboard)/reports/events/page.tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useEventsReport } from "@/hooks/swr/use-reports";
import { useCurrency }     from "@/hooks/swr/use-currency";
import { useAuth }         from "@/hooks/use-auth";
import { fmtN } from "@/lib/export";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { ReportShell, StatCard, ReportSection, ReportEmptyState, useDateRange } from "@/components/reports/report-shell";
import { FeatureGate } from "@/components/shared/feature-gate";
import { PaginationControls } from "@/components/shared/pagination-controls";
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

const EVENT_PAGE_SIZE = 10;

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
  const { show_profit: showProfit } = useModulePermissions("REPORTS");

  useEffect(() => { setEventPage(1); }, [from, to]);

  const periodLabel = `${new Date(from + "T12:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })} — ${new Date(to + "T12:00:00").toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })}`;

  // ── Exportación via servidor ──────────────────────────────────────
  const handlePDFExport = async () => {
    const token = await firebaseUser?.getIdToken();
    if (!token) return;

    try {
      const res = await fetch("/api/reports/events/export", {
        method:  "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
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
          <ReportSection title="Detalle por evento" icon={CalendarDays} noPadding>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/10 text-xs text-muted-foreground">
                    <th className="text-left px-4 py-2">Evento</th>
                    <th className="text-left px-4 py-2 hidden sm:table-cell">Fecha</th>
                    <th className="text-right px-4 py-2">Ventas</th>
                    <th className="text-right px-4 py-2">Ingresos</th>
                    {showProfit && <th className="text-right px-4 py-2 hidden md:table-cell">Gastos</th>}
                    {showProfit && <th className="text-right px-4 py-2">Utilidad neta</th>}
                    <th className="text-left px-4 py-2 hidden lg:table-cell">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {events
                    .slice((eventPage - 1) * EVENT_PAGE_SIZE, eventPage * EVENT_PAGE_SIZE)
                    .map((e) => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-medium max-w-[160px] truncate">{e.name}</p>
                          {e.location && <p className="text-xs text-muted-foreground">{e.location}</p>}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs hidden sm:table-cell" suppressHydrationWarning>
                          {new Date(e.starts_at).toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-2.5 text-right">{e.sales_count}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{format(e.total_revenue)}</td>
                        {showProfit && (
                          <td className="px-4 py-2.5 text-right text-muted-foreground hidden md:table-cell">
                            {format(Number(e.fixed_cost) + Number(e.extra_expenses))}
                          </td>
                        )}
                        {showProfit && (
                          <td className="px-4 py-2.5 text-right font-semibold">
                            <span className={Number(e.net_profit) >= 0 ? "text-green-700 dark:text-green-400" : "text-destructive"}>
                              {Number(e.net_profit) < 0 ? "-" : ""}{format(Math.abs(Number(e.net_profit)))}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-2.5 hidden lg:table-cell">
                          <Badge className={`${STATUS_COLOR[e.status] ?? ""} border text-xs`}>
                            {STATUS_LABEL[e.status] ?? e.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </ReportSection>
          <PaginationControls
            page={eventPage}
            totalPages={Math.ceil(events.length / EVENT_PAGE_SIZE)}
            total={events.length}
            label="eventos"
            onPageChange={setEventPage}
          />
        </div>
      )}

      {!isLoading && events.length === 0 && (
        <ReportEmptyState icon={Calendar} message="Sin eventos en el período seleccionado." />
      )}
    </ReportShell>
  );
}
