# 形式审查结果页 P0+P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `ReviewPanel.tsx` 展开行内的扁平 Table 原地重构为「结论横幅 + 统计卡筛选 + 维度分组卡片 + 出处/改判双抽屉」的形式审查工作台。

**Architecture:** 纯前端改造，零后端改动。新增 `src/components/review/` 子目录承载工作台组件；分组/计数/常量抽成可单测的纯模块。数据全部来自现有端点（`getPackageReview` / `getPackageStructured` + 新增 `getPackageSegments` 客户端，后端端点已存在）。

**Tech Stack:** React 19 + TypeScript 5.6 + antd 5 + @tanstack/react-query 5 + vitest 2 + @testing-library/react。

## Global Constraints

- 后端**零改动**：只新增前端 api 客户端调用已存在端点 `GET /packages/{id}/segments`。
- antd 为主（Collapse / Drawer / Progress / Radio / Tag / Input.TextArea），仅结论横幅左色条、发现卡片状态色条、判定胶囊三处用自定义内联样式。
- 颜色 token 沿用演示页：success `#52c41a` / warning `#faad14` / error `#ff4d4f` / neutral `#8c8c8c`。
- 维度分组按真实 `dimension_code`（六维：completeness 完整性 / normativeness 规范性 / compliance 合规性 / consistency 一致性 / rationality 合理性 / authenticity 真实性），未知 code 回退显示原 code。
- 结果口径：单条结果取 `final_result ?? effective_result ?? initial_result`；复核进度取 `status !== "open"`（status 取值 `open`/`confirmed`/`overruled`）。
- 改判提交沿用 `postReviewAction` + `version` 乐观锁 + 409→「数据已变更，请刷新后重试」。
- 测试命令：单文件 `npx vitest run <path>`；全量 `npm test`；构建 `npm run build`。

---

## File Structure

```
src/components/ReviewPanel.tsx                  外层包列表（Task 6 改：展开行渲染 ReviewWorkbench）
src/components/review/
  review-constants.ts      CONCLUSION / RESULT / DIMENSION_LABELS / ResultKey / dimensionLabel
  review-grouping.ts       countChecks / groupByDimension / resultOf / evidenceLabel（纯函数）
  review-grouping.test.ts  纯函数单测
  VerdictBanner.tsx        P0① 结论横幅 + 计数 + 进度条
  StatCards.tsx            P0② 4 统计卡（点击筛选）
  FindingCard.tsx          P0④/P1① 发现卡片
  DimensionGroup.tsx       P0③ 维度分组（Collapse）+ 组级批量确认
  ReviewWorkbench.tsx      组织取数/筛选/进度/抽屉，替代旧 PackageReviewView
  EvidenceDrawer.tsx       P1② 出处原文抽屉
  OverruleDrawer.tsx       P1③ 改判抽屉
src/api/materials.ts       Task 8 加 getPackageSegments
```

`ReviewCheck` / `PackageReview` 类型已存在于 `src/api/review.ts`，全程复用，不改动。

---

## 阶段 P0

### Task 1: 常量与分组纯函数

**Files:**
- Create: `src/components/review/review-constants.ts`
- Create: `src/components/review/review-grouping.ts`
- Test: `src/components/review/review-grouping.test.ts`

**Interfaces:**
- Produces:
  - `type ResultKey = "pass" | "fail" | "need_review" | "not_applicable"`
  - `CONCLUSION: Record<string,{label:string;color:string}>`、`RESULT: Record<string,{label:string;color:string}>`、`dimensionLabel(code:string):string`
  - `resultOf(c:ReviewCheck):string`、`countChecks(checks:ReviewCheck[]):Counts`、`groupByDimension(checks:ReviewCheck[]):DimensionGroupData[]`、`evidenceLabel(c:ReviewCheck):string`
  - `interface Counts { pass:number; fail:number; need_review:number; not_applicable:number }`
  - `interface DimensionGroupData { code:string; label:string; checks:ReviewCheck[]; counts:Counts; hasProblem:boolean }`

- [ ] **Step 1: 写失败测试**

`src/components/review/review-grouping.test.ts`：
```ts
import { describe, it, expect } from "vitest";
import { countChecks, groupByDimension, resultOf, evidenceLabel } from "./review-grouping";
import { dimensionLabel } from "./review-constants";
import type { ReviewCheck } from "../../api/review";

function chk(over: Partial<ReviewCheck>): ReviewCheck {
  return {
    round_check_id: 1, rule_version_id: 1, rule_code: "R", name: "规则", dimension_code: "completeness",
    initial_result: "pass", initial_disposition: null, final_result: null, final_disposition: null,
    effective_result: "pass", status: "open", suggestion: null, confidence: null, severity: null,
    version: 0, evidence: [], ...over,
  };
}

describe("review-grouping", () => {
  it("resultOf 优先 final_result，其次 effective，再 initial", () => {
    expect(resultOf(chk({ final_result: "pass", effective_result: "fail", initial_result: "fail" }))).toBe("pass");
    expect(resultOf(chk({ final_result: null, effective_result: "fail", initial_result: "pass" }))).toBe("fail");
  });

  it("countChecks 按结果计数", () => {
    const c = countChecks([chk({ effective_result: "pass" }), chk({ effective_result: "fail" }),
      chk({ effective_result: "need_review" })]);
    expect(c).toEqual({ pass: 1, fail: 1, need_review: 1, not_applicable: 0 });
  });

  it("groupByDimension 把有问题的维度排前面", () => {
    const groups = groupByDimension([
      chk({ dimension_code: "completeness", effective_result: "pass" }),
      chk({ dimension_code: "compliance", effective_result: "fail" }),
    ]);
    expect(groups.map((g) => g.code)).toEqual(["compliance", "completeness"]);
    expect(groups[0].hasProblem).toBe(true);
    expect(groups[1].hasProblem).toBe(false);
  });

  it("dimensionLabel 已知映射中文，未知回退原 code", () => {
    expect(dimensionLabel("rationality")).toBe("合理性");
    expect(dimensionLabel("unknown_x")).toBe("unknown_x");
  });

  it("evidenceLabel 拼出处文本，多条用顿号连接", () => {
    expect(evidenceLabel(chk({ evidence: [
      { segment_id: 5, field_code: null, budget_item_id: null, note: null },
      { segment_id: null, field_code: "title", budget_item_id: null, note: null },
    ] }))).toBe("段落#5、字段:title");
    expect(evidenceLabel(chk({ evidence: [] }))).toBe("—");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/review/review-grouping.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 review-constants.ts**

```ts
export type ResultKey = "pass" | "fail" | "need_review" | "not_applicable";

