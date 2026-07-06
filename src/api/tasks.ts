import { authHeaders, jsonHeaders, handle } from "./client";

export interface ReportType {
  code: string;
  name: string;
}

export interface TaskReport {
  id: number;
  report_type: string;
  report_name: string;
  file_id: number | null;
  file_name: string | null;
  review_status: string;
  uploaded: boolean;
}

export interface Task {
  id: number;
  task_no: string;
  task_name: string;
  status: string;
  assignee_id: number | null;
  assignee_name: string | null;
  report_total: number;
  report_uploaded: number;
  created_at: string | null;
  distributed_at: string | null;
}

export interface RuleDocBrief {
  id: number;
  title: string;
}

export interface TaskDetail extends Task {
  reports: TaskReport[];
  rule_docs: RuleDocBrief[];
}

export interface Reviewer {
  id: number;
  username: string;
  display_name: string | null;
}

export function listReportTypes(): Promise<ReportType[]> {
  return fetch("/api/task-report-types").then((r) => handle<ReportType[]>(r));
}

export function listTasks(): Promise<Task[]> {
  return fetch("/api/tasks", { headers: authHeaders() }).then((r) => handle<Task[]>(r));
}

export function getTask(id: number): Promise<TaskDetail> {
  return fetch(`/api/tasks/${id}`, { headers: authHeaders() }).then((r) => handle<TaskDetail>(r));
}

export function createTask(
  task_name: string,
  task_no: string | undefined,
  ruleDocIds: number[],
): Promise<TaskDetail> {
  return fetch("/api/tasks", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ task_name, task_no: task_no || null, rule_doc_ids: ruleDocIds }),
  }).then((r) => handle<TaskDetail>(r));
}

export function uploadReport(taskId: number, reportType: string, file: File): Promise<TaskReport> {
  const fd = new FormData();
  fd.append("report_type", reportType);
  fd.append("file", file);
  return fetch(`/api/tasks/${taskId}/reports`, {
    method: "POST",
    headers: authHeaders(), // 不设 Content-Type,让浏览器带 multipart 边界
    body: fd,
  }).then((r) => handle<TaskReport>(r));
}

export function listReviewers(): Promise<Reviewer[]> {
  return fetch("/api/reviewers", { headers: authHeaders() }).then((r) => handle<Reviewer[]>(r));
}

export function distributeTask(taskId: number, assigneeId: number): Promise<Task> {
  return fetch(`/api/tasks/${taskId}/distribute`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ assignee_id: assigneeId }),
  }).then((r) => handle<Task>(r));
}

export function listMyTasks(): Promise<Task[]> {
  return fetch("/api/my/tasks", { headers: authHeaders() }).then((r) => handle<Task[]>(r));
}

export interface Overview {
  total_tasks: number;
  done_tasks: number;
  active_users: number;
  reviewers: number;
  reports_uploaded: number;
  reports_total: number;
  by_status: Record<string, number>;
}

export function getOverview(): Promise<Overview> {
  return fetch("/api/stats/overview", { headers: authHeaders() }).then((r) => handle<Overview>(r));
}

export interface MyOverview {
  total: number;
  received: number;
  reviewing: number;
  done: number;
  reports_uploaded: number;
  reports_total: number;
  by_status: Record<string, number>;
}

export function getMyOverview(): Promise<MyOverview> {
  return fetch("/api/my/overview", { headers: authHeaders() }).then((r) => handle<MyOverview>(r));
}

export function recallTask(taskId: number): Promise<Task> {
  return fetch(`/api/tasks/${taskId}/recall`, { method: "POST", headers: authHeaders() }).then((r) =>
    handle<Task>(r),
  );
}

export function deleteTask(id: number): Promise<void> {
  return fetch(`/api/tasks/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) =>
    handle<void>(r),
  );
}

// 报告文件名固定格式:含对应关键词。用于批量上传自动归类(与后端 REPORT_KEYWORDS 一致)。
export const REPORT_KEYWORDS: Record<string, string> = {
  comprehensive: "综合论证",
  economy: "经济性",
  tech_system: "技术体质",
  system_contribution: "体系贡献率",
  general_quality: "通用质量特性",
};

export const REPORT_TYPE_NAMES: Record<string, string> = {
  comprehensive: "综合论证报告",
  economy: "经济性",
  tech_system: "技术体质",
  system_contribution: "体系贡献率",
  general_quality: "通用质量特性",
};

export function matchReportType(filename: string): string | null {
  for (const [type, kw] of Object.entries(REPORT_KEYWORDS)) {
    if (filename.includes(kw)) return type;
  }
  return null;
}

// 任务是否可删除:未分发(created) 或 已完成(done)
export function isDeletable(status: string): boolean {
  return status === "created" || status === "done";
}

// 报告下载/预览端点需带鉴权头,故用 fetch 取 blob 再打开(不能直接 <a href>)。
export async function openReport(taskId: number, reportId: number): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/reports/${reportId}/download`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
