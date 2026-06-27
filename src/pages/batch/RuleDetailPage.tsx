import { useState, useEffect } from "react";
import { Breadcrumb, Button, Tabs, type BreadcrumbProps } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSessionStore, useChat } from "@blade-hq/agent-kit/react";
import { useRouteStore } from "../../store/useRouteStore";
import {
  listStandardDocs,
  listRules,
  listClauses,
  recognizeStandardDoc,
  downloadStandardDocUrl,
  type StandardDoc,
} from "../../api/standardDocs";
import FilePreviewModal from "../../components/FilePreviewModal";
import DimensionRuleGroup from "../../components/batch/DimensionRuleGroup";
import ClauseItemCard from "../../components/batch/ClauseItemCard";

interface Props {
  docId: number;
  docTitle: string;
  batchId?: number;
  batchTitle?: string;
}

export default function RuleDetailPage({ docId, docTitle, batchId, batchTitle }: Props) {
  const navigate = useRouteStore((s) => s.navigate);
  const qc = useQueryClient();
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const { send } = useChat(activeSessionId ?? "");

  const [pending, setPending] = useState<{
    docId: number;
    title: string;
    sawProcessing: boolean;
  } | null>(null);
  const [preview, setPreview] = useState(false);

  // 与 StandardDocLibrary 相同的轮询逻辑（零行为改动）
  const listQuery = useQuery({
    queryKey: ["standard-docs"],
    queryFn: listStandardDocs,
    refetchInterval: (query) => {
      const data = query.state.data as StandardDoc[] | undefined;
      return Array.isArray(data) &&
        data.some((d) => d.recognition_status === "processing")
        ? 3000
        : 10000;
    },
  });

  const recognizeMut = useMutation({
    mutationFn: (id: number) => recognizeStandardDoc(id),
    onSuccess: (res) => {
      if (res.recognition_status === "processing") toast.info("识别中…");
      else if (res.recognition_status === "done")
        toast.success(`已识别 ${res.segment_count} 段`);
      else toast.warning("识别失败：" + (res.error ?? "未知原因"));
      qc.invalidateQueries({ queryKey: ["standard-docs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function onRecognize() {
    if (!activeSessionId) {
      toast.warning("请先在右侧开始对话");
      return;
    }
    setPending({ docId, title: docTitle, sawProcessing: false });
    recognizeMut.mutate(docId);
  }

  // sawProcessing 守卫：processing→done 后触发 send（与 StandardDocLibrary.onRecognize 行为完全一致）
  useEffect(() => {
    if (!pending) return;
    const doc = (listQuery.data ?? []).find((d) => d.id === pending.docId);
    if (!doc) return;
    if (doc.recognition_status === "processing" && !pending.sawProcessing) {
      setPending((p) => (p ? { ...p, sawProcessing: true } : p));
      return;
    }
    if (!pending.sawProcessing) return; // 未见本轮 processing 前忽略陈旧 done/failed
    if (doc.recognition_status === "done") {
      if (activeSessionId) {
        send(
          `请重新抽取规则文件《${pending.title}》(doc_id=${pending.docId}) 的审查规则。`,
        );
        toast.info("已请 AI 重新抽取规则…");
      }
      setPending(null);
    } else if (doc.recognition_status === "failed") {
      toast.error("重新识别失败,未触发抽取");
      setPending(null);
    }
  }, [listQuery.data, pending, activeSessionId, send]);

  const rulesQuery = useQuery({
    queryKey: ["rules", docId],
    queryFn: () => listRules(docId),
  });
  const clausesQuery = useQuery({
    queryKey: ["clauses", docId],
    queryFn: () => listClauses(docId),
  });

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

  return (
    <>
      {/* 面包屑 */}
      <Breadcrumb items={breadcrumbItems} style={{ marginBottom: 14 }} />

      {/* 页头：标题 + 操作 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600 }}>📘 {docTitle}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button onClick={() => setPreview(true)}>查看原文件</Button>
          <Button loading={recognizeMut.isPending} onClick={onRecognize}>
            重新识别并重抽规则
          </Button>
        </div>
      </div>

      {/* 内容 Tabs */}
      <Tabs
        items={[
          {
            key: "rules",
            label: "审查规则",
            children: rulesQuery.isLoading ? (
              <span>加载中…</span>
            ) : !rulesQuery.data?.length ? (
              <span>
                尚未结构化，可在聊天里让 AI 把本文档条款结构化为规则
              </span>
            ) : (
              <DimensionRuleGroup rules={rulesQuery.data} docId={docId} />
            ),
          },
          {
            key: "clauses",
            label: "依据条款",
            children: clausesQuery.isLoading ? (
              <span>加载中…</span>
            ) : !clausesQuery.data?.length ? (
              <span>尚未抽取，可在聊天里让 AI 抽取本文档规则</span>
            ) : (
              clausesQuery.data.map((c) => (
                <ClauseItemCard key={c.id} clause={c} docId={docId} />
              ))
            ),
          },
        ]}
      />

      {/* 原文件预览弹窗 */}
      <FilePreviewModal
        open={preview}
        url={previewUrl}
        fileName={docTitle}
        onClose={() => setPreview(false)}
      />
    </>
  );
}
