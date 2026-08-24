import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Cell = "check" | "dash" | string;

type FeatureRow = {
  label: string;
  free: Cell;
  basico: Cell;
  pro: Cell;
};

type FeatureSection = {
  title: string;
  rows: FeatureRow[];
};

type PlanCard = {
  name: string;
  price: string;
  tagline: string;
  highlights: string[];
  featured?: boolean;
};

const plans: PlanCard[] = [
  {
    name: "Gratis",
    price: "$0",
    tagline: "Para empezar a ordenar tu negocio.",
    highlights: [
      "Dashboard y ventas (100 al mes)",
      "30 productos y servicios activos",
      "2 cuentas financieras",
      "Reporte de ventas",
    ],
  },
  {
    name: "Básico",
    price: "$8.99",
    tagline: "Cuando tu negocio empieza a crecer.",
    highlights: [
      "Todo lo del plan Gratis, más:",
      "500 productos y ventas ilimitadas",
      "Clientes y fidelización",
      "Eventos y suministros (5)",
      "Reportes de ventas e inventario",
    ],
    featured: true,
  },
  {
    name: "Pro",
    price: "$12.99",
    tagline: "Todo el poder de HiKonta, sin límites.",
    highlights: [
      "Todo lo del plan Básico, más:",
      "Inventario y suministros ilimitados",
      "Tarjetas de crédito",
      "Rentabilidad y reportes de eventos",
      "Equipo y roles de acceso",
    ],
  },
];

const featureSections: FeatureSection[] = [
  {
    title: "Dashboard",
    rows: [{ label: "Panel general", free: "check", basico: "check", pro: "check" }],
  },
  {
    title: "Inventario",
    rows: [
      { label: "Productos y servicios activos", free: "30 activos", basico: "500 activos", pro: "Ilimitado" },
      { label: "Movimientos de inventario", free: "dash", basico: "check", pro: "check" },
      { label: "Mercancía en camino", free: "dash", basico: "dash", pro: "check" },
    ],
  },
  {
    title: "Ventas",
    rows: [{ label: "Ventas por mes", free: "100 al mes", basico: "Ilimitadas", pro: "Ilimitadas" }],
  },
  {
    title: "Clientes",
    rows: [
      { label: "Gestión de clientes", free: "dash", basico: "check", pro: "check" },
      { label: "Programa de fidelización", free: "dash", basico: "1 tipo", pro: "Ilimitados" },
    ],
  },
  {
    title: "Finanzas",
    rows: [
      { label: "Cuentas financieras", free: "2", basico: "5", pro: "Ilimitadas" },
      { label: "Transacciones", free: "check", basico: "check", pro: "check" },
      { label: "Tarjetas de crédito", free: "dash", basico: "dash", pro: "check" },
    ],
  },
  {
    title: "Eventos",
    rows: [{ label: "Ventas y gastos por evento", free: "dash", basico: "check", pro: "check" }],
  },
  {
    title: "Suministros",
    rows: [{ label: "Insumos y consumibles", free: "dash", basico: "5", pro: "Ilimitado" }],
  },
  {
    title: "Reportes",
    rows: [
      { label: "Ventas", free: "check", basico: "check", pro: "check" },
      { label: "Inventario", free: "dash", basico: "check", pro: "check" },
      { label: "Rentabilidad", free: "dash", basico: "dash", pro: "check" },
      { label: "Eventos", free: "dash", basico: "dash", pro: "check" },
    ],
  },
  {
    title: "Configuración",
    rows: [
      { label: "Mi perfil", free: "check", basico: "check", pro: "check" },
      { label: "Mi negocio y categorías", free: "Categorías predeterminadas", basico: "Categorías personalizadas", pro: "Categorías personalizadas" },
      { label: "Suscripción", free: "check", basico: "check", pro: "check" },
      { label: "Equipo", free: "dash", basico: "dash", pro: "check" },
      { label: "Roles y permisos", free: "dash", basico: "dash", pro: "check" },
    ],
  },
];

function FeatureCell({ value }: { value: Cell }) {
  if (value === "check") {
    return <CheckCircle2 className="mx-auto size-5 text-[#0068ff]" />;
  }
  if (value === "dash") {
    return <Minus className="mx-auto size-4 text-slate-300" />;
  }
  return <span className="text-sm font-medium text-slate-700">{value}</span>;
}

export function LandingPricing() {
  return (
    <section id="precios" className="bg-slate-50 px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-normal leading-tight text-black sm:text-5xl">
            Empieza simple. Crece cuando lo necesites.
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            HiKonta está pensado para emprendedores que quieren ordenar su negocio sin complicarse con herramientas enormes.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col rounded-xl border bg-white p-6 shadow-sm sm:p-7",
                plan.featured
                  ? "border-blue-200 shadow-[0_20px_60px_rgba(37,99,235,0.14)] sm:scale-105"
                  : "border-slate-200"
              )}
            >
              {plan.featured && (
                <span className="mb-4 w-fit rounded-full bg-[#8cff00] px-3 py-1 text-xs font-bold text-black">
                  Más popular
                </span>
              )}
              <div className="text-sm font-bold uppercase tracking-wide text-[#0068ff]">{plan.name}</div>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-4xl font-bold text-black">{plan.price}</span>
                <span className="pb-1 text-slate-500">USD / mes</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{plan.tagline}</p>

              <div className="mt-6 grid flex-1 gap-2.5">
                {plan.highlights.map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#0068ff]" />
                    {item}
                  </div>
                ))}
              </div>

              <Link href="/register" className="mt-7 block">
                <Button
                  className={cn(
                    "h-11 w-full rounded-xl text-base font-bold",
                    plan.featured
                      ? "bg-[#8cff00] text-black hover:bg-[#7ce600]"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  )}
                >
                  {plan.price === "$0" ? "Empieza gratis" : "Elegir plan"}
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Los planes pagos incluyen 30 días de prueba gratis. Sin tarjeta de crédito para comenzar.
        </p>

        <div className="mt-14 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="p-4 text-sm font-bold text-slate-900">Funciones</th>
                {plans.map((plan) => (
                  <th key={plan.name} className="p-4 text-center text-sm font-bold text-slate-900">
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureSections.map((section) => (
                <Fragment key={section.title}>
                  <tr className="bg-slate-50">
                    <td colSpan={4} className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {section.title}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={`${section.title}-${row.label}`} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-sm text-slate-700">{row.label}</td>
                      <td className="px-4 py-3 text-center">
                        <FeatureCell value={row.free} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <FeatureCell value={row.basico} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <FeatureCell value={row.pro} />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
