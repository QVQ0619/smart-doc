import PageScaffold from "../../components/PageScaffold";
import ReviewPanel from "../../components/ReviewPanel";

export default function ReviewTasksPage() {
  return (
    <PageScaffold title="形式审查" subtitle="按 hard 规则逐条核对申报包，机审结论与人工复核">
      <ReviewPanel />
    </PageScaffold>
  );
}
