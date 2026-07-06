import { useEffect, useState } from "react";
import { Card, Typography, Button, Space, Tag, message, Row, Col, Divider, Alert, Tooltip } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { getTask, openReport, type TaskDetail } from "../../api/tasks";
import { useRouteStore } from "../../store/useRouteStore";
import { useAuthStore } from "../../store/useAuthStore";

// 5 个审查按钮:与报告类型一一对应(本期占位,内部逻辑由后续实现)
const REVIEW_BUTTONS: { type: string; label: string }[] = [
  { type: "comprehensive", label: "综合论证报告审查" },
  { type: "economy", label: "经济性审查" },
  { type: "tech_system", label: "技术体质审查" },
  { type: "system_contribution", label: "体系贡献率审查" },
  { type: "general_quality", label: "通用质量特性审查" },
];

export default function TaskReviewPage({ taskId, taskName }: { taskId: number; taskName: string }) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const navigate = useRouteStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    getTask(taskId)
      .then(setDetail)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"));
  }, [taskId]);

  const reportByType = (t: string) => detail?.reports.find((r) => r.report_type === t);
  // 只读:项目已分发给他人(管理员查看时)。分发给自己/未分发则可审查。
  const readOnly = detail != null && detail.assignee_id != null && detail.assignee_id !== user?.id;

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
                    <Tooltip title={readOnly ? "已分发给他人，需先撤回才能自行审查" : ""}>
                      <Button
                        type="primary"
                        disabled={readOnly}
                        onClick={() => message.info("该审查功能待实现")}
                      >
                        开始审查
                      </Button>
                    </Tooltip>
                    <Button
                      icon={<FileTextOutlined />}
                      disabled={!rep?.uploaded}
                      onClick={() =>
                        rep && openReport(taskId, rep.id).catch((e) => message.error(e instanceof Error ? e.message : "打开失败"))
                      }
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
    </div>
  );
}
