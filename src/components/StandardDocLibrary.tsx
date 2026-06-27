import { useState, useEffect } from "react";
import { Button, Popconfirm, Space, Table, Tag } from "antd";
import FilePreviewModal from "./FilePreviewModal";
import type { ColumnsType } from "antd/es/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listStandardDocs,
  deleteStandardDoc,
  downloadStandardDocUrl,
  recognizeStandardDoc,
  type StandardDoc,
} from "../api/standardDocs";
import { useSessionStore, useChat } from "@blade-hq/agent-kit/react";
import { useRouteStore } from "../store/useRouteStore";

function humanSize(bytes: number | null): string {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const KEY = ["standard-docs"];

export default function StandardDocLibrary() {
  const qc = useQueryClient();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const { send } = useChat(activeSessionId ?? "");
  const navigate = useRouteStore((s) => s.navigate);
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
          <a
            style={{ cursor: "pointer" }}
            onClick={() =>
              navigate({ name: "rule-detail", docId: row.id, docTitle: row.title })
            }
          >
            查看规则
          </a>
          <a style={{ cursor: "pointer" }}
             onClick={() => setPreview({ url: downloadStandardDocUrl(row.id), name: row.file_name })}>
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
