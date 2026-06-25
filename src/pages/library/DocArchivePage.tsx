import PageScaffold from "../../components/PageScaffold";
import MaterialLibrary from "../../components/MaterialLibrary";

export default function DocArchivePage() {
  return (
    <PageScaffold title="审查文档库" subtitle="申请材料的上传与识别（只读，上传走聊天）">
      <MaterialLibrary />
    </PageScaffold>
  );
}
