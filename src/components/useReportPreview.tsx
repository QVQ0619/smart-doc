import { useState } from "react";
import { message } from "antd";
import { fetchReportBlobUrl, type TaskReport } from "../api/tasks";
import FilePreviewModal from "./FilePreviewModal";

// 任务报告在线预览：取 blob objectURL → FilePreviewModal（pdf/docx/图片），
// 关闭时 revoke。三个报告页（任务评审/报告生成/审查台账）共用。
export function useReportPreview() {
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  function openPreview(taskId: number, r: TaskReport) {
    fetchReportBlobUrl(taskId, r.id)
      .then((url) => setPreview({ url, name: r.file_name || `${r.report_name}审查报告` }))
      .catch((e) => message.error(e instanceof Error ? e.message : "打开失败"));
  }

  const previewModal = (
    <FilePreviewModal
      open={preview != null}
      url={preview?.url ?? null}
      fileName={preview?.name ?? ""}
      onClose={() => {
        if (preview) URL.revokeObjectURL(preview.url);
        setPreview(null);
      }}
    />
  );

  return { openPreview, previewModal };
}
