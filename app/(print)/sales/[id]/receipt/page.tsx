"use client";

import { use } from "react";
import Link from "next/link";
import { useSale } from "@/hooks/swr/use-sales";
import { useMe } from "@/hooks/swr/use-me";
import { useCurrency } from "@/hooks/swr/use-currency";

type Props = { params: Promise<{ id: string }> };

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  MIXED: "Mixto",
  OTHER: "Otro",
};

function Dashes() {
  return (
    <div className="text-center text-gray-300 leading-none my-1.5 text-[10px] tracking-widest select-none">
      {"- - - - - - - - - - - - - - - - -"}
    </div>
  );
}

export default function ReceiptPage({ params }: Props) {
  const { id }         = use(params);
  const numericId      = Number(id);
  const { sale, isLoading: saleLoading }       = useSale(numericId);
  const { profile, isLoading: profileLoading } = useMe();
  const { format }                             = useCurrency();

  if (saleLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-500">Cargando ticket…</p>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center space-y-2">
          <p className="text-gray-700 font-medium">Venta no encontrada</p>
          <Link href="/sales" className="text-sm text-blue-600 underline">
            Volver a ventas
          </Link>
        </div>
      </div>
    );
  }

  const businessName   = profile?.business_name || "Mi Negocio";
  const businessLogo   = profile?.business_logo_url ?? null;
  const tz             = profile?.timezone ?? "America/Tegucigalpa";
  const taxRate        = Number(sale.tax_rate ?? 0);
  const taxAmount      = Number(sale.tax ?? 0);
  const shippingAmount = Number(sale.shipping_cost ?? 0);
  const discount       = Number(sale.discount ?? 0);

  const dateFormatted = new Date(sale.sold_at).toLocaleDateString("es-HN", {
    timeZone: tz,
    day:      "2-digit",
    month:    "2-digit",
    year:     "numeric",
    hour:     "2-digit",
    minute:   "2-digit",
  });

  return (
    <>
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          .no-print { display: none !important; }
          body { background: white !important; }
          .receipt-wrapper { padding: 0 !important; }
        }
      `}</style>

      {/* Receipt — fixed 80mm width */}
      <div className="receipt-wrapper flex flex-col items-center bg-gray-200 pt-8 pb-8 min-h-screen print:bg-white print:pt-0 print:pb-0 print:min-h-0 print:block">

        {/* Toolbar */}
        <div className="no-print mb-4 flex gap-2">
          <Link
            href={`/sales/${id}`}
            className="px-4 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ← Volver
          </Link>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Imprimir ticket
          </button>
        </div>

        <div
          className="bg-white shadow-lg print:shadow-none"
          style={{ width: "302px", fontFamily: "'Courier New', Courier, monospace" }}
        >

          {/* Business header */}
          <div className="text-center pt-5 pb-3 px-4">
            {businessLogo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={businessLogo}
                alt={businessName}
                className="h-10 mx-auto mb-1.5 object-contain"
              />
            )}
            <p className="font-bold text-sm uppercase tracking-wide leading-snug">
              {businessName}
            </p>
          </div>

          <Dashes />

          {/* Sale info */}
          <div className="px-4 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-gray-500">N°</span>
              <span className="font-bold">{sale.sale_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Fecha</span>
              <span>{dateFormatted}</span>
            </div>
            {sale.customer_name && (
              <div className="flex justify-between gap-2">
                <span className="text-gray-500 shrink-0">Cliente</span>
                <span className="text-right truncate">{sale.customer_name}</span>
              </div>
            )}
            {sale.customer_phone && (
              <div className="flex justify-between gap-2">
                <span className="text-gray-500 shrink-0">Tel.</span>
                <span className="text-right">{sale.customer_phone}</span>
              </div>
            )}
          </div>

          <Dashes />

          {/* Items */}
          <div className="px-4 text-xs space-y-2">
            {sale.items.map((item) => (
              <div key={item.id}>
                <p className="font-semibold leading-tight truncate">{item.product_name}</p>
                {item.variant_name && (
                  <p className="text-gray-400 leading-tight text-[10px]">{item.variant_name}</p>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>
                    {item.quantity} x {format(Number(item.unit_price))}
                  </span>
                  <span className="font-semibold text-black">
                    {format(Number(item.line_total))}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <Dashes />

          {/* Subtotals */}
          <div className="px-4 text-xs space-y-0.5">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{format(Number(sale.subtotal))}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Descuento</span>
                <span>-{format(discount)}</span>
              </div>
            )}
            {shippingAmount > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Envío</span>
                <span>+{format(shippingAmount)}</span>
              </div>
            )}
            {taxRate > 0 && (
              <div className="flex justify-between text-gray-400 text-[10px]">
                <span>ISV {taxRate}% (incluido)</span>
                <span>{format(taxAmount)}</span>
              </div>
            )}
          </div>

          <Dashes />

          {/* Grand total */}
          <div className="px-4 py-1 flex justify-between items-baseline">
            <span className="font-bold text-sm uppercase tracking-wide">TOTAL</span>
            <span className="font-bold text-lg">{format(Number(sale.total))}</span>
          </div>

          <Dashes />

          {/* Payment */}
          <div className="px-4 text-xs space-y-0.5 pb-1">
            <div className="flex justify-between text-gray-600">
              <span>Método de pago</span>
              <span className="font-medium text-black">
                {PAYMENT_LABELS[sale.payment_method ?? ""] ?? sale.payment_method ?? "—"}
              </span>
            </div>
          </div>

          {sale.notes?.trim() && (
            <>
              <Dashes />
              <div className="px-4 pb-1 text-[10px] text-gray-500 text-center italic">
                {sale.notes}
              </div>
            </>
          )}

          <Dashes />

          {/* Thank you + footer */}
          <div className="text-center pb-5 px-4">
            <p className="text-xs font-semibold">¡Gracias por su compra!</p>
            <p className="text-[10px] text-gray-400 mt-3">
              Powered by <span className="font-bold text-gray-600">HiKonta</span>
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
