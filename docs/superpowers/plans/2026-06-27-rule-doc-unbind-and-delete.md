# 规则文件 从批次移除 + 彻底删除 + 规则库查看 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在批次详情页支持「从批次移除」单个规则文件（仅解绑），在规则库页支持「彻底删除」规则文件（物理级联），并把规则库页接入左侧菜单、复用批次的美化详情页查看规则。

**Architecture:** 后端新增单个解绑端点（只删 `batch_rule_doc` 一行），并把现有「假软删」的 `DELETE /standard-docs/{doc_id}` 改造为复用 `delete_rules_for_doc` 的物理级联删除。前端在批次规则卡加「从批次移除」按钮、把规则库页接进菜单与路由、把 `RuleDetailPage` 的批次上下文改为可选以便从规则库复用。

**Tech Stack:** 后端 FastAPI + SQLModel + pytest；前端 React + TypeScript + Ant Design + @tanstack/react-query + zustand + vitest + @testing-library。

## Global Constraints

- 后端写/变更端点必须带 `dependencies=[Depends(require_api_key)]`（与现有 `DELETE /standard-docs/{doc_id}` 一致）。
- 删除链严格遵守 FK RESTRICT 顺序：`batch_rule_doc → review_rule 全链（经 delete_rules_for_doc）→ regulation_clause → parse_segment → standard_doc`。
- 彻底删除是**物理删除、不可逆**；`file_object` 维持现有 `deleted_at` 软删（不物理删 blob）。
- 单个解绑端点：删到返回 204，关联不存在返回 404。
- 前端写请求经 `src/api/batches.ts` 的 `authHeaders()` 带 `X-API-Key`（未配置则不带）。
- 全程中文 UI 文案；规则数据只靠 `docId`，批次上下文仅用于面包屑导航。
- 提交信息用中文，遵循现有 `feat(...)/fix(...)/docs:` 风格。

---

## File Structure

**后端**
- `backend/app/batches.py` — 新增 `unbind_rule_doc(db, batch_id, doc_id) -> bool` service。
- `backend/app/routers/batches.py` — 新增 `DELETE /batches/{batch_id}/standard-docs/{doc_id}` 路由。
- `backend/app/routers/standard_docs.py` — 改造 `delete_standard_doc` 为物理级联删除。
- `backend/tests/test_batches_api.py` — 追加解绑端点测试。
- `backend/tests/test_standard_doc_delete_cascade.py`（新建）— 彻底删除级联测试。

**前端**
- `src/api/batches.ts` — 新增 `unbindRuleDoc(batchId, docId)`。
- `src/pages/batch/BatchDetailPage.tsx` — 规则卡加「从批次移除」。
- `src/layout/menuConfig.tsx` — 新增 `rule-library` RouteKey + 菜单项。
- `src/App.tsx` — 路由映射加 `rule-library` → `RuleLibraryPage`；`rule-detail` 传可选 batch。
- `src/store/useRouteStore.ts` — `rule-detail` 的 `batchId/batchTitle` 改可选。
- `src/layout/SideMenu.tsx` — 选中态：无批次的 rule-detail 高亮 `rule-library`。
- `src/pages/batch/RuleDetailPage.tsx` — batch 上下文可选 + 面包屑适配。
- `src/components/StandardDocLibrary.tsx` — 「查看规则」导航 + 删除强警示文案 + 去掉展开行内表格。
- 对应 `*.test.tsx` 同步。

---

## Task 1: 后端 — 单个解绑 service + 端点

**Files:**
- Modify: `backend/app/batches.py`（在 `list_batch_rule_docs` 之后新增函数，约 38 行后）
- Modify: `backend/app/routers/batches.py`（import + 新增路由）
- Test: `backend/tests/test_batches_api.py`（文件末尾追加）

**Interfaces:**
- Produces: `unbind_rule_doc(db: Session, batch_id: int, doc_id: int) -> bool`（删到返回 True，未匹配返回 False）。
- Produces: 路由 `DELETE /api/batches/{batch_id}/standard-docs/{doc_id}` → 204（删到）/ 404（未匹配）。

- [ ] **Step 1: 写失败的 service 测试**

在 `backend/tests/test_batches_service.py` 末尾追加：

