"use client";

import { TrendingUp } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useCurrency } from "@/hooks/swr/use-currency";
import { usePrivacyMode } from "@/context/privacy-mode-context";
import { useModulePermissions } from "@/hooks/use-module-permissions";
import { CartItem } from "@/hooks/swr/use-sales";
import { estimateSaleProfit } from "@/lib/sale-estimate";
import { SupplyUsed } from "./supplies-used-modal";

type Props = {
  cart: CartItem[];
  subtotal: number;
  totalDiscount: number;
  taxAmount: number;
  suppliesUsed: SupplyUsed[];
};

export function CartMarginSummary({
  cart,
  subtotal,
  totalDiscount,
  taxAmount,
  suppliesUsed,
}: Props) {
  const { format } = useCurrency();
  const { mask } = usePrivacyMode();
  const { show_costs: showCosts, show_profit: showProfit } = useModulePermissions("SALES");

  if (!showCosts && !showProfit) return null;

  const estimate = estimateSaleProfit({
    subtotal,
    discount: totalDiscount,
    tax: taxAmount,
    items: cart,
    supplies: suppliesUsed,
  });

  // Sin el costo promedio no hay un estimado honesto: mostrarlo en 0
  // inflaría la ganancia. El envío no se resta (igual que en el detalle).
  if (!estimate.costsKnown) return null;

  const showProductCost = showCosts;
  const showSuppliesCost = showCosts && estimate.suppliesCost > 0;
  const showProfitRow = showProfit;
  if (!showProductCost && !showSuppliesCost && !showProfitRow) return null;

  const profitClass = estimate.netProfit >= 0
    ? "text-green-600 dark:text-green-400"
    : "text-destructive";

  return (
    <div className="space-y-1.5">
      <Separator />
      {showProductCost && (
        <div className="flex justify-between text-muted-foreground">
          <span>Costo productos</span>
          <span>-{format(estimate.productsCost)}</span>
        </div>
      )}
      {showSuppliesCost && (
        <div className="flex justify-between text-orange-600">
          <span>Costo suministros</span>
          <span>-{format(estimate.suppliesCost)}</span>
        </div>
      )}
      {showProfitRow && (
        <div className={`flex justify-between font-semibold ${profitClass}`}>
          <span className="flex items-center gap-1.5">
            <TrendingUp className="size-3.5" />
            Ganancia estimada
          </span>
          <span>{format(estimate.netProfit)}</span>
        </div>
      )}
      {showProfitRow && (
        <p className={`text-[11px] text-right ${profitClass}`}>
          {mask(`${estimate.marginPct.toFixed(1)}% margen`)}
        </p>
      )}
      <p className="text-[10px] leading-snug text-muted-foreground">
        Estimado con el costo promedio. Al guardar, el costo final del inventario usa FIFO.
      </p>
    </div>
  );
}
