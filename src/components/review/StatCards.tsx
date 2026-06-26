import { RESULT, type ResultKey } from "./review-constants";
import type { Counts } from "./review-grouping";

const CELLS: { key: ResultKey; color: string }[] = [
  { key: "pass", color: "#52c41a" }, { key: "fail", color: "#ff4d4f" },
  { key: "need_review", color: "#faad14" }, { key: "not_applicable", color: "#8c8c8c" },
];

export default function StatCards(
  { counts, active, onToggle }: { counts: Counts; active: ResultKey | null; onToggle: (k: ResultKey) => void },
) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, margin: "16px 0" }}>
      {CELLS.map(({ key, color }) => {
        const on = active === key;
        return (
          <div key={key} data-filter={key} data-active={on} onClick={() => onToggle(key)}
            style={{ border: `1px solid ${on ? "#2f6bff" : "#e5e6eb"}`, borderRadius: 10, padding: "14px 16px",
              cursor: "pointer", boxShadow: on ? "0 0 0 2px rgba(47,107,255,.12)" : "none", userSelect: "none" }}>
            <div style={{ color: "#86909c", fontSize: 13 }}>{RESULT[key].label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color, marginTop: 4 }}>{counts[key]}</div>
          </div>
        );
      })}
    </div>
  );
}
