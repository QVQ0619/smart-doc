import { authHeaders, jsonHeaders, handle } from "./client";

export interface Setting {
  key: string;
  value: string | null;
}

export const REVIEW_PROMPT_KEY = "review_prompt_template";

// 「开始审查」默认提示词模板;支持变量 {审查项} {报告文件名} {任务名称}
export const DEFAULT_REVIEW_PROMPT_TEMPLATE =
  "请开始「{审查项}」：待审报告《{报告文件名}》已上传到会话工作区，请阅读该文件并依据审查规则开展审查，输出审查意见。（任务：{任务名称}）";

export function getSetting(key: string): Promise<Setting> {
  return fetch(`/api/settings/${key}`, { headers: authHeaders() }).then((r) => handle<Setting>(r));
}

export function putSetting(key: string, value: string): Promise<Setting> {
  return fetch(`/api/settings/${key}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify({ value }),
  }).then((r) => handle<Setting>(r));
}

// 取「开始审查」提示词模板:未配置或请求失败时回退默认模板,不阻塞审查发起
export async function getReviewPromptTemplate(): Promise<string> {
  try {
    const s = await getSetting(REVIEW_PROMPT_KEY);
    return s.value?.trim() ? s.value : DEFAULT_REVIEW_PROMPT_TEMPLATE;
  } catch {
    return DEFAULT_REVIEW_PROMPT_TEMPLATE;
  }
}

export function renderReviewPrompt(
  template: string,
  vars: { reviewLabel: string; fileName: string; taskName: string },
): string {
  return template
    .replaceAll("{审查项}", vars.reviewLabel)
    .replaceAll("{报告文件名}", vars.fileName)
    .replaceAll("{任务名称}", vars.taskName);
}
