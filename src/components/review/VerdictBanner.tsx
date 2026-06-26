import { Progress } from "antd";
import { CONCLUSION } from "./review-constants";
import type { Counts } from "./review-grouping";

const COLOR: Record<string, string> = {
  error: "#ff4d4f", warning: "#faad14", success: "#52c41a", default: "#8c8c8c",
};

export default function VerdictBanner(
  { conclusion, counts, reviewed, total }: { conclusion: string; counts: Counts; reviewed: number; total: number },
) {
  const cc = CONCLUSION[conclusion] ?? { label: conclusion, color: "default" };
  const color = COLOR[cc.color] ?? COLOR.default;
  const pct = total ? Math.round((reviewed / total) * 100) : 0;
  return (
    <div style={{ position: "relative", borderRadius: 12, padding: "16px 20px 16px 24px",
      border: `1px solid ${color}55`, background: `${color}10`, marginBottom: 16 }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: color,
        borderRadius: "12px 0 0 12px" }} />
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{cc.label}</div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
        <span style={{ color: "#86909c" }}>共 {total} 条规则</span>
        <span>{counts.pass} 通过</span>
        <span>{counts.fail} 不通过</span>
        <span>{counts.need_review} 待复核</span>
        <span>{counts.not_applicable} 不适用</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 12, color: "#86909c" }}>
        <Progress percent={pct} showInfo={false} style={{ width: 200, margin: 0 }} />
        <span>复核进度 {reviewed}/{total}</span>
      </div>
    </div>
  );
}
