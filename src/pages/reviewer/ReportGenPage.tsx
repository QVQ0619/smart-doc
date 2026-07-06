import { useEffect, useState } from "react";
import { Card, Select, Typography, Space, Button, Tooltip, message, Row, Col, Empty } from "antd";
import { FileAddOutlined, EditOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { listTasks, listMyTasks, type Task } from "../../api/tasks";
import { useAuthStore } from "../../store/useAuthStore";

// 六个报告项:5 审查项 + 1 综合总报告。每项:报告生成 → 会签;整任务完成后终签归档。
const REPORT_ITEMS = [
  "综合论证报告审查报告",
  "经济性审查报告",
  "技术体质审查报告",
  "体系贡献率审查报告",
  "通用质量特性审查报告",
  "立项审查综合报告",
];

export default function ReportGenPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskId, setTaskId] = useState<number | undefined>();

  useEffect(() => {
    (async () => {
      try {
        setTasks(await (isAdmin ? listTasks() : listMyTasks()));
      } catch (e) {
        message.error(e instanceof Error ? e.message : "加载任务失败");
      }
    })();
  }, [isAdmin]);

  const todo = () => message.info("该功能待实现");

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>审查报告生成</Typography.Title>
      <Typography.Paragraph type="secondary">
        对每个审查项：报告生成 → 会签；待整个任务全部审查完成后，统一终签归档。
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
      ) : (
        <Row gutter={[16, 16]}>
          {REPORT_ITEMS.map((name) => (
            <Col span={8} key={name}>
              <Card>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <b>{name}</b>
                  <Space wrap>
                    <Button type="primary" icon={<FileAddOutlined />} onClick={todo}>
                      报告生成
                    </Button>
                    <Button icon={<EditOutlined />} onClick={todo}>
                      会签
                    </Button>
                    <Tooltip title="整个任务全部审查完成后统一终签归档">
                      <Button icon={<SafetyCertificateOutlined />} disabled>
                        终签归档
                      </Button>
                    </Tooltip>
                  </Space>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
