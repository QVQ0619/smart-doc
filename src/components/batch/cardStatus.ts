// 识别状态(规则文件/材料通用)
export const RECOGNITION_STATUS: Record<
  string,
  { text: string; color: string; dot: string }
> = {
  pending: { text: "待识别", color: "default", dot: "#bfbfbf" },
  processing: { text: "识别中", color: "processing", dot: "#1677ff" },
  done: { text: "已识别", color: "success", dot: "#52c41a" },
  failed: { text: "识别失败", color: "error", dot: "#ff4d4f" },
};

// 批次状态
export const BATCH_STATUS: Record<
  string,
  { text: string; color: string; dot: string }
> = {
  reviewing: { text: "审查中", color: "success", dot: "#52c41a" },
  archived: { text: "已归档", color: "default", dot: "#bfbfbf" },
};

export function recognitionMeta(s: string) {
  return (
    RECOGNITION_STATUS[s] ?? { text: s, color: "default", dot: "#bfbfbf" }
  );
}

export function batchStatusMeta(s: string) {
  return BATCH_STATUS[s] ?? { text: s, color: "default", dot: "#bfbfbf" };
}
