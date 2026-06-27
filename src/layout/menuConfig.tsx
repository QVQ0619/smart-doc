import {
  HomeOutlined,
  FileAddOutlined,
  ProfileOutlined,
  FileDoneOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type RouteKey =
  | "home"
  | "review-new"
  | "review-tasks"
  | "review-report"
  | "batch-list"
  | "rule-library"
  | "about";

export interface MenuItemDef {
  key: RouteKey;
  label: string;
  icon: ReactNode;
}

export interface MenuGroupDef {
  title: string;
  items: MenuItemDef[];
}

export const MENU_GROUPS: MenuGroupDef[] = [
  {
    title: "概览",
    items: [{ key: "home", label: "工作台", icon: <HomeOutlined /> }],
  },
  {
    title: "审查",
    items: [
      { key: "review-new", label: "新建审查", icon: <FileAddOutlined /> },
      { key: "review-tasks", label: "审查任务", icon: <ProfileOutlined /> },
      { key: "review-report", label: "审查报告", icon: <FileDoneOutlined /> },
    ],
  },
  {
    title: "资源",
    items: [
      { key: "batch-list", label: "项目批次", icon: <AppstoreOutlined /> },
      { key: "rule-library", label: "规则库", icon: <DatabaseOutlined /> },
    ],
  },
  {
    title: "系统",
    items: [{ key: "about", label: "关于流程", icon: <InfoCircleOutlined /> }],
  },
];

export const ROUTE_LABELS: Record<RouteKey, string> = Object.fromEntries(
  MENU_GROUPS.flatMap((g) => g.items).map((it) => [it.key, it.label]),
) as Record<RouteKey, string>;
