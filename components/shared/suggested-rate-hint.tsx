// components/shared/suggested-rate-hint.tsx
// "Sugerido (BCH, 30 sep): 24.89 · Usar" debajo de un input de tasa USD.
// El BCH publica USD → HNL, así que solo se muestra si la moneda local es HNL.
"use client";

import { useSuggestedExchangeRate } from "@/hooks/swr/use-exchange-rate";

export function SuggestedRateHint({
  value,
  localCurrency,
  onUse,
}: {
  value: number;
  localCurrency: string;
  onUse: (rate: number) => void;
}) {
  const { rate, rateDate } = useSuggestedExchangeRate();
  if (rate == null || localCurrency !== "HNL") return null;

  return (
    <p className="text-xs text-muted-foreground">
      Sugerido (BCH{rateDate ? `, ${new Date(rateDate).toLocaleDateString("es-HN", { day: "numeric", month: "short" })}` : ""}): {rate}
      {value !== rate && (
        <button
          type="button"
          className="ml-1.5 text-primary hover:underline font-medium"
          onClick={() => onUse(rate)}
        >
          Usar
        </button>
      )}
    </p>
  );
}
