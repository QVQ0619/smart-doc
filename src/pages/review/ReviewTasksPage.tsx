import PageScaffold from "../../components/PageScaffold";
import EmptyState from "../../components/EmptyState";

export default function ReviewTasksPage() {
  return (
    <PageScaffold title="审查任务" subtitle="进行中与历史审查批次看板">
      <EmptyState />
    </PageScaffold>
  );
}
