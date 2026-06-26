export default function RuleDetailPage(props: { docId: number; docTitle: string; batchId: number; batchTitle: string }) {
  return <div data-testid="rule-detail-page">规则详情 doc#{props.docId} {props.docTitle}（建设中）</div>;
}
