import { useState } from "react";
import { Table, Tag, Tabs } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import { listMaterialPackages, listMaterialSegments, getPackageStructured, downloadMaterialFileUrl,
         type MaterialPackage, type MaterialFileBrief, type MaterialSegment } from "../api/materials";
import { listBatchPackages } from "../api/batches";
import FilePreviewModal from "./FilePreviewModal";

const STATUS_LABEL: Record<string, string> = {
  pending: "待识别", processing: "识别中", done: "已识别", failed: "识别失败",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "default", processing: "processing", done: "success", failed: "error",
};
// material_category 后端 chk_mf_cat 白名单 → 中文
const CATEGORY_LABEL: Record<string, string> = {
  application_form: "申请书", budget: "预算表", cv: "个人简历",
  research_plan: "研究方案", attachment: "附件",
};

function segProvenance(s: MaterialSegment): string {
  const loc = s.locator ?? {};
  const raw = (loc["block_index"] ?? loc["para_index"]) as number | undefined;
  const segPart = typeof raw === "number" ? `第${raw + 1}段` : "";
  if (s.page_no != null) return `第${s.page_no}页${segPart}`;
  return segPart || "—";
}

const SEG_COLS: ColumnsType<MaterialSegment> = [
  { title: "类型", dataIndex: "segment_type", key: "segment_type", width: 80 },
  { title: "出处", key: "prov", width: 160, render: (_: unknown, s) => segProvenance(s) },
  { title: "内容", dataIndex: "content_text", key: "content_text" },
];

function FileSegments({ id }: { id: number }) {
  const q = useQuery({ queryKey: ["material-segments", id], queryFn: () => listMaterialSegments(id) });
  if (q.isLoading) return <span>加载中…</span>;
  if (q.isError) return <span>段落加载失败</span>;
  const data = q.data ?? [];
  if (!data.length) return <span>暂无识别段落</span>;
  return <Table rowKey="id" size="small" dataSource={data} columns={SEG_COLS} pagination={false} />;
}

const FILE_COLS: ColumnsType<MaterialFileBrief> = [
  { title: "文件名", dataIndex: "file_name", key: "file_name" },
  { title: "类别", key: "material_category", width: 120,
    render: (_: unknown, f) => CATEGORY_LABEL[f.material_category] ?? f.material_category },
  { title: "识别状态", key: "status", width: 110,
    render: (_: unknown, f) => <Tag color={STATUS_COLOR[f.recognition_status] ?? "default"}>
      {STATUS_LABEL[f.recognition_status] ?? f.recognition_status}</Tag> },
  { title: "段落数", dataIndex: "segment_count", key: "segment_count", width: 90 },
];

function PackageFiles({ pkg }: { pkg: MaterialPackage }) {
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const viewCol: ColumnsType<MaterialFileBrief>[number] = {
    title: "原文件", key: "view", width: 110,
    render: (_: unknown, f: MaterialFileBrief) => (
      <a style={{ cursor: "pointer" }}
         onClick={() => setPreview({ url: downloadMaterialFileUrl(f.material_file_id), name: f.file_name })}>
        查看原文件
      </a>
    ),
  };

  const columns: ColumnsType<MaterialFileBrief> = [...FILE_COLS, viewCol];

  return (
    <>
      <Table rowKey="material_file_id" size="small" dataSource={pkg.files} columns={columns}
        pagination={false}
        expandable={{ expandedRowRender: (f) => <FileSegments id={f.material_file_id} /> }} />
      <FilePreviewModal
        open={!!preview}
        url={preview?.url ?? null}
        fileName={preview?.name ?? ""}
        onClose={() => setPreview(null)}
      />
    </>
  );
}

