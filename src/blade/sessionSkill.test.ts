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

import { pushRuleDocSkill } from "./sessionSkill";

type FileEntry = { path: string; content: string };

beforeEach(() => {
  vi.unstubAllEnvs();
  uploadSessionSkill.mockReset().mockResolvedValue({
    name: "local/save-rule-doc",
    skill_dir: "/sandbox/.agent/skills/save-rule-doc",
    file_count: 3,
    overwritten: false,
  });
  toast.warning.mockReset();
});

test("配了 VITE_SMART_DOC_API → 以正确 name/files 推送", async () => {
  vi.stubEnv("VITE_SMART_DOC_API", "https://t.example.com");
  await pushRuleDocSkill("s-1");

  expect(uploadSessionSkill).toHaveBeenCalledTimes(1);
  const [sid, payload] = uploadSessionSkill.mock.calls[0] as [string, { name: string; files: FileEntry[] }];
  expect(sid).toBe("s-1");
  expect(payload.name).toBe("local/save-rule-doc");

  const paths = payload.files.map((f) => f.path);
  expect(paths).toEqual(["SKILL.md", "scripts/smart_doc_add.py", "scripts/api_base.txt"]);

  const api = payload.files.find((f) => f.path === "scripts/api_base.txt")!;
  expect(api.content).toBe("https://t.example.com");

  // ?raw 导入到的真实内容：SKILL.md 含技能名、脚本含后端路径
  const md = payload.files.find((f) => f.path === "SKILL.md")!;
  expect(md.content).toContain("save-rule-doc");
  const py = payload.files.find((f) => f.path === "scripts/smart_doc_add.py")!;
  expect(py.content).toContain("standard-docs");
});

test("未配 env → toast.warning 且 api_base.txt 为空串，仍推送", async () => {
  vi.stubEnv("VITE_SMART_DOC_API", ""); // 显式置空，避免依赖本地 .env 实际值
  await pushRuleDocSkill("s-2");
  expect(toast.warning).toHaveBeenCalled();
  const payload = uploadSessionSkill.mock.calls[0][1] as { files: FileEntry[] };
  expect(payload.files.find((f) => f.path === "scripts/api_base.txt")!.content).toBe("");
});

test("uploadSessionSkill reject → 不抛 + toast.warning", async () => {
  vi.stubEnv("VITE_SMART_DOC_API", "https://t.example.com");
  uploadSessionSkill.mockRejectedValue(new Error("boom"));
  await expect(pushRuleDocSkill("s-3")).resolves.toBeUndefined();
  expect(toast.warning).toHaveBeenCalled();
});
