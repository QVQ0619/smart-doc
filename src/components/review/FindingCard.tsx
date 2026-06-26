import { Button } from "antd";
import type { ReviewCheck } from "../../api/review";
import { RESULT } from "./review-constants";
import { resultOf, evidenceLabel } from "./review-grouping";

const BAR: Record<string, string> = { fail: "#ff4d4f", need_review: "#faad14", pass: "#52c41a" };
const BG: Record<string, string> = { fail: "#fff1f0", need_review: "#fffbe6", pass: "#fff" };

interface FindingCardProps {
  check: ReviewCheck;
  onConfirm: (c: ReviewCheck) => void;
  onEvidence: (c: ReviewCheck) => void;
  onOverrule: (c: ReviewCheck) => void;
}

export default function FindingCard({ check, onConfirm, onEvidence, onOverrule }: FindingCardProps) {
  const r = resultOf(check);
  const meta = RESULT[r] ?? { label: r, color: "default" };
  const bar = BAR[r] ?? "#8c8c8c";
  const reviewed = check.status !== "open";
  return (
    <div style={{ position: "relative", border: "1px solid #e5e6eb", borderRadius: 8,
      padding: "12px 14px 12px 16px", marginTop: 8, background: BG[r] ?? "#fff", opacity: reviewed ? 0.6 : 1 }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: bar,
        borderRadius: "8px 0 0 8px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{check.name}</span>
        <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 999, whiteSpace: "nowrap",
          border: `1px solid ${bar}`, color: bar }}>机审 {meta.label}</span>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#86909c", marginTop: 4 }}>{check.rule_code}</div>
      {check.suggestion && <div style={{ fontSize: 14, color: "#4e5969", marginTop: 6 }}>{check.suggestion}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 10 }}>
        <span onClick={() => onEvidence(check)} style={{ fontSize: 12, color: "#4e5969", cursor: "pointer",
          border: "1px dashed #d4d8de", borderRadius: 6, padding: "2px 9px" }}>📎 {evidenceLabel(check)} ↗</span>
        {!reviewed && (
          <span style={{ display: "flex", gap: 8 }}>
            <Button size="small" autoInsertSpace={false} onClick={() => onConfirm(check)}>确认</Button>
            <Button size="small" type="link" onClick={() => onOverrule(check)}>改判</Button>
          </span>
        )}
      </div>
    </div>
  );
}
