import type { ReactNode } from "react";
import AppShell from "./layout/AppShell";
import SideMenu from "./layout/SideMenu";
import ChatPanel from "./layout/ChatPanel";
import { useRouteStore } from "./store/useRouteStore";
import type { Nav } from "./store/useRouteStore";
import HomePage from "./pages/home/HomePage";
import NewReviewPage from "./pages/review/NewReviewPage";
import ReviewTasksPage from "./pages/review/ReviewTasksPage";
import ReviewReportPage from "./pages/review/ReviewReportPage";
import AboutPage from "./pages/about/AboutPage";
import BatchListPage from "./pages/batch/BatchListPage";
import BatchDetailPage from "./pages/batch/BatchDetailPage";
import RuleDetailPage from "./pages/batch/RuleDetailPage";

function renderMain(n: Nav): ReactNode {
  switch (n.name) {
    case "home":
      return <HomePage />;
    case "review-new":
      return <NewReviewPage />;
    case "review-tasks":
      return <ReviewTasksPage />;
    case "review-report":
      return <ReviewReportPage />;
    case "about":
      return <AboutPage />;
    case "batch-list":
      return <BatchListPage />;
    case "batch-detail":
      return <BatchDetailPage batchId={n.batchId} batchTitle={n.batchTitle} />;
    case "rule-detail":
      return (
        <RuleDetailPage
          docId={n.docId}
          docTitle={n.docTitle}
          batchId={n.batchId}
          batchTitle={n.batchTitle}
        />
      );
  }
}

export default function App() {
  const nav = useRouteStore((s) => s.nav);
  return (
    <AppShell menu={<SideMenu />} main={renderMain(nav)} chat={<ChatPanel />} />
  );
}
