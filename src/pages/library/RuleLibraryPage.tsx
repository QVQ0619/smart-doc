import PageScaffold from "../../components/PageScaffold";
import StandardDocLibrary from "../../components/StandardDocLibrary";

export default function RuleLibraryPage() {
  return (
    <PageScaffold title="规则库" subtitle="规则文件（政策/指南）的上传与管理">
      <StandardDocLibrary />
    </PageScaffold>
  );
}
