"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { title: "Por cobrar", href: "/finances/receivables-payables/cobrar" },
  { title: "Por pagar", href: "/finances/receivables-payables/pagar" },
];

export default function ReceivablesPayablesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = TABS.find((tab) => pathname.startsWith(tab.href)) ?? TABS[0];

  return (
    <div className="space-y-4 md:space-y-6">
      <Tabs value={current.href} className="relative">
        <TabsList className="max-w-full gap-1.5 overflow-x-auto rounded-xl border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.href}
              value={tab.href}
              asChild
              className="rounded-xl border-0 px-4 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-primary/15 hover:text-primary data-[state=active]:bg-primary/15 data-[state=active]:font-medium data-[state=active]:text-primary"
            >
              <Link href={tab.href}>{tab.title}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {children}
    </div>
  );
}
