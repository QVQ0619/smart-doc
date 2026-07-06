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
import REVIEW_SKILL_MD from "../../blade/skills/review-package/versions/1.0.0/SKILL.md?raw";
import REVIEW_INPUT_PY from "../../blade/skills/shared/helpers/smart_doc_review_input.py?raw";
import REVIEW_PY from "../../blade/skills/shared/helpers/smart_doc_review.py?raw";

const SAVE_SKILL_NAME = "local/save-rule-doc";
const EXTRACT_RULES_SKILL_NAME = "local/extract-rules";
const SAVE_MATERIAL_SKILL_NAME = "local/save-material-doc";
const EXTRACT_MATERIAL_SKILL_NAME = "local/extract-material-structure";
const REVIEW_SKILL_NAME = "local/review-package";

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

/**
 * 把形式审查技能推送到会话(agent 沙箱):review-package 依 hard 规则逐条机审申报包。
 * best-effort:失败只 toast.warning,不抛出阻断聊天。
 */
export async function pushReviewSkill(sessionId: string): Promise<void> {
  const apiBase = getSmartDocApi();
  const apiKey = getSmartDocApiKey();
  await pushOne(sessionId, REVIEW_SKILL_NAME, [
    { path: "SKILL.md", content: REVIEW_SKILL_MD },
    { path: "scripts/smart_doc_review_input.py", content: REVIEW_INPUT_PY },
    { path: "scripts/smart_doc_review.py", content: REVIEW_PY },
    { path: "scripts/api_base.txt", content: apiBase ?? "" },
    { path: "scripts/api_key.txt", content: apiKey ?? "" },
  ]);
}

// ============================================================================
// Drop-in 自包含技能自动扫描（方案 A）
//
// 约定：`blade/skills/<name>/` **根目录**存在 `SKILL.md` 即视为「自包含 drop-in
// 技能」，自动以 `local/<name>` 推送。skill 需要的一切文件都放在自己文件夹内。
// - 旧技能的 SKILL.md 在 `versions/1.0.0/` 深层（根目录无 SKILL.md）→ 天然被排除，
//   仍由上面的 pushRuleDocSkill/pushMaterialDocSkill/pushReviewSkill 硬编码推送。
// - `shared/`（无根 SKILL.md）→ 排除。
// 新增/更新一个自包含技能 = 拖文件夹进 blade/skills/，无需改本文件。
// ============================================================================

const SKILLS_PREFIX = "blade/skills/";
const DROP_IN_NAME_RE = /^[a-z0-9-]+$/;

type DropInSkill = { name: `${string}/${string}`; files: FileEntry[] };

/**
 * 从 Vite `import.meta.glob` 的 { 路径 -> 原始内容 } 映射，组装出所有「自包含
 * drop-in 技能」的推送载荷。**纯函数**（除非法命名会 toast.warning），便于单测。
 *
 * 判别规则：某文件夹内存在相对路径正好等于 `SKILL.md` 的文件（即根目录 SKILL.md）
 * 才算 drop-in 技能。文件夹名须匹配 `^[a-z0-9-]+$`，否则跳过。以 `.` 开头的文件
 * （如 `.skill_id`）被过滤不推送。产出按文件夹名码点序排序，保证顺序确定。
 */
export function assembleDropInSkills(raw: Record<string, string>): DropInSkill[] {
  // 按文件夹名归组：folder -> [{ rel, content }]
  const groups = new Map<string, { rel: string; content: string }[]>();
  for (const [absPath, content] of Object.entries(raw)) {
    const idx = absPath.indexOf(SKILLS_PREFIX);
    if (idx < 0) continue;
    const tail = absPath.slice(idx + SKILLS_PREFIX.length); // "<folder>/<rel...>"
    const slash = tail.indexOf("/");
    if (slash < 0) continue; // 直接位于 skills/ 下的文件，忽略
    const folder = tail.slice(0, slash);
    const rel = tail.slice(slash + 1);
    if (!rel) continue;
    if (rel.split("/").some((seg) => seg.startsWith("."))) continue; // 跳过 .skill_id 等
    const arr = groups.get(folder) ?? [];
    arr.push({ rel, content });
    groups.set(folder, arr);
  }

  const result: DropInSkill[] = [];
  for (const folder of [...groups.keys()].sort()) {
    const arr = groups.get(folder)!;
    if (!arr.some((f) => f.rel === "SKILL.md")) continue; // 非 drop-in（旧技能/shared 等）
    if (!DROP_IN_NAME_RE.test(folder)) {
      toast.warning(`跳过技能：文件夹名 "${folder}" 非法（须小写字母/数字/连字符）`);
      continue;
    }
    const files = arr
      .slice()
      .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
      .map((f) => ({ path: f.rel, content: f.content }));
    result.push({ name: `local/${folder}` as `${string}/${string}`, files });
  }
  return result;
}

// 构建期展开：扫描 blade/skills 下所有文件为原始文本。
const DROP_IN_RAW = import.meta.glob("../../blade/skills/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * 推送所有自动发现的自包含 drop-in 技能到会话（agent 沙箱）。
 * best-effort：单个失败只 toast.warning（在 pushOne 内），不抛出阻断聊天。
 */
export async function pushDropInSkills(sessionId: string): Promise<void> {
  for (const skill of assembleDropInSkills(DROP_IN_RAW)) {
    await pushOne(sessionId, skill.name, skill.files);
  }
}
