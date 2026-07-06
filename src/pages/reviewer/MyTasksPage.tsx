import { useEffect, useState } from "react";
import { List, Card, Typography, Tag, Button, message, Empty, Space } from "antd";
import { listMyTasks, listTasks, type Task } from "../../api/tasks";
import { useRouteStore } from "../../store/useRouteStore";
import { useAuthStore } from "../../store/useAuthStore";

export default function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useRouteStore((s) => s.navigate);
  const isAdmin = useAuthStore((s) => s.isAdmin);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // 管理员看所有项目;评审专家看分发给自己的
        setTasks(await (isAdmin ? listTasks() : listMyTasks()));
      } catch (e) {
        message.error(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin]);

  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>立项论证审查</Typography.Title>
      <Typography.Paragraph type="secondary">
        {isAdmin
          ? "下面是全部项目。未分发的可直接审查；已分发的标注了受理人，如需自行审查请先在「受理分发」中撤回。"
          : "下面是分发给你的项目，点击进入审查。"}
      </Typography.Paragraph>
      {tasks.length === 0 && !loading ? (
        <Empty description={isAdmin ? "暂无项目" : "暂无分发给你的任务"} />
      ) : (
        <List
          grid={{ gutter: 16, column: 3 }}
          loading={loading}
          dataSource={tasks}
          renderItem={(t) => {
            const distributed = t.assignee_id != null;
            return (
              <List.Item>
                <Card
                  hoverable
                  title={t.task_name}
                  extra={<Tag color="blue">{t.task_no}</Tag>}
                  onClick={() => navigate({ name: "task-review", taskId: t.id, taskName: t.task_name })}
                >
                  <Space direction="vertical" size={4} style={{ width: "100%" }}>
                    <div>
                      报告：{t.report_uploaded}/{t.report_total}
                    </div>
                    {isAdmin &&
                      (distributed ? (
                        <Tag color="orange">已分发给 {t.assignee_name}</Tag>
                      ) : (
                        <Tag>未分发</Tag>
                      ))}
                    <Button type="link" style={{ paddingLeft: 0 }}>
                      {isAdmin && distributed ? "查看 →" : "进入审查 →"}
                    </Button>
                  </Space>
                </Card>
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}
