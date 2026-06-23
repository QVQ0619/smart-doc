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
