import { Link2, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type AccountOrigin = {
  source_type?: string | null;
  source_id?: number | string | null;
};

const sourceLabels: Record<string, string> = {
  CREDIT_SALE: "Venta a crédito",
  INSTALLMENT_SALE: "Venta en cuotas",
  PERSONAL_LOAN: "Transacción vinculada",
  CREDIT_CARD_TRANSACTION: "Cargo de tarjeta vinculado",
};

export function ReceivablesPayablesOrigin({ account, showReference = false }: {
  account: AccountOrigin;
  showReference?: boolean;
}) {
  const linked = account.source_id != null && Number(account.source_id) > 0;
  const label = linked ? sourceLabels[account.source_type ?? ""] ?? "Operación vinculada" : "Registro manual";
  const Icon = linked ? Link2 : PenLine;

  return (
    <Badge variant={linked ? "secondary" : "outline"} className="max-w-full gap-1 whitespace-normal">
      <Icon className="size-3 shrink-0" />
      <span>{label}{linked && showReference ? ` #${account.source_id}` : ""}</span>
    </Badge>
  );
}
