import { Menu } from "antd";
import type { MenuProps } from "antd";
import { MENU_GROUPS, type RouteKey } from "./menuConfig";
import { useRouteStore } from "../store/useRouteStore";

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

  return (
    <div>
      <div
        style={{
          padding: "16px 20px",
          fontWeight: 700,
          fontSize: 15,
          color: "#1677ff",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        立项审查AI辅助系统
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
