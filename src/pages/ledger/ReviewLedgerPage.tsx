import { useEffect, useState } from "react";
import { Table, Typography, Tag, Button, Modal, List, Space, Spin, Input, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { FileTextOutlined, SearchOutlined } from "@ant-design/icons";
import {
  listTasks, listMyTasks, getTask, openReport, type Task, type TaskDetail,
} from "../../api/tasks";
import { useAuthStore } from "../../store/useAuthStore";

const STATUS_TAG: Record<string, { t: string; c: string }> = {
  created: { t: "待分发", c: "default" },
  distributed: { t: "已分发", c: "blue" },
  reviewing: { t: "审查中", c: "gold" },
  done: { t: "已完成", c: "green" },
};

export default function ReviewLedgerPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setTasks(await (isAdmin ? listTasks() : listMyTasks()));
      } catch (e) {
        message.error(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin]);

  async function openDetail(id: number) {
    setDetailOpen(true);
    setDetail(null);
    try {
      setDetail(await getTask(id));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    }
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? tasks.filter((t) => t.task_no.toLowerCase().includes(q) || t.task_name.toLowerCase().includes(q))
    : tasks;

  const cols: ColumnsType<Task> = [
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
    { title: "报告", width: 90, render: (_, t) => `${t.report_uploaded}/${t.report_total}` },
    {
      title: "操作",
      width: 120,
      render: (_, t) => (
        <Button size="small" icon={<FileTextOutlined />} onClick={() => openDetail(t.id)}>
          查看报告
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>审查台账</Typography.Title>
      <Typography.Paragraph type="secondary">
        任务与报告归档一览，可在线预览、下载报告。（终签归档的任务将在此长期留存）
      </Typography.Paragraph>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="搜索任务编号或名称"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: 320, marginBottom: 16 }}
      />
      <Table rowKey="id" loading={loading} columns={cols} dataSource={filtered} />

      <Modal
        title={detail ? `报告 · ${detail.task_no} ${detail.task_name}` : "报告"}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={640}
      >
        {!detail ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <Spin />
          </div>
        ) : (
          <List
            dataSource={detail.reports}
            renderItem={(r) => (
              <List.Item
                actions={[
                  <Button
                    key="view"
                    size="small"
                    type="link"
                    disabled={!r.uploaded}
                    onClick={() =>
                      openReport(detail.id, r.id).catch((e) =>
                        message.error(e instanceof Error ? e.message : "打开失败"),
                      )
                    }
                  >
                    预览 / 下载
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {r.report_name}
                      {r.uploaded ? <Tag color="green">已上传</Tag> : <Tag>未上传</Tag>}
                    </Space>
                  }
                  description={r.file_name || "尚未上传文件"}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  );
}
