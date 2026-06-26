import { useState, useEffect } from "react";
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag } from "antd";
import FilePreviewModal from "./FilePreviewModal";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listStandardDocs,
  deleteStandardDoc,
  downloadStandardDocUrl,
  recognizeStandardDoc,
  listClauses,
  listRules,
  updateClause,
  deleteClause,
  updateRule,
  deleteRule,
  type StandardDoc,
  type Clause,
  type Rule,
  type RuleUpdate,
} from "../api/standardDocs";
import { useSessionStore, useChat } from "@blade-hq/agent-kit/react";

function humanSize(bytes: number | null): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const KEY = ["standard-docs"];

function clauseProvenance(c: Clause): string {
  const loc = c.locator ?? {};
  const raw = (loc["block_index"] ?? loc["para_index"]);
  const segPart = typeof raw === "number" ? `第${raw + 1}段` : "";
  if (c.page_no != null) return `第${c.page_no}页${segPart}`;
  return segPart || "—";
}

const CLAUSE_COLS: ColumnsType<Clause> = [
  { title: "条号", dataIndex: "clause_no", key: "clause_no", width: 120 },
  { title: "条文", dataIndex: "clause_text", key: "clause_text" },
  { title: "出处", key: "prov", width: 160, render: (_: unknown, c: Clause) => clauseProvenance(c) },
];

