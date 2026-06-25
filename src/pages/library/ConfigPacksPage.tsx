import PageScaffold from "../../components/PageScaffold";
import ConfigPackageLibrary from "../../components/ConfigPackageLibrary";

export default function ConfigPacksPage() {
  return (
    <PageScaffold title="配置包" subtitle="按规则文件浏览审查配置包（只读）">
      <ConfigPackageLibrary />
    </PageScaffold>
  );
}
