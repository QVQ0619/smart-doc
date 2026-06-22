import { useRef, useState, type ChangeEvent } from "react";
import { Button } from "antd";
import { UploadOutlined, SaveOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { uploadFiles, useChat, buildMessageContent } from "@blade-hq/agent-kit/react";
import { uploadStandardDocs } from "../api/standardDocs";

const SANDBOX_DIR = "uploads";

export default function RuleDocChatBridge({ sessionId }: { sessionId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const { send } = useChat(sessionId);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPickedFile(file);
    setAiBusy(true);
    try {
      await uploadFiles(sessionId, SANDBOX_DIR, [file]);
      send(
        buildMessageContent(
          `我上传了 ${file.name}，请判断它是不是规则文档（政策/指南/规范），并建议是否存入规则库。`,
        ),
      );
    } catch {
      toast.warning("传给 AI 失败，但你仍可直接存入规则库");
    } finally {
      setAiBusy(false);
    }
  }

  async function onSave() {
    if (!pickedFile) return;
    setSaving(true);
    try {
      const res = await uploadStandardDocs([pickedFile]);
      if (res.uploaded.length) {
        const d = res.uploaded[0];
        toast.success(`已存入规则库：${d.title}（${d.doc_code}）`);
        try {
          send(buildMessageContent(`已存入规则库：${d.title}（${d.doc_code}）`));
        } catch {
          /* 反映到对话失败不影响入库结果 */
        }
      }
      if (res.failed.length) {
        toast.warning(
          `${res.failed.length} 个失败：` +
            res.failed.map((f) => `${f.name}(${f.reason})`).join("，"),
        );
      }
      setPickedFile(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderBottom: "1px solid #e5e6eb",
        flex: "0 0 auto",
      }}
    >
      <input ref={inputRef} type="file" hidden onChange={onPick} />
      <Button
        size="small"
        icon={<UploadOutlined />}
        loading={aiBusy}
        onClick={() => inputRef.current?.click()}
      >
        选规则文件给 AI 看
      </Button>
      <Button
        size="small"
        type="primary"
        icon={<SaveOutlined />}
        aria-label="存入规则库"
        disabled={!pickedFile || saving}
        loading={saving}
        onClick={() => void onSave()}
      >
        存入规则库
      </Button>
      <span style={{ color: "#86909c", fontSize: 12 }}>
        {pickedFile ? `已选：${pickedFile.name}` : "未选文件"}
      </span>
    </div>
  );
}
