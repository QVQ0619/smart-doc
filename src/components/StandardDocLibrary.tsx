import { useRef } from "react";
import { Button, Popconfirm, Space, Table, Tag } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listStandardDocs,
  uploadStandardDocs,
  deleteStandardDoc,
  downloadStandardDocUrl,
  recognizeStandardDoc,
  listClauses,
  type StandardDoc,
  type Clause,
} from "../api/standardDocs";

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
  const q = useQuery({ queryKey: ["clauses", docId], queryFn: () => listClauses(docId) });
  if (q.isLoading) return <span>加载中…</span>;
  const data = q.data ?? [];
  if (!data.length) return <span>尚未抽取，可在聊天里让 AI 抽取本文档规则</span>;
  return <Table rowKey="id" size="small" dataSource={data} columns={CLAUSE_COLS} pagination={false} />;
}

export default function StandardDocLibrary() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const listQuery = useQuery({
    queryKey: KEY,
    queryFn: listStandardDocs,
    refetchInterval: 10000,
  });

  const uploadMut = useMutation({
    mutationFn: (files: File[]) => uploadStandardDocs(files),
    onSuccess: (res) => {
      if (res.uploaded.length) toast.success(`成功上传 ${res.uploaded.length} 个规则文件`);
      if (res.failed.length) {
        toast.warning(`${res.failed.length} 个失败：` + res.failed.map((f) => `${f.name}(${f.reason})`).join("，"));
      }
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
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
    done: { color: "green", text: "已识别" },
    failed: { color: "red", text: "识别失败" },
  };

  const recognizeMut = useMutation({
    mutationFn: (id: number) => recognizeStandardDoc(id),
    onSuccess: (res) => {
      if (res.recognition_status === "done") toast.success(`已识别 ${res.segment_count} 段`);
      else toast.warning("识别失败：" + (res.error ?? "未知原因"));
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) uploadMut.mutate(files);
    e.target.value = "";
  }

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
          <a href={downloadStandardDocUrl(row.id)} target="_blank" rel="noreferrer">
            下载
          </a>
          <Button
            type="link"
            loading={recognizeMut.isPending && recognizeMut.variables === row.id}
            onClick={() => recognizeMut.mutate(row.id)}
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
      <div style={{ marginBottom: 16 }}>
        <input ref={inputRef} type="file" multiple hidden onChange={onPick} />
        <Button
          type="primary"
          icon={<UploadOutlined />}
          loading={uploadMut.isPending}
          onClick={() => inputRef.current?.click()}
        >
          上传规则文件
        </Button>
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={listQuery.isLoading}
        dataSource={listQuery.data ?? []}
        columns={columns}
        pagination={false}
        expandable={{ expandedRowRender: (row: StandardDoc) => <ClauseList docId={row.id} /> }}
      />
    </div>
  );
}
