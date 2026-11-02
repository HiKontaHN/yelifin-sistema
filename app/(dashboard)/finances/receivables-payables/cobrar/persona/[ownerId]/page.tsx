import { ReceivablesPayablesOwnerDetail } from "@/components/finances/receivables-payables-owner-detail";

export default async function ReceivablePersonPage({ params }: { params: Promise<{ ownerId: string }> }) {
  return <ReceivablesPayablesOwnerDetail type="receivable" ownerId={(await params).ownerId} />;
}
