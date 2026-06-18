import {
  HomeOutlined,
  FileAddOutlined,
  ProfileOutlined,
  FileDoneOutlined,
  BookOutlined,
  AppstoreOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export type RouteKey =
  | "home"
  | "review-new"
  | "review-tasks"
  | "review-report"
  | "lib-rules"
  | "lib-packs"
  | "lib-archive"
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
    title: "资源库",
    items: [
      { key: "lib-rules", label: "规则库", icon: <BookOutlined /> },
      { key: "lib-packs", label: "配置包", icon: <AppstoreOutlined /> },
      { key: "lib-archive", label: "审查文档库", icon: <FolderOpenOutlined /> },
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