```python
def test_unbind_rule_doc_removes_one(client):
    """解绑单个：bind [d1,d2] → unbind d1 → True，list 只剩 [d2]。"""
    from app.batches import unbind_rule_doc
    with Session(engine) as db:
        b = _make_batch(db)
        d1 = _make_doc(db, "DOC-U1")
        d2 = _make_doc(db, "DOC-U2")
        db.commit()
        bind_rule_docs(db, b, [d1, d2])
        assert unbind_rule_doc(db, b, d1) is True
        assert list_batch_rule_docs(db, b) == [d2]


def test_unbind_rule_doc_missing_returns_false(client):
    """解绑不存在的关联 → False，list 不变。"""
    from app.batches import unbind_rule_doc
    with Session(engine) as db:
        b = _make_batch(db)
        d1 = _make_doc(db, "DOC-U3")
        db.commit()
        bind_rule_docs(db, b, [d1])
        assert unbind_rule_doc(db, b, 999999) is False
        assert list_batch_rule_docs(db, b) == [d1]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_batches_service.py::test_unbind_rule_doc_removes_one -v`
Expected: FAIL（`ImportError: cannot import name 'unbind_rule_doc'`）

- [ ] **Step 3: 实现 service**

在 `backend/app/batches.py` 的 `list_batch_rule_docs` 函数之后新增：

```python
def unbind_rule_doc(db: Session, batch_id: int, doc_id: int) -> bool:
    """解除单个规则文件与批次的绑定（只删 batch_rule_doc 一行）。
    删到返回 True；该关联不存在返回 False。不触碰 StandardDoc 及派生数据。"""
    res = db.execute(
        delete(BatchRuleDoc).where(
            BatchRuleDoc.batch_id == batch_id,
            BatchRuleDoc.standard_doc_id == doc_id,
        )
    )
    db.commit()
    return res.rowcount > 0
```

- [ ] **Step 4: 运行 service 测试确认通过**

Run: `cd backend && python -m pytest tests/test_batches_service.py -v`
Expected: PASS（含原有用例 + 2 个新用例）

- [ ] **Step 5: 写失败的端点测试**

在 `backend/tests/test_batches_api.py` 末尾追加（`_upload_standard_doc` / `_post_batch` 已在本文件定义）：

```python
# --------------------------------------------------------------------------- #
# DELETE /api/batches/{id}/standard-docs/{doc_id} 单个解绑
# --------------------------------------------------------------------------- #

def test_unbind_rule_doc_204(client):
    """解绑单个规则文件 → 204，详情里该 doc 消失、另一个保留。"""
    batch_id = _post_batch(client, "UNBIND-OK").json()["id"]
    d1 = _upload_standard_doc(client, "规则解绑1.pdf")
    d2 = _upload_standard_doc(client, "规则解绑2.pdf")
    client.post(f"/api/batches/{batch_id}/bind-rule-docs",
                json={"standard_doc_ids": [d1, d2]})

    r = client.delete(f"/api/batches/{batch_id}/standard-docs/{d1}")
    assert r.status_code == 204

    detail = client.get(f"/api/batches/{batch_id}").json()
    ids = [d["id"] for d in detail["rule_docs"]]
    assert d1 not in ids and d2 in ids


def test_unbind_rule_doc_missing_404(client):
    """解绑不存在的关联 → 404。"""
    batch_id = _post_batch(client, "UNBIND-MISS").json()["id"]
    r = client.delete(f"/api/batches/{batch_id}/standard-docs/999999")
    assert r.status_code == 404


def test_unbind_rule_doc_requires_key(client, monkeypatch):
    """配置 API key 后，解绑缺 key → 401。"""
    monkeypatch.setattr(config.settings, "api_key", "secret")
    batch_id = _post_batch(client, "UNBIND-AUTH", headers={"X-API-Key": "secret"}).json()["id"]
    r = client.delete(f"/api/batches/{batch_id}/standard-docs/1")
    assert r.status_code == 401
```

- [ ] **Step 6: 运行端点测试确认失败**

Run: `cd backend && python -m pytest tests/test_batches_api.py::test_unbind_rule_doc_404 -v`
Expected: FAIL（路由不存在 → 405 Method Not Allowed 或 404 默认，非预期断言路径；确认是因端点缺失而失败）

- [ ] **Step 7: 实现端点**

在 `backend/app/routers/batches.py` 顶部 import 加入 `unbind_rule_doc`：

```python
from ..batches import (bind_rule_docs, create_batch, get_batch_detail,
                       list_batch_standard_docs, list_batches, unbind_rule_doc)
```

在 `get_batch_standard_docs` 路由之后新增：

```python
@router.delete("/batches/{batch_id}/standard-docs/{doc_id}", status_code=204,
               dependencies=[Depends(require_api_key)])
def delete_batch_standard_doc(batch_id: int, doc_id: int,
                              db: Session = Depends(get_session)) -> None:
    if not unbind_rule_doc(db, batch_id, doc_id):
        raise HTTPException(status_code=404, detail="binding not found")
```

- [ ] **Step 8: 运行端点测试确认通过**

Run: `cd backend && python -m pytest tests/test_batches_api.py -v`
Expected: PASS（全部）

