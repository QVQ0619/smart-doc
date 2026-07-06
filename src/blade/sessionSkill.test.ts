import { test, expect, vi, beforeEach } from "vitest";

const uploadSessionSkill = vi.fn();
vi.mock("@blade-hq/agent-kit/react", () => ({
  partnerSkillApi: {
    uploadSessionSkill: (...a: unknown[]) => uploadSessionSkill(...a),
  },
}));

// vi.hoisted 确保在 vi.mock 提升到文件顶部执行时 toast 已初始化
const toast = vi.hoisted(() => ({ warning: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import {
  pushRuleDocSkill,
  pushMaterialDocSkill,
  pushReviewSkill,
  assembleDropInSkills,
} from "./sessionSkill";

type FileEntry = { path: string; content: string };

beforeEach(() => {
  vi.unstubAllEnvs();
  uploadSessionSkill.mockReset().mockResolvedValue({
    name: "local/save-rule-doc",
    skill_dir: "/sandbox/.agent/skills/save-rule-doc",
    file_count: 4,
    overwritten: false,
  });
  toast.warning.mockReset();
});

test("配了 env → 推送两个 skill(save-rule-doc + 一步 extract-rules)，各带 api_base/api_key", async () => {
  vi.stubEnv("VITE_SMART_DOC_API", "https://t.example.com");
  vi.stubEnv("VITE_SMART_DOC_API_KEY", "k-secret");
  await pushRuleDocSkill("s-1");

  expect(uploadSessionSkill).toHaveBeenCalledTimes(2);

  const [sid0, p0] = uploadSessionSkill.mock.calls[0] as [string, { name: string; files: FileEntry[] }];
  expect(sid0).toBe("s-1");
  expect(p0.name).toBe("local/save-rule-doc");
  expect(p0.files.map((f) => f.path)).toEqual([
    "SKILL.md", "scripts/smart_doc_add.py", "scripts/api_base.txt", "scripts/api_key.txt",
  ]);

  const [sid1, p1] = uploadSessionSkill.mock.calls[1] as [string, { name: string; files: FileEntry[] }];
  expect(sid1).toBe("s-1");
  expect(p1.name).toBe("local/extract-rules");
  expect(p1.files.map((f) => f.path)).toEqual([
    "SKILL.md", "scripts/smart_doc_add.py", "scripts/smart_doc_segments.py",
    "scripts/smart_doc_extract_rules.py", "scripts/api_base.txt", "scripts/api_key.txt",
  ]);
  expect(p1.files.find((f) => f.path === "scripts/api_base.txt")!.content).toBe("https://t.example.com");
  expect(p1.files.find((f) => f.path === "scripts/api_key.txt")!.content).toBe("k-secret");
});

test("未配 env → toast.warning 且两个 skill 的 api_base.txt 为空串，仍推送", async () => {
  vi.stubEnv("VITE_SMART_DOC_API", "");
  await pushRuleDocSkill("s-2");
  expect(toast.warning).toHaveBeenCalled();
  expect(uploadSessionSkill).toHaveBeenCalledTimes(2);
  for (const call of uploadSessionSkill.mock.calls) {
    const payload = call[1] as { files: FileEntry[] };
    expect(payload.files.find((f) => f.path === "scripts/api_base.txt")!.content).toBe("");
  }
});

test("uploadSessionSkill reject → 不抛 + toast.warning", async () => {
  vi.stubEnv("VITE_SMART_DOC_API", "https://t.example.com");
  uploadSessionSkill.mockRejectedValue(new Error("boom"));
  await expect(pushRuleDocSkill("s-3")).resolves.toBeUndefined();
  expect(toast.warning).toHaveBeenCalled();
});

test("pushMaterialDocSkill 推送 save-material-doc 与 extract-material-structure", async () => {
  vi.stubEnv("VITE_SMART_DOC_API", "https://t.example.com");
  vi.stubEnv("VITE_SMART_DOC_API_KEY", "k-secret");
  uploadSessionSkill.mockReset().mockResolvedValue({ skill_dir: "/x", file_count: 1 } as never);
  await pushMaterialDocSkill("sess-1");
  const names = uploadSessionSkill.mock.calls.map((c) => (c[1] as { name: string }).name);
  expect(names).toContain("local/save-material-doc");
  expect(names).toContain("local/extract-material-structure");
});

test("pushReviewSkill 推送 review-package", async () => {
  uploadSessionSkill.mockReset().mockResolvedValue({ skill_dir: "/x", file_count: 1 } as never);
  await pushReviewSkill("sess-1");
  const names = uploadSessionSkill.mock.calls.map((c) => (c[1] as { name: string }).name);
  expect(names).toContain("local/review-package");
});

// --- Drop-in 自动扫描（方案 A）：纯函数 assembleDropInSkills ---

test("assembleDropInSkills: 识别根目录有 SKILL.md 的自包含技能，含相对路径与 local/ 命名", () => {
  const raw = {
    "../../blade/skills/fund-rule-extract/SKILL.md": "md",
    "../../blade/skills/fund-rule-extract/tools.py": "py",
    "../../blade/skills/fund-rule-extract/resources/x.json": "{}",
  };
  const skills = assembleDropInSkills(raw);
  expect(skills).toHaveLength(1);
  expect(skills[0].name).toBe("local/fund-rule-extract");
  // 文件按相对路径的码点序（大写在前）：SKILL.md < resources/x.json < tools.py
  expect(skills[0].files.map((f) => f.path)).toEqual([
    "SKILL.md",
    "resources/x.json",
    "tools.py",
  ]);
  expect(skills[0].files.find((f) => f.path === "tools.py")!.content).toBe("py");
});

test("assembleDropInSkills: 旧技能(SKILL.md 在 versions/ 深层)与 shared/ 被排除", () => {
  const raw = {
    "../../blade/skills/save-rule-doc/metadata.json": "{}",
    "../../blade/skills/save-rule-doc/versions/1.0.0/SKILL.md": "md",
    "../../blade/skills/shared/helpers/smart_doc_add.py": "py",
  };
  expect(assembleDropInSkills(raw)).toEqual([]);
});

test("assembleDropInSkills: 文件夹名非法 → 跳过并 toast.warning", () => {
  const raw = {
    "../../blade/skills/Bad_Name/SKILL.md": "md",
    "../../blade/skills/Bad_Name/tools.py": "py",
  };
  expect(assembleDropInSkills(raw)).toEqual([]);
  expect(toast.warning).toHaveBeenCalled();
});

test("assembleDropInSkills: 跳过 . 开头的文件(如 .skill_id)，但仍识别该技能", () => {
  const raw = {
    "../../blade/skills/foo/SKILL.md": "md",
    "../../blade/skills/foo/.skill_id": "foo",
    "../../blade/skills/foo/tools.py": "py",
  };
  const skills = assembleDropInSkills(raw);
  expect(skills).toHaveLength(1);
  expect(skills[0].files.map((f) => f.path)).toEqual(["SKILL.md", "tools.py"]);
});

test("assembleDropInSkills: 多个 drop-in 技能按文件夹名排序输出", () => {
  const raw = {
    "../../blade/skills/zeta/SKILL.md": "z",
    "../../blade/skills/alpha/SKILL.md": "a",
  };
  const skills = assembleDropInSkills(raw);
  expect(skills.map((s) => s.name)).toEqual(["local/alpha", "local/zeta"]);
});
