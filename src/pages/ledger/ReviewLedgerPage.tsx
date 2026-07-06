import { useEffect, useState } from "react";
import { Table, Typography, Tag, Button, Modal, List, Space, Input, Empty, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { FileTextOutlined, SearchOutlined } from "@ant-design/icons";
import { listLedger, type LedgerTask } from "../../api/tasks";
import { useReportPreview } from "../../components/useReportPreview";

const STATUS_TAG: Record<string, { t: string; c: string }> = {
  created: { t: "待分发", c: "default" },
  distributed: { t: "已分发", c: "blue" },
  reviewing: { t: "审查中", c: "gold" },
  done: { t: "已完成", c: "green" },
};

export default function ReviewLedgerPage() {
  const [tasks, setTasks] = useState<LedgerTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [cur, setCur] = useState<LedgerTask | null>(null);
  const { openPreview, previewModal } = useReportPreview();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setTasks(await listLedger());
      } catch (e) {
        message.error(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? tasks.filter((t) => t.task_no.toLowerCase().includes(q) || t.task_name.toLowerCase().includes(q))
    : tasks;

  const cols: ColumnsType<LedgerTask> = [
    { title: "编号", dataIndex: "task_no", width: 110 },
    { title: "任务名称", dataIndex: "task_name" },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (s: string) => {
        const m = STATUS_TAG[s] ?? { t: s, c: "default" };
        return <Tag color={m.c}>{m.t}</Tag>;
      },
    },
    { title: "受理人", dataIndex: "assignee_name", width: 120, render: (n: string | null) => n || "—" },
    { title: "已归档报告", width: 100, render: (_, t) => `${t.archived_reports.length} 份` },
    {
      title: "操作",
      width: 120,
      render: (_, t) => (
        <Button size="small" icon={<FileTextOutlined />} onClick={() => setCur(t)}>
          查看报告
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>审查台账</Typography.Title>
      <Typography.Paragraph type="secondary">
        仅展示已终签归档的审查报告，可在线预览、下载。
      </Typography.Paragraph>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="搜索任务编号或名称"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: 320, marginBottom: 16 }}
      />
      {filtered.length === 0 && !loading ? (
        <Empty description="暂无终签归档的报告" />
      ) : (
        <Table rowKey="id" loading={loading} columns={cols} dataSource={filtered} />
      )}

      <Modal
        title={cur ? `已归档报告 · ${cur.task_no} ${cur.task_name}` : "已归档报告"}
        open={!!cur}
        onCancel={() => setCur(null)}
        footer={null}
        width={640}
      >
        {cur && (
          <List
            dataSource={cur.archived_reports}
            renderItem={(r) => (
              <List.Item
                actions={[
                  <Button
                    key="view"
                    size="small"
                    type="link"
                    onClick={() => openPreview(cur.id, r)}
                  >
                    预览 / 下载
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {r.report_name}审查报告
                      <Tag color="green">已终签归档</Tag>
                    </Space>
                  }
                  description={r.file_name || "—"}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
      {previewModal}
    </div>
  );
}
