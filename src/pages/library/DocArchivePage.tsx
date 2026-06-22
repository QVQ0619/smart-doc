import PageScaffold from "../../components/PageScaffold";
import EmptyState from "../../components/EmptyState";

export default function DocArchivePage() {
  return (
    <PageScaffold title="审查文档库" subtitle="申请材料的上传与管理">
      <EmptyState description="申请材料需关联申报批次/项目，待该流程上线后接入" />
    </PageScaffold>
  );
}
