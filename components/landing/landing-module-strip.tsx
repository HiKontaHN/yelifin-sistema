import { BarChart3, CalendarDays, CreditCard, Package, ShoppingBag, ShoppingCart, Users } from "lucide-react";

const modules = [
  { label: "Inventario", icon: Package },
  { label: "Suministros", icon: ShoppingBag },
  { label: "Finanzas", icon: CreditCard },
  { label: "Clientes", icon: Users },
  { label: "Eventos", icon: CalendarDays },
  { label: "Reportes", icon: BarChart3 },
  { label: "Ventas", icon: ShoppingCart },
];

export function LandingModuleStrip() {
  const loopModules = [...modules, ...modules];

  return (
    <section className="overflow-hidden bg-white py-9">
      <div className="relative mx-auto max-w-7xl">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-linear-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-linear-to-l from-white to-transparent" />

        <div className="landing-marquee flex w-max items-center gap-12 text-sm font-semibold text-black">
          {loopModules.map((module, index) => (
            <div key={`${module.label}-${index}`} className="flex min-w-36 items-center justify-center gap-3">
              <module.icon className="size-6 shrink-0" />
              <span>{module.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
