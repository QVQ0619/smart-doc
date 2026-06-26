import type { ReactNode } from "react";
import { useChatCollapseStore } from "../store/useChatCollapseStore";
import { useMenuCollapseStore } from "../store/useMenuCollapseStore";
import "../styles/global.css";

interface AppShellProps {
  menu: ReactNode;
  main: ReactNode;
  chat: ReactNode;
}

export default function AppShell({ menu, main, chat }: AppShellProps) {
  const chatCollapsed = useChatCollapseStore((s) => s.collapsed);
  const menuCollapsed = useMenuCollapseStore((s) => s.collapsed);
  const rootClass = [
    "app-shell",
    menuCollapsed && "app-shell--menu-collapsed",
    chatCollapsed && "app-shell--chat-collapsed",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={rootClass}>
      <aside className="app-shell__menu" data-testid="shell-menu">
        {menu}
      </aside>
      <main className="app-shell__main" data-testid="shell-main">
        {main}
      </main>
      <section className="app-shell__chat" data-testid="shell-chat">
        {chat}
      </section>
    </div>
  );
}
