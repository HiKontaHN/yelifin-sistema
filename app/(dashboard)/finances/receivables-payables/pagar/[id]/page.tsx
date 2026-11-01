import { ReceivablesPayablesAccountDetail } from "@/components/finances/receivables-payables-account-detail";

export default async function PayableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <ReceivablesPayablesAccountDetail type="payable" id={Number((await params).id)} />;
}
