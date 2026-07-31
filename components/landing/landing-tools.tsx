"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CreditCard,
  Eye,
  MonitorSmartphone,
  MoreVertical,
  Pencil,
  ShoppingCart,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";

export function LandingTools() {
  return (
    <section className="bg-white px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <h2 className="text-3xl font-normal leading-tight text-black sm:text-4xl">
            Herramientas que sí ayudan
          </h2>
          <p className="mt-2 text-slate-600 sm:mt-3">Lo que nos hace diferentes</p>
        </div>

        <div className="mt-10 grid auto-rows-auto gap-6 md:grid-cols-2 xl:grid-cols-6">
          <ToolCard className="xl:col-span-2 xl:row-span-2" icon={<CalendarDays className="size-5" />} title="Eventos">
            <p className="text-sm leading-5 text-slate-600">
              Conoce la rentabilidad real de cada evento. Registra gastos y descubre tu ganancia real.
            </p>
            <EventPreview />
          </ToolCard>

          <ToolCard className="md:min-h-70 xl:col-span-2" icon={<Star className="size-5" />} title="Fidelización">
            <p className="text-sm leading-5 text-slate-600">
              Define niveles para recompensar a tus clientes frecuentes
            </p>
            <LoyaltyPreview />
          </ToolCard>

          <div className="flex flex-col gap-6 md:min-h-70 xl:col-span-2">
            <ToolCard className="flex-1" icon={<Users className="size-5" />} title="Equipo y Roles">
              <p className="text-sm leading-5 text-slate-600">
                Invita a tu equipo y asigna permisos según el rol de cada integrante.
              </p>
            </ToolCard>

            <ToolCard className="flex-1" icon={<MonitorSmartphone className="size-5" />} title="Multiplataforma">
              <p className="text-sm leading-5 text-slate-600">
                Accede a la plataforma desde cualquier dispositivo con conexión a internet.
              </p>
            </ToolCard>
          </div>

          <ToolCard className="md:col-span-2 xl:col-span-2" icon={<ShoppingCart className="size-5" />} title="Suministros">
            <p className="text-sm leading-5 text-slate-600">
              Incluye empaques, etiquetas y otros insumos al registrar cada compra.
            </p>
            <SuppliesPreview />
          </ToolCard>

          <ToolCard className="md:col-span-2 xl:col-span-2" icon={<CreditCard className="size-5" />} title="Tarjetas de crédito">
            <p className="text-sm leading-5 text-slate-600">
              Sigue el saldo, los movimientos y los pagos de tus tarjetas.
            </p>
            <CreditCardPreview />
          </ToolCard>
        </div>
      </div>
    </section>
  );
}

