import { toast } from "sonner";
import { partnerSkillApi } from "@blade-hq/agent-kit/react";
import SKILL_MD from "../../blade/skills/save-rule-doc/SKILL.md?raw";
import SHIM_PY from "../../backend/agent_shim/smart_doc_add.py?raw";
import EXTRACT_SKILL_MD from "../../blade/skills/extract-review-rules/SKILL.md?raw";
import SEGMENTS_PY from "../../backend/agent_shim/smart_doc_segments.py?raw";
import CLAUSES_PY from "../../backend/agent_shim/smart_doc_clauses.py?raw";

const SAVE_SKILL_NAME = "local/save-rule-doc";
const EXTRACT_SKILL_NAME = "local/extract-review-rules";

type FileEntry = { path: string; content: string };

export function getSmartDocApi(): string | undefined {
  const v = import.meta.env.VITE_SMART_DOC_API?.trim();
  return v && v.length > 0 ? v : undefined;
}

async function pushOne(sessionId: string, name: string, files: FileEntry[]): Promise<void> {
  try {
    const res = await partnerSkillApi.uploadSessionSkill(sessionId, { name, files });
    // eslint-disable-next-line no-console
    console.info("[sessionSkill] pushed", name, "->", res.skill_dir, `(files=${res.file_count})`);
  } catch (e) {
    toast.warning("技能推送失败 (" + name + ")：" + (e instanceof Error ? e.message : String(e)));
  }
}

/**
 * 把规则相关技能推送到指定会话（agent 沙箱）：save-rule-doc + extract-review-rules。
 * best-effort：任何单个失败只 toast.warning，绝不抛出阻断会话/聊天。
 */
export async function pushRuleDocSkill(sessionId: string): Promise<void> {
  const apiBase = getSmartDocApi();
  if (!apiBase) {
    toast.warning("未配置 VITE_SMART_DOC_API，agent 入库/抽取会失败（请在 .env 配置隧道域名后重启）");
  }
  await pushOne(sessionId, SAVE_SKILL_NAME, [
    { path: "SKILL.md", content: SKILL_MD },
    { path: "scripts/smart_doc_add.py", content: SHIM_PY },
    { path: "scripts/api_base.txt", content: apiBase ?? "" },
  ]);
  await pushOne(sessionId, EXTRACT_SKILL_NAME, [
    { path: "SKILL.md", content: EXTRACT_SKILL_MD },
    { path: "scripts/smart_doc_segments.py", content: SEGMENTS_PY },
    { path: "scripts/smart_doc_clauses.py", content: CLAUSES_PY },
    { path: "scripts/api_base.txt", content: apiBase ?? "" },
  ]);
}
