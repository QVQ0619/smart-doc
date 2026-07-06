import { useMemo } from "react";
import { Tooltip } from "antd";
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  SafetyCertificateFilled,
} from "@ant-design/icons";
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

  // 按当前角色过滤菜单项
  const role = isAdmin ? "admin" : "reviewer";
  const groups = useMemo(
    () =>
      MENU_GROUPS.map((g) => ({
        title: g.title,
        items: g.items.filter((it) => !it.roles || it.roles.includes(role)),
      })).filter((g) => g.items.length > 0),
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

  if (collapsed) {
    return (
      <div className="menu-rail menu-rail--dark">
        <Tooltip title="展开菜单" placement="right">
          <button
            type="button"
            className="side-menu__icon-btn"
            aria-label="展开菜单"
            onClick={toggle}
          >
            <MenuUnfoldOutlined />
          </button>
        </Tooltip>
        <span className="menu-rail__label">菜单</span>
      </div>
    );
  }

  // 扁平序号:入场动效按序错峰
  let flatIdx = 0;

  return (
    <div className="side-menu">
      <div className="side-menu__brand">
        <div className="side-menu__emblem">
          <SafetyCertificateFilled />
        </div>
        <div className="side-menu__brand-text">
          <span className="side-menu__brand-eyebrow">装备研制立项</span>
          <span className="side-menu__brand-title">AI辅助审查评估系统</span>
        </div>
      </div>

      <nav className="side-menu__nav">
        {groups.map((g) => (
          <div key={g.title}>
            {g.items.length > 1 && <div className="side-menu__group-title">{g.title}</div>}
            {g.items.map((it) => {
              const active = it.key === selectedKey;
              const idx = flatIdx++;
              return (
                <button
                  key={it.key}
                  type="button"
                  className={"side-menu__item" + (active ? " side-menu__item--active" : "")}
                  style={{ animationDelay: `${idx * 30}ms` }}
                  onClick={() => navigate({ name: it.key as RouteKey })}
                >
                  <span className="side-menu__item-icon">{it.icon}</span>
                  <span className="side-menu__item-label">{it.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {user && (
        <div className="side-menu__footer">
          <div className="side-menu__user">
            <div className="side-menu__avatar">
              {(user.display_name ?? user.username).slice(0, 1)}
            </div>
            <div className="side-menu__user-meta">
              <div className="side-menu__user-name">{user.display_name ?? user.username}</div>
              <span className={"side-menu__role" + (isAdmin ? " side-menu__role--admin" : "")}>
                {isAdmin ? "管理员" : "评审专家"}
              </span>
            </div>
            <Tooltip title="退出登录">
              <button
                type="button"
                className="side-menu__icon-btn"
                aria-label="退出登录"
                onClick={logout}
              >
                <LogoutOutlined />
              </button>
            </Tooltip>
          </div>
          <button type="button" className="side-menu__collapse" aria-label="折叠菜单" onClick={toggle}>
            <MenuFoldOutlined />
            <span>收起导航</span>
          </button>
        </div>
      )}
    </div>
  );
}