function ToolCard({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={`rounded-xl border border-slate-200 bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.08)] sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center gap-2 text-base font-bold text-[#0068ff]">
        {icon}
        {title}
      </div>
      <div className="space-y-5">{children}</div>
    </article>
  );
}

function EventPreview() {
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:mt-7 sm:p-4">
      <div className="flex items-center justify-between">
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">Completado</span>
        <MoreVertical className="size-4 text-slate-500" />
      </div>
      <h3 className="mt-5 text-lg font-bold text-slate-900">Feria</h3>
      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
        <CalendarDays className="size-4" />
        28 may 2026
      </div>
      <div className="mt-6 grid gap-3 min-[420px]:grid-cols-2">
        <Metric label="Ventas" value="L 9,107" />
        <Metric label="Gastos" value="L 741.08" />
      </div>
      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Ganancia neta</span>
          <span className="text-xs text-slate-500">ROI</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm font-bold text-emerald-600">
          <span>L 4,743.16</span>
          <span>↗ 208.7%</span>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-600">Costo fijo: <strong>L 500</strong></p>
      <div className="mt-6 grid gap-2 min-[420px]:grid-cols-3">
        <button className="flex h-10 items-center justify-center gap-1 rounded-md bg-slate-100 text-sm font-bold text-slate-700">
          <Eye className="size-4" />
          Detalle
        </button>
        <button className="h-10 rounded-md bg-red-50 text-sm font-bold text-red-500">Gasto</button>
        <button className="h-10 rounded-md bg-[#2f80ed] text-sm font-bold text-white">Venta</button>
      </div>
    </div>
  );
}

function LoyaltyPreview() {
  const tiers = [
    ["Principiante", "0-499 pts.", "bg-amber-100 text-amber-700"],
    ["Fan", "500-999 pts.", "bg-slate-100 text-slate-700"],
    ["Clave", "2000+ pts.", "bg-blue-100 text-blue-700"],
  ];

  return (
    <div className="space-y-3">
      {tiers.map(([name, range, color]) => (
        <div key={name} className={`flex items-center justify-between rounded-md px-3 py-2 text-xs ${color}`}>
          <div>
            <div className="font-bold">{name}</div>
            <div className="opacity-70">{range}</div>
          </div>
          <div className="flex gap-2 opacity-70">
            <Pencil className="size-3.5" />
            <Trash2 className="size-3.5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SuppliesPreview() {
  const [supplies, setSupplies] = useState([
    { name: "Stickers de regalo", unitCost: 0.09, quantity: 1 },
    { name: "Bolsas de empacar 20x30", unitCost: 3.78, quantity: 1 },
  ]);

  const total = useMemo(
    () => supplies.reduce((sum, item) => sum + item.unitCost * item.quantity, 0),
    [supplies],
  );

  const updateQuantity = (index: number, delta: number) => {
    setSupplies((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    );
  };

  const removeSupply = (index: number) => {
    setSupplies((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="rounded-xl border border-dashed border-orange-200 bg-orange-50/45 p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-bold text-orange-600">Suministros</span>
        <span className="rounded-full border border-orange-200 bg-orange-100 px-2 py-0.5 text-sm font-bold text-orange-600">
          {supplies.length}
        </span>
      </div>
      <div className="space-y-2.5">
        {supplies.map((item, index) => (
          <div key={item.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold text-slate-800 sm:text-base">{item.name}</p>
                <p className="mt-2 text-sm font-bold text-orange-600">L {item.unitCost.toFixed(2)}</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                onClick={() => removeSupply(index)}
                aria-label={`Quitar ${item.name}`}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              <div className="flex h-8 items-center rounded-full border border-slate-200 bg-white text-slate-700">
                <button
                  type="button"
                  className="h-full px-3 text-lg leading-none"
                  onClick={() => updateQuantity(index, -1)}
                  aria-label={`Restar ${item.name}`}
                >
                  −
                </button>
                <span className="min-w-7 text-center text-sm font-medium">{item.quantity}</span>
                <button
                  type="button"
                  className="h-full px-3 text-lg leading-none"
                  onClick={() => updateQuantity(index, 1)}
                  aria-label={`Sumar ${item.name}`}
                >
                  +
                </button>
              </div>
              <span className="text-xs text-slate-500">unit</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-sm text-orange-600">
        <span>Costo suministros</span>
        <span className="font-bold">-L {total.toFixed(2)}</span>
      </div>
    </div>
  );
}

function CreditCardPreview() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-100 bg-red-50 p-4">
        <p className="text-sm text-slate-600">Deuda total en tarjetas</p>
        <p className="text-xs text-slate-400">HNL</p>
        <p className="mt-1 text-xl font-extrabold text-red-500">L 2,672.3</p>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
        <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-[#0068ff]">
          <CreditCard className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">Visa BAC **** 2357</p>
          <p className="text-xs text-red-500">L 2,672.3 <span className="text-slate-400">Pago día 10</span></p>
        </div>
        <MoreVertical className="size-4 shrink-0 text-slate-500" />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-base font-bold text-slate-900">{value}</div>
    </div>
  );
}