export const CONCLUSION: Record<string, { label: string; color: string }> = {
  reject: { label: "建议不予立项", color: "error" },
  fix: { label: "需整改", color: "warning" },
  accept: { label: "通过", color: "success" },
  pending: { label: "待定", color: "default" },
};

export const RESULT: Record<string, { label: string; color: string }> = {
  pass: { label: "通过", color: "success" },
  fail: { label: "不通过", color: "error" },
  need_review: { label: "待复核", color: "warning" },
  not_applicable: { label: "不适用", color: "default" },
  pending: { label: "待判", color: "default" },
  error: { label: "错误", color: "error" },
};

export const DIMENSION_LABELS: Record<string, string> = {
  completeness: "完整性",
  normativeness: "规范性",
  compliance: "合规性",
  consistency: "一致性",
  rationality: "合理性",
  authenticity: "真实性",
};

export function dimensionLabel(code: string): string {
  return DIMENSION_LABELS[code] ?? code;
}
```

- [ ] **Step 4: 实现 review-grouping.ts**

```ts
import type { ReviewCheck } from "../../api/review";
import { dimensionLabel, type ResultKey } from "./review-constants";

export interface Counts { pass: number; fail: number; need_review: number; not_applicable: number; }
export interface DimensionGroupData {
  code: string; label: string; checks: ReviewCheck[]; counts: Counts; hasProblem: boolean;
}

export function resultOf(c: ReviewCheck): string {
  return c.final_result ?? c.effective_result ?? c.initial_result;
}

function emptyCounts(): Counts { return { pass: 0, fail: 0, need_review: 0, not_applicable: 0 }; }

export function countChecks(checks: ReviewCheck[]): Counts {
  const counts = emptyCounts();
  for (const c of checks) {
    const r = resultOf(c) as ResultKey;
    if (r in counts) counts[r] += 1;
  }
  return counts;
}

export function groupByDimension(checks: ReviewCheck[]): DimensionGroupData[] {
  const map = new Map<string, ReviewCheck[]>();
  for (const c of checks) {
    const arr = map.get(c.dimension_code) ?? [];
    arr.push(c);
    map.set(c.dimension_code, arr);
  }
  const groups: DimensionGroupData[] = [];
  for (const [code, arr] of map) {
    const counts = countChecks(arr);
    groups.push({
      code, label: dimensionLabel(code), checks: arr, counts,
      hasProblem: counts.fail > 0 || counts.need_review > 0,
    });
  }
  // Array.sort 稳定：问题组排前，其余维持插入序
  groups.sort((a, b) => Number(b.hasProblem) - Number(a.hasProblem));
  return groups;
}

