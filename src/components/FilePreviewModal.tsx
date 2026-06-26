import { Modal } from "antd";

const IFRAME_EXT = ["pdf"];
const IMG_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

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
  return (
    <Modal
      open={open}
      title={fileName}
      onCancel={onClose}
      footer={null}
      width="80%"
      styles={{ body: { height: "78vh", padding: 0, overflow: "auto" } }}
      destroyOnHidden
    >
      {url && canIframe && (
        <iframe src={url} title={fileName} style={{ width: "100%", height: "100%", border: 0 }} />
      )}
      {url && !canIframe && canImg && (
        <div style={{ height: "100%", textAlign: "center" }}>
          <img src={url} alt={fileName} style={{ maxWidth: "100%" }} />
        </div>
      )}
      {url && !canIframe && !canImg && (
        <div style={{ padding: 24 }}>
          该格式暂不支持在线预览。
          <a href={url} target="_blank" rel="noreferrer">在新标签页打开 / 下载</a>
        </div>
      )}
    </Modal>
  );
}
