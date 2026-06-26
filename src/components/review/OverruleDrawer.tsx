import { useEffect, useState } from "react";
import { Drawer, Radio, Input, Button, message } from "antd";
import type { ReviewCheck } from "../../api/review";

const CHOICES = [
  { value: "pass", label: "✓ 通过" }, { value: "fail", label: "✕ 不通过" },
  { value: "not_applicable", label: "⊘ 不适用" },
];

interface OverruleDrawerProps {
  check: ReviewCheck | null;
  onClose: () => void;
  onSubmit: (final_result: string, remark: string) => void;
}

export default function OverruleDrawer({ check, onClose, onSubmit }: OverruleDrawerProps) {
  const [result, setResult] = useState<string | null>(null);
  const [remark, setRemark] = useState("");
  useEffect(() => { if (check) { setResult(null); setRemark(""); } }, [check]);
  const submit = () => {
    if (!result) { message.warning("请选择改判结果"); return; }
    if (!remark.trim()) { message.warning("请填写处置意见"); return; }
    onSubmit(result, remark.trim());
  };
  return (
    <Drawer title="人工改判" open={check !== null} onClose={onClose} width={440}
      footer={<div style={{ textAlign: "right" }}>
        <Button onClick={onClose} style={{ marginRight: 8 }}>取消</Button>
        <Button type="primary" onClick={submit}>提交改判</Button>
      </div>}>
      {check && (
        <>
          <div style={{ fontSize: 13, color: "#86909c" }}>规则：<b style={{ color: "#1d2129" }}>{check.name}</b></div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#86909c" }}>机审原判：{check.initial_result}
            {check.confidence != null && `（置信度 ${Math.round(check.confidence * 100)}%）`}</div>
          <div style={{ marginTop: 16, fontSize: 12, color: "#86909c" }}>依据条款</div>
          <div style={{ background: "#f0f5ff", border: "1px solid #cdd9ff", borderRadius: 8, padding: "10px 12px",
            fontSize: 13, marginTop: 6 }}>{check.suggestion ?? check.name}</div>
          <div style={{ marginTop: 16, fontSize: 12, color: "#86909c" }}>改判结果</div>
          <Radio.Group style={{ marginTop: 6 }} value={result} onChange={(e) => setResult(e.target.value)}>
            {CHOICES.map((c) => <Radio.Button key={c.value} value={c.value}>{c.label}</Radio.Button>)}
          </Radio.Group>
          <div style={{ marginTop: 16, fontSize: 12, color: "#86909c" }}>处置意见 <span style={{ color: "#ff4d4f" }}>*必填</span></div>
          <Input.TextArea rows={3} style={{ marginTop: 6 }} value={remark}
            onChange={(e) => setRemark(e.target.value)} placeholder="请填写人工复核处置意见，将记入审查记录…" />
        </>
      )}
    </Drawer>
  );
}
