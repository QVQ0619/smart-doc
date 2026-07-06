import { useEffect, useState } from "react";
import { Row, Col, Card, Statistic, Typography, Spin, message } from "antd";
import {
  FileTextOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  CloudUploadOutlined,
  InboxOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { getOverview, getMyOverview, type Overview, type MyOverview } from "../../api/tasks";
import { useAuthStore } from "../../store/useAuthStore";

interface Bar {
  label: string;
  value: number;
  color: string;
}

function BarChart({ bars }: { bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 32, height: 220, padding: "16px 24px" }}>
      {bars.map((b) => (
        <div key={b.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{b.value}</div>
          <div
            style={{
              width: "70%",
              maxWidth: 64,
              height: Math.max(4, Math.round((b.value / max) * 160)),
              background: b.color,
              borderRadius: "6px 6px 0 0",
              transition: "height .3s",
            }}
          />
          <div style={{ marginTop: 8, color: "#666" }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

function AdminDashboard() {
  const [ov, setOv] = useState<Overview | null>(null);
  useEffect(() => {
    getOverview()
      .then(setOv)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"));
  }, []);
  if (!ov) return <Spin size="large" style={{ display: "block", margin: "64px auto" }} />;

  return (
    <>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="任务总数" value={ov.total_tasks} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="已完成任务" value={ov.done_tasks} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#52c41a" }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="活跃用户" value={ov.active_users} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="报告已上传" value={ov.reports_uploaded} suffix={`/ ${ov.reports_total}`} prefix={<CloudUploadOutlined />} />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={14}>
          <Card title="任务状态分布">
            <BarChart
              bars={[
                { label: "待分发", value: ov.by_status.created || 0, color: "#8c8c8c" },
                { label: "已分发", value: ov.by_status.distributed || 0, color: "#1677ff" },
                { label: "审查中", value: ov.by_status.reviewing || 0, color: "#faad14" },
                { label: "已完成", value: ov.by_status.done || 0, color: "#52c41a" },
              ]}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="概况">
            <p>评审专家：{ov.reviewers} 人</p>
            <p>待分发任务：{ov.by_status.created || 0} 个</p>
            <p>已分发任务：{ov.by_status.distributed || 0} 个</p>
            <p>报告上传进度：{ov.reports_uploaded} / {ov.reports_total}</p>
          </Card>
        </Col>
      </Row>
    </>
  );
}

function ReviewerDashboard() {
  const [ov, setOv] = useState<MyOverview | null>(null);
  useEffect(() => {
    getMyOverview()
      .then(setOv)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"));
  }, []);
  if (!ov) return <Spin size="large" style={{ display: "block", margin: "64px auto" }} />;

  return (
    <>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="我的任务" value={ov.total} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="已接收" value={ov.received} prefix={<InboxOutlined />} valueStyle={{ color: "#1677ff" }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="审查中" value={ov.reviewing} prefix={<SyncOutlined />} valueStyle={{ color: "#faad14" }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="已完成" value={ov.done} prefix={<CheckCircleOutlined />} valueStyle={{ color: "#52c41a" }} />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={14}>
          <Card title="我的任务状态分布">
            <BarChart
              bars={[
                { label: "已接收", value: ov.received, color: "#1677ff" },
                { label: "审查中", value: ov.reviewing, color: "#faad14" },
                { label: "已完成", value: ov.done, color: "#52c41a" },
              ]}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="概况">
            <p>分发给我的任务：{ov.total} 个</p>
            <p>待我审查：{ov.received} 个</p>
            <p>审查中：{ov.reviewing} 个</p>
            <p>报告：{ov.reports_uploaded} / {ov.reports_total}</p>
          </Card>
        </Col>
      </Row>
    </>
  );
}

export default function DashboardPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  return (
    <div style={{ padding: 24 }}>
      <Typography.Title level={4}>仪表盘</Typography.Title>
      {isAdmin ? <AdminDashboard /> : <ReviewerDashboard />}
    </div>
  );
}
