import { ReceivablesPayablesAccountDetail } from "@/components/finances/receivables-payables-account-detail";

export default async function ReceivableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <ReceivablesPayablesAccountDetail type="receivable" id={Number((await params).id)} />;
}
