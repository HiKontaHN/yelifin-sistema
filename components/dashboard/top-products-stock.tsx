// components/dashboard/top-products-stock.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { StockAlertsCard } from "@/components/dashboard/stock-alerts-card";

const CHART_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

type Props = { topProducts: any[]; isLoading: boolean };

export function TopProductsStock({ topProducts, isLoading }: Props) {
  return (
    <div className="hidden lg:grid grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Top productos</CardTitle>
          <CardDescription>Por unidades vendidas en el período</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? <Skeleton className="h-56 w-full" /> : !topProducts.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin ventas en el período</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
                <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} />
                <Bar dataKey="units_sold" radius={[0, 4, 4, 0]} name="Unidades">
                  {topProducts.map((p: any, i: number) => (
                    <Cell key={p.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <StockAlertsCard />
    </div>
  );
}