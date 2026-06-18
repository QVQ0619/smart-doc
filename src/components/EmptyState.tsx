import { Empty } from "antd";

interface EmptyStateProps {
  description?: string;
}

export default function EmptyState({ description }: EmptyStateProps) {
  return (
    <div
      style={{
        minHeight: 280,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Empty description={description ?? "功能建设中"} />
    </div>
  );
}