export function evidenceLabel(c: ReviewCheck): string {
  if (!c.evidence.length) return "—";
  return c.evidence.map((e) =>
    e.segment_id != null ? `段落#${e.segment_id}` :
    e.field_code != null ? `字段:${e.field_code}` :
    e.budget_item_id != null ? `预算#${e.budget_item_id}` : "—").join("、");
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/components/review/review-grouping.test.ts`
Expected: PASS（5 个用例全绿）

- [ ] **Step 6: 提交**

```bash
git add src/components/review/review-constants.ts src/components/review/review-grouping.ts src/components/review/review-grouping.test.ts
git commit -m "feat(review): 形式审查分组/计数纯函数与常量(P0)"
```

---

### Task 2: VerdictBanner 结论横幅

**Files:**
- Create: `src/components/review/VerdictBanner.tsx`
- Test: `src/components/review/VerdictBanner.test.tsx`

**Interfaces:**
- Consumes: `Counts`（Task 1）、`CONCLUSION`（Task 1）
- Produces: `export default function VerdictBanner(props: { conclusion: string; counts: Counts; reviewed: number; total: number }): JSX.Element`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import VerdictBanner from "./VerdictBanner";

describe("VerdictBanner", () => {
  it("显示结论文案与四项计数", () => {
    render(<VerdictBanner conclusion="reject"
      counts={{ pass: 15, fail: 3, need_review: 2, not_applicable: 0 }} reviewed={5} total={20} />);
    expect(screen.getByText("建议不予立项")).toBeInTheDocument();
    expect(screen.getByText("15 通过")).toBeInTheDocument();
    expect(screen.getByText("3 不通过")).toBeInTheDocument();
    expect(screen.getByText("2 待复核")).toBeInTheDocument();
    expect(screen.getByText("复核进度 5/20")).toBeInTheDocument();
  });

  it("未知结论回退显示原值", () => {
    render(<VerdictBanner conclusion="weird"
      counts={{ pass: 0, fail: 0, need_review: 0, not_applicable: 0 }} reviewed={0} total={0} />);
    expect(screen.getByText("weird")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/review/VerdictBanner.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 VerdictBanner.tsx**

```tsx
import { Progress } from "antd";
import { CONCLUSION, type Counts } from "./review-constants";

const COLOR: Record<string, string> = {
  error: "#ff4d4f", warning: "#faad14", success: "#52c41a", default: "#8c8c8c",
};

export default function VerdictBanner(
  { conclusion, counts, reviewed, total }: { conclusion: string; counts: Counts; reviewed: number; total: number },
) {
  const cc = CONCLUSION[conclusion] ?? { label: conclusion, color: "default" };
  const color = COLOR[cc.color] ?? COLOR.default;
  const ruleTotal = counts.pass + counts.fail + counts.need_review + counts.not_applicable;
  const pct = total ? Math.round((reviewed / total) * 100) : 0;
  return (
    <div style={{ position: "relative", borderRadius: 12, padding: "16px 20px 16px 24px",
      border: `1px solid ${color}55`, background: `${color}10`, marginBottom: 16 }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: color,
        borderRadius: "12px 0 0 12px" }} />
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{cc.label}</div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
        <span style={{ color: "#86909c" }}>共 {ruleTotal} 条规则</span>
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/review/VerdictBanner.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/review/VerdictBanner.tsx src/components/review/VerdictBanner.test.tsx
git commit -m "feat(review): 结论横幅 VerdictBanner(P0)"
```

---

### Task 3: StatCards 统计卡筛选

**Files:**
- Create: `src/components/review/StatCards.tsx`
- Test: `src/components/review/StatCards.test.tsx`

**Interfaces:**
- Consumes: `Counts`、`ResultKey`（Task 1）
- Produces: `export default function StatCards(props: { counts: Counts; active: ResultKey | null; onToggle: (k: ResultKey) => void }): JSX.Element`

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StatCards from "./StatCards";

describe("StatCards", () => {
  it("点不通过卡回调 fail", () => {
    const onToggle = vi.fn();
    render(<StatCards counts={{ pass: 15, fail: 3, need_review: 2, not_applicable: 0 }}
      active={null} onToggle={onToggle} />);
    fireEvent.click(screen.getByText("不通过").closest("div[data-filter]")!);
    expect(onToggle).toHaveBeenCalledWith("fail");
  });

  it("active 卡片带 data-active", () => {
    render(<StatCards counts={{ pass: 1, fail: 1, need_review: 1, not_applicable: 1 }}
      active="pass" onToggle={() => {}} />);
    expect(screen.getByText("通过").closest("div[data-filter]")).toHaveAttribute("data-active", "true");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/review/StatCards.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 StatCards.tsx**

```tsx
import { RESULT, type Counts, type ResultKey } from "./review-constants";

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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/review/StatCards.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/review/StatCards.tsx src/components/review/StatCards.test.tsx
git commit -m "feat(review): 统计卡筛选 StatCards(P0)"
```

---

### Task 4: FindingCard 发现卡片（P0 版）

**Files:**
- Create: `src/components/review/FindingCard.tsx`
- Test: `src/components/review/FindingCard.test.tsx`

**Interfaces:**
- Consumes: `ReviewCheck`（api/review）、`resultOf` / `evidenceLabel`（Task 1）、`RESULT`（Task 1）
- Produces: `export default function FindingCard(props: FindingCardProps): JSX.Element`
  ```ts
  interface FindingCardProps {
    check: ReviewCheck;
    onConfirm: (c: ReviewCheck) => void;
    onEvidence: (c: ReviewCheck) => void;
    onOverrule: (c: ReviewCheck) => void;
  }
  ```

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FindingCard from "./FindingCard";
import type { ReviewCheck } from "../../api/review";

const FAIL: ReviewCheck = {
  round_check_id: 9, rule_version_id: 1, rule_code: "SD-RULE-014", name: "负责人连续承担年限不满足",
  dimension_code: "compliance", initial_result: "fail", initial_disposition: null, final_result: null,
  final_disposition: null, effective_result: "fail", status: "open", suggestion: "近3年须连续承担",
  confidence: null, severity: null, version: 0,
  evidence: [{ segment_id: 3, field_code: null, budget_item_id: null, note: null }],
};

describe("FindingCard (P0)", () => {
  it("渲染规则名、建议、出处与机审判定", () => {
    render(<FindingCard check={FAIL} onConfirm={() => {}} onEvidence={() => {}} onOverrule={() => {}} />);
    expect(screen.getByText("负责人连续承担年限不满足")).toBeInTheDocument();
    expect(screen.getByText("近3年须连续承担")).toBeInTheDocument();
    expect(screen.getByText(/段落#3/)).toBeInTheDocument();
    expect(screen.getByText(/不通过/)).toBeInTheDocument();
  });

  it("点确认/改判/出处分别回调", () => {
    const onConfirm = vi.fn(), onOverrule = vi.fn(), onEvidence = vi.fn();
    render(<FindingCard check={FAIL} onConfirm={onConfirm} onEvidence={onEvidence} onOverrule={onOverrule} />);
    fireEvent.click(screen.getByText("确认"));
    fireEvent.click(screen.getByText("改判"));
    fireEvent.click(screen.getByText(/段落#3/));
    expect(onConfirm).toHaveBeenCalledWith(FAIL);
    expect(onOverrule).toHaveBeenCalledWith(FAIL);
    expect(onEvidence).toHaveBeenCalledWith(FAIL);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/review/FindingCard.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 FindingCard.tsx**

```tsx
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/review/FindingCard.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/review/FindingCard.tsx src/components/review/FindingCard.test.tsx
git commit -m "feat(review): 发现卡片 FindingCard(P0)"
```

---

### Task 5: DimensionGroup 维度分组

**Files:**
- Create: `src/components/review/DimensionGroup.tsx`
- Test: `src/components/review/DimensionGroup.test.tsx`

**Interfaces:**
- Consumes: `DimensionGroupData`（Task 1）、`FindingCard`（Task 4）、`ResultKey`、`resultOf`
- Produces: `export default function DimensionGroup(props: DimensionGroupProps): JSX.Element`
  ```ts
  interface DimensionGroupProps {
    group: DimensionGroupData;
    filter: ResultKey | null;
    onConfirm: (c: ReviewCheck) => void;
    onEvidence: (c: ReviewCheck) => void;
    onOverrule: (c: ReviewCheck) => void;
    onConfirmGroup: (g: DimensionGroupData) => void;
  }
  ```

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DimensionGroup from "./DimensionGroup";
import type { DimensionGroupData } from "./review-grouping";
import type { ReviewCheck } from "../../api/review";

function chk(over: Partial<ReviewCheck>): ReviewCheck {
  return { round_check_id: 1, rule_version_id: 1, rule_code: "R", name: "规则X", dimension_code: "compliance",
    initial_result: "fail", initial_disposition: null, final_result: null, final_disposition: null,
    effective_result: "fail", status: "open", suggestion: null, confidence: null, severity: null,
    version: 0, evidence: [], ...over };
}
const GROUP: DimensionGroupData = {
  code: "compliance", label: "合规性", hasProblem: true,
  counts: { pass: 1, fail: 1, need_review: 0, not_applicable: 0 },
  checks: [chk({ round_check_id: 1, name: "不通过项", effective_result: "fail" }),
           chk({ round_check_id: 2, name: "通过项", effective_result: "pass" })],
};

describe("DimensionGroup", () => {
  it("显示维度名与组内卡片", () => {
    render(<DimensionGroup group={GROUP} filter={null} onConfirm={() => {}} onEvidence={() => {}}
      onOverrule={() => {}} onConfirmGroup={() => {}} />);
    expect(screen.getByText("合规性")).toBeInTheDocument();
    expect(screen.getByText("不通过项")).toBeInTheDocument();
    expect(screen.getByText("通过项")).toBeInTheDocument();
  });

  it("点确认本组通过项回调整组", () => {
    const onConfirmGroup = vi.fn();
    render(<DimensionGroup group={GROUP} filter={null} onConfirm={() => {}} onEvidence={() => {}}
      onOverrule={() => {}} onConfirmGroup={onConfirmGroup} />);
    fireEvent.click(screen.getByText("确认本组通过项"));
    expect(onConfirmGroup).toHaveBeenCalledWith(GROUP);
  });

  it("filter 只显示匹配结果的卡片", () => {
    render(<DimensionGroup group={GROUP} filter="fail" onConfirm={() => {}} onEvidence={() => {}}
      onOverrule={() => {}} onConfirmGroup={() => {}} />);
    expect(screen.getByText("不通过项")).toBeInTheDocument();
    expect(screen.queryByText("通过项")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/review/DimensionGroup.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 DimensionGroup.tsx**

```tsx
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/review/DimensionGroup.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/review/DimensionGroup.tsx src/components/review/DimensionGroup.test.tsx
git commit -m "feat(review): 维度分组 DimensionGroup(P0)"
```

---

### Task 6: ReviewWorkbench 组织 + 替换 ReviewPanel 展开行

**Files:**
- Create: `src/components/review/ReviewWorkbench.tsx`
- Modify: `src/components/ReviewPanel.tsx`（删 `PackageReviewView`、`evidenceText`、改判 Modal、内层 Table，展开行改渲染 `ReviewWorkbench`；保留外层 `ReviewPanel` 与 `PKG_COLS`）
- Test: `src/components/ReviewPanel.test.tsx`（更新断言为工作台结构）

**Interfaces:**
- Consumes: `getPackageReview` / `postReviewAction`（api/review）、Task 1–5 全部组件与纯函数
- Produces: `export default function ReviewWorkbench(props: { packageId: number }): JSX.Element`

> 本任务 P0 阶段：改判仍用 antd `Modal`（沿用现有交互），出处点击暂用 `message.info` 占位提示（"出处抽屉将在 P1 接入"）。EvidenceDrawer / OverruleDrawer 在 Task 9/10 替换。

- [ ] **Step 1: 更新 ReviewPanel.test.tsx 为失败测试**

把文件整体替换为：
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReviewPanel from "./ReviewPanel";
import * as matApi from "../api/materials";
import * as revApi from "../api/review";

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const PKG = { package_id: 3, created_at: null, file_count: 1, files: [] };
const REVIEW = {
  round: { round_id: 1, round_no: 1, conclusion: "reject" },
  checks: [{ round_check_id: 9, rule_version_id: 12, rule_code: "R-1", name: "必须有申请人",
             dimension_code: "completeness", initial_result: "fail", initial_disposition: "reject",
             final_result: null, final_disposition: null, effective_result: "fail", status: "open",
             suggestion: "缺申请人", confidence: null, severity: null, version: 0,
             evidence: [{ segment_id: 5, field_code: null, budget_item_id: null, note: "第1段" }] }],
};

async function expandFirst(container: HTMLElement) {
  await waitFor(() => expect(screen.getByText("审查包 #3")).toBeInTheDocument());
  (container.querySelector(".ant-table-row-expand-icon") as HTMLElement)?.click();
}

describe("ReviewPanel", () => {
  it("展开审查包显示结论横幅与发现卡片", async () => {
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([PKG] as never);
    vi.spyOn(revApi, "getPackageReview").mockResolvedValue(REVIEW as never);
    const { container } = renderWithQuery(<ReviewPanel />);
    await expandFirst(container);
    await waitFor(() => expect(screen.getByText("建议不予立项")).toBeInTheDocument());
    expect(screen.getByText("必须有申请人")).toBeInTheDocument();
    expect(screen.getByText("缺申请人")).toBeInTheDocument();
  });

  it("点确认调 postReviewAction", async () => {
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([PKG] as never);
    vi.spyOn(revApi, "getPackageReview").mockResolvedValue(REVIEW as never);
    const spy = vi.spyOn(revApi, "postReviewAction").mockResolvedValue(REVIEW.checks[0] as never);
    const { container } = renderWithQuery(<ReviewPanel />);
    await expandFirst(container);
    await waitFor(() => expect(screen.getByText("确认")).toBeInTheDocument());
    fireEvent.click(screen.getByText("确认"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(9, { action: "confirm", version: 0 }));
  });

  it("点统计卡按结果筛选", async () => {
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([PKG] as never);
    vi.spyOn(revApi, "getPackageReview").mockResolvedValue(REVIEW as never);
    const { container } = renderWithQuery(<ReviewPanel />);
    await expandFirst(container);
    await waitFor(() => expect(screen.getByText("必须有申请人")).toBeInTheDocument());
    fireEvent.click(screen.getByText("通过").closest("div[data-filter]")!); // 筛"通过"→唯一的 fail 卡片隐藏
    await waitFor(() => expect(screen.queryByText("必须有申请人")).not.toBeInTheDocument());
  });

  it("空状态文案", async () => {
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([] as never);
    renderWithQuery(<ReviewPanel />);
    await waitFor(() => expect(screen.getByText(/暂无可审查/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/ReviewPanel.test.tsx`
Expected: FAIL（结论横幅/筛选断言找不到）

- [ ] **Step 3: 实现 ReviewWorkbench.tsx**

```tsx
import { useMemo, useState } from "react";
import { Modal, Select, Input, message } from "antd";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPackageReview, postReviewAction,
         type ReviewCheck, type PackageReview } from "../../api/review";
import { RESULT, type ResultKey } from "./review-constants";
import { groupByDimension, countChecks, type DimensionGroupData } from "./review-grouping";
import VerdictBanner from "./VerdictBanner";
import StatCards from "./StatCards";
import DimensionGroup from "./DimensionGroup";

const RESULT_OPTIONS = ["pass", "fail", "need_review", "not_applicable"]
  .map((v) => ({ value: v, label: RESULT[v].label }));

export default function ReviewWorkbench({ packageId }: { packageId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pkg-review", packageId], queryFn: () => getPackageReview(packageId) });
  const [filter, setFilter] = useState<ResultKey | null>(null);
  const [overrule, setOverrule] = useState<ReviewCheck | null>(null);
  const [ovResult, setOvResult] = useState("pass");
  const [ovRemark, setOvRemark] = useState("");
  const mut = useMutation({
    mutationFn: (v: { id: number; body: Parameters<typeof postReviewAction>[1] }) =>
      postReviewAction(v.id, v.body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["pkg-review", packageId] }); },
    onError: (e: Error) => { message.error(e.message.includes("409") ? "数据已变更，请刷新后重试" : e.message); },
  });

  const data = q.data as PackageReview | undefined;
  const checks = data?.checks ?? [];
  const counts = useMemo(() => countChecks(checks), [checks]);
  const groups = useMemo(() => groupByDimension(checks), [checks]);
  const reviewed = checks.filter((c) => c.status !== "open").length;

  if (q.isLoading) return <span>加载中…</span>;
  if (q.isError) return <span>审查结果加载失败</span>;
  if (!data || data.round === null)
    return <span>该申报包尚未形式审查（可在聊天中说“形式审查这个申报包”）</span>;

  const confirm = (c: ReviewCheck) => mut.mutate({ id: c.round_check_id, body: { action: "confirm", version: c.version } });
  const confirmGroup = (g: DimensionGroupData) =>
    g.checks.filter((c) => c.status === "open" && (c.final_result ?? c.effective_result ?? c.initial_result) === "pass")
      .forEach(confirm);
  const openEvidence = () => message.info("出处抽屉将在 P1 接入");

  return (
    <div>
      <VerdictBanner conclusion={data.round.conclusion} counts={counts} reviewed={reviewed} total={checks.length} />
      <StatCards counts={counts} active={filter} onToggle={(k) => setFilter(filter === k ? null : k)} />
      {groups.map((g) => (
        <DimensionGroup key={g.code} group={g} filter={filter}
          onConfirm={confirm} onEvidence={openEvidence}
          onOverrule={(c) => { setOverrule(c); setOvResult("pass"); setOvRemark(""); }}
          onConfirmGroup={confirmGroup} />
      ))}
      <Modal title="人工改判" open={overrule !== null} onCancel={() => setOverrule(null)}
        onOk={() => {
          if (overrule) mut.mutate({ id: overrule.round_check_id,
            body: { action: "overrule", final_result: ovResult, remark: ovRemark, version: overrule.version } });
          setOverrule(null);
        }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Select value={ovResult} onChange={setOvResult} options={RESULT_OPTIONS} />
          <Input.TextArea value={ovRemark} onChange={(e) => setOvRemark(e.target.value)} placeholder="复核意见" rows={2} />
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: 改 ReviewPanel.tsx 用 ReviewWorkbench**

整体替换为：
```tsx
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import { listMaterialPackages, type MaterialPackage } from "../api/materials";
import ReviewWorkbench from "./review/ReviewWorkbench";

const PKG_COLS: ColumnsType<MaterialPackage> = [
  { title: "审查包", key: "pkg", render: (_: unknown, p) => `审查包 #${p.package_id}` },
  { title: "材料数", dataIndex: "file_count", key: "file_count", width: 100 },
];

export default function ReviewPanel() {
  const q = useQuery({ queryKey: ["material-packages"], queryFn: listMaterialPackages });
  if (q.isError) return <div>审查包加载失败</div>;
  return (
    <Table rowKey="package_id" size="middle" loading={q.isLoading} dataSource={q.data ?? []}
      columns={PKG_COLS} pagination={false}
      locale={{ emptyText: "暂无可审查的申报包，请先在聊天中上传并结构化抽取申请材料" }}
      expandable={{ expandedRowRender: (p) => <ReviewWorkbench packageId={p.package_id} /> }} />
  );
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/components/ReviewPanel.test.tsx`
Expected: PASS（4 用例）

- [ ] **Step 6: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿、构建零错误

- [ ] **Step 7: 提交**

```bash
git add src/components/review/ReviewWorkbench.tsx src/components/ReviewPanel.tsx src/components/ReviewPanel.test.tsx
git commit -m "feat(review): 工作台 ReviewWorkbench 替换扁平表格(P0 骨架完成)"
```

---

## 阶段 P1

### Task 7: FindingCard 接入置信度/严重度/低置信标记

**Files:**
- Modify: `src/components/review/FindingCard.tsx`（在判定胶囊后加 confidence、meta 行加 severity，低置信加标记）
- Test: `src/components/review/FindingCard.test.tsx`（追加用例）

**Interfaces:** 不变（props 同 Task 4）。

- [ ] **Step 1: 追加失败测试**

在 `FindingCard.test.tsx` 的 `describe` 内追加：
```tsx
  it("显示置信度与严重度，低置信加标记", () => {
    render(<FindingCard check={{ ...FAIL, confidence: 0.52, severity: 2 }}
      onConfirm={() => {}} onEvidence={() => {}} onOverrule={() => {}} />);
    expect(screen.getByText(/置信度 52%/)).toBeInTheDocument();
    expect(screen.getByText(/严重度 中/)).toBeInTheDocument();
    expect(screen.getByText("⚠ 建议人工")).toBeInTheDocument();
  });

  it("高置信不出现建议人工标记", () => {
    render(<FindingCard check={{ ...FAIL, confidence: 0.91, severity: 3 }}
      onConfirm={() => {}} onEvidence={() => {}} onOverrule={() => {}} />);
    expect(screen.queryByText("⚠ 建议人工")).not.toBeInTheDocument();
    expect(screen.getByText(/严重度 高/)).toBeInTheDocument();
  });

  it("已改判项显示机审→人工箭头链，不再显示操作按钮", () => {
    render(<FindingCard check={{ ...FAIL, status: "overruled", initial_result: "fail", final_result: "pass" }}
      onConfirm={() => {}} onEvidence={() => {}} onOverrule={() => {}} />);
    expect(screen.getByText(/机审 不通过/)).toBeInTheDocument();
    expect(screen.getByText(/人工 通过/)).toBeInTheDocument();
    expect(screen.queryByText("确认")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/review/FindingCard.test.tsx`
Expected: FAIL（新增 2 用例）

- [ ] **Step 3: 改 FindingCard.tsx**

在文件顶部常量区下方加严重度映射：
```tsx
const SEVERITY: Record<number, { label: string; color: string }> = {
  3: { label: "高", color: "#ff4d4f" }, 2: { label: "中", color: "#ad6800" }, 1: { label: "低", color: "#86909c" },
};
const LOW_CONF = 0.6;
```
把判定胶囊 `<span>机审 {meta.label}</span>` 整段替换为：已改判项（`status==="overruled"`）显示「机审→人工」箭头链，否则显示含置信度的机审胶囊：
```tsx
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
```
（注：FindingCard 已用 `const reviewed = check.status !== "open"` 控制操作按钮隐藏，改判后 `status==="overruled"` 自动不再显示「确认/改判」，满足测试断言。）
在 `rule_code` 那行右侧加严重度（同一 flex 行）：把
```tsx
      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#86909c", marginTop: 4 }}>{check.rule_code}</div>
```
改为
```tsx
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4, fontSize: 12 }}>
        <span style={{ fontFamily: "monospace", color: "#86909c" }}>{check.rule_code}</span>
        {check.severity != null && SEVERITY[check.severity] && (
          <span style={{ color: SEVERITY[check.severity].color }}>● 严重度 {SEVERITY[check.severity].label}</span>
        )}
      </div>
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/review/FindingCard.test.tsx`
Expected: PASS（含原 P0 用例共 4 个）

- [ ] **Step 5: 提交**

```bash
git add src/components/review/FindingCard.tsx src/components/review/FindingCard.test.tsx
git commit -m "feat(review): 发现卡片置信度/严重度/低置信标记(P1)"
```

---

### Task 8: getPackageSegments api 客户端

**Files:**
- Modify: `src/api/materials.ts`（追加类型与函数）
- Test: `src/api/materials.test.ts`（若不存在则创建）

**Interfaces:**
- Produces:
  ```ts
  interface MaterialFileSegments { material_file_id: number; file_name: string; segments: MaterialSegment[]; }
  function getPackageSegments(packageId: number): Promise<MaterialFileSegments[]>
  ```

- [ ] **Step 1: 写失败测试**

在 `src/api/materials.test.ts` 追加（无文件则新建带必要 import）：
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { getPackageSegments } from "./materials";

afterEach(() => vi.restoreAllMocks());

describe("getPackageSegments", () => {
  it("GET /api/packages/{id}/segments 返回分文件段落", async () => {
    const body = [{ material_file_id: 1, file_name: "a.pdf",
      segments: [{ id: 5, page_no: 1, locator: null, segment_type: "text", content_text: "原文" }] }];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }) as never);
    const r = await getPackageSegments(7);
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])
      .toBe("/api/packages/7/segments");
    expect(r[0].segments[0].content_text).toBe("原文");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/api/materials.test.ts`
Expected: FAIL（getPackageSegments 未导出）

- [ ] **Step 3: 改 materials.ts**

在文件末尾追加：
```ts
export interface MaterialFileSegments {
  material_file_id: number;
  file_name: string;
  segments: MaterialSegment[];
}
export function getPackageSegments(packageId: number): Promise<MaterialFileSegments[]> {
  return fetch(`/api/packages/${packageId}/segments`).then((r) => handle<MaterialFileSegments[]>(r));
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/api/materials.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/api/materials.ts src/api/materials.test.ts
git commit -m "feat(review): getPackageSegments 客户端(P1 出处数据源)"
```

---

### Task 9: EvidenceDrawer 出处原文抽屉

**Files:**
- Create: `src/components/review/EvidenceDrawer.tsx`
- Test: `src/components/review/EvidenceDrawer.test.tsx`

**Interfaces:**
- Consumes: `ReviewCheck`、`MaterialFileSegments`（Task 8）、`PackageStructured`（api/materials）、`resultOf`/`RESULT`
- Produces: `export default function EvidenceDrawer(props: EvidenceDrawerProps): JSX.Element`
  ```ts
  interface EvidenceDrawerProps {
    check: ReviewCheck | null;
    segments: MaterialFileSegments[] | undefined;
    structured: PackageStructured | undefined;
    onClose: () => void;
  }
  ```
- 内部 helper：`export function resolveEvidence(check, segments, structured): { source: string; text: string }[]`（纯函数，可单测）。

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EvidenceDrawer, { resolveEvidence } from "./EvidenceDrawer";
import type { ReviewCheck } from "../../api/review";

const SEGMENTS = [{ material_file_id: 1, file_name: "a.pdf",
  segments: [{ id: 5, page_no: 1, locator: null, segment_type: "text", content_text: "负责人 2022 年中断 1 年" }] }];
const STRUCTURED = { package_id: 7, members: [], coop_units: [], attachments: [],
  budget_items: [{ id: 2, category: "device", item_name: "设备费", amount: 240000, source_segment_id: null }],
  fields: [{ id: 1, field_code: "title", field_value: "某项目", extraction_status: "ok", source_segment_id: null }] };

function chk(over: Partial<ReviewCheck>): ReviewCheck {
  return { round_check_id: 1, rule_version_id: 1, rule_code: "R", name: "规则", dimension_code: "compliance",
    initial_result: "fail", initial_disposition: null, final_result: null, final_disposition: null,
    effective_result: "fail", status: "open", suggestion: null, confidence: null, severity: null,
    version: 0, evidence: [], ...over };
}

describe("resolveEvidence", () => {
  it("段落出处取段落原文", () => {
    const r = resolveEvidence(chk({ evidence: [{ segment_id: 5, field_code: null, budget_item_id: null, note: null }] }),
      SEGMENTS as never, STRUCTURED as never);
    expect(r[0].text).toBe("负责人 2022 年中断 1 年");
  });
  it("字段/预算出处取结构化值，多条并列", () => {
    const r = resolveEvidence(chk({ evidence: [
      { segment_id: null, field_code: "title", budget_item_id: null, note: null },
      { segment_id: null, field_code: null, budget_item_id: 2, note: null },
    ] }), SEGMENTS as never, STRUCTURED as never);
    expect(r).toHaveLength(2);
    expect(r[0].text).toContain("某项目");
    expect(r[1].text).toContain("设备费");
  });
});

describe("EvidenceDrawer", () => {
  it("打开时显示原文", () => {
    render(<EvidenceDrawer check={chk({ evidence: [{ segment_id: 5, field_code: null, budget_item_id: null, note: null }] })}
      segments={SEGMENTS as never} structured={STRUCTURED as never} onClose={() => {}} />);
    expect(screen.getByText(/负责人 2022 年中断 1 年/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/review/EvidenceDrawer.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 EvidenceDrawer.tsx**

```tsx
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/review/EvidenceDrawer.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/review/EvidenceDrawer.tsx src/components/review/EvidenceDrawer.test.tsx
git commit -m "feat(review): 出处原文抽屉 EvidenceDrawer(P1)"
```

---

### Task 10: OverruleDrawer 改判抽屉 + 接线 Workbench

**Files:**
- Create: `src/components/review/OverruleDrawer.tsx`
- Modify: `src/components/review/ReviewWorkbench.tsx`（用 EvidenceDrawer 替换 `message.info` 占位、用 OverruleDrawer 替换 Modal；新增 segments/structured 取数）
- Test: `src/components/review/OverruleDrawer.test.tsx`、`src/components/ReviewPanel.test.tsx`（追加出处抽屉用例）

**Interfaces:**
- Produces: `export default function OverruleDrawer(props: OverruleDrawerProps): JSX.Element`
  ```ts
  interface OverruleDrawerProps {
    check: ReviewCheck | null;
    onClose: () => void;
    onSubmit: (final_result: string, remark: string) => void;
  }
  ```

- [ ] **Step 1: 写 OverruleDrawer 失败测试**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OverruleDrawer from "./OverruleDrawer";
import type { ReviewCheck } from "../../api/review";

const CHK: ReviewCheck = { round_check_id: 1, rule_version_id: 1, rule_code: "R", name: "设备费占比超限",
  dimension_code: "rationality", initial_result: "fail", initial_disposition: null, final_result: null,
  final_disposition: null, effective_result: "fail", status: "open", suggestion: "超过 20% 上限",
  confidence: 0.91, severity: 3, version: 2, evidence: [] };

describe("OverruleDrawer", () => {
  it("未选结果或未填意见不提交", () => {
    const onSubmit = vi.fn();
    render(<OverruleDrawer check={CHK} onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("提交改判"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("选结果+填意见后提交回调", () => {
    const onSubmit = vi.fn();
    render(<OverruleDrawer check={CHK} onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("✓ 通过"));
    fireEvent.change(screen.getByPlaceholderText(/处置意见/), { target: { value: "已补充材料" } });
    fireEvent.click(screen.getByText("提交改判"));
    expect(onSubmit).toHaveBeenCalledWith("pass", "已补充材料");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/components/review/OverruleDrawer.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 OverruleDrawer.tsx**

```tsx
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/components/review/OverruleDrawer.test.tsx`
Expected: PASS

- [ ] **Step 5: 接线 ReviewWorkbench**

改 `ReviewWorkbench.tsx`：
1. import 增加：
```tsx
import EvidenceDrawer from "./EvidenceDrawer";
import OverruleDrawer from "./OverruleDrawer";
import { getPackageSegments, getPackageStructured } from "../../api/materials";
```
2. 删除 `Modal, Select, Input` 与 `RESULT_OPTIONS`、`ovResult`/`ovRemark` 两个 state 及 `openEvidence` 占位。
3. 增加取数与抽屉 state：
```tsx
  const [evidence, setEvidence] = useState<ReviewCheck | null>(null);
  const segQ = useQuery({ queryKey: ["pkg-segments", packageId], queryFn: () => getPackageSegments(packageId), enabled: evidence !== null });
  const structQ = useQuery({ queryKey: ["pkg-structured", packageId], queryFn: () => getPackageStructured(packageId), enabled: evidence !== null });
```
4. `onEvidence` 改为 `setEvidence`，渲染处 `onEvidence={openEvidence}` 改为 `onEvidence={setEvidence}`。
5. 把 `<Modal>…</Modal>` 整段替换为：
```tsx
      <EvidenceDrawer check={evidence} segments={segQ.data} structured={structQ.data}
        onClose={() => setEvidence(null)} />
      <OverruleDrawer check={overrule} onClose={() => setOverrule(null)}
        onSubmit={(final_result, remark) => {
          if (overrule) mut.mutate({ id: overrule.round_check_id,
            body: { action: "overrule", final_result, remark, version: overrule.version } });
          setOverrule(null);
        }} />
```
6. `onOverrule` 简化为 `onOverrule={setOverrule}`（删掉 setOvResult/setOvRemark）。

- [ ] **Step 6: 追加 ReviewPanel 出处抽屉用例**

在 `ReviewPanel.test.tsx` 追加：
```tsx
  it("点出处打开原文抽屉", async () => {
    vi.spyOn(matApi, "listMaterialPackages").mockResolvedValue([PKG] as never);
    vi.spyOn(revApi, "getPackageReview").mockResolvedValue(REVIEW as never);
    vi.spyOn(matApi, "getPackageSegments").mockResolvedValue([{ material_file_id: 1, file_name: "a.pdf",
      segments: [{ id: 5, page_no: 1, locator: null, segment_type: "text", content_text: "申请人原文片段" }] }] as never);
    vi.spyOn(matApi, "getPackageStructured").mockResolvedValue(
      { package_id: 3, members: [], coop_units: [], budget_items: [], attachments: [], fields: [] } as never);
    const { container } = renderWithQuery(<ReviewPanel />);
    await expandFirst(container);
    await waitFor(() => expect(screen.getByText(/段落#5/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/段落#5/));
    await waitFor(() => expect(screen.getByText(/申请人原文片段/)).toBeInTheDocument());
  });
```

- [ ] **Step 7: 全量测试 + 构建**

Run: `npm test && npm run build`
Expected: 全绿、构建零错误

- [ ] **Step 8: 提交**

```bash
git add src/components/review/OverruleDrawer.tsx src/components/review/OverruleDrawer.test.tsx src/components/review/ReviewWorkbench.tsx src/components/ReviewPanel.test.tsx
git commit -m "feat(review): 改判抽屉 OverruleDrawer + 出处抽屉接线(P1 完成)"
```

---

## Self-Review 记录

- **Spec 覆盖**：§2 P0①横幅→Task2；②统计卡→Task3；③分组→Task1/5；④发现卡片→Task4。§2 P1⑤置信/严重→Task7；⑥出处抽屉→Task8/9；⑦改判抽屉→Task10；⑧箭头链留痕→Task7（FindingCard 在 `status==="overruled"` 时显式渲染「机审 {initial} → 人工 {final}」箭头链 + reviewed 置灰，改判提交链路在 Task10）。§3 数据层→Task8。§4 维度映射→Task1。§8 测试→各任务 TDD。
- **Placeholder 扫描**：无 TBD/TODO；P0 占位（message.info / Modal）在 Task10 被显式替换，已标注。
- **类型一致性**：`resultOf`/`countChecks`/`groupByDimension`/`DimensionGroupData`/`Counts`/`ResultKey`/`evidenceLabel`/`resolveEvidence`/`MaterialFileSegments` 全程同名同签名。
- **遗留**：改判抽屉「依据条款」降级显示 `suggestion ?? name`（§3 已说明，后端补全文为后续可选）。
