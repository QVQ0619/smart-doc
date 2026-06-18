import PageScaffold from "../../components/PageScaffold";
import EmptyState from "../../components/EmptyState";

export default function HomePage() {
  return (
    <PageScaffold title="工作台" subtitle="概览统计、最近审查与快捷入口">
      <EmptyState />
    </PageScaffold>
  );
}
