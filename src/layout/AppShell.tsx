import type { ReactNode } from "react";
import "../styles/global.css";

interface AppShellProps {
  menu: ReactNode;
  main: ReactNode;
  chat: ReactNode;
}

export default function AppShell({ menu, main, chat }: AppShellProps) {
  return (
    <div className="app-shell">
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