function ClauseList({ docId }: { docId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["clauses", docId], queryFn: () => listClauses(docId) });
  const [editing, setEditing] = useState<Clause | null>(null);
  const [form] = Form.useForm();

  const updateMut = useMutation({
    mutationFn: (v: { clause_no: string; clause_text: string | null }) =>
      updateClause(docId, editing!.id, v),
    onSuccess: () => {
      toast.success("已保存");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["clauses", docId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteClause(docId, id),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["clauses", docId] });
      qc.invalidateQueries({ queryKey: ["rules", docId] });   // 可能连带删了规则
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function openEdit(c: Clause) {
    setEditing(c);
    form.setFieldsValue({ clause_no: c.clause_no, clause_text: c.clause_text ?? "" });
  }

  const cols: ColumnsType<Clause> = [
    ...CLAUSE_COLS,
    {
      title: "操作", key: "ops", width: 120,
      render: (_: unknown, c: Clause) => (
        <Space>
          <a onClick={() => openEdit(c)}>编辑</a>
          <Popconfirm title="确认删除该条款?" okText="确定" cancelText="取消"
            onConfirm={() => deleteMut.mutate(c.id)}>
            <a>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (q.isLoading) return <span>加载中…</span>;
  const data = q.data ?? [];
  if (!data.length) return <span>尚未抽取，可在聊天里让 AI 抽取本文档规则</span>;
  return (
    <>
      <Table rowKey="id" size="small" dataSource={data} columns={cols} pagination={false} />
      <Modal
        title="编辑条款" open={!!editing} okText="保存" cancelText="取消"
        confirmLoading={updateMut.isPending}
        onOk={() => form.submit()} onCancel={() => setEditing(null)} destroyOnHidden
      >
        <Form form={form} layout="vertical"
          onFinish={(v) => updateMut.mutate({ clause_no: v.clause_no, clause_text: v.clause_text || null })}>
          <Form.Item name="clause_no" label="条号" rules={[{ required: true, message: "条号必填" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="clause_text" label="条文">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

const DECISION_LABEL: Record<string, string> = { hard: "硬性", verify: "需核验", soft: "建议" };
const DISPOSITION_LABEL: Record<string, string> = { reject: "驳回", fix: "补正", review: "复核" };
const BINDING_LABEL: Record<string, string> = { common: "通用", parameterized: "参数化", specific: "特定" };

const DIMENSION_LABEL: Record<string, string> = {
  completeness: "完整性",
  normativeness: "规范性",
  compliance: "合规性",
  consistency: "一致性",
  rationality: "合理性",
  authenticity: "真实性",
};

const opts = (m: Record<string, string>) =>
  Object.entries(m).map(([value, label]) => ({ value, label }));

function ruleProvenance(r: Rule): string {
  const loc = r.locator ?? {};
  const raw = (loc["block_index"] ?? loc["para_index"]);
  const segPart = typeof raw === "number" ? `第${raw + 1}段` : "";
  if (r.page_no != null) return `第${r.page_no}页${segPart}`;
  return segPart || "—";
}

const RULE_COLS: ColumnsType<Rule> = [
  { title: "规则名", dataIndex: "name", key: "name" },
  { title: "维度", dataIndex: "dimension_name", key: "dimension_name", width: 90 },
  { title: "判定", key: "decision", width: 90,
    render: (_: unknown, r: Rule) => <Tag>{DECISION_LABEL[r.decision_type] ?? r.decision_type}</Tag> },
  { title: "处置", key: "disposition", width: 90,
    render: (_: unknown, r: Rule) => <Tag>{DISPOSITION_LABEL[r.disposition] ?? r.disposition}</Tag> },
  { title: "出处", key: "prov", width: 160,
    render: (_: unknown, r: Rule) => ruleProvenance(r) },
];

function RuleList({ docId }: { docId: number }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["rules", docId], queryFn: () => listRules(docId) });
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
      name: r.name, logic: r.logic ?? "", dimension_code: r.dimension_code,
      decision_type: r.decision_type, disposition: r.disposition, binding_class: r.binding_class,
    });
  }

  const cols: ColumnsType<Rule> = [
    ...RULE_COLS,
    {
      title: "操作", key: "ops", width: 120,
      render: (_: unknown, r: Rule) => (
        <Space>
          <a onClick={() => openEdit(r)}>编辑</a>
          <Popconfirm title="确认删除该规则?" okText="确定" cancelText="取消"
            onConfirm={() => deleteMut.mutate(r.id)}>
            <a>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (q.isLoading) return <span>加载中…</span>;
  const data = q.data ?? [];
  if (!data.length) return <span>尚未结构化，可在聊天里让 AI 把本文档条款结构化为规则</span>;
  return (
    <>
      <Table rowKey="id" size="small" dataSource={data} columns={cols} pagination={false} />
      <Modal
        title="编辑规则" open={!!editing} okText="保存" cancelText="取消"
        confirmLoading={updateMut.isPending}
        onOk={() => form.submit()} onCancel={() => setEditing(null)} destroyOnHidden
      >
        <Form form={form} layout="vertical"
          onFinish={(v) => updateMut.mutate({
            name: v.name, logic: v.logic || null, dimension_code: v.dimension_code,
            decision_type: v.decision_type, disposition: v.disposition, binding_class: v.binding_class,
          })}>
          <Form.Item name="name" label="规则名" rules={[{ required: true, message: "规则名必填" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="logic" label="判定逻辑">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="dimension_code" label="维度" rules={[{ required: true }]}>
            <Select options={opts(DIMENSION_LABEL)} />
          </Form.Item>
          <Form.Item name="decision_type" label="判定" rules={[{ required: true }]}>
            <Select options={opts(DECISION_LABEL)} />
          </Form.Item>
          <Form.Item name="disposition" label="处置" rules={[{ required: true }]}>
            <Select options={opts(DISPOSITION_LABEL)} />
          </Form.Item>
          <Form.Item name="binding_class" label="绑定" rules={[{ required: true }]}>
            <Select options={opts(BINDING_LABEL)} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function DocExpand({ docId }: { docId: number }) {
  return (
    <Tabs
      size="small"
      items={[
        { key: "rules", label: "审查规则", children: <RuleList docId={docId} /> },
        { key: "clauses", label: "依据条款", children: <ClauseList docId={docId} /> },
      ]}
    />
  );
}

export default function StandardDocLibrary() {
  const qc = useQueryClient();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const { send } = useChat(activeSessionId ?? "");
  const [pending, setPending] = useState<{ docId: number; title: string; sawProcessing: boolean } | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  const listQuery = useQuery({
    queryKey: KEY,
    queryFn: listStandardDocs,
    refetchInterval: (query) => {
      const data = query.state.data as StandardDoc[] | undefined;
      return Array.isArray(data) && data.some((d) => d.recognition_status === "processing")
        ? 3000
        : 10000;
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteStandardDoc(id),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const STATUS: Record<string, { color: string; text: string }> = {
    pending: { color: "default", text: "待识别" },
    processing: { color: "blue", text: "识别中" },
    done: { color: "green", text: "已识别" },
    failed: { color: "red", text: "识别失败" },
  };

  const recognizeMut = useMutation({
    mutationFn: (id: number) => recognizeStandardDoc(id),
    onSuccess: (res) => {
      if (res.recognition_status === "processing") toast.info("识别中…");
      else if (res.recognition_status === "done") toast.success(`已识别 ${res.segment_count} 段`);
      else toast.warning("识别失败：" + (res.error ?? "未知原因"));
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function onRecognize(row: StandardDoc) {
    if (!activeSessionId) { toast.warning("请先在右侧开始对话"); return; }
    setPending({ docId: row.id, title: row.title, sawProcessing: false });
    recognizeMut.mutate(row.id);
  }

  useEffect(() => {
    if (!pending) return;
    const doc = (listQuery.data ?? []).find((d) => d.id === pending.docId);
    if (!doc) return;
    if (doc.recognition_status === "processing" && !pending.sawProcessing) {
      setPending((p) => (p ? { ...p, sawProcessing: true } : p));
      return;
    }
    if (!pending.sawProcessing) return;            // 未见本轮 processing 前，忽略陈旧 done/failed
    if (doc.recognition_status === "done") {
      if (activeSessionId) {
        send(`请重新抽取规则文件《${pending.title}》(doc_id=${pending.docId}) 的审查规则。`);
        toast.info("已请 AI 重新抽取规则…");
      }
      setPending(null);
    } else if (doc.recognition_status === "failed") {
      toast.error("重新识别失败,未触发抽取");
      setPending(null);
    }
  }, [listQuery.data, pending, activeSessionId, send]);

  const columns: ColumnsType<StandardDoc> = [
    { title: "标题", dataIndex: "title", key: "title" },
    { title: "文件名", dataIndex: "file_name", key: "file_name" },
    { title: "大小", dataIndex: "size_bytes", key: "size_bytes", render: (b: number | null) => humanSize(b) },
    {
      title: "识别状态",
      dataIndex: "recognition_status",
      key: "recognition_status",
      render: (s: string) => {
        const m = STATUS[s] ?? { color: "default", text: s };
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: "上传时间",
      dataIndex: "created_at",
      key: "created_at",
      render: (t: string | null) => (t ? new Date(t).toLocaleString() : "-"),
    },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, row: StandardDoc) => (
        <Space>
          <a onClick={() => setPreview({ url: downloadStandardDocUrl(row.id), name: row.file_name })}>
            查看原文件
          </a>
          <Button
            type="link"
            loading={recognizeMut.isPending && recognizeMut.variables === row.id}
            onClick={() => onRecognize(row)}
          >
            重新识别
          </Button>
          <Popconfirm
            title="确认删除该规则文件？"
            okText="确定"
            cancelText="取消"
            onConfirm={() => deleteMut.mutate(row.id)}
          >
            <Button type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Table
        rowKey="id"
        size="middle"
        loading={listQuery.isLoading}
        dataSource={listQuery.data ?? []}
        columns={columns}
        pagination={false}
        expandable={{ expandedRowRender: (row: StandardDoc) => <DocExpand docId={row.id} /> }}
      />
      <FilePreviewModal
        open={!!preview}
        url={preview?.url ?? null}
        fileName={preview?.name ?? ""}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
