import { ReceivablesPayablesOwnerDetail } from "@/components/finances/receivables-payables-owner-detail";

export default async function PayableEntityPage({ params }: { params: Promise<{ entityId: string }> }) {
  return <ReceivablesPayablesOwnerDetail type="payable" ownerId={`entity-${(await params).entityId}`} />;
}