- [ ] **Step 9: 提交**

```bash
git add backend/app/batches.py backend/app/routers/batches.py backend/tests/test_batches_service.py backend/tests/test_batches_api.py
git commit -m "feat(api): 批次单个规则文件解绑端点 DELETE /batches/{id}/standard-docs/{doc_id}"
```

---

## Task 2: 后端 — 彻底删除改造为物理级联

**Files:**
- Modify: `backend/app/routers/standard_docs.py:1-16`（imports）、`:209-221`（端点）
- Test: `backend/tests/test_standard_doc_delete_cascade.py`（新建）

**Interfaces:**
- Consumes: `delete_rules_for_doc(db, doc_id)`（来自 `backend/app/structuring.py`，已存在）。
- Produces: `DELETE /api/standard-docs/{doc_id}` → 204，物理删除 standard_doc 及全部派生数据与批次关联。

- [ ] **Step 1: 写失败的级联测试**

新建 `backend/tests/test_standard_doc_delete_cascade.py`：

```python
"""彻底删除规则文件：物理级联清除 batch_rule_doc / 规则全链 / 条款 / 段落，并物理删除 standard_doc。"""
import uuid

from sqlalchemy import func, select
from sqlmodel import Session

from app.db import engine
from app.models import (BatchRuleDoc, ParseSegment, RegulationClause,
                        ReviewRuleClause, StandardDoc)


def _upload(client, filename="规则X.pdf") -> int:
    content = f"rule-{uuid.uuid4().hex}".encode()
    r = client.post("/api/standard-docs",
                    files=[("files", (filename, content, "application/pdf"))])
    assert r.status_code == 200, r.text
    return r.json()["uploaded"][0]["id"]


def test_delete_standard_doc_cascades_everything(client):
    doc_id = _upload(client)

    # 写 1 条 RegulationClause + 1 条 ParseSegment（直接落 DB）
    with Session(engine) as s:
        doc_code = s.execute(
            select(StandardDoc.doc_code).where(StandardDoc.id == doc_id)
        ).scalar_one()
        s.add(RegulationClause(standard_doc_id=doc_id, doc_code=doc_code, clause_no="第一条"))
        s.add(ParseSegment(standard_doc_id=doc_id, segment_type="text", content_text="正文"))
        s.commit()
        clause_id = s.execute(
            select(RegulationClause.id).where(RegulationClause.standard_doc_id == doc_id)
        ).scalar_one()

    # 经 API 建 1 条 review_rule（绑定到上面的 clause）
    r = client.post(f"/api/standard-docs/{doc_id}/rules", json={"rules": [
        {"source_clause_id": clause_id, "dimension_code": "compliance", "name": "规则A",
         "logic": None, "decision_type": "hard", "disposition": "reject",
         "binding_class": "common"}]})
    assert r.status_code == 200, r.text

    # 绑定到批次
    batch_id = client.post("/api/batches", json={"batch_no": "DEL-CASCADE"}).json()["id"]
    client.post(f"/api/batches/{batch_id}/bind-rule-docs",
                json={"standard_doc_ids": [doc_id]})

    # 彻底删除
    assert client.delete(f"/api/standard-docs/{doc_id}").status_code == 204

    with Session(engine) as s:
        assert s.get(StandardDoc, doc_id) is None                       # 物理删
        assert s.execute(select(func.count()).select_from(BatchRuleDoc)
                         .where(BatchRuleDoc.standard_doc_id == doc_id)).scalar_one() == 0
        assert s.execute(select(func.count()).select_from(RegulationClause)
                         .where(RegulationClause.standard_doc_id == doc_id)).scalar_one() == 0
        assert s.execute(select(func.count()).select_from(ParseSegment)
                         .where(ParseSegment.standard_doc_id == doc_id)).scalar_one() == 0
        assert s.execute(select(func.count()).select_from(ReviewRuleClause)).scalar_one() == 0


def test_delete_standard_doc_unknown_404(client):
    assert client.delete("/api/standard-docs/999999").status_code == 404
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && python -m pytest tests/test_standard_doc_delete_cascade.py -v`
Expected: FAIL（`test_delete_standard_doc_cascades_everything` 在断言 `StandardDoc is None` 处失败——现状是软删，行仍在）

- [ ] **Step 3: 改造端点 imports**

`backend/app/routers/standard_docs.py` 第 7 行改为：

```python
from sqlalchemy import delete, select
```

第 13 行改为：

```python
from ..models import BatchRuleDoc, FileObject, ParseSegment, RegulationClause, StandardDoc
```

在第 14 行 `from ..recognition import recognize_standard_doc` 之后加：

