import { useEffect, useState } from "react";
import { Card, Typography, Input, Button, Space, Tag, message, Alert } from "antd";
import { SaveOutlined, UndoOutlined } from "@ant-design/icons";
import {
  REVIEW_PROMPT_KEY,
  DEFAULT_REVIEW_PROMPT_TEMPLATE,
  getSetting,
  putSetting,
} from "../../api/settings";

// 模板可用变量:发起审查时由系统自动替换
const TEMPLATE_VARS: { name: string; desc: string }[] = [
  { name: "{审查项}", desc: "审查按钮名称,如「经济性审查」" },
  { name: "{报告文件名}", desc: "推送到对话的报告文件名" },
  { name: "{任务名称}", desc: "所属任务名称" },
];

export default function SystemSettingsPage() {
  const [template, setTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSetting(REVIEW_PROMPT_KEY)
      .then((s) => setTemplate(s.value?.trim() ? s.value : DEFAULT_REVIEW_PROMPT_TEMPLATE))
      .catch((e) => {
        setTemplate(DEFAULT_REVIEW_PROMPT_TEMPLATE);
        message.error(e instanceof Error ? e.message : "加载设置失败");
      })
      .finally(() => setLoaded(true));
  }, []);

  async function save() {
    if (!template.trim()) {
      message.error("模板内容不能为空");
      return;
    }
    setSaving(true);
    try {
      await putSetting(REVIEW_PROMPT_KEY, template.trim());
      message.success("已保存，之后发起的审查将使用新模板");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <Typography.Title level={4}>系统设置</Typography.Title>
      <Card title="「开始审查」提示词模板" loading={!loaded}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="点击「开始审查」时，系统会把报告推送到右侧对话，并按本模板自动发出审查指令。"
          />
          <div>
            可用变量（发起时自动替换）：
            <Space wrap style={{ marginTop: 6 }}>
              {TEMPLATE_VARS.map((v) => (
                <Tag key={v.name} title={v.desc}>
                  {v.name} <span style={{ color: "#8c8c8c" }}>{v.desc}</span>
                </Tag>
              ))}
            </Space>
          </div>
          <Input.TextArea
            rows={6}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder={DEFAULT_REVIEW_PROMPT_TEMPLATE}
          />
          <Space>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
              保存
            </Button>
            <Button
              icon={<UndoOutlined />}
              onClick={() => setTemplate(DEFAULT_REVIEW_PROMPT_TEMPLATE)}
            >
              恢复默认模板
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
