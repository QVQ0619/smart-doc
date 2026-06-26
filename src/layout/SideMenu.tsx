import { Menu, Button, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { MENU_GROUPS, type RouteKey } from "./menuConfig";
import { useRouteStore } from "../store/useRouteStore";
import { useMenuCollapseStore } from "../store/useMenuCollapseStore";

const items: MenuProps["items"] = MENU_GROUPS.map((group) => ({
  type: "group",
  label: group.title,
  children: group.items.map((it) => ({
    key: it.key,
    icon: it.icon,
    label: it.label,
  })),
}));

export default function SideMenu() {
  const route = useRouteStore((s) => s.route);
  const setRoute = useRouteStore((s) => s.setRoute);
  const collapsed = useMenuCollapseStore((s) => s.collapsed);
  const toggle = useMenuCollapseStore((s) => s.toggle);

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
    <div>
      <div
        style={{
          padding: "16px 20px",
          fontWeight: 700,
          fontSize: 15,
          color: "#1677ff",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>立项审查AI辅助系统</span>
        <Tooltip title="折叠菜单">
          <Button
            size="small"
            aria-label="折叠菜单"
            icon={<MenuFoldOutlined />}
            onClick={toggle}
          />
        </Tooltip>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[route]}
        items={items}
        style={{ borderInlineEnd: "none" }}
        onClick={(info) => setRoute(info.key as RouteKey)}
      />
    </div>
  );
}
