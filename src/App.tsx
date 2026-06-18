import type { ReactNode } from "react";
import AppShell from "./layout/AppShell";
import SideMenu from "./layout/SideMenu";
import ChatPanel from "./layout/ChatPanel";
import { useRouteStore } from "./store/useRouteStore";
import type { RouteKey } from "./layout/menuConfig";
import HomePage from "./pages/home/HomePage";
import NewReviewPage from "./pages/review/NewReviewPage";
import ReviewTasksPage from "./pages/review/ReviewTasksPage";
import ReviewReportPage from "./pages/review/ReviewReportPage";
import RuleLibraryPage from "./pages/library/RuleLibraryPage";
import ConfigPacksPage from "./pages/library/ConfigPacksPage";
import DocArchivePage from "./pages/library/DocArchivePage";
import AboutPage from "./pages/about/AboutPage";

const PAGES: Record<RouteKey, ReactNode> = {
  home: <HomePage />,
  "review-new": <NewReviewPage />,
  "review-tasks": <ReviewTasksPage />,
  "review-report": <ReviewReportPage />,
  "lib-rules": <RuleLibraryPage />,
  "lib-packs": <ConfigPacksPage />,
  "lib-archive": <DocArchivePage />,
  about: <AboutPage />,
};

export default function App() {
  const route = useRouteStore((s) => s.route);
  return (
    <AppShell menu={<SideMenu />} main={PAGES[route]} chat={<ChatPanel />} />
  );
}
