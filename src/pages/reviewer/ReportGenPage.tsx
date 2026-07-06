import { useEffect, useState } from "react";
import { Card, Select, Typography, Space, Button, Tag, message, Row, Col, Empty } from "antd";
import { FileAddOutlined, EditOutlined, SafetyCertificateOutlined, FileTextOutlined } from "@ant-design/icons";
import {
  listTasks, listMyTasks, getTask, reviewStep, openReport,
  type Task, type TaskDetail, type TaskReport,
} from "../../api/tasks";
import { useAuthStore } from "../../store/useAuthStore";

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "待生成", color: "default" },
  generated: { label: "已生成", color: "blue" },
  countersigned: { label: "已会签", color: "gold" },
  archived: { label: "已终签归档", color: "green" },
};

export default function ReportGenPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskId, setTaskId] = useState<number | undefined>();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setTasks(await (isAdmin ? listTasks() : listMyTasks()));
      } catch (e) {
        message.error(e instanceof Error ? e.message : "加载任务失败");
      }
    })();
  }, [isAdmin]);

  async function loadDetail(id: number) {
    try {
      setDetail(await getTask(id));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    }
  }
  useEffect(() => {
    if (taskId) loadDetail(taskId);
    else setDetail(null);
  }, [taskId]);

  async function doStep(r: TaskReport, step: "generate" | "countersign" | "archive") {
    if (!taskId) return;
    setBusy(r.id);
    try {
      await reviewStep(taskId, r.id, step);
      message.success("操作成功");
      loadDetail(taskId);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>审查报告生成</Typography.Title>
      <Typography.Paragraph type="secondary">
        对每个审查项：报告生成 → 会签 → 终签归档。终签归档后进入「审查台账」留存。
      </Typography.Paragraph>
      <Space style={{ marginBottom: 16 }}>
        <span>选择任务：</span>
        <Select
          style={{ width: 380 }}
          placeholder="选择任务（可输入编号或名称搜索）"
          value={taskId}
          onChange={setTaskId}
          showSearch
          optionFilterProp="label"
          options={tasks.map((t) => ({ value: t.id, label: `${t.task_no} · ${t.task_name}` }))}
        />
      </Space>
      {!taskId ? (
        <Empty description="请先选择任务" />
      ) : !detail ? null : (
        <Row gutter={[16, 16]}>
          {detail.reports.map((r) => {
            const meta = STATUS_META[r.review_status] ?? { label: r.review_status, color: "default" };
            return (
              <Col span={8} key={r.id}>
                <Card>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Space>
                      <b>{r.report_name}审查报告</b>
                      <Tag color={meta.color}>{meta.label}</Tag>
                    </Space>
                    <Space wrap>
                      <Button
                        type="primary"
                        icon={<FileAddOutlined />}
                        size="small"
                        loading={busy === r.id}
                        disabled={!r.uploaded || r.review_status !== "pending"}
                        onClick={() => doStep(r, "generate")}
                      >
                        报告生成
                      </Button>
                      <Button
                        icon={<EditOutlined />}
                        size="small"
                        loading={busy === r.id}
                        disabled={r.review_status !== "generated"}
                        onClick={() => doStep(r, "countersign")}
                      >
                        会签
                      </Button>
                      <Button
                        icon={<SafetyCertificateOutlined />}
                        size="small"
                        loading={busy === r.id}
                        disabled={r.review_status !== "countersigned"}
                        onClick={() => doStep(r, "archive")}
                      >
                        终签归档
                      </Button>
                    </Space>
                    <Button
                      type="link"
                      size="small"
                      icon={<FileTextOutlined />}
                      style={{ paddingLeft: 0 }}
                      disabled={!r.uploaded}
                      onClick={() =>
                        openReport(taskId, r.id).catch((e) => message.error(e instanceof Error ? e.message : "打开失败"))
                      }
                    >
                      查看原始报告
                    </Button>
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
}
