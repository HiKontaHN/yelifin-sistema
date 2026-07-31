import { BarChart3, CalendarDays, CreditCard, Eye, Home, Moon, Package, Settings, ShoppingCart, Users } from "lucide-react";
import { HiKontaIcon } from "@/components/shared/hikonta-icon";

const topItems = [Home, Package, ShoppingCart, Users, CreditCard, CalendarDays, BarChart3];
const bottomItems = [Settings, Eye, Moon];

export function LandingSidebarPreview() {
  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center justify-between rounded-l-lg border-r border-slate-200 bg-white py-3">
      <div className="flex flex-col items-center gap-3">
        <HiKontaIcon className="size-8 rounded-md" />
        <span className="text-xs font-bold text-slate-400">&gt;&gt;</span>
        {topItems.map((Icon, index) => (
          <div key={index} className={index === 0 ? "rounded-md bg-blue-50 p-2 text-[#0068ff]" : "p-2 text-slate-700"}>
            <Icon className="size-4" />
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-2">
        {bottomItems.map((Icon, index) => (
          <div key={index} className="p-2 text-slate-600">
            <Icon className="size-4" />
          </div>
        ))}
      </div>
    </aside>
  );
}
