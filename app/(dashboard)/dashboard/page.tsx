// app/(dashboard)/dashboard/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  CalendarDays,
  ShoppingCart,
  ArrowLeftRight,
} from "lucide-react";

import { useDashboard, useDashboardPeriods } from "@/hooks/swr/use-dashboard";
import { useAccounts } from "@/hooks/swr/use-accounts";
import { useCreditCards } from "@/hooks/swr/use-credit-cards";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { Fab } from "@/components/ui/fab";
import { CreateTransactionModal } from "@/components/transactions/create-transaction-modal";

import { MetricsGrid } from "@/components/dashboard/metrics-grid";
import { SecondaryStats } from "@/components/dashboard/secondary-stats";
import { MobileSummary } from "@/components/dashboard/mobile-summary";
import { SalesCharts } from "@/components/dashboard/sales-charts";
import { TopProductsStock } from "@/components/dashboard/top-products-stock";
import { RecentSalesTable } from "@/components/dashboard/recent-sales-table";
import { CreditCardDebtWidget } from "@/components/dashboard/credit-card-debt-widget";

const MONTH_NAMES = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export default function DashboardPage() {
  const { push } = useRouter();

  const [selectedMonth, setSelectedMonth] = useState<number | undefined>();
  const [selectedYear, setSelectedYear] = useState<number | undefined>();
  const [transactionOpen, setTransactionOpen] = useState(false);

  const { data, isLoading, mutate } = useDashboard({
    month: selectedMonth,
    year: selectedYear,
  });
  const { periods } = useDashboardPeriods();
  const { accounts } = useAccounts();
  const { creditCards } = useCreditCards();
  const { show_profit: showProfit, show_costs: showCosts } = useModulePermissions("DASHBOARD");

  const availableYears = [...new Set(periods.map((p) => p.year))].sort(
    (a, b) => b - a
  );

  const periodLabel = () => {
    if (!selectedMonth && !selectedYear) return "Mes actual";
    if (selectedYear && !selectedMonth) return `Año ${selectedYear}`;
    if (selectedYear && selectedMonth)
      return `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    return "Mes actual";
  };

  const clearFilter = () => {
    setSelectedMonth(undefined);
    setSelectedYear(undefined);
  };

  const m = data?.metrics;

  const salesChart = (data?.sales_chart ?? []).map((d: any) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("es-HN", {
      month: "short",
      day: "numeric",
    }),
    revenue: Number(d.revenue ?? 0),
    profit: Number(d.profit ?? 0),
  }));

  const topProducts = (data?.top_products ?? []).map((p: any) => ({
    ...p,
    units_sold: Number(p.units_sold ?? 0),
  }));

  const PAYMENT_LABELS: Record<string, string> = {
    CASH:        "Efectivo",
    CARD:        "Tarjeta débito",
    CREDIT_CARD: "Tarjeta créd.",
    TRANSFER:    "Transferencia",
    MIXED:       "Mixto",
    OTHER:       "Otro",
  };

  const paymentMethods = (data?.payment_methods ?? []).map(
    (p: any, i: number) => ({
      name: PAYMENT_LABELS[p.method] ?? p.method ?? "Otro",
      value: Number(p.amount ?? 0),
      fill: ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"][i % 5],
    })
  );

  return (
    <div className="space-y-4 pb-24 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Resumen de tu negocio</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
              <CalendarDays className="size-3.5" />
              <span className="text-sm">{periodLabel()}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={clearFilter}>
              <span
                className={
                  !selectedMonth && !selectedYear
                    ? "font-medium text-primary"
                    : ""
                }
              >
                Mes actual
              </span>
            </DropdownMenuItem>

            {availableYears.length > 0 && <DropdownMenuSeparator />}

            {availableYears.map((year) => (
              <div key={year}>
                <DropdownMenuLabel className="text-xs text-muted-foreground py-1">
                  {year}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedYear(year);
                    setSelectedMonth(undefined);
                  }}
                >
                  <span
                    className={
                      selectedYear === year && !selectedMonth
                        ? "font-medium text-primary"
                        : ""
                    }
                  >
                    Todo {year}
                  </span>
                </DropdownMenuItem>
                {periods
                  .filter((p) => p.year === year)
                  .sort((a, b) => b.month - a.month)
                  .map((p) => (
                    <DropdownMenuItem
                      key={`${p.year}-${p.month}`}
                      className="pl-5"
                      onClick={() => {
                        setSelectedYear(p.year);
                        setSelectedMonth(p.month);
                      }}
                    >
                      <span
                        className={
                          selectedYear === p.year && selectedMonth === p.month
                            ? "font-medium text-primary"
                            : ""
                        }
                      >
                        {MONTH_NAMES[p.month]}
                      </span>
                    </DropdownMenuItem>
                  ))}
              </div>
            ))}

            {periods.length === 0 && !isLoading && (
              <DropdownMenuItem disabled>
                Sin ventas registradas
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MetricsGrid metrics={m} isLoading={isLoading} showProfit={showProfit} />
      <CreditCardDebtWidget
        debtLocal={m?.credit_card_debt?.local ?? 0}
        debtUsd={m?.credit_card_debt?.usd ?? 0}
        isLoading={isLoading}
      />
      <MobileSummary
        lowStock={data?.low_stock ?? []}
        recentSales={data?.recent_sales ?? []}
        isLoading={isLoading}
        showProfit={showProfit}
      />
      <SecondaryStats metrics={m} isLoading={isLoading} showCosts={showCosts} />
      <SalesCharts
        salesChart={salesChart}
        paymentMethods={paymentMethods}
        periodLabel={periodLabel()}
        isLoading={isLoading}
        showProfit={showProfit}
      />
      <TopProductsStock
        topProducts={topProducts}
        isLoading={isLoading}
      />
      <RecentSalesTable
        recentSales={data?.recent_sales ?? []}
        isLoading={isLoading}
        showProfit={showProfit}
      />

      {/* FAB */}
      <Fab
        actions={[
          {
            label: "Nueva venta",
            icon: ShoppingCart,
            onClick: () => push("/sales/new"),
          },
          {
            label: "Nueva transacción",
            icon: ArrowLeftRight,
            onClick: () => setTransactionOpen(true),
          },
        ]}
      />

      <CreateTransactionModal
        open={transactionOpen}
        onOpenChange={setTransactionOpen}
        accounts={accounts}
        creditCards={creditCards}
        onSuccess={() => {
          mutate();
          setTransactionOpen(false);
        }}
      />
    </div>
  );
}
