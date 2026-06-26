export default function BatchDetailPage({ batchId, batchTitle }: { batchId: number; batchTitle: string }) {
  return <div data-testid="batch-detail-page">批次详情 #{batchId} {batchTitle}（建设中）</div>;
}
