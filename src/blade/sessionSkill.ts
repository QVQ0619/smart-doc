import { toast } from "sonner";
import { partnerSkillApi } from "@blade-hq/agent-kit/react";
import SKILL_MD from "../../blade/skills/save-rule-doc/SKILL.md?raw";
import SHIM_PY from "../../backend/agent_shim/smart_doc_add.py?raw";

const SKILL_NAME = "local/save-rule-doc";

export function getSmartDocApi(): string | undefined {
  const v = import.meta.env.VITE_SMART_DOC_API?.trim();
  return v && v.length > 0 ? v : undefined;
}

/**
 * 把 save-rule-doc 技能推送到指定会话（agent 沙箱）。best-effort：
 * 任何失败只 toast.warning，绝不抛出阻断会话/聊天。
 */
export async function pushRuleDocSkill(sessionId: string): Promise<void> {
  try {
    const apiBase = getSmartDocApi();
    if (!apiBase) {
      toast.warning("未配置 VITE_SMART_DOC_API，agent 入库会失败（请在 .env 配置隧道域名后重启）");
    }
    const res = await partnerSkillApi.uploadSessionSkill(sessionId, {
      name: SKILL_NAME,
      files: [
        { path: "SKILL.md", content: SKILL_MD },
        { path: "scripts/smart_doc_add.py", content: SHIM_PY },
        { path: "scripts/api_base.txt", content: apiBase ?? "" },
      ],
    });
    // eslint-disable-next-line no-console
    console.info(
      "[sessionSkill] pushed save-rule-doc ->",
      res.skill_dir,
      `(files=${res.file_count})`,
    );
  } catch (e) {
    toast.warning("规则文件技能推送失败：" + (e instanceof Error ? e.message : String(e)));
  }
}
