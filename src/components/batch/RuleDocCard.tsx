import React from "react";
import { Card, Tag } from "antd";
import { recognitionMeta } from "./cardStatus";
import "./cards.css";

export interface RuleDocCardProps {
  title: string;
  recognitionStatus: string; // pending / processing / done / failed
  segmentCount?: number | null; // 段
  clauseCount?: number | null; // 条款
  ruleCount?: number | null; // 规则
  sizeText?: string; // 已格式化大小，如 "2.3 MB"
  uploadedAt?: string | null; // ISO 字符串；组件内 toLocaleDateString 展示
  onClick?: () => void; // 点卡片（整卡可点）
  actions?: React.ReactNode; // 底部操作区插槽
  loading?: boolean; // 识别中整卡 loading 态
}

export default function RuleDocCard({
  title,
  recognitionStatus,
  segmentCount,
  clauseCount,
  ruleCount,
  sizeText,
  uploadedAt,
  onClick,
  actions,
  loading,
}: RuleDocCardProps) {
  const meta = recognitionMeta(recognitionStatus);
  const isProcessing = recognitionStatus === "processing";

  // 副信息
  const subParts: string[] = [];
  if (sizeText) subParts.push(sizeText);
  if (uploadedAt) {
    subParts.push(
      `${new Date(uploadedAt).toLocaleDateString("zh-CN")} 上传`,
    );
  }

  return (
    <Card
      className="batch-card"
      loading={loading}
      hoverable={!!onClick}
      onClick={onClick}
      styles={{ body: { padding: 0 } }}
    >
      <div className="batch-card__body">
        {/* 头部：图标 + 标题 + 更多菜单占位 */}
        <div className="batch-card__head">
          <div className="batch-card__title">
            <span className="batch-card__icon">📘</span>
            <span className="batch-card__title-text">{title}</span>
          </div>
          <span className="batch-card__more">⋮</span>
        </div>

        {/* 识别状态 Tag */}
        <div className="batch-card__meta">
          <Tag color={meta.color}>
            <span
              className="batch-card__dot"
              style={{ background: meta.dot }}
            />
            {meta.text}
          </Tag>
        </div>

        {/* 统计行：仅渲染非空计数；processing 时显示 — */}
        <div
          className={`batch-card__stat${
            isProcessing ? " batch-card__stat--dim" : ""
          }`}
        >
          {isProcessing ? (
            <>
              <span>
                <b>—</b>段
              </span>
              <span>
                <b>—</b>条款
              </span>
              <span>
                <b>—</b>规则
              </span>
            </>
          ) : (
            <>
              {segmentCount != null && (
                <span>
                  <b>{segmentCount}</b>段
                </span>
              )}
              {clauseCount != null && (
                <span>
                  <b>{clauseCount}</b>条款
                </span>
              )}
              {ruleCount != null && (
                <span>
                  <b>{ruleCount}</b>规则
                </span>
              )}
            </>
          )}
        </div>

        {/* 副信息：大小 · 上传日期 */}
        {subParts.length > 0 && (
          <div className="batch-card__sub">{subParts.join(" · ")}</div>
        )}
      </div>

      {/* 底部操作插槽 */}
      {actions && <div className="batch-card__foot">{actions}</div>}
    </Card>
  );
}
