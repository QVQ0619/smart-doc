import { Drawer } from "antd";
import type { ReviewCheck } from "../../api/review";
import type { MaterialFileSegments, PackageStructured } from "../../api/materials";
import { RESULT } from "./review-constants";
import { resultOf } from "./review-grouping";

export interface ResolvedEvidence { source: string; text: string; }

export function resolveEvidence(
  check: ReviewCheck,
  segments: MaterialFileSegments[] | undefined,
  structured: PackageStructured | undefined,
): ResolvedEvidence[] {
  const segMap = new Map<number, string>();
  for (const f of segments ?? [])
    for (const s of f.segments) segMap.set(s.id, s.content_text ?? "");
  return check.evidence.map((e) => {
    if (e.segment_id != null)
      return { source: `段落#${e.segment_id}`, text: segMap.get(e.segment_id) ?? "（未找到原文）" };
    if (e.field_code != null) {
      const f = (structured?.fields ?? []).find((x) => x.field_code === e.field_code);
      return { source: `字段:${e.field_code}`, text: f ? `${e.field_code} = ${f.field_value ?? "（空）"}` : "（未找到字段）" };
    }
    if (e.budget_item_id != null) {
      const b = (structured?.budget_items ?? []).find((x) => x.id === e.budget_item_id);
      return { source: `预算#${e.budget_item_id}`, text: b ? `${b.item_name}：${b.amount} 元` : "（未找到预算项）" };
    }
    return { source: "—", text: e.note ?? "（无出处）" };
  });
}

interface EvidenceDrawerProps {
  check: ReviewCheck | null;
  segments: MaterialFileSegments[] | undefined;
  structured: PackageStructured | undefined;
  onClose: () => void;
}

export default function EvidenceDrawer({ check, segments, structured, onClose }: EvidenceDrawerProps) {
  const items = check ? resolveEvidence(check, segments, structured) : [];
  const meta = check ? (RESULT[resultOf(check)] ?? { label: resultOf(check) }) : null;
  return (
    <Drawer title="出处原文" open={check !== null} onClose={onClose} width={440}>
      {check && (
        <>
          <div style={{ fontSize: 13, color: "#86909c", marginBottom: 4 }}>关联规则：<b style={{ color: "#1d2129" }}>{check.name}</b></div>
          <div style={{ fontSize: 13, color: "#86909c", marginBottom: 12 }}>机审判定：{meta?.label}</div>
          {items.map((it, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#86909c", marginBottom: 4 }}>来源：{it.source}</div>
              <div style={{ background: "#fafafa", border: "1px solid #e5e6eb", borderRadius: 8, padding: 14,
                fontSize: 14, lineHeight: 1.9 }}>{it.text}</div>
            </div>
          ))}
        </>
      )}
    </Drawer>
  );
}
