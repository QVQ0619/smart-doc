import { useEffect, useState } from "react";
import { Card, Typography, Button, Space, Tag, message, Row, Col, Divider, Alert, Tooltip } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { useSessionStore, useChat, sessionsApi, buildMessageContent } from "@blade-hq/agent-kit/react";
import { getTask, fetchReportFile, type TaskDetail, type TaskReport } from "../../api/tasks";
import { useReportPreview } from "../../components/useReportPreview";
import { useRouteStore } from "../../store/useRouteStore";
import { useAuthStore } from "../../store/useAuthStore";

// 5 个审查按钮:与报告类型一一对应
const REVIEW_BUTTONS: { type: string; label: string }[] = [
  { type: "comprehensive", label: "综合论证报告审查" },
  { type: "economy", label: "经济性审查" },
  { type: "tech_system", label: "技术体质审查" },
  { type: "system_contribution", label: "体系贡献率审查" },
  { type: "general_quality", label: "通用质量特性审查" },
];

export default function TaskReviewPage({ taskId, taskName }: { taskId: number; taskName: string }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const { openPreview, previewModal } = useReportPreview();
  const navigate = useRouteStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const { send } = useChat(activeSessionId ?? "");

  useEffect(() => {
    getTask(taskId)
      .then(setDetail)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"));
  }, [taskId]);

  const reportByType = (t: string) => detail?.reports.find((r) => r.report_type === t);
  // 只读:项目已分发给他人(管理员查看时)。分发给自己/未分发则可审查。
  const readOnly = detail != null && detail.assignee_id != null && detail.assignee_id !== user?.id;

  // 开始审查:把报告文件推到右侧对话(等同聊天框手动上传到会话工作区),再自动发起审查消息
  async function startReview(label: string, type: string, rep: TaskReport) {
    if (!activeSessionId) {
      message.warning("请先在右侧开始对话");
      return;
    }
    setReviewing(type);
    try {
      const name = rep.file_name || `${rep.report_name}审查报告`;
      const file = await fetchReportFile(taskId, rep.id, name);
      const { uploaded } = await sessionsApi.uploadFiles(activeSessionId, ".", [{ file, name }]);
      if (uploaded.length === 0) throw new Error("文件推送到对话失败");
      send(
        buildMessageContent(
          `请开始「${label}」：待审报告《${name}》已上传到会话工作区，请阅读该文件并依据审查规则开展审查，输出审查意见。（任务：${taskName}）`,
          [{ kind: "file", name, uploadedPath: uploaded[0] }],
        ),
      );
      message.success("报告已推送到右侧对话，审查已发起");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "发起审查失败");
    } finally {
      setReviewing(null);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <Button type="link" style={{ paddingLeft: 0 }} onClick={() => navigate({ name: "my-tasks" })}>
        ← 返回我的任务
      </Button>
      <Typography.Title level={4} style={{ marginTop: 8 }}>
        {taskName}
      </Typography.Title>
      {readOnly && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message={`本项目已分发给「${detail?.assignee_name}」，仅可查看报告；如需自行审查，请先在「受理分发」中撤回。`}
        />
      )}
      <Divider orientation="left">审查项</Divider>
      <Row gutter={[16, 16]}>
        {REVIEW_BUTTONS.map((b) => {
          const rep = reportByType(b.type);
          return (
            <Col span={8} key={b.type}>
              <Card>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Space>
                    <b>{b.label}</b>
                    {rep?.uploaded ? <Tag color="green">报告已上传</Tag> : <Tag>无报告</Tag>}
                  </Space>
                  <Space>
                    <Tooltip
                      title={
                        readOnly
                          ? "已分发给他人，需先撤回才能自行审查"
                          : !rep?.uploaded
                            ? "请先上传报告"
                            : ""
                      }
                    >
                      <Button
                        type="primary"
                        disabled={readOnly || !rep?.uploaded}
                        loading={reviewing === b.type}
                        onClick={() => rep && startReview(b.label, b.type, rep)}
                      >
                        开始审查
                      </Button>
                    </Tooltip>
                    <Button
                      icon={<FileTextOutlined />}
                      disabled={!rep?.uploaded}
                      onClick={() => rep && openPreview(taskId, rep)}
                    >
                      查看原始报告
                    </Button>
                  </Space>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>
      {previewModal}
    </div>
  );
}
