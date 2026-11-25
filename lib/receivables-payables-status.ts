export const accountStatusFilters = [
  { value: "pending", label: "Pendientes", empty: "No hay cuentas pendientes" },
  { value: "completed", label: "Completado", empty: "No hay cuentas completadas" },
  { value: "cancelled", label: "Cancelado", empty: "No hay cuentas canceladas" },
  { value: "all", label: "Todos", empty: "No hay cuentas registradas" },
] as const;

export type AccountStatusFilter = (typeof accountStatusFilters)[number]["value"];

export function isPendingReceivablePayable(status: string) {
  return status === "PENDING" || status === "PARTIAL" || status === "OVERDUE";
}

export function matchesAccountStatus(status: string, filter: AccountStatusFilter) {
  switch (filter) {
    case "pending": return isPendingReceivablePayable(status);
    case "completed": return status === "PAID";
    case "cancelled": return status === "CANCELLED";
    case "all": return true;
  }
}
