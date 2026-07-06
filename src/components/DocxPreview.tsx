import { useEffect, useRef, useState } from "react";
import { Spin } from "antd";
import { renderAsync } from "docx-preview";

// docx 前端渲染（参考 ttmux 的 OfficePreviewers）：fetch → blob → docx-preview 渲染进容器。
// 依赖较重，务必经 React.lazy 按需加载（见 FilePreviewModal），别直接静态 import。
export default function DocxPreview({ src, name }: { src: string; name: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = "";
        await renderAsync(blob, hostRef.current, undefined, {
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#e8e8e8" }}>
      {loading && (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin tip="文档渲染中…" />
        </div>
      )}
      {error && (
        <div style={{ padding: 24 }}>
          预览失败（{error}）。
          <a href={src} download={name} target="_blank" rel="noreferrer">
            下载原文件
          </a>
        </div>
      )}
      <div ref={hostRef} />
    </div>
  );
}
