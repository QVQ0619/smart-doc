import { useMemo, useState } from "react";
import { message, Button } from "antd";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPackageReview, postReviewAction, exportPackageReport,
         type ReviewCheck, type PackageReview } from "../../api/review";
import { getPackageSegments, getPackageStructured } from "../../api/materials";
import { type ResultKey } from "./review-constants";
import { groupByDimension, countChecks, resultOf, type DimensionGroupData } from "./review-grouping";
import VerdictBanner from "./VerdictBanner";
import StatCards from "./StatCards";
import DimensionGroup from "./DimensionGroup";
import EvidenceDrawer from "./EvidenceDrawer";
import OverruleDrawer from "./OverruleDrawer";

export default function ReviewWorkbench({ packageId }: { packageId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pkg-review", packageId], queryFn: () => getPackageReview(packageId) });
  const [filter, setFilter] = useState<ResultKey | null>(null);
  const [overrule, setOverrule] = useState<ReviewCheck | null>(null);
  const [evidence, setEvidence] = useState<ReviewCheck | null>(null);
  const [exporting, setExporting] = useState(false);
  const segQ = useQuery({ queryKey: ["pkg-segments", packageId], queryFn: () => getPackageSegments(packageId), enabled: evidence !== null });
  const structQ = useQuery({ queryKey: ["pkg-structured", packageId], queryFn: () => getPackageStructured(packageId), enabled: evidence !== null });
  const mut = useMutation({
    mutationFn: (v: { id: number; body: Parameters<typeof postReviewAction>[1] }) =>
      postReviewAction(v.id, v.body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["pkg-review", packageId] }); },
    onError: (e: Error) => { message.error(e.message.includes("409") ? "数据已变更，请刷新后重试" : e.message); },
  });

  const data = q.data as PackageReview | undefined;
  const checks = data?.checks ?? [];
  const counts = useMemo(() => countChecks(checks), [checks]);
  const groups = useMemo(() => groupByDimension(checks), [checks]);
  const reviewed = checks.filter((c) => c.status !== "open").length;

  if (q.isLoading) return <span>加载中…</span>;
  if (q.isError) return <span>审查结果加载失败</span>;
  if (!data || data.round === null)
    return <span>该申报包尚未形式审查（可在聊天中说"形式审查这个申报包"）</span>;

  const onExport = async () => {
    setExporting(true);
    try {
      await exportPackageReport(packageId);
    } catch (e) {
      message.error("报告导出失败：" + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const confirm = (c: ReviewCheck) => mut.mutate({ id: c.round_check_id, body: { action: "confirm", version: c.version } });
  const confirmGroup = (g: DimensionGroupData) =>
    g.checks.filter((c) => c.status === "open" && resultOf(c) === "pass")
      .forEach(confirm);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <VerdictBanner conclusion={data.round.conclusion} counts={counts} reviewed={reviewed} total={checks.length} />
        </div>
        <Button type="primary" loading={exporting} onClick={onExport}>导出报告</Button>
      </div>
      <StatCards counts={counts} active={filter} onToggle={(k) => setFilter(filter === k ? null : k)} />
      {groups.filter((g) => !filter || g.checks.some((c) => resultOf(c) === filter)).map((g) => (
        <DimensionGroup key={g.code} group={g} filter={filter}
          onConfirm={confirm} onEvidence={setEvidence}
          onOverrule={setOverrule}
          onConfirmGroup={confirmGroup} />
      ))}
      <EvidenceDrawer check={evidence} segments={segQ.data} structured={structQ.data}
        onClose={() => setEvidence(null)} />
      <OverruleDrawer check={overrule} onClose={() => setOverrule(null)}
        onSubmit={(final_result, remark) => {
          if (overrule) mut.mutate({ id: overrule.round_check_id,
            body: { action: "overrule", final_result, remark, version: overrule.version } });
          setOverrule(null);
        }} />
    </div>
  );
}
