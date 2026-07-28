// components/events/event-card.tsx
"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar, MapPin, TrendingUp, TrendingDown,
  MoreVertical, Pencil, Trash2, ShoppingCart, Receipt,
  CalendarClock, CalendarCheck, AlertCircle, Eye,
} from "lucide-react";
import { Event, EventStatus } from "@/hooks/swr/use-events";
import { useCurrency } from "@/hooks/swr/use-currency";

// ── Helpers ────────────────────────────────────────────────────────────
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric" });

const STATUS_CONFIG: Record<EventStatus, {
  label: string;
  icon:  React.ElementType;
  badge: string;
}> = {
  PLANNED:   { label: "Planificado", icon: CalendarClock, badge: "bg-blue-100 text-blue-700 border-blue-200" },
  ACTIVE:    { label: "Activo",      icon: AlertCircle,   badge: "bg-green-100 text-green-700 border-green-200" },
  COMPLETED: { label: "Completado",  icon: CalendarCheck, badge: "bg-gray-100 text-gray-600 border-gray-200" },
};

// ── Props ──────────────────────────────────────────────────────────────
type Props = {
  event:        Event;
  onView:       (event: Event) => void;
  onEdit:       (event: Event) => void;
  onDelete:     (event: Event) => void;
  onAddExpense: (event: Event) => void;
  canEdit?:     boolean;
  canDelete?:   boolean;
  showProfit?:  boolean;
};

// ── Component ──────────────────────────────────────────────────────────
export function EventCard({ event, onView, onEdit, onDelete, onAddExpense, canEdit = true, canDelete = true, showProfit = true }: Props) {
  const { push }   = useRouter();
  const { format } = useCurrency();

  const cfg        = STATUS_CONFIG[event.status];
  const StatusIcon = cfg.icon;

  const sameDay =
    event.starts_at.split("T")[0] === event.ends_at.split("T")[0];

  return (
    <Card className="flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="p-4 pb-3 flex items-start justify-between gap-2">
        <div
          className="min-w-0 flex-1 cursor-pointer"
          onClick={() => onView(event)}
        >
          <Badge className={`text-[11px] gap-1 mb-1.5 ${cfg.badge}`} variant="outline">
            <StatusIcon className="size-3" />
            {cfg.label}
          </Badge>
          <p className="font-semibold text-base truncate hover:text-primary transition-colors">
            {event.name}
          </p>

          {event.location && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="size-3 shrink-0" />
              {event.location}
            </p>
          )}

          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Calendar className="size-3 shrink-0" />
            {sameDay
              ? formatDate(event.starts_at)
              : <>{formatDate(event.starts_at)} — {formatDate(event.ends_at)}</>
            }
          </p>
        </div>

        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 shrink-0">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(event)}>
              <Eye className="size-4 mr-2" /> Ver detalle
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem onClick={() => onEdit(event)}>
                <Pencil className="size-4 mr-2" /> Editar
              </DropdownMenuItem>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(event)}
                >
                  <Trash2 className="size-4 mr-2" /> Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Stats ── */}
      <div className="px-4 pb-3 space-y-2">
        <div className={`grid gap-2 ${showProfit ? "grid-cols-2" : "grid-cols-1"}`}>
          <div className="rounded-lg bg-muted/50 p-2.5">
            <p className="text-[11px] text-muted-foreground">Ventas</p>
            <p className="text-sm font-bold">{format(event.total_sales)}</p>
          </div>
          {showProfit && (
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-[11px] text-muted-foreground">Gastos</p>
              <p className="text-sm font-bold">{format(event.total_expenses ?? 0)}</p>
            </div>
          )}
        </div>

        {/* Ganancia + ROI */}
        {showProfit && (
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <p className="text-[11px] text-muted-foreground">Ganancia neta</p>
              <p className={`text-sm font-bold ${(event.net_profit ?? 0) >= 0 ? "text-green-600" : "text-destructive"}`}>
                {format(event.net_profit ?? 0)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">ROI</p>
              <p className={`text-sm font-bold flex items-center justify-end gap-0.5 ${(event.roi ?? 0) >= 0 ? "text-green-600" : "text-destructive"}`}>
                {(event.roi ?? 0) >= 0
                  ? <TrendingUp className="size-3.5" />
                  : <TrendingDown className="size-3.5" />
                }
                {(event.roi ?? 0).toFixed(1)}%
              </p>
            </div>
          </div>
        )}

        {event.fixed_cost > 0 && (
          <p className="text-[11px] text-muted-foreground px-0.5">
            Costo fijo: <span className="text-foreground font-medium">{format(event.fixed_cost)}</span>
          </p>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div className="px-4 pb-4 grid grid-cols-3 gap-2 mt-auto">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onView(event)}
        >
          <Eye className="size-3.5" />
          Detalle
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
          onClick={() => onAddExpense(event)}
        >
          <Receipt className="size-3.5" />
          Gasto
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => push(`/sales/new?event_id=${event.id}`)}
        >
          <ShoppingCart className="size-3.5" />
          Venta
        </Button>
      </div>

    </Card>
  );
}