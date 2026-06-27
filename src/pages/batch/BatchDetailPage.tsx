import { useState } from "react";
import {
  Breadcrumb,
  Button,
  Descriptions,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBatchDetail, unbindRuleDoc } from "../../api/batches";
import { toast } from "sonner";
import { listConfigPackages, type ConfigPackage } from "../../api/configPackages";
import {
  downloadStandardDocUrl,
  type StandardDoc,
} from "../../api/standardDocs";
import { useRouteStore } from "../../store/useRouteStore";
import { batchStatusMeta } from "../../components/batch/cardStatus";
import RuleDocCard from "../../components/batch/RuleDocCard";
import FilePreviewModal from "../../components/FilePreviewModal";
import MaterialLibrary from "../../components/MaterialLibrary";
import BindRuleDocsModal from "../../components/batch/BindRuleDocsModal";
import "../../components/batch/cards.css";

function humanSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const CONFIG_PKG_COLS: ColumnsType<ConfigPackage> = [
  { title: "配置包名称", dataIndex: "title", key: "title" },
  { title: "版本", dataIndex: "version", key: "version", width: 90 },
  { title: "规则数", dataIndex: "rule_count", key: "rule_count", width: 90 },
  {
    title: "覆盖维度",
    key: "dimensions",
    render: (_: unknown, p: ConfigPackage) => (
      <>{p.dimensions.map((d) => <Tag key={d}>{d}</Tag>)}</>
    ),
  },
];

interface Props {
  batchId: number;
  batchTitle: string;
}

export default function BatchDetailPage({ batchId, batchTitle }: Props) {
  const navigate = useRouteStore((s) => s.navigate);
  const [bindOpen, setBindOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null,
  );

  const qc = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["batch-detail", batchId],
    queryFn: () => getBatchDetail(batchId),
  });
  const unbindMut = useMutation({
    mutationFn: (docId: number) => unbindRuleDoc(batchId, docId),
    onSuccess: () => {
      toast.success("已从批次移除");
      qc.invalidateQueries({ queryKey: ["batch-detail", batchId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const configQuery = useQuery({
    queryKey: ["config-packages"],
    queryFn: listConfigPackages,
  });

  if (detailQuery.isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (detailQuery.isError) {
    return <div style={{ padding: 24 }}>批次详情加载失败</div>;
  }

  const detail = detailQuery.data!;
  const statusMeta = batchStatusMeta(detail.status);

  // 客户端按本批次绑定的规则文件 id 过滤配置包
  const ruleDocIds = new Set(detail.rule_docs.map((d) => d.id));
  const filteredConfigs = (configQuery.data ?? []).filter((c) =>
    ruleDocIds.has(c.doc_id),
  );

  function renderRuleDocCard(doc: StandardDoc) {
    return (
      <RuleDocCard
        key={doc.id}
        title={doc.title}
        recognitionStatus={doc.recognition_status}
        segmentCount={doc.segment_count}
        clauseCount={doc.clause_count}
        ruleCount={doc.rule_count}
        sizeText={doc.size_bytes != null ? humanSize(doc.size_bytes) : undefined}
        uploadedAt={doc.created_at}
        actions={
          <Space size="small">
            <Button
              size="small"
              onClick={() =>
                navigate({
                  name: "rule-detail",
                  docId: doc.id,
                  docTitle: doc.title,
                  batchId,
                  batchTitle,
                })
              }
            >
              查看规则
            </Button>
            <Button
              size="small"
              onClick={() =>
                setPreview({
                  url: downloadStandardDocUrl(doc.id),
                  name: doc.file_name,
                })
              }
            >
              原文
            </Button>
            <Popconfirm
              title="从本批次移除该规则文件？"
              description="仅解除与本批次的绑定，规则文件本身及其他批次不受影响。"
              okText="确认移除"
              cancelText="取消"
              onConfirm={() => unbindMut.mutate(doc.id)}
            >
              <Button size="small" danger>
                从批次移除
              </Button>
            </Popconfirm>
          </Space>
        }
      />
    );
  }

  const tabs = [
    {
      key: "rule-docs",
      label: `规则库(${detail.rule_doc_count})`,
      children: (
        <div>
          {detail.rule_docs.length === 0 ? (
            <Typography.Text type="secondary">
              尚未绑定规则文件，点上方『绑定规则集』
            </Typography.Text>
          ) : (
            <div className="batch-grid">
              {detail.rule_docs.map(renderRuleDocCard)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "config-packages",
      label: "配置包",
      children: (
        <div>
          <Typography.Paragraph
            type="secondary"
            style={{ marginBottom: 12 }}
          >
            配置包=本批次绑定规则文件派生的只读规则集
          </Typography.Paragraph>
          {filteredConfigs.length === 0 ? (
            <Typography.Text type="secondary">
              暂无配置包，请先为规则文件抽取审查规则
            </Typography.Text>
          ) : (
            <Table
              rowKey="doc_id"
              size="middle"
              dataSource={filteredConfigs}
              columns={CONFIG_PKG_COLS}
              pagination={false}
            />
          )}
        </div>
      ),
    },
    {
      key: "material-library",
      label: `审查文档库(${detail.material_count})`,
      children: <MaterialLibrary batchId={batchId} />,
    },
  ];

  return (
    <div>
      {/* 面包屑 */}
      <Breadcrumb
        style={{ marginBottom: 14 }}
        items={[
          {
            title: (
              <a onClick={() => navigate({ name: "batch-list" })}>项目批次</a>
            ),
          },
          { title: batchTitle },
        ]}
      />

      {/* 元信息卡 */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          padding: "16px 20px",
          marginBottom: 20,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <Descriptions size="small" column={2}>
          <Descriptions.Item label="批次号">
            {detail.batch_no}
          </Descriptions.Item>
          <Descriptions.Item label="项目类型">
            {detail.project_type_name}
          </Descriptions.Item>
          <Descriptions.Item label="审查阶段">
            {detail.stage_name}
          </Descriptions.Item>
          <Descriptions.Item label="申报期">
            {detail.declare_period ?? "—"}
          </Descriptions.Item>
          <Descriptions.Item label="批次状态">
            <Tag color={statusMeta.color}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: statusMeta.dot,
                  display: "inline-block",
                  marginRight: 4,
                  verticalAlign: "middle",
                }}
              />
              {statusMeta.text}
            </Tag>
          </Descriptions.Item>
        </Descriptions>
        <Button type="primary" onClick={() => setBindOpen(true)}>
          绑定规则集
        </Button>
      </div>

      {/* 三 Tab */}
      <Tabs defaultActiveKey="rule-docs" items={tabs} />

      {/* 绑定规则集弹窗 */}
      <BindRuleDocsModal
        open={bindOpen}
        onClose={() => setBindOpen(false)}
        batchId={batchId}
        boundDocIds={detail.rule_docs.map((d) => d.id)}
      />

      {/* 原文预览弹窗 */}
      <FilePreviewModal
        open={!!preview}
        url={preview?.url ?? null}
        fileName={preview?.name ?? ""}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
