import { Button, Popconfirm, Tag } from "antd";
import type { Rule } from "../../api/standardDocs";

export const DECISION_LABEL: Record<string, string> = {
  hard: "硬性",
  verify: "需核验",
  soft: "建议",
};
export const DISPOSITION_LABEL: Record<string, string> = {
  reject: "驳回",
  fix: "补正",
  review: "复核",
};

// hard→红 verify→橙 soft→蓝
const DECISION_COLOR: Record<string, string> = {
  hard: "#ff4d4f",
  verify: "#fa8c16",
  soft: "#1677ff",
};

export function ruleProvenance(r: Rule): string {
  const loc = r.locator ?? {};
  const raw = loc["block_index"] ?? loc["para_index"];
  const segPart = typeof raw === "number" ? `第${raw + 1}段` : "";
  if (r.page_no != null) return `第${r.page_no}页${segPart}`;
  return segPart || "—";
}

interface Props {
  rule: Rule;
  onEdit: () => void;
  onDelete: () => void;
}

export default function RuleItemCard({ rule, onEdit, onDelete }: Props) {
  const decisionColor = DECISION_COLOR[rule.decision_type];
  const decisionLabel = DECISION_LABEL[rule.decision_type] ?? rule.decision_type;
  const dispositionLabel = DISPOSITION_LABEL[rule.disposition] ?? rule.disposition;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #f0f0f0",
        borderRadius: 10,
        padding: "14px 18px",
        marginBottom: 10,
        boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        position: "relative",
      }}
    >
      {/* 标题行：规则名 + 判定徽章 + 处置 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{rule.name}</div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <Tag color={decisionColor}>{decisionLabel}</Tag>
          <Tag>{dispositionLabel}</Tag>
        </div>
      </div>

      {/* 判定逻辑（可选） */}
      {rule.logic && (
        <div style={{ color: "#595959", fontSize: 13.5, marginTop: 8, lineHeight: 1.6 }}>
          <span style={{ color: "#8c8c8c" }}>判定逻辑：</span>
          {rule.logic}
        </div>
      )}

      {/* 脚注：出处 + 操作 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 10,
        }}
      >
        <div style={{ color: "#8c8c8c", fontSize: 12.5 }}>
          📍 出处：{ruleProvenance(rule)}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <Button type="link" size="small" onClick={onEdit}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该规则?"
            okText="确定"
            cancelText="取消"
            onConfirm={onDelete}
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </div>
      </div>
    </div>
  );
}