```python
from ..structuring import delete_rules_for_doc
```

- [ ] **Step 4: 改造端点实现**

把 `backend/app/routers/standard_docs.py:209-221` 整个函数替换为：

```python
@router.delete("/standard-docs/{doc_id}", status_code=204, dependencies=[Depends(require_api_key)])
def delete_standard_doc(doc_id: int, db: Session = Depends(get_session)):
    sd = db.get(StandardDoc, doc_id)
    if sd is None or not sd.is_active:
        raise HTTPException(status_code=404, detail="standard_doc not found")
    # 物理级联删除：严格按 FK RESTRICT 顺序（规则全链 → 条款 → 段落 → 批次关联 → 文档本身）
    delete_rules_for_doc(db, doc_id)
    db.execute(delete(RegulationClause).where(RegulationClause.standard_doc_id == doc_id))
    db.execute(delete(ParseSegment).where(ParseSegment.standard_doc_id == doc_id))
    db.execute(delete(BatchRuleDoc).where(BatchRuleDoc.standard_doc_id == doc_id))
    if sd.file_id:
        fo = db.get(FileObject, sd.file_id)
        if fo is not None:
            fo.deleted_at = datetime.now()  # file_object 维持软删
            db.add(fo)
    db.delete(sd)  # 物理删 standard_doc
    db.commit()
```

- [ ] **Step 5: 运行级联测试确认通过**

Run: `cd backend && python -m pytest tests/test_standard_doc_delete_cascade.py -v`
Expected: PASS（2 个用例）

- [ ] **Step 6: 跑全量后端测试确认无回归**

Run: `cd backend && python -m pytest -q`
Expected: PASS（注意 `test_auth.py` 中 `client.delete("/api/standard-docs/999999")` 仍应 404 —— 端点 404 分支未变）

- [ ] **Step 7: 提交**

```bash
git add backend/app/routers/standard_docs.py backend/tests/test_standard_doc_delete_cascade.py
git commit -m "feat(api): 规则文件彻底删除改为物理级联(复用 delete_rules_for_doc)"
```

---

## Task 3: 前端 — `unbindRuleDoc` API + 批次规则卡「从批次移除」

**Files:**
- Modify: `src/api/batches.ts`（末尾新增函数）
- Modify: `src/pages/batch/BatchDetailPage.tsx`（imports + mutation + 规则卡 actions）
- Test: `src/pages/batch/BatchDetailPage.test.tsx`（新增用例）

**Interfaces:**
- Consumes: `DELETE /api/batches/{batchId}/standard-docs/{docId}`（Task 1）。
- Produces: `unbindRuleDoc(batchId: number, docId: number): Promise<void>`。

- [ ] **Step 1: 写失败的前端测试**

在 `src/pages/batch/BatchDetailPage.test.tsx` 的 `describe("BatchDetailPage", …)` 内追加（`renderWithQuery`、`mockDetail`、`batchApi` 已在文件顶部就绪）：

```tsx
  it("点击'从批次移除' → 确认后调用 unbindRuleDoc(batchId, docId)", async () => {
    const spy = vi
      .spyOn(batchApi, "unbindRuleDoc")
      .mockResolvedValue(undefined);
    renderWithQuery(<BatchDetailPage batchId={5} batchTitle="B-2026-05" />);
    await waitFor(() =>
      expect(screen.getAllByText("从批次移除").length).toBeGreaterThan(0),
    );
    await userEvent.click(screen.getAllByText("从批次移除")[0]);
    // Popconfirm 确认
    await userEvent.click(await screen.findByText("确认移除"));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(5, 11));
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/pages/batch/BatchDetailPage.test.tsx -t "从批次移除"`
Expected: FAIL（`unbindRuleDoc` 不存在 / 找不到「从批次移除」按钮）

- [ ] **Step 3: 新增 API 函数**

在 `src/api/batches.ts` 末尾追加：

