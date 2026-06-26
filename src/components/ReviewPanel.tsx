import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import { listMaterialPackages, type MaterialPackage } from "../api/materials";
import ReviewWorkbench from "./review/ReviewWorkbench";

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
      expandable={{ expandedRowRender: (p) => <ReviewWorkbench packageId={p.package_id} /> }} />
  );
}
