import { Empty, Typography } from "antd";

// 通用占位页:标题 + 建设中(用于尚未实现的审查工作项)
export default function ComingSoon({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>{title}</Typography.Title>
      {hint && <Typography.Paragraph type="secondary">{hint}</Typography.Paragraph>}
      <div style={{ marginTop: 96 }}>
        <Empty description="功能建设中" />
      </div>
    </div>
  );
}
