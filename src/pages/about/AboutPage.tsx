import PageScaffold from "../../components/PageScaffold";
import EmptyState from "../../components/EmptyState";

export default function AboutPage() {
  return (
    <PageScaffold title="关于流程" subtitle="立项审查流程说明">
      <EmptyState description="流程说明待补充" />
    </PageScaffold>
  );
}