```ts
export function unbindRuleDoc(batchId: number, docId: number): Promise<void> {
  return fetch(`/api/batches/${batchId}/standard-docs/${docId}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  }).then((r) => handle<void>(r));
}
```

- [ ] **Step 4: 改造 BatchDetailPage imports**

`src/pages/batch/BatchDetailPage.tsx` 顶部：把 antd import 增加 `Popconfirm`：

```tsx
import {
  Breadcrumb,
  Button,
  Descriptions,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
```

把第 14 行的 react-query import 改为：

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
```

把 `getBatchDetail` 那行 import 改为同时引入 `unbindRuleDoc`：

```tsx
import { getBatchDetail, unbindRuleDoc } from "../../api/batches";
```

在 import 区加 toast：

```tsx
import { toast } from "sonner";
```

- [ ] **Step 5: 加 mutation**

在 `BatchDetailPage` 组件体内、`detailQuery` 之后加：

```tsx
  const qc = useQueryClient();
  const unbindMut = useMutation({
    mutationFn: (docId: number) => unbindRuleDoc(batchId, docId),
    onSuccess: () => {
      toast.success("已从批次移除");
      qc.invalidateQueries({ queryKey: ["batch-detail", batchId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
```

- [ ] **Step 6: 规则卡 actions 加按钮**

在 `renderRuleDocCard` 的 `actions` 的 `<Space>` 内，「原文」按钮之后追加：

```tsx
            <Popconfirm
              title="从本批次移除该规则文件？"
              description="仅解除与本批次的绑定，规则文件本身及其他批次不受影响。"
              okText="确认移除"
              cancelText="取消"
              onConfirm={() => unbindMut.mutate(doc.id)}
            >
              <Button size="small" danger>
                从批次移除
              </Button>
            </Popconfirm>
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx vitest run src/pages/batch/BatchDetailPage.test.tsx`
Expected: PASS（全部）

- [ ] **Step 8: 提交**

```bash
git add src/api/batches.ts src/pages/batch/BatchDetailPage.tsx src/pages/batch/BatchDetailPage.test.tsx
git commit -m "feat(web): 批次详情页规则卡『从批次移除』(单个解绑)"
```

---

## Task 4: 前端 — 规则库进菜单 + 路由可达

**Files:**
- Modify: `src/layout/menuConfig.tsx`（RouteKey + 菜单项 + 图标）
- Modify: `src/App.tsx`（import + case）
- Test: `src/App.test.tsx`（新增用例）、`src/layout/LibraryMenu.test.tsx`（新建，菜单含规则库）

**Interfaces:**
- Consumes: `RuleLibraryPage`（`src/pages/library/RuleLibraryPage.tsx`，已存在，包 `StandardDocLibrary`）。
- Produces: 新 `RouteKey "rule-library"`；菜单「资源」组含「规则库」项。

- [ ] **Step 1: 写失败的 App 路由测试**

在 `src/App.test.tsx` 末尾追加（先在顶部 mock 区加入对 RuleLibraryPage 的隔离 mock）：

顶部 mock 区追加：

```tsx
// 隔离 RuleLibraryPage 的真实依赖，聚焦路由切换
vi.mock("./pages/library/RuleLibraryPage", () => ({
  default: () => <div data-testid="rule-library-page" />,
}));
```

文件末尾追加：

```tsx
test("nav 为 rule-library 渲染规则库页", async () => {
  useRouteStore.setState({ nav: { name: "rule-library" } });
  render(<App />);
  expect(await screen.findByTestId("rule-library-page")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/App.test.tsx -t "rule-library"`
Expected: FAIL（类型错误：`"rule-library"` 不在 RouteKey；或渲染不到 testid）

- [ ] **Step 3: menuConfig 增加 RouteKey + 菜单项**

`src/layout/menuConfig.tsx`：图标 import 增加 `DatabaseOutlined`：

```tsx
import {
  HomeOutlined,
  FileAddOutlined,
  ProfileOutlined,
  FileDoneOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
```

`RouteKey` 联合类型加 `"rule-library"`：

```tsx
export type RouteKey =
  | "home"
  | "review-new"
  | "review-tasks"
  | "review-report"
  | "batch-list"
  | "rule-library"
  | "about";
```

「资源」组 `items` 改为：

```tsx
  {
    title: "资源",
    items: [
      { key: "batch-list", label: "项目批次", icon: <AppstoreOutlined /> },
      { key: "rule-library", label: "规则库", icon: <DatabaseOutlined /> },
    ],
  },
```

- [ ] **Step 4: App.tsx 接路由**

`src/App.tsx` import 区加：

```tsx
import RuleLibraryPage from "./pages/library/RuleLibraryPage";
```

`renderMain` 的 switch 内、`case "batch-list":` 之后加：

```tsx
    case "rule-library":
      return <RuleLibraryPage />;
```

- [ ] **Step 5: 运行 App 测试确认通过**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS（全部）

- [ ] **Step 6: 写菜单含规则库测试**

新建 `src/layout/LibraryMenu.test.tsx`：

```tsx
import { render, screen } from "@testing-library/react";
import SideMenu from "./SideMenu";
import { useMenuCollapseStore } from "../store/useMenuCollapseStore";

beforeEach(() => {
  useMenuCollapseStore.setState({ collapsed: false });
});

test("侧边菜单『资源』组含『规则库』项", () => {
  render(<SideMenu />);
  expect(screen.getByText("规则库")).toBeInTheDocument();
  expect(screen.getByText("项目批次")).toBeInTheDocument();
});
```

- [ ] **Step 7: 运行菜单测试确认通过**

Run: `npx vitest run src/layout/LibraryMenu.test.tsx`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/layout/menuConfig.tsx src/App.tsx src/App.test.tsx src/layout/LibraryMenu.test.tsx
git commit -m "feat(web): 规则库页接入左侧菜单『资源』组 + 路由"
```

---

## Task 5: 前端 — `RuleDetailPage` 批次上下文可选 + 面包屑适配

**Files:**
- Modify: `src/store/useRouteStore.ts`（`rule-detail` 类型）
- Modify: `src/App.tsx`（传可选 batch props）
- Modify: `src/layout/SideMenu.tsx`（选中态）
- Modify: `src/pages/batch/RuleDetailPage.tsx`（props 可选 + 面包屑）
- Test: `src/pages/batch/RuleDetailPage.test.tsx`（新增无批次用例）

**Interfaces:**
- Produces: `Nav` 的 `rule-detail` 变体 `batchId?` / `batchTitle?` 可选；`RuleDetailPage` 接受可选 batch；无批次时面包屑为「规则库 / 文件名」，点「规则库」→ `navigate({ name: "rule-library" })`。

- [ ] **Step 1: 写失败的无批次面包屑测试**

在 `src/pages/batch/RuleDetailPage.test.tsx` 末尾追加：

```tsx
test("无批次上下文：面包屑显示『规则库』并导航到 rule-library", async () => {
  render(
    <RuleDetailPage docId={7} docTitle="政策B" />,
  );
  const lib = await screen.findByText("规则库");
  await userEvent.click(lib);
  expect(useRouteStore.getState().nav.name).toBe("rule-library");
});
```

（若该测试文件未引入 `userEvent`，在顶部加 `import userEvent from "@testing-library/user-event";`）

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/pages/batch/RuleDetailPage.test.tsx -t "无批次"`
Expected: FAIL（类型要求 batchId/batchTitle 必填；或面包屑仍指向 batch-detail）

- [ ] **Step 3: 放开 Nav 类型**

`src/store/useRouteStore.ts` 第 7 行改为：

```ts
  | { name: "rule-detail"; docId: number; docTitle: string; batchId?: number; batchTitle?: string };
```

- [ ] **Step 4: App.tsx 传可选 props**

`src/App.tsx` 的 `case "rule-detail":` 保持不变即可（`n.batchId` / `n.batchTitle` 现为 `number | undefined`，与 Task 5 的可选 props 兼容）。确认 `RuleDetailPage` props 接受可选后无类型错误。

- [ ] **Step 5: RuleDetailPage props 可选 + 面包屑适配**

`src/pages/batch/RuleDetailPage.tsx`：`Props` 接口改为：

```tsx
interface Props {
  docId: number;
  docTitle: string;
  batchId?: number;
  batchTitle?: string;
}
```

把 `goToBatchDetail` 与 `breadcrumbItems` 段（约 106-117 行）替换为：

```tsx
  const hasBatch = batchId != null && batchTitle != null;
  function goToBatchDetail() {
    if (hasBatch) navigate({ name: "batch-detail", batchId, batchTitle });
  }

  const previewUrl = downloadStandardDocUrl(docId);

  const breadcrumbItems: BreadcrumbProps["items"] = hasBatch
    ? [
        { title: <a onClick={() => navigate({ name: "batch-list" })}>项目批次</a> },
        { title: <a onClick={goToBatchDetail}>{batchTitle}</a> },
        { title: <a onClick={goToBatchDetail}>规则库</a> },
        { title: docTitle },
      ]
    : [
        { title: <a onClick={() => navigate({ name: "rule-library" })}>规则库</a> },
        { title: docTitle },
      ];
```

（注意：原本 `const previewUrl = …` 在 `goToBatchDetail` 之后，本步把它一并纳入替换块，避免重复声明；若文件中仍有旧的 `const previewUrl` 行，删除旧行只保留此处。）

- [ ] **Step 6: SideMenu 选中态适配**

`src/layout/SideMenu.tsx` 第 24-27 行的 `selectedKey` 改为：

```tsx
  const selectedKey =
    nav.name === "batch-detail"
      ? "batch-list"
      : nav.name === "rule-detail"
        ? nav.batchId != null
          ? "batch-list"
          : "rule-library"
        : nav.name;
```

- [ ] **Step 7: 运行相关测试确认通过**

Run: `npx vitest run src/pages/batch/RuleDetailPage.test.tsx src/App.test.tsx src/layout/SideMenu.test.tsx`
Expected: PASS（含原有「面包屑『规则库』导航到 batch-detail」用例仍绿——那些用例传了 batchId）

- [ ] **Step 8: 提交**

```bash
git add src/store/useRouteStore.ts src/App.tsx src/layout/SideMenu.tsx src/pages/batch/RuleDetailPage.tsx src/pages/batch/RuleDetailPage.test.tsx
git commit -m "feat(web): RuleDetailPage 批次上下文可选(面包屑适配规则库进入)"
```

---

## Task 6: 前端 — 规则库「查看规则」导航 + 删除强警示文案

**Files:**
- Modify: `src/components/StandardDocLibrary.tsx`（imports + 操作列「查看规则」+ 删除 Popconfirm 文案）
- Test: `src/components/StandardDocLibrary.test.tsx`（新增导航 + 文案用例）

**Interfaces:**
- Consumes: `useRouteStore.navigate` + `rule-detail`（无 batch）（Task 5）。
- Produces: 规则库行「查看规则」→ `navigate({ name: "rule-detail", docId, docTitle })`。

- [ ] **Step 1: 写失败的导航测试**

在 `src/components/StandardDocLibrary.test.tsx` 内新增（沿用该文件既有的渲染/mock helper；若需要可参考文件顶部已有的 `listStandardDocs` mock 数据，取第一行 doc 的 id/title）：

```tsx
test("点击『查看规则』→ navigate rule-detail（无 batch）", async () => {
  // 复用本文件已有的渲染与 listStandardDocs mock（doc 列表至少 1 行）
  renderLibrary(); // ← 用本文件既有的渲染入口
  const btn = await screen.findAllByText("查看规则");
  await userEvent.click(btn[0]);
  const nav = useRouteStore.getState().nav;
  expect(nav.name).toBe("rule-detail");
  if (nav.name === "rule-detail") {
    expect(nav.batchId).toBeUndefined();
  }
});
```

> 实现者注意：本文件已有自己的渲染封装与 `listStandardDocs` mock，请用其既有入口替换上面的 `renderLibrary()` 占位调用，并在顶部 `import { useRouteStore } from "../store/useRouteStore";`、`import userEvent from "@testing-library/user-event";`（若尚未引入）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/StandardDocLibrary.test.tsx -t "查看规则"`
Expected: FAIL（找不到「查看规则」/ 未导航）

- [ ] **Step 3: StandardDocLibrary 加导航 + 按钮**

`src/components/StandardDocLibrary.tsx` 顶部 import 加：

```tsx
import { useRouteStore } from "../store/useRouteStore";
```

在 `StandardDocLibrary()` 组件体内加：

```tsx
  const navigate = useRouteStore((s) => s.navigate);
```

在操作列 `render` 的 `<Space>` 内、「查看原文件」之前加「查看规则」按钮：

```tsx
          <a
            style={{ cursor: "pointer" }}
            onClick={() =>
              navigate({ name: "rule-detail", docId: row.id, docTitle: row.title })
            }
          >
            查看规则
          </a>
```

- [ ] **Step 4: 删除 Popconfirm 改强警示文案**

把操作列中删除的 `<Popconfirm …>` 改为：

```tsx
          <Popconfirm
            title="彻底删除该规则文件？"
            description="将永久删除该规则文件及其全部条款、审查规则、配置包，并从所有批次解绑，不可恢复。"
            okText="确认彻底删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => deleteMut.mutate(row.id)}
          >
            <Button type="link" danger>
              彻底删除
            </Button>
          </Popconfirm>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/components/StandardDocLibrary.test.tsx`
Expected: PASS（若旧用例断言旧文案「删除」按钮文本，需要随之更新为「彻底删除」——在本步一并改测试断言）

- [ ] **Step 6: 提交**

```bash
git add src/components/StandardDocLibrary.tsx src/components/StandardDocLibrary.test.tsx
git commit -m "feat(web): 规则库『查看规则』跳美化详情页 + 彻底删除强警示文案"
```

---

## Task 7: 前端 — 去掉规则库展开行内表格（统一走详情页）

**Files:**
- Modify: `src/components/StandardDocLibrary.tsx`（移除 `expandable` + `DocExpand`/`RuleList`/`ClauseList` 及其相关 cols/imports）
- Test: `src/components/StandardDocLibrary.test.tsx`（删除展开相关用例）

**Interfaces:**
- 无新增对外接口；删除冗余的行内预览，规则查看统一由 Task 6 的「查看规则」→ `RuleDetailPage` 承担。

- [ ] **Step 1: 移除 Table 的 expandable**

`src/components/StandardDocLibrary.tsx` 中 `<Table … expandable={{ expandedRowRender: (row: StandardDoc) => <DocExpand docId={row.id} /> }} />` 去掉 `expandable` 这个 prop（保留其余 props）。

- [ ] **Step 2: 删除现已无用的内嵌组件与列定义**

删除 `DocExpand`、`RuleList`、`ClauseList` 三个函数组件，及仅供它们使用的 `CLAUSE_COLS`、`RULE_COLS`、`DECISION_LABEL`/`DISPOSITION_LABEL`/`BINDING_LABEL`/`DIMENSION_LABEL`/`opts`/`clauseProvenance`/`ruleProvenance` 等仅被它们引用的辅助定义。

清理顶部 import 中现已不再使用的符号：`Form`、`Input`、`Modal`、`Select`、`Tabs`，以及 `listClauses`、`listRules`、`updateClause`、`deleteClause`、`updateRule`、`deleteRule`、`type Clause`、`type Rule`、`type RuleUpdate`。

> 实现者注意：逐个确认这些符号在文件内确无其他引用后再删；以 TypeScript 编译（Step 4）兜底捕获遗漏。

- [ ] **Step 3: 删除展开相关测试用例**

在 `src/components/StandardDocLibrary.test.tsx` 中，删除所有依赖「展开行 → 审查规则/依据条款 Tab」的用例（断言展开后出现规则/条款表格、编辑/删除单条规则或条款的用例）。保留：列表渲染、识别状态、重新识别、查看原文件、Task 6 的「查看规则」导航与「彻底删除」文案用例。

- [ ] **Step 4: 类型检查 + 测试**

Run: `npx tsc --noEmit`
Expected: 无错误（确认没有遗留未使用 import / 未定义引用）

Run: `npx vitest run src/components/StandardDocLibrary.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/StandardDocLibrary.tsx src/components/StandardDocLibrary.test.tsx
git commit -m "refactor(web): 规则库去掉展开行内表格(统一走美化详情页)"
```

---

## Task 8: 全量验证 + 收尾

**Files:** 无新增；端到端校验。

- [ ] **Step 1: 后端全量测试**

Run: `cd backend && python -m pytest -q`
Expected: PASS（全绿）

- [ ] **Step 2: 前端全量测试 + 构建**

Run: `npx vitest run`
Expected: PASS（全绿）

Run: `npm run build`
Expected: 构建零错误

- [ ] **Step 3: 人工冒烟（可选，需本地起服务）**

- 左侧菜单「资源」→「规则库」可进入；行「查看规则」进入美化详情页，面包屑「规则库 / 文件名」。
- 批次详情页规则卡「从批次移除」→ 确认 → 该卡消失、其他批次不受影响。
- 规则库「彻底删除」→ 确认 → 该规则文件消失；回批次详情页该文件已不在绑定列表。

- [ ] **Step 4: 更新设计文档状态（可选）**

把 `docs/superpowers/specs/2026-06-27-rule-doc-unbind-and-delete-design.md` 顶部状态由「设计已确认，待写实现计划」改为「已实现」。

```bash
git add docs/superpowers/specs/2026-06-27-rule-doc-unbind-and-delete-design.md
git commit -m "docs: 规则文件 移除/彻底删除 设计文档标记已实现"
```

---

## Self-Review

**Spec coverage：**
- 改动①（从批次移除）→ Task 1（后端）+ Task 3（前端）✅
- 改动②（彻底删除物理级联）→ Task 2（后端）+ Task 6（前端文案/按钮）✅
- 改动③（规则库进菜单 + 路由）→ Task 4 ✅
- 改动④（复用美化详情页 + 面包屑适配）→ Task 5 + Task 6（查看规则导航）✅
- 决策 6.4（去掉展开行内表格）→ Task 7 ✅
- 测试清单（解绑端点、级联断言、菜单入口、无批次面包屑）→ Task 1/2/4/5/6 覆盖 ✅
- 404/204 语义、file_object 软删 → Task 1/2 明确 ✅

**Placeholder scan：** Task 6 Step 1 与 Task 7 Step 2/3 含「实现者注意」说明（因 `StandardDocLibrary.test.tsx` 为既有大文件、未逐行纳入本计划），均给出了精确的符号清单与判定标准 + tsc 兜底，非空泛占位。其余步骤均含完整代码与命令。

**Type consistency：**
- `unbind_rule_doc(db, batch_id, doc_id) -> bool`：Task 1 定义、被路由调用，一致。
- `unbindRuleDoc(batchId, docId): Promise<void>`：Task 1 端点 / Task 3 定义与调用，一致。
- `Nav.rule-detail` 的 `batchId?/batchTitle?`：Task 5 放开类型，Task 6 导航不带 batch、Task 3 导航带 batch，均与可选类型兼容。
- `delete_rules_for_doc`：Task 2 复用 `structuring.py` 既有签名。
