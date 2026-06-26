import { useState } from "react";
import { Table, Tag, Button, Modal, Select, Input, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listMaterialPackages, type MaterialPackage } from "../api/materials";
import { getPackageReview, postReviewAction,
         type ReviewCheck, type PackageReview } from "../api/review";

const CONCLUSION: Record<string, { label: string; color: string }> = {
  reject: { label: "建议不予立项", color: "error" },
  fix: { label: "需整改", color: "warning" },
  accept: { label: "通过", color: "success" },
  pending: { label: "待定", color: "default" },
};
const RESULT: Record<string, { label: string; color: string }> = {
  pass: { label: "通过", color: "success" }, fail: { label: "不通过", color: "error" },
  need_review: { label: "待复核", color: "warning" }, not_applicable: { label: "不适用", color: "default" },
  pending: { label: "待判", color: "default" }, error: { label: "错误", color: "error" },
};
const RESULT_OPTIONS = ["pass", "fail", "need_review", "not_applicable"].map((v) => ({ value: v, label: RESULT[v].label }));

function evidenceText(c: ReviewCheck): string {
  if (!c.evidence.length) return "—";
  return c.evidence.map((e) =>
    e.segment_id != null ? `段落#${e.segment_id}` :
    e.field_code != null ? `字段:${e.field_code}` :
    e.budget_item_id != null ? `预算#${e.budget_item_id}` : "—").join("、");
}

function PackageReviewView({ packageId }: { packageId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pkg-review", packageId], queryFn: () => getPackageReview(packageId) });
  const [overrule, setOverrule] = useState<ReviewCheck | null>(null);
  const [ovResult, setOvResult] = useState("pass");
  const [ovRemark, setOvRemark] = useState("");
  const mut = useMutation({
    mutationFn: (v: { id: number; body: Parameters<typeof postReviewAction>[1] }) =>
      postReviewAction(v.id, v.body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["pkg-review", packageId] }); },
    onError: (e: Error) => { message.error(e.message.includes("409") ? "数据已变更，请刷新后重试" : e.message); },
  });
  if (q.isLoading) return <span>加载中…</span>;
  if (q.isError) return <span>审查结果加载失败</span>;
  const data = q.data as PackageReview | undefined;
  if (!data || data.round === null) return <span>该申报包尚未形式审查（可在聊天中说“形式审查这个申报包”）</span>;
  const cc = CONCLUSION[data.round.conclusion] ?? { label: data.round.conclusion, color: "default" };

  const cols: ColumnsType<ReviewCheck> = [
    { title: "规则", dataIndex: "name", key: "name" },
    { title: "维度", dataIndex: "dimension_code", key: "dim", width: 120 },
    { title: "初判", key: "ir", width: 90,
      render: (_: unknown, c) => <Tag color={(RESULT[c.initial_result] ?? {}).color ?? "default"}>
        {(RESULT[c.initial_result] ?? {}).label ?? c.initial_result}</Tag> },
    { title: "终判", key: "fr", width: 90,
      render: (_: unknown, c) => c.final_result
        ? <Tag color={(RESULT[c.final_result] ?? {}).color ?? "default"}>{(RESULT[c.final_result] ?? {}).label ?? c.final_result}</Tag>
        : <span>—</span> },
    { title: "建议", dataIndex: "suggestion", key: "sug" },
    { title: "出处", key: "ev", width: 140, render: (_: unknown, c) => evidenceText(c) },
    { title: "复核", key: "act", width: 150, render: (_: unknown, c) => (
      <>
        <Button size="small" autoInsertSpace={false} onClick={() => mut.mutate({ id: c.round_check_id, body: { action: "confirm", version: c.version } })}>确认</Button>
        <Button size="small" type="link" onClick={() => { setOverrule(c); setOvResult("pass"); setOvRemark(""); }}>改判</Button>
      </>
    ) },
  ];

  return (
    <div>
      <div style={{ marginBottom: 8 }}>本轮结论：<Tag color={cc.color}>{cc.label}</Tag></div>
      <Table rowKey="round_check_id" size="small" dataSource={data.checks} columns={cols} pagination={false} />
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

const PKG_COLS: ColumnsType<MaterialPackage> = [
  { title: "审查包", key: "pkg", render: (_: unknown, p) => `审查包 #${p.package_id}` },
  { title: "材料数", dataIndex: "file_count", key: "file_count", width: 100 },
];

export default function ReviewPanel() {
  const q = useQuery({ queryKey: ["material-packages"], queryFn: listMaterialPackages });
  if (q.isError) return <div>审查包加载失败</div>;
  return (
    <Table rowKey="package_id" size="middle" loading={q.isLoading} dataSource={q.data ?? []}
      columns={PKG_COLS} pagination={false}
      locale={{ emptyText: "暂无可审查的申报包，请先在聊天中上传并结构化抽取申请材料" }}
      expandable={{ expandedRowRender: (p) => <PackageReviewView packageId={p.package_id} /> }} />
  );
}