const MEMBER_COLS = [
  { title: "角色", key: "member_role", width: 90,
    render: (_: unknown, m: { member_role: string }) => (m.member_role === "applicant" ? "申请人" : "参与人") },
  { title: "姓名", dataIndex: "name", key: "name" },
  { title: "职称", dataIndex: "title", key: "title", width: 90 },
  { title: "单位", dataIndex: "unit_name", key: "unit_name" },
];
const COOP_COLS = [
  { title: "类型", dataIndex: "coop_type", key: "coop_type", width: 100 },
  { title: "单位", dataIndex: "unit_name", key: "unit_name" },
  { title: "分工", dataIndex: "task_desc", key: "task_desc" },
];
const BUDGET_COLS = [
  { title: "科目", dataIndex: "category", key: "category", width: 100 },
  { title: "明细", dataIndex: "item_name", key: "item_name" },
  { title: "金额(万元)", dataIndex: "amount", key: "amount", width: 110 },
];
const ATTACH_COLS = [
  { title: "附件类型", dataIndex: "attachment_type", key: "attachment_type" },
  { title: "是否提交", key: "is_present", width: 100,
    render: (_: unknown, a: { is_present: boolean }) => (a.is_present ? "是" : "否") },
];
const FIELD_COLS = [
  { title: "字段", dataIndex: "field_code", key: "field_code", width: 140 },
  { title: "值", dataIndex: "field_value", key: "field_value" },
  { title: "状态", dataIndex: "extraction_status", key: "extraction_status", width: 90 },
];

function PackageStructuredView({ packageId }: { packageId: number }) {
  const q = useQuery({ queryKey: ["pkg-structured", packageId],
                       queryFn: () => getPackageStructured(packageId) });
  if (q.isLoading) return <span>加载中…</span>;
  if (q.isError) return <span>结构化数据加载失败</span>;
  const d = q.data;
  if (!d) return <span>尚未结构化抽取</span>;
  const empty = !d.members.length && !d.coop_units.length && !d.budget_items.length
    && !d.attachments.length && !d.fields.length;
  if (empty) return <span>尚未结构化抽取（可在聊天中说"结构化抽取这份申请材料"）</span>;
  const t = (rows: unknown[], cols: unknown[]) =>
    <Table rowKey="id" size="small" dataSource={rows as never} columns={cols as never} pagination={false} />;
  return (
    <Tabs size="small" items={[
      { key: "m", label: `成员(${d.members.length})`, children: t(d.members, MEMBER_COLS) },
      { key: "c", label: `合作单位(${d.coop_units.length})`, children: t(d.coop_units, COOP_COLS) },
      { key: "b", label: `预算(${d.budget_items.length})`, children: t(d.budget_items, BUDGET_COLS) },
      { key: "a", label: `附件(${d.attachments.length})`, children: t(d.attachments, ATTACH_COLS) },
      { key: "f", label: `标量字段(${d.fields.length})`, children: t(d.fields, FIELD_COLS) },
    ]} />
  );
}

function PackageDetail({ pkg }: { pkg: MaterialPackage }) {
  return (
    <div>
      <PackageFiles pkg={pkg} />
      <div style={{ marginTop: 12, fontWeight: 600 }}>结构化抽取</div>
      <PackageStructuredView packageId={pkg.package_id} />
    </div>
  );
}

const PKG_COLS: ColumnsType<MaterialPackage> = [
  { title: "审查包", key: "pkg", render: (_: unknown, p) => `审查包 #${p.package_id}` },
  { title: "材料数", dataIndex: "file_count", key: "file_count", width: 100 },
];

export default function MaterialLibrary({ batchId }: { batchId?: number } = {}) {
  const q = useQuery({
    queryKey: batchId != null ? ["material-packages", batchId] : ["material-packages"],
    queryFn: () => (batchId != null ? listBatchPackages(batchId) : listMaterialPackages()),
  });
  if (q.isError) return <div>审查材料加载失败</div>;
  return (
    <Table rowKey="package_id" size="middle" loading={q.isLoading} dataSource={q.data ?? []}
      columns={PKG_COLS} pagination={false}
      locale={{ emptyText: `暂无审查材料，请在聊天中上传申请材料并说"这是待审查的申请材料"` }}
      expandable={{ expandedRowRender: (p) => <PackageDetail pkg={p} /> }} />
  );
}
