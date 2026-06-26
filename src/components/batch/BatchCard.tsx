import React from "react";
import { Card, Tag } from "antd";
import { batchStatusMeta } from "./cardStatus";
import "./cards.css";

export interface BatchCardProps {
  title: string; // 批次显示名
  batchNo: string;
  status: string; // reviewing / archived / ...
  projectTypeName: string;
  stageName: string;
  materialCount: number;
  ruleDocCount: number;
  ruleCount: number;
  declarePeriod?: string | null;
  onClick?: () => void;
  actions?: React.ReactNode; // 底部操作插槽（绑定规则集/进入批次等）
}

export default function BatchCard({
  title,
  batchNo,
  status,
  projectTypeName,
  stageName,
  materialCount,
  ruleDocCount,
  ruleCount,
  declarePeriod,
  onClick,
  actions,
}: BatchCardProps) {
  const meta = batchStatusMeta(status);

  // 副信息：批次号 · 申报期
  const subParts: string[] = [`批次号 ${batchNo}`];
  if (declarePeriod) subParts.push(`申报期 ${declarePeriod}`);

  return (
    <Card
      className="batch-card"
      hoverable={!!onClick}
      onClick={onClick}
      styles={{ body: { padding: 0 } }}
    >
      <div className="batch-card__body">
        {/* 头部：图标 + 标题 + 批次状态 Tag */}
        <div className="batch-card__head">
          <div className="batch-card__title">
            <span className="batch-card__icon">🗂️</span>
            <span className="batch-card__title-text">{title}</span>
          </div>
          <Tag color={meta.color}>
            <span
              className="batch-card__dot"
              style={{ background: meta.dot }}
            />
            {meta.text}
          </Tag>
        </div>

        {/* 项目类型 / 阶段 灰色 Tag */}
        <div className="batch-card__meta">
          <Tag color="default">{projectTypeName}</Tag>
          <Tag color="default">{stageName}</Tag>
        </div>

        {/* 统计行 */}
        <div className="batch-card__stat">
          <span>
            <b>{materialCount}</b>份材料
          </span>
          <span>
            <b>{ruleDocCount}</b>份规则文件
          </span>
          <span>
            <b>{ruleCount}</b>条规则
          </span>
        </div>

        {/* 副信息：批次号 · 申报期 */}
        <div className="batch-card__sub">{subParts.join(" · ")}</div>
      </div>

      {/* 底部操作插槽 */}
      {actions && <div className="batch-card__foot">{actions}</div>}
    </Card>
  );
}
