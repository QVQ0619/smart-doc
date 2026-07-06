import { useEffect, useMemo, useState } from "react";
import { Menu, Button, Tooltip, Tag } from "antd";
import type { MenuProps } from "antd";
import { MenuFoldOutlined, MenuUnfoldOutlined, LogoutOutlined } from "@ant-design/icons";
import { MENU_GROUPS, type RouteKey } from "./menuConfig";
import { useRouteStore } from "../store/useRouteStore";
import { useMenuCollapseStore } from "../store/useMenuCollapseStore";
import { useAuthStore } from "../store/useAuthStore";

export default function SideMenu() {
  const nav = useRouteStore((s) => s.nav);
  const navigate = useRouteStore((s) => s.navigate);
  const collapsed = useMenuCollapseStore((s) => s.collapsed);
  const toggle = useMenuCollapseStore((s) => s.toggle);
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);

  // 按当前角色过滤;每个分组做成可折叠子菜单(点击一级标题展开/收起)。
  const role = isAdmin ? "admin" : "reviewer";
  const groups = useMemo(
    () =>
      MENU_GROUPS.map((g) => ({
        title: g.title,
        items: g.items.filter((it) => !it.roles || it.roles.includes(role)),
      })).filter((g) => g.items.length > 0),
    [role],
  );
  const groupKey = (title: string) => `grp:${title}`;
  // 单项分组直接渲染为独立菜单项(如 仪表盘/关于流程/任务管理);多项分组渲染为可折叠子菜单。
  const items: MenuProps["items"] = groups.map((g) => {
    if (g.items.length === 1) {
      const it = g.items[0];
      return { key: it.key, icon: it.icon, label: it.label };
    }
    return {
      key: groupKey(g.title),
      label: g.title,
      children: g.items.map((it) => ({ key: it.key, icon: it.icon, label: it.label })),
    };
  });

  const selectedKey =
    nav.name === "batch-detail"
      ? "batch-list"
      : nav.name === "rule-detail"
        ? nav.batchId != null
          ? "batch-list"
          : "rule-library"
        : nav.name === "task-review"
          ? "my-tasks"
          : nav.name;

  // 让当前选中项所在分组保持展开
  const selectedGroupKey = useMemo(() => {
    const g = groups.find((grp) => grp.items.length > 1 && grp.items.some((it) => it.key === selectedKey));
    return g ? groupKey(g.title) : undefined;
  }, [groups, selectedKey]);
  const [openKeys, setOpenKeys] = useState<string[]>(selectedGroupKey ? [selectedGroupKey] : []);
  useEffect(() => {
    if (selectedGroupKey) {
      setOpenKeys((prev) => (prev.includes(selectedGroupKey) ? prev : [...prev, selectedGroupKey]));
    }
  }, [selectedGroupKey]);

  if (collapsed) {
    return (
      <div className="menu-rail">
        <Tooltip title="展开菜单" placement="right">
          <Button
            size="small"
            aria-label="展开菜单"
            icon={<MenuUnfoldOutlined />}
            onClick={toggle}
          />
        </Tooltip>
        <span className="menu-rail__label">菜单</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: "16px 20px",
          fontWeight: 700,
          fontSize: 15,
          color: "#1677ff",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        装备研制立项AI辅助审查评估系统
      </div>
      {/* 菜单区占据剩余空间，把页脚顶到最底 */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys as string[])}
          items={items}
          style={{ borderInlineEnd: "none" }}
          onClick={(info) => navigate({ name: info.key as RouteKey })}
        />
      </div>
      {user && (
        <div style={{ borderTop: "1px solid #f0f0f0" }}>
          {/* 用户名 + 退出登录 */}
          <div
            style={{
              padding: "12px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontWeight: 600, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                {user.display_name ?? user.username}
              </div>
              <Tag color={isAdmin ? "blue" : "green"} style={{ marginTop: 2 }}>
                {isAdmin ? "管理员" : "评审专家"}
              </Tag>
            </div>
            <Tooltip title="退出登录">
              <Button size="small" icon={<LogoutOutlined />} onClick={logout} aria-label="退出登录" />
            </Tooltip>
          </div>
          {/* 灰线 + 折叠(无按钮边框,置于最下) */}
          <div style={{ borderTop: "1px solid #f0f0f0" }}>
            <Button
              type="text"
              icon={<MenuFoldOutlined />}
              onClick={toggle}
              aria-label="折叠菜单"
              style={{ width: "100%", height: 40, color: "#8c8c8c", borderRadius: 0 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
