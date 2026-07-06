import { useMemo } from "react";
import { Menu, Avatar, Dropdown, Tag, theme } from "antd";
import type { MenuProps } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { MENU_GROUPS, type RouteKey } from "./menuConfig";
import { useRouteStore } from "../store/useRouteStore";
import { useMenuCollapseStore } from "../store/useMenuCollapseStore";
import { useAuthStore } from "../store/useAuthStore";

// 白色主题侧边栏,样式对齐 blade-oauth 的 AdminLayout:
// 品牌主色标题 + antd Menu 分组标签 + 头像 Dropdown 退出 + 底部裸图标折叠行。
export default function SideMenu() {
  const { token: t } = theme.useToken();
  const nav = useRouteStore((s) => s.nav);
  const navigate = useRouteStore((s) => s.navigate);
  const collapsed = useMenuCollapseStore((s) => s.collapsed);
  const toggle = useMenuCollapseStore((s) => s.toggle);
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const logout = useAuthStore((s) => s.logout);

  // 按当前角色过滤,保持原有扁平菜单结构(不加分组标签)
  const role = isAdmin ? "admin" : "reviewer";
  const items: MenuProps["items"] = useMemo(
    () =>
      MENU_GROUPS.flatMap((g) => g.items)
        .filter((it) => !it.roles || it.roles.includes(role))
        .map((it) => ({ key: it.key, icon: it.icon, label: it.label })),
    [role],
  );

  // 详情类路由高亮到其所属的一级菜单项
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

  const userMenu: MenuProps = {
    items: [{ key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true }],
    onClick: ({ key }) => {
      if (key === "logout") logout();
    },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* 品牌 */}
      <div
        style={{
          flexShrink: 0,
          padding: collapsed ? "20px 8px 12px" : "20px 16px 12px",
          textAlign: "center",
          fontWeight: 700,
          fontSize: collapsed ? 16 : 15,
          lineHeight: "22px",
          color: t.colorPrimary,
        }}
      >
        {collapsed ? "审" : "装备研制立项AI辅助审查评估系统"}
      </div>

      {/* 菜单 */}
      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        selectedKeys={[selectedKey]}
        items={items}
        onClick={({ key }) => navigate({ name: key as RouteKey })}
        style={{ borderInlineEnd: 0, flex: 1, minHeight: 0, overflowY: "auto" }}
      />

      {/* 用户信息 */}
      {user && (
        <div
          style={{
            flexShrink: 0,
            borderTop: `1px solid ${t.colorBorderSecondary}`,
            padding: collapsed ? "12px 0" : "12px 12px",
          }}
        >
          <Dropdown menu={userMenu} placement="topRight" trigger={["click"]}>
            <div
              className="side-user-trigger"
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: collapsed ? "center" : "flex-start",
                gap: 8,
                padding: collapsed ? "4px 0" : 4,
                borderRadius: t.borderRadius,
              }}
            >
              <Avatar size="small" style={{ background: t.colorPrimary, flexShrink: 0 }}>
                {(user.display_name ?? user.username).slice(0, 1)}
              </Avatar>
              {!collapsed && (
                <>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 13,
                    }}
                  >
                    {user.display_name ?? user.username}
                  </span>
                  <Tag color={isAdmin ? "blue" : "green"} style={{ marginInlineEnd: 0 }}>
                    {isAdmin ? "管理员" : "评审专家"}
                  </Tag>
                </>
              )}
            </div>
          </Dropdown>
        </div>
      )}

      {/* 折叠开关 */}
      <div
        role="button"
        aria-label={collapsed ? "展开菜单" : "折叠菜单"}
        className="side-collapse-toggle"
        style={{ borderTop: `1px solid ${t.colorBorderSecondary}` }}
        onClick={toggle}
      >
        {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
      </div>
    </div>
  );
}
