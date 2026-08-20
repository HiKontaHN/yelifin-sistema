import type React from "react";
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

// Repeated 8x (not just 2x) so the track always has several set-widths
// of content still ahead of the visible viewport, even on wide desktop
// monitors — otherwise the strip runs out of content mid-cycle and the
// loop reset reads as a visible jump/restart. This is the only place
// that number lives: it's read by the `landing-marquee` keyframe in
// globals.css via the --marquee-repeat custom property set below, so
// changing it can't desync the animation.
const REPEAT_COUNT = 8;

export function LandingModuleStrip() {
  const loopModules = Array.from({ length: REPEAT_COUNT }, () => modules).flat();

  return (
    <section className="overflow-hidden bg-white py-9">
      <div className="relative mx-auto max-w-7xl">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-linear-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-linear-to-l from-white to-transparent" />

        <div
          className="landing-marquee flex w-max items-center gap-12 text-sm font-semibold text-black"
          style={{ "--marquee-repeat": REPEAT_COUNT } as React.CSSProperties}
        >
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
