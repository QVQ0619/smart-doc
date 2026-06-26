import { useState } from "react";
import { Button, Card, Input, Spin, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import BatchCard from "../../components/batch/BatchCard";
import CreateBatchModal from "../../components/batch/CreateBatchModal";
import { listBatches } from "../../api/batches";
import { useRouteStore } from "../../store/useRouteStore";
import "../../components/batch/cards.css";

const { Title } = Typography;

export default function BatchListPage() {
  const [searchText, setSearchText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useRouteStore((s) => s.navigate);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["batches"],
    queryFn: listBatches,
  });

  const filtered = (data ?? []).filter((b) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return (
      b.batch_no.toLowerCase().includes(q) ||
      (b.declare_period ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div data-testid="batch-list-page" style={{ padding: "24px" }}>
      {/* 顶部：标题 + 工具栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          项目批次
        </Title>
        <div style={{ display: "flex", gap: 8 }}>
          <Input.Search
            placeholder="搜索批次号 / 申报期"
            allowClear
            style={{ width: 220 }}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={(v) => setSearchText(v)}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建批次
          </Button>
        </div>
      </div>

      {/* 加载态 */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" />
        </div>
      )}

      {/* 错误态 */}
      {isError && (
        <div style={{ color: "#ff4d4f", padding: 24 }}>批次加载失败</div>
      )}

      {/* 内容 */}
      {!isLoading && !isError && (
        <>
          {filtered.length === 0 && !searchText && (
            <div style={{ color: "#8c8c8c", padding: "24px 0" }}>
              暂无批次，点右上新建
            </div>
          )}

          <div className="batch-grid">
            {filtered.map((b) => (
              <BatchCard
                key={b.id}
                title={b.batch_no}
                batchNo={b.batch_no}
                status={b.status}
                projectTypeName={b.project_type_name}
                stageName={b.stage_name}
                materialCount={b.material_count}
                ruleDocCount={b.rule_doc_count}
                ruleCount={b.rule_count}
                declarePeriod={b.declare_period}
                onClick={() =>
                  navigate({
                    name: "batch-detail",
                    batchId: b.id,
                    batchTitle: b.batch_no,
                  })
                }
                actions={
                  <Button
                    type="link"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate({
                        name: "batch-detail",
                        batchId: b.id,
                        batchTitle: b.batch_no,
                      });
                    }}
                  >
                    进入批次
                  </Button>
                }
              />
            ))}

            {/* 虚线占位卡：点击打开新建弹窗 */}
            <Card
              style={{
                border: "2px dashed #d9d9d9",
                cursor: "pointer",
                minHeight: 120,
              }}
              styles={{
                body: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  minHeight: 120,
                  padding: 24,
                },
              }}
              onClick={() => setCreateOpen(true)}
            >
              <div style={{ textAlign: "center", color: "#8c8c8c" }}>
                <PlusOutlined style={{ fontSize: 24, marginBottom: 8, display: "block" }} />
                <div>新建批次</div>
              </div>
            </Card>
          </div>
        </>
      )}

      <CreateBatchModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
