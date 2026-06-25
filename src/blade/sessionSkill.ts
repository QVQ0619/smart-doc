import { toast } from "sonner";
import { partnerSkillApi } from "@blade-hq/agent-kit/react";
import SKILL_MD from "../../blade/skills/save-rule-doc/versions/1.0.0/SKILL.md?raw";
import SHIM_PY from "../../blade/skills/shared/helpers/smart_doc_add.py?raw";
import EXTRACT_RULES_SKILL_MD from "../../blade/skills/extract-rules/versions/1.0.0/SKILL.md?raw";
import SEGMENTS_PY from "../../blade/skills/shared/helpers/smart_doc_segments.py?raw";
import EXTRACT_RULES_PY from "../../blade/skills/shared/helpers/smart_doc_extract_rules.py?raw";
import SAVE_MATERIAL_SKILL_MD from "../../blade/skills/save-material-doc/versions/1.0.0/SKILL.md?raw";
import MATERIAL_PY from "../../blade/skills/shared/helpers/smart_doc_material.py?raw";
import EXTRACT_MATERIAL_SKILL_MD from "../../blade/skills/extract-material-structure/versions/1.0.0/SKILL.md?raw";
import PKG_SEGMENTS_PY from "../../blade/skills/shared/helpers/smart_doc_pkg_segments.py?raw";
import EXTRACT_PY from "../../blade/skills/shared/helpers/smart_doc_extract.py?raw";

const SAVE_SKILL_NAME = "local/save-rule-doc";
const EXTRACT_RULES_SKILL_NAME = "local/extract-rules";
const SAVE_MATERIAL_SKILL_NAME = "local/save-material-doc";
const EXTRACT_MATERIAL_SKILL_NAME = "local/extract-material-structure";

type FileEntry = { path: string; content: string };

export function getSmartDocApi(): string | undefined {
  const v = import.meta.env.VITE_SMART_DOC_API?.trim();
  return v && v.length > 0 ? v : undefined;
}

export function getSmartDocApiKey(): string | undefined {
  const v = import.meta.env.VITE_SMART_DOC_API_KEY?.trim();
  return v && v.length > 0 ? v : undefined;
}

async function pushOne(
  sessionId: string,
  name: `${string}/${string}`,
  files: FileEntry[],
): Promise<void> {
  try {
    const res = await partnerSkillApi.uploadSessionSkill(sessionId, { name, files });
    // eslint-disable-next-line no-console
    console.info("[sessionSkill] pushed", name, "->", res.skill_dir, `(files=${res.file_count})`);
  } catch (e) {
    toast.warning("技能推送失败 (" + name + ")：" + (e instanceof Error ? e.message : String(e)));
  }
}

/**
 * 把规则相关技能推送到指定会话（agent 沙箱）：
 * - save-rule-doc：上传文件入规则库
 * - extract-rules：**一步**从已识别文档抽取依据条款 + 审查规则（取代原先分步的 extract + structure）
 * best-effort：任何单个失败只 toast.warning，绝不抛出阻断会话/聊天。
 */
export async function pushRuleDocSkill(sessionId: string): Promise<void> {
  const apiBase = getSmartDocApi();
  const apiKey = getSmartDocApiKey();
  if (!apiBase) {
    toast.warning("未配置 VITE_SMART_DOC_API，agent 入库/抽取会失败（请在 .env 配置隧道域名后重启）");
  }
  await pushOne(sessionId, SAVE_SKILL_NAME, [
    { path: "SKILL.md", content: SKILL_MD },
    { path: "scripts/smart_doc_add.py", content: SHIM_PY },
    { path: "scripts/api_base.txt", content: apiBase ?? "" },
    { path: "scripts/api_key.txt", content: apiKey ?? "" },
  ]);
  await pushOne(sessionId, EXTRACT_RULES_SKILL_NAME, [
    { path: "SKILL.md", content: EXTRACT_RULES_SKILL_MD },
    { path: "scripts/smart_doc_add.py", content: SHIM_PY },
    { path: "scripts/smart_doc_segments.py", content: SEGMENTS_PY },
    { path: "scripts/smart_doc_extract_rules.py", content: EXTRACT_RULES_PY },
    { path: "scripts/api_base.txt", content: apiBase ?? "" },
    { path: "scripts/api_key.txt", content: apiKey ?? "" },
  ]);
}

/**
 * 把申请材料相关技能推送到会话（agent 沙箱）：
 * - save-material-doc：上传申请材料入审查包并识别
 * - extract-material-structure：从已识别审查包结构化抽取五表
 * best-effort：单个失败只 toast.warning，绝不抛出阻断聊天。
 */
export async function pushMaterialDocSkill(sessionId: string): Promise<void> {
  const apiBase = getSmartDocApi();
  const apiKey = getSmartDocApiKey();
  await pushOne(sessionId, SAVE_MATERIAL_SKILL_NAME, [
    { path: "SKILL.md", content: SAVE_MATERIAL_SKILL_MD },
    { path: "scripts/smart_doc_material.py", content: MATERIAL_PY },
    { path: "scripts/api_base.txt", content: apiBase ?? "" },
    { path: "scripts/api_key.txt", content: apiKey ?? "" },
  ]);
  await pushOne(sessionId, EXTRACT_MATERIAL_SKILL_NAME, [
    { path: "SKILL.md", content: EXTRACT_MATERIAL_SKILL_MD },
    { path: "scripts/smart_doc_pkg_segments.py", content: PKG_SEGMENTS_PY },
    { path: "scripts/smart_doc_extract.py", content: EXTRACT_PY },
    { path: "scripts/api_base.txt", content: apiBase ?? "" },
    { path: "scripts/api_key.txt", content: apiKey ?? "" },
  ]);
}
