import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import { listMaterialPackages, listMaterialSegments,
         type MaterialPackage, type MaterialFileBrief, type MaterialSegment } from "../api/materials";

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
  return (
    <Table rowKey="material_file_id" size="small" dataSource={pkg.files} columns={FILE_COLS}
      pagination={false}
      expandable={{ expandedRowRender: (f) => <FileSegments id={f.material_file_id} /> }} />
  );
}

const PKG_COLS: ColumnsType<MaterialPackage> = [
  { title: "审查包", key: "pkg", render: (_: unknown, p) => `审查包 #${p.package_id}` },
  { title: "材料数", dataIndex: "file_count", key: "file_count", width: 100 },
];

export default function MaterialLibrary() {
  const q = useQuery({ queryKey: ["material-packages"], queryFn: listMaterialPackages });
  if (q.isError) return <div>审查材料加载失败</div>;
  return (
    <Table rowKey="package_id" size="middle" loading={q.isLoading} dataSource={q.data ?? []}
      columns={PKG_COLS} pagination={false}
      locale={{ emptyText: `暂无审查材料，请在聊天中上传申请材料并说“这是待审查的申请材料”` }}
      expandable={{ expandedRowRender: (p) => <PackageFiles pkg={p} /> }} />
  );
}
