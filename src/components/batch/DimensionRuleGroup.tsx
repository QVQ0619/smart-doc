import { useState } from "react";
import { Form, Input, Modal, Select } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  updateRule,
  deleteRule,
  type Rule,
  type RuleUpdate,
} from "../../api/standardDocs";
import RuleItemCard, { DECISION_LABEL, DISPOSITION_LABEL } from "./RuleItemCard";

export const DIMENSION_LABEL: Record<string, string> = {
  completeness: "完整性",
  normativeness: "规范性",
  compliance: "合规性",
  consistency: "一致性",
  rationality: "合理性",
  authenticity: "真实性",
};

const BINDING_LABEL: Record<string, string> = {
  common: "通用",
  parameterized: "参数化",
  specific: "特定",
};

const opts = (m: Record<string, string>) =>
  Object.entries(m).map(([value, label]) => ({ value, label }));

const DIMENSION_KEYS = Object.keys(DIMENSION_LABEL);

interface Props {
  rules: Rule[];
  docId: number;
}

export default function DimensionRuleGroup({ rules, docId }: Props) {
  const qc = useQueryClient();
  const [selectedDim, setSelectedDim] = useState<string | null>(null); // null = 全部
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form] = Form.useForm();

  const updateMut = useMutation({
    mutationFn: (v: RuleUpdate) => updateRule(docId, editing!.id, v),
    onSuccess: () => {
      toast.success("已保存");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["rules", docId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteRule(docId, id),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["rules", docId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function openEdit(r: Rule) {
    setEditing(r);
    form.setFieldsValue({
      name: r.name,
      logic: r.logic ?? "",
      dimension_code: r.dimension_code,
      decision_type: r.decision_type,
      disposition: r.disposition,
      binding_class: r.binding_class,
    });
  }

  // 各维度数量
  const dimCounts = DIMENSION_KEYS.reduce<Record<string, number>>((acc, k) => {
    acc[k] = rules.filter((r) => r.dimension_code === k).length;
    return acc;
  }, {});

  // 按选中维度过滤
  const filteredRules = selectedDim
    ? rules.filter((r) => r.dimension_code === selectedDim)
    : rules;

  // 分组（选全部时按维度顺序分组；选单维时单组）
  const groups: Array<{ code: string; label: string; items: Rule[] }> = selectedDim
    ? [
        {
          code: selectedDim,
          label: DIMENSION_LABEL[selectedDim] ?? selectedDim,
          items: filteredRules,
        },
      ]
    : DIMENSION_KEYS.filter((k) => rules.some((r) => r.dimension_code === k)).map((k) => ({
        code: k,
        label: DIMENSION_LABEL[k] ?? k,
        items: rules.filter((r) => r.dimension_code === k),
      }));

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 14px",
    border: "1px solid",
    borderColor: active ? "#1677ff" : "#e8e8e8",
    borderRadius: 16,
    cursor: "pointer",
    fontSize: 13,
    color: active ? "#fff" : "#595959",
    background: active ? "#1677ff" : "#fff",
    userSelect: "none",
  });

  return (
    <>
      {/* 维度筛选 chip 条 */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span
          data-testid="chip-all"
          style={chipStyle(selectedDim === null)}
          onClick={() => setSelectedDim(null)}
        >
          全部
          <span style={{ opacity: 0.7, marginLeft: 3 }}>{rules.length}</span>
        </span>
        {DIMENSION_KEYS.map((k) => (
          <span
            key={k}
            data-testid={`chip-${k}`}
            style={chipStyle(selectedDim === k)}
            onClick={() => setSelectedDim(k)}
          >
            {DIMENSION_LABEL[k]}
            <span style={{ opacity: 0.7, marginLeft: 3 }}>{dimCounts[k]}</span>
          </span>
        ))}
      </div>

      {/* 分组规则卡 */}
      {groups.map(({ code, label, items }) => (
        <div key={code} style={{ marginBottom: 22 }} data-testid={`dim-group-${code}`}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#595959",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 3,
                height: 14,
                borderRadius: 2,
                background: "#1677ff",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            {label}
            <span style={{ color: "#8c8c8c", fontWeight: 400 }}>({items.length})</span>
          </div>
          {items.map((r) => (
            <RuleItemCard
              key={r.id}
              rule={r}
              onEdit={() => openEdit(r)}
              onDelete={() => deleteMut.mutate(r.id)}
            />
          ))}
        </div>
      ))}

      {/* 规则编辑 Modal */}
      <Modal
        title="编辑规则"
        open={!!editing}
        okText="保存"
        cancelText="取消"
        confirmLoading={updateMut.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) =>
            updateMut.mutate({
              name: v.name,
              logic: v.logic || null,
              dimension_code: v.dimension_code,
              decision_type: v.decision_type,
              disposition: v.disposition,
              binding_class: v.binding_class,
            })
          }
        >
          <Form.Item
            name="name"
            label="规则名"
            rules={[{ required: true, message: "规则名必填" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="logic" label="判定逻辑">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            name="dimension_code"
            label="维度"
            rules={[{ required: true }]}
          >
            <Select options={opts(DIMENSION_LABEL)} />
          </Form.Item>
          <Form.Item
            name="decision_type"
            label="判定"
            rules={[{ required: true }]}
          >
            <Select options={opts(DECISION_LABEL)} />
          </Form.Item>
          <Form.Item
            name="disposition"
            label="处置"
            rules={[{ required: true }]}
          >
            <Select options={opts(DISPOSITION_LABEL)} />
          </Form.Item>
          <Form.Item
            name="binding_class"
            label="绑定"
            rules={[{ required: true }]}
          >
            <Select options={opts(BINDING_LABEL)} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
