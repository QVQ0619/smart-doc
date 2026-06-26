import { useMemo, useState } from "react";
import { Modal, Select, Input, message } from "antd";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPackageReview, postReviewAction,
         type ReviewCheck, type PackageReview } from "../../api/review";
import { RESULT, type ResultKey } from "./review-constants";
import { groupByDimension, countChecks, type DimensionGroupData } from "./review-grouping";
import VerdictBanner from "./VerdictBanner";
import StatCards from "./StatCards";
import DimensionGroup from "./DimensionGroup";

const RESULT_OPTIONS = ["pass", "fail", "need_review", "not_applicable"]
  .map((v) => ({ value: v, label: RESULT[v].label }));

export default function ReviewWorkbench({ packageId }: { packageId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pkg-review", packageId], queryFn: () => getPackageReview(packageId) });
  const [filter, setFilter] = useState<ResultKey | null>(null);
  const [overrule, setOverrule] = useState<ReviewCheck | null>(null);
  const [ovResult, setOvResult] = useState("pass");
  const [ovRemark, setOvRemark] = useState("");
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

  const confirm = (c: ReviewCheck) => mut.mutate({ id: c.round_check_id, body: { action: "confirm", version: c.version } });
  const confirmGroup = (g: DimensionGroupData) =>
    g.checks.filter((c) => c.status === "open" && (c.final_result ?? c.effective_result ?? c.initial_result) === "pass")
      .forEach(confirm);
  const openEvidence = () => message.info("出处抽屉将在 P1 接入");

  return (
    <div>
      <VerdictBanner conclusion={data.round.conclusion} counts={counts} reviewed={reviewed} total={checks.length} />
      <StatCards counts={counts} active={filter} onToggle={(k) => setFilter(filter === k ? null : k)} />
      {groups.map((g) => (
        <DimensionGroup key={g.code} group={g} filter={filter}
          onConfirm={confirm} onEvidence={openEvidence}
          onOverrule={(c) => { setOverrule(c); setOvResult("pass"); setOvRemark(""); }}
          onConfirmGroup={confirmGroup} />
      ))}
      <Modal title="人工改判" open={overrule !== null} onCancel={() => setOverrule(null)}
        onOk={() => {
          if (overrule) mut.mutate({ id: overrule.round_check_id,
            body: { action: "overrule", final_result: ovResult, remark: ovRemark, version: overrule.version } });
          setOverrule(null);
        }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Select value={ovResult} onChange={setOvResult} options={RESULT_OPTIONS} />
          <Input.TextArea value={ovRemark} onChange={(e) => setOvRemark(e.target.value)} placeholder="复核意见" rows={2} />
        </div>
      </Modal>
    </div>
  );
}
