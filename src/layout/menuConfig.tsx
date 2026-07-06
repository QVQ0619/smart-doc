import {
  DashboardOutlined,
  FileDoneOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
  AuditOutlined,
  SolutionOutlined,
  ExperimentOutlined,
  CommentOutlined,
  ProfileOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type RouteKey =
  | "dashboard"
  | "batch-list" // 保留类型(页面死代码);已从菜单移除
  | "rule-library"
  | "about"
  | "task-manage"
  | "review-ledger"
  | "my-tasks"
  | "metric-inspect"
  | "opinion-review"
  | "report-gen"
  | "settings";

export type MenuRole = "admin" | "reviewer";

export interface MenuItemDef {
  key: RouteKey;
  label: string;
  icon: ReactNode;
  roles?: MenuRole[]; // 省略=所有角色可见
}

export interface MenuGroupDef {
  title: string;
  items: MenuItemDef[];
}

// 单项分组在侧栏渲染为独立一级菜单项。菜单扁平。
export const MENU_GROUPS: MenuGroupDef[] = [
  { title: "概览", items: [{ key: "dashboard", label: "仪表盘", icon: <DashboardOutlined /> }] },
  // 任务管理:管理员核心,紧随仪表盘
  { title: "任务管理", items: [{ key: "task-manage", label: "任务管理", icon: <AuditOutlined />, roles: ["admin"] }] },
  { title: "立项论证审查", items: [{ key: "my-tasks", label: "立项论证审查", icon: <SolutionOutlined /> }] },
  { title: "指标专项检验", items: [{ key: "metric-inspect", label: "指标专项检验", icon: <ExperimentOutlined /> }] },
  { title: "审查意见研判", items: [{ key: "opinion-review", label: "审查意见研判", icon: <CommentOutlined /> }] },
  { title: "审查报告生成", items: [{ key: "report-gen", label: "审查报告生成", icon: <FileDoneOutlined /> }] },
  { title: "审查台账", items: [{ key: "review-ledger", label: "审查台账", icon: <ProfileOutlined /> }] },
  { title: "规则库", items: [{ key: "rule-library", label: "规则库", icon: <DatabaseOutlined />, roles: ["admin"] }] },
  // 系统设置(管理员)与关于流程置于最后
  { title: "系统设置", items: [{ key: "settings", label: "系统设置", icon: <SettingOutlined />, roles: ["admin"] }] },
  { title: "系统", items: [{ key: "about", label: "关于流程", icon: <InfoCircleOutlined /> }] },
];

export const ROUTE_LABELS: Record<string, string> = Object.fromEntries(
  MENU_GROUPS.flatMap((g) => g.items).map((it) => [it.key, it.label]),
);
