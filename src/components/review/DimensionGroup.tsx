import { Collapse, Button, Tag } from "antd";
import type { ReviewCheck } from "../../api/review";
import type { DimensionGroupData } from "./review-grouping";
import { resultOf } from "./review-grouping";
import type { ResultKey } from "./review-constants";
import FindingCard from "./FindingCard";

interface DimensionGroupProps {
  group: DimensionGroupData;
  filter: ResultKey | null;
  onConfirm: (c: ReviewCheck) => void;
  onEvidence: (c: ReviewCheck) => void;
  onOverrule: (c: ReviewCheck) => void;
  onConfirmGroup: (g: DimensionGroupData) => void;
}

export default function DimensionGroup(
  { group, filter, onConfirm, onEvidence, onOverrule, onConfirmGroup }: DimensionGroupProps,
) {
  const visible = group.checks.filter((c) => !filter || resultOf(c) === filter);
  const header = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <b style={{ fontSize: 15 }}>{group.label}</b>
      {group.counts.fail > 0 && <Tag color="error">{group.counts.fail} 不通过</Tag>}
      {group.counts.need_review > 0 && <Tag color="warning">{group.counts.need_review} 待复核</Tag>}
      {!group.hasProblem && <Tag color="success">✓ 全部通过 ({group.checks.length})</Tag>}
    </span>
  );
  return (
    <Collapse style={{ marginTop: 14 }} defaultActiveKey={group.hasProblem ? [group.code] : []}
      items={[{
        key: group.code, label: header,
        extra: (
          <Button size="small" onClick={(e) => { e.stopPropagation(); onConfirmGroup(group); }}>确认本组通过项</Button>
        ),
        children: visible.length
          ? visible.map((c) => (
            <FindingCard key={c.round_check_id} check={c}
              onConfirm={onConfirm} onEvidence={onEvidence} onOverrule={onOverrule} />
          ))
          : <div style={{ color: "#86909c", fontSize: 13, padding: "8px 0" }}>本组无匹配筛选的审查项</div>,
      }]} />
  );
}
