// components/dashboard/recent-sales-table.tsx
"use client";

import { useRouter } from "next/navigation";
import { useCurrency } from "@/hooks/swr/use-currency";
import { formatCalendarDate } from "@/lib/date-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, CreditCard, ArrowLeftRight, HelpCircle } from "lucide-react";

const paymentLabel: Record<string, { label: string; icon: any }> = {
  CASH:        { label: "Efectivo",       icon: Banknote },
  CARD:        { label: "Tarjeta débito", icon: CreditCard },
  CREDIT_CARD: { label: "Tarjeta créd.",  icon: CreditCard },
  TRANSFER:    { label: "Transferencia",  icon: ArrowLeftRight },
  MIXED:       { label: "Mixto",          icon: HelpCircle },
  OTHER:       { label: "Otro",           icon: HelpCircle },
};

type Props = { recentSales: any[]; isLoading: boolean; showProfit?: boolean };

export function RecentSalesTable({ recentSales, isLoading, showProfit = true }: Props) {
  const { push } = useRouter();
  const { format: formatCurrency } = useCurrency();
  const formatDateFull = (d: string) =>
    formatCalendarDate(d, { month: "short", day: "numeric", year: "numeric" });

  return (
    <Card className="hidden lg:block">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-base">Últimas ventas</CardTitle>
        <CardDescription>Las 5 más recientes del período</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {showProfit && <TableHead className="text-right">Ganancia</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: showProfit ? 6 : 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !recentSales.length ? (
              <TableRow>
                <TableCell colSpan={showProfit ? 6 : 5} className="text-center py-8 text-muted-foreground">
                  Sin ventas en este período
                </TableCell>
              </TableRow>
            ) : (
              recentSales.map((sale: any) => {
                const pay     = paymentLabel[sale.payment_method] ?? paymentLabel.OTHER;
                const PayIcon = pay.icon;
                return (
                  <TableRow key={sale.id} className="cursor-pointer hover:bg-muted/50" onClick={() => push(`/sales/${sale.id}`)}>
                    <TableCell className="font-mono font-medium">{sale.sale_number}</TableCell>
                    <TableCell>{sale.customer_name ?? <span className="text-muted-foreground">Consumidor Final</span>}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <PayIcon className="size-3" />{pay.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDateFull(sale.sale_date ?? sale.sold_at)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(sale.total))}</TableCell>
                    {showProfit && (
                      <TableCell className="text-right text-green-600 font-medium">{formatCurrency(Number(sale.profit))}</TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
