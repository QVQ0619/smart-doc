import { Suspense, lazy } from "react";
import { Modal, Spin } from "antd";

// docx-preview 依赖较重，懒加载成独立 chunk，只在真正预览 docx 时才拉取
const DocxPreview = lazy(() => import("./DocxPreview"));

const IFRAME_EXT = ["pdf"];
const IMG_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
const DOCX_EXT = ["docx"];

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export interface FilePreviewModalProps {
  open: boolean;
  url: string | null;
  fileName: string;
  onClose: () => void;
}

export default function FilePreviewModal({ open, url, fileName, onClose }: FilePreviewModalProps) {
  const e = extOf(fileName);
  const canIframe = IFRAME_EXT.includes(e);
  const canImg = IMG_EXT.includes(e);
  const canDocx = DOCX_EXT.includes(e);
  return (
    <Modal
      open={open}
      title={fileName}
      onCancel={onClose}
      footer={
        url ? (
          <a href={url} download={fileName} target="_blank" rel="noreferrer">
            下载原文件
          </a>
        ) : null
      }
      width="80%"
      styles={{ body: { height: "78vh", padding: 0, overflow: "auto" } }}
      destroyOnHidden
    >
      {url && canIframe && (
        <iframe src={url} title={fileName} style={{ width: "100%", height: "100%", border: 0 }} />
      )}
      {url && canImg && (
        <div style={{ height: "100%", textAlign: "center" }}>
          <img src={url} alt={fileName} style={{ maxWidth: "100%" }} />
        </div>
      )}
      {url && canDocx && (
        <Suspense
          fallback={
            <div style={{ padding: 48, textAlign: "center" }}>
              <Spin tip="加载预览组件…" />
            </div>
          }
        >
          <DocxPreview src={url} name={fileName} />
        </Suspense>
      )}
      {url && !canIframe && !canImg && !canDocx && (
        <div style={{ padding: 24 }}>
          该格式暂不支持在线预览。
          <a href={url} target="_blank" rel="noreferrer">
            在新标签页打开 / 下载
          </a>
        </div>
      )}
    </Modal>
  );
}
