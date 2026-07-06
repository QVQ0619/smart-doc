import { useState } from "react";
import { Card, Form, Input, Button, Typography, Alert, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { login } from "../../api/auth";
import { useAuthStore } from "../../store/useAuthStore";
import { useRouteStore } from "../../store/useRouteStore";

export default function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useRouteStore((s) => s.navigate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFinish(values: { username: string; password: string }) {
    setLoading(true);
    setError(null);
    try {
      const res = await login(values.username.trim(), values.password);
      setAuth(res.token, res.user);
      navigate({ name: "dashboard" });
      message.success(`欢迎，${res.user.display_name ?? res.user.username}`);
    } catch (e) {
      // 后端 401 返回「用户名或密码错误」；用页面内固定 Alert 展示,确保可见
      setError(e instanceof Error ? e.message : "登录失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f2f5",
      }}
    >
      <Card style={{ width: 380, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Typography.Title level={3} style={{ color: "#1677ff", marginBottom: 4 }}>
            装备研制立项AI辅助审查评估系统
          </Typography.Title>
          <Typography.Text type="secondary">请登录后使用</Typography.Text>
        </div>
        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            closable
            onClose={() => setError(null)}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form onFinish={onFinish} size="large" requiredMark={false}>
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoFocus />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: 0, textAlign: "center" }}>
          管理员 admin / admin123 · 评审 reviewer1 / review123
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
