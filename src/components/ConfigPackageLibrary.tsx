import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import { listRules, type Rule } from "../api/standardDocs";
import { listConfigPackages, type ConfigPackage } from "../api/configPackages";

const DECISION_LABEL: Record<string, string> = { hard: "硬性", verify: "需核验", soft: "建议" };
const DISPOSITION_LABEL: Record<string, string> = { reject: "驳回", fix: "补正", review: "复核" };
const BINDING_LABEL: Record<string, string> = { common: "通用", parameterized: "参数化", specific: "特定" };

function ruleProvenance(r: Rule): string {
  const loc = r.locator ?? {};
  const raw = loc["block_index"] ?? loc["para_index"];
  const segPart = typeof raw === "number" ? `第${raw + 1}段` : "";
  if (r.page_no != null) return `第${r.page_no}页${segPart}`;
  return segPart || "—";
}

const RULE_COLS: ColumnsType<Rule> = [
  { title: "规则名", dataIndex: "name", key: "name" },
  { title: "维度", dataIndex: "dimension_name", key: "dimension_name", width: 90 },
  { title: "判定", key: "decision", width: 90,
    render: (_: unknown, r: Rule) => <Tag>{DECISION_LABEL[r.decision_type] ?? r.decision_type}</Tag> },
  { title: "处置", key: "disposition", width: 90,
    render: (_: unknown, r: Rule) => <Tag>{DISPOSITION_LABEL[r.disposition] ?? r.disposition}</Tag> },
  { title: "绑定", key: "binding", width: 90,
    render: (_: unknown, r: Rule) => <Tag>{BINDING_LABEL[r.binding_class] ?? r.binding_class}</Tag> },
  { title: "出处", key: "prov", width: 160, render: (_: unknown, r: Rule) => ruleProvenance(r) },
];

// 展开区：只读列出该包(=该文档)的全部规则，复用现成 listRules
function PackageRules({ docId }: { docId: number }) {
  const q = useQuery({ queryKey: ["config-package-rules", docId], queryFn: () => listRules(docId) });
  if (q.isLoading) return <span>加载中…</span>;
  if (q.isError) return <span>规则加载失败</span>;
  const data = q.data ?? [];
  if (!data.length) return <span>该配置包暂无规则</span>;
  return <Table rowKey="id" size="small" dataSource={data} columns={RULE_COLS} pagination={false} />;
}

const PACKAGE_COLS: ColumnsType<ConfigPackage> = [
  { title: "配置包名称", dataIndex: "title", key: "title" },
  { title: "关联文件编码", dataIndex: "doc_code", key: "doc_code", width: 180 },
  { title: "版本", dataIndex: "version", key: "version", width: 90 },
  { title: "规则数", dataIndex: "rule_count", key: "rule_count", width: 90 },
  {
    title: "覆盖维度", key: "dimensions",
    render: (_: unknown, p: ConfigPackage) => <>{p.dimensions.map((d) => <Tag key={d}>{d}</Tag>)}</>,
  },
];

export default function ConfigPackageLibrary() {
  const listQuery = useQuery({ queryKey: ["config-packages"], queryFn: listConfigPackages });
  if (listQuery.isError) return <div>配置包加载失败</div>;
  return (
    <Table
      rowKey="doc_id"
      size="middle"
      loading={listQuery.isLoading}
      dataSource={listQuery.data ?? []}
      columns={PACKAGE_COLS}
      pagination={false}
      locale={{ emptyText: "暂无配置包，请先在规则库中为规则文件抽取审查规则" }}
      expandable={{ expandedRowRender: (p: ConfigPackage) => <PackageRules docId={p.doc_id} /> }}
    />
  );
}
