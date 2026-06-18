import PageScaffold from "../../components/PageScaffold";
import EmptyState from "../../components/EmptyState";

export default function NewReviewPage() {
  return (
    <PageScaffold title="新建审查" subtitle="上传立项材料、选择规则与配置、发起审查">
      <EmptyState />
    </PageScaffold>
  );
}
