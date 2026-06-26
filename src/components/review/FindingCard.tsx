import { Button } from "antd";
import type { ReviewCheck } from "../../api/review";
import { RESULT } from "./review-constants";
import { resultOf, evidenceLabel } from "./review-grouping";

const BAR: Record<string, string> = { fail: "#ff4d4f", need_review: "#faad14", pass: "#52c41a" };
const BG: Record<string, string> = { fail: "#fff1f0", need_review: "#fffbe6", pass: "#fff" };
const SEVERITY: Record<number, { label: string; color: string }> = {
  3: { label: "高", color: "#ff4d4f" }, 2: { label: "中", color: "#ad6800" }, 1: { label: "低", color: "#86909c" },
};
const LOW_CONF = 0.6;

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
        {check.status === "overruled" ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "#389e0d", fontWeight: 600 }}>
            <span style={{ color: "#86909c", textDecoration: "line-through", fontWeight: 400 }}>
              机审 {(RESULT[check.initial_result] ?? { label: check.initial_result }).label}
            </span>
            <span style={{ color: "#86909c" }}>→</span>
            人工 {(RESULT[check.final_result ?? ""] ?? { label: check.final_result }).label}
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, padding: "3px 10px",
            borderRadius: 999, whiteSpace: "nowrap", border: `1px solid ${bar}`, color: bar }}>
            机审 {meta.label}
            {check.confidence != null && (
              <span style={{ color: "#86909c", borderLeft: "1px solid currentColor", paddingLeft: 8 }}>
                置信度 {Math.round(check.confidence * 100)}%
              </span>
            )}
            {check.confidence != null && check.confidence < LOW_CONF && (
              <span style={{ color: "#ad6800", background: "#fffbe6", border: "1px solid #ffe58f",
                borderRadius: 999, fontSize: 11, padding: "1px 7px" }}>⚠ 建议人工</span>
            )}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4, fontSize: 12 }}>
        <span style={{ fontFamily: "monospace", color: "#86909c" }}>{check.rule_code}</span>
        {check.severity != null && SEVERITY[check.severity] && (
          <span style={{ color: SEVERITY[check.severity].color }}>● 严重度 {SEVERITY[check.severity].label}</span>
        )}
      </div>
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
