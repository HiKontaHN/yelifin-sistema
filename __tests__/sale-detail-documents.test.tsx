/** @jest-environment node */
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SaleDetailPage from "@/app/(dashboard)/sales/[id]/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, back: () => {} }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => createElement("img", props),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));

const state: { sale: Record<string, unknown> | null; canEdit: boolean } = {
  sale: null,
  canEdit: true,
};

jest.mock("@/hooks/swr/use-sales", () => ({
  useSale: () => ({ sale: state.sale, isLoading: false }),
  usePatchSale: () => ({
    confirmSale: async () => {},
    cancelSale: async () => {},
    isPatching: false,
  }),
}));

jest.mock("@/hooks/swr/use-currency", () => ({
  useCurrency: () => ({ format: (n: number) => `L ${n}` }),
}));

jest.mock("@/hooks/swr/use-timezone", () => ({
  useTimezone: () => "America/Tegucigalpa",
  formatInTZ: () => "1 ene 2026",
}));

jest.mock("@/hooks/use-module-permissions", () => ({
  useModulePermissions: () => ({
    show_costs: true,
    show_profit: true,
    can_edit: state.canEdit,
  }),
}));

function fulfilledParams(id: string) {
  return {
    then(resolve: (value: { id: string }) => void) {
      resolve({ id });
    },
    status: "fulfilled" as const,
    value: { id },
  };
}

function sale(status: "PENDING" | "COMPLETED" | "CANCELLED") {
  return {
    id: 7,
    sale_number: "V-007",
    status,
    payment_status: status === "COMPLETED" ? "PAID" : "PENDING",
    amount_paid: status === "COMPLETED" ? 100 : 0,
    amount_due: status === "COMPLETED" ? 0 : 100,
    tax_rate: 0,
    tax: 0,
    shipping_cost: 0,
    total: 100,
    subtotal: 100,
    discount: 0,
    products_cost: 40,
    supplies_cost: 0,
    net_profit: 60,
    margin_pct: 60,
    customer_name: "Ana",
    account_name: "Caja",
    sale_date: "2026-01-15",
    sold_at: "2026-01-15T12:00:00.000Z",
    notes: null,
    items: [],
    supplies: [],
    prev_id: null,
    next_id: null,
    deleted_at: status === "CANCELLED" ? "2026-01-16T12:00:00.000Z" : null,
    cancellation_reason: status === "CANCELLED" ? "Error de registro" : null,
  };
}

function render(status: "PENDING" | "COMPLETED" | "CANCELLED", canEdit = true) {
  state.sale = sale(status);
  state.canEdit = canEdit;
  return renderToStaticMarkup(
    createElement(SaleDetailPage, { params: fulfilledParams("7") as never }),
  );
}

describe("sale detail document actions", () => {
  it("shows Ticket PDF and Ticket when the sale is completed", () => {
    const html = render("COMPLETED");
    expect(html).toContain("Ticket PDF");
    expect(html).toContain("Factura PDF");
    expect(html).toContain('href="/sales/7/invoice"');
    expect(html).toContain('href="/sales/7/receipt"');
    expect(html).toContain('href="/sales/7/edit"');
    expect(html).toContain("grid gap-2 sm:hidden grid-cols-3");
    expect(html).not.toContain("Estado del pago");
  });

  it("hides document buttons on a pending sale and keeps Editar", () => {
    const html = render("PENDING");
    expect(html).not.toContain("Ticket PDF");
    expect(html).not.toContain("Factura PDF");
    expect(html).not.toContain('href="/sales/7/invoice"');
    expect(html).not.toContain('href="/sales/7/receipt"');
    expect(html).toContain('href="/sales/7/edit"');
    expect(html).toContain("grid gap-2 sm:hidden grid-cols-1");
    expect(html).toContain("Editar venta");
    expect(html).toContain("Estado del pago");
    expect(html).toContain("Saldo pendiente");
  });

  it("hides document buttons and Editar when the sale is cancelled", () => {
    const html = render("CANCELLED");
    expect(html).not.toContain("Ticket PDF");
    expect(html).not.toContain("Factura PDF");
    expect(html).not.toContain('href="/sales/7/invoice"');
    expect(html).not.toContain('href="/sales/7/receipt"');
    expect(html).not.toContain('href="/sales/7/edit"');
    expect(html).not.toContain("Editar venta");
    expect(html).not.toContain("sm:hidden");
    expect(html).toContain("Esta venta fue cancelada");
  });

  it("still shows documents on a completed sale when editing is not allowed", () => {
    const html = render("COMPLETED", false);
    expect(html).toContain('href="/sales/7/invoice"');
    expect(html).toContain('href="/sales/7/receipt"');
    expect(html).toContain("grid gap-2 sm:hidden grid-cols-2");
    expect(html).not.toContain('href="/sales/7/edit"');
  });
});
