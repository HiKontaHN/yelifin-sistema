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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: "Pagada",    color: "bg-green-100 text-green-700 border-green-200" },
  PENDING:   { label: "Pendiente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  CANCELLED: { label: "Cancelada", color: "bg-red-100 text-red-700 border-red-200" },
};

export default function InvoicePage({ params }: Props) {
  const { id }         = use(params);
  const numericId      = Number(id);
  const { sale, isLoading: saleLoading }       = useSale(numericId);
  const { profile, isLoading: profileLoading } = useMe();
  const { format }                             = useCurrency();

  if (saleLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-500">Cargando factura…</p>
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

  const taxRate        = Number(sale.tax_rate ?? 0);
  const taxAmount      = Number(sale.tax ?? 0);
  const shippingAmount = Number(sale.shipping_cost ?? 0);
  const discount       = Number(sale.discount ?? 0);

  const businessName = profile?.business_name || "Mi Negocio";
  const businessLogo = profile?.business_logo_url ?? null;
  const tz           = profile?.timezone ?? "America/Tegucigalpa";

  const dateFormatted = new Date(sale.sold_at).toLocaleDateString("es-HN", {
    timeZone: tz,
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const statusInfo = STATUS_LABELS[sale.status] ?? { label: sale.status, color: "bg-gray-100 text-gray-700 border-gray-200" };

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 1.5cm; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">

        {/* Toolbar */}
        <div className="no-print max-w-2xl mx-auto mb-4 flex gap-2 px-4">
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
            Imprimir / Guardar PDF
          </button>
        </div>

        {/* Invoice */}
        <div className="max-w-2xl mx-auto bg-white shadow-sm print:shadow-none print:max-w-none">

          {/* Header */}
          <div className="px-10 pt-10 pb-6 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {businessLogo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={businessLogo}
                    alt={businessName}
                    className="size-14 object-contain rounded-lg"
                  />
                ) : (
                  <div className="size-14 rounded-lg bg-black flex items-center justify-center shrink-0">
                    <span className="text-2xl font-bold text-white">
                      {businessName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{businessName}</h2>
                </div>
              </div>

              <div className="text-right">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">FACTURA</h1>
                <p className="text-base font-mono text-gray-500 mt-0.5">{sale.sale_number}</p>
                <span className={`inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              </div>
            </div>
          </div>

          {/* Meta + customer */}
          <div className="px-10 py-6 border-b border-gray-100 grid grid-cols-2 gap-8">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Detalles
              </p>
              <div className="space-y-1.5 text-sm text-gray-700">
                <div className="flex gap-2">
                  <span className="text-gray-400 w-24 shrink-0">Fecha:</span>
                  <span>{dateFormatted}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-24 shrink-0">Método pago:</span>
                  <span>{PAYMENT_LABELS[sale.payment_method ?? ""] ?? sale.payment_method ?? "—"}</span>
                </div>
                {sale.account_name && (
                  <div className="flex gap-2">
                    <span className="text-gray-400 w-24 shrink-0">Cuenta:</span>
                    <span>{sale.account_name}</span>
                  </div>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                Cliente
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {sale.customer_name ?? "Cliente general"}
              </p>
              {sale.customer_phone && (
                <p className="text-sm text-gray-500 mt-0.5">{sale.customer_phone}</p>
              )}
            </div>
          </div>

          {/* Items table */}
          <div className="px-10 py-6 border-b border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Producto
                  </th>
                  <th className="text-center pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-16">
                    Cant.
                  </th>
                  <th className="text-right pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-28">
                    Precio unit.
                  </th>
                  <th className="text-right pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-28">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, i) => (
                  <tr
                    key={item.id}
                    className={i % 2 === 0 ? "" : "bg-gray-50/60"}
                  >
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-gray-900">{item.product_name}</p>
                      {item.variant_name && (
                        <p className="text-xs text-gray-400 mt-0.5">{item.variant_name}</p>
                      )}
                    </td>
                    <td className="py-2.5 text-center text-gray-700">{item.quantity}</td>
                    <td className="py-2.5 text-right text-gray-700">
                      {format(Number(item.unit_price))}
                    </td>
                    <td className="py-2.5 text-right font-semibold text-gray-900">
                      {format(Number(item.line_total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="px-10 py-6 border-b border-gray-100">
            <div className="ml-auto w-64 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{format(Number(sale.subtotal))}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
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
                <div className="flex justify-between text-amber-600 text-xs">
                  <span>ISV {taxRate}% (incluido en precio)</span>
                  <span>{format(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg text-gray-900 pt-2 border-t border-gray-200">
                <span>TOTAL</span>
                <span>{format(Number(sale.total))}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {sale.notes?.trim() && (
            <div className="px-10 py-5 border-b border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Detalle
              </p>
              <p className="text-sm text-gray-700">{sale.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-10 py-5 flex items-center justify-between">
            <p className="text-xs text-gray-300">
              {sale.sale_number} · {dateFormatted}
            </p>
            <p className="text-xs text-gray-400">
              Powered by{" "}
              <span className="font-bold text-gray-600">HiKonta</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
