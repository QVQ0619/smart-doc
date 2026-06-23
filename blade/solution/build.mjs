// 组装 Solution 包：把 SKILL.md(blade/skills) + shim(backend/agent_shim) + api_base/api_key
// 装进 dist/project_review/skills/，产出可上传 8020/studio/skill-editor 的目录。
// 跑法: SMART_DOC_API=https://你的隧道 SMART_DOC_API_KEY=你的key node blade/solution/build.mjs
import { mkdirSync, copyFileSync, writeFileSync, rmSync, cpSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));     // blade/solution
const ROOT = `${HERE}/../..`;                              // 项目根
const SRC = `${HERE}/project_review`;                      // 配置源(git)
const OUT = `${HERE}/dist/project_review`;                 // 产物(gitignore)

// skill 目录名 → 需打包的 shim(来自 backend/agent_shim)
const SKILLS = {
  "save-rule-doc": ["smart_doc_add.py"],
  "extract-review-rules": ["smart_doc_segments.py", "smart_doc_clauses.py"],
  "structure-review-rules": ["smart_doc_list_clauses.py", "smart_doc_rules.py"],
};

const API = process.env.SMART_DOC_API ?? "";
const KEY = process.env.SMART_DOC_API_KEY ?? "";
if (!API) console.warn("⚠️  SMART_DOC_API 未设置 → api_base.txt 为空，agent 会报后端不可达");
if (!KEY) console.warn("⚠️  SMART_DOC_API_KEY 未设置 → api_key.txt 为空(后端若启用鉴权会 401)");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1) 配置：solution.yaml + roles/
copyFileSync(`${SRC}/solution.yaml`, `${OUT}/solution.yaml`);
cpSync(`${SRC}/roles`, `${OUT}/roles`, { recursive: true });

// 2) skills：SKILL.md + shim + 注入 api_base/api_key
for (const [name, shims] of Object.entries(SKILLS)) {
  const scripts = `${OUT}/skills/${name}/scripts`;
  mkdirSync(scripts, { recursive: true });
  const skillMd = `${ROOT}/blade/skills/${name}/SKILL.md`;
  if (!existsSync(skillMd)) throw new Error(`缺 SKILL.md: ${skillMd}`);
  copyFileSync(skillMd, `${OUT}/skills/${name}/SKILL.md`);
  for (const sh of shims) {
    const src = `${ROOT}/backend/agent_shim/${sh}`;
    if (!existsSync(src)) throw new Error(`缺 shim: ${src}`);
    copyFileSync(src, `${scripts}/${sh}`);
  }
  writeFileSync(`${scripts}/api_base.txt`, API);
  writeFileSync(`${scripts}/api_key.txt`, KEY);
}

console.log(`✅ 已组装 → ${OUT}`);
console.log("打包上传：");
console.log(`  PowerShell:  Compress-Archive -Path "${OUT}" -DestinationPath "${HERE}/dist/project_review.zip" -Force`);
console.log("  然后在 8020/studio/skill-editor 上传 project_review.zip(上传即校验)");
