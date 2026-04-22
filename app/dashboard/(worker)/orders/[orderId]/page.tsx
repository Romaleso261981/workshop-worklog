import { OrderDetailClient } from "./order-detail-client";

export default async function WorkerOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <OrderDetailClient orderId={orderId} />;
}
