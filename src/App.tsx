import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Spin } from "antd";
import AppShell from "./layout/AppShell";
import SideMenu from "./layout/SideMenu";
import ChatPanel from "./layout/ChatPanel";
import { useRouteStore } from "./store/useRouteStore";
import type { Nav } from "./store/useRouteStore";
import { useAuthStore } from "./store/useAuthStore";
import { getMe } from "./api/auth";
import LoginPage from "./pages/auth/LoginPage";
import ComingSoon from "./pages/common/ComingSoon";
import AboutPage from "./pages/about/AboutPage";
import BatchListPage from "./pages/batch/BatchListPage";
import BatchDetailPage from "./pages/batch/BatchDetailPage";
import RuleDetailPage from "./pages/batch/RuleDetailPage";
import RuleLibraryPage from "./pages/library/RuleLibraryPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import TaskManagePage from "./pages/admin/TaskManagePage";
import ReviewLedgerPage from "./pages/ledger/ReviewLedgerPage";
import MyTasksPage from "./pages/reviewer/MyTasksPage";
import TaskReviewPage from "./pages/reviewer/TaskReviewPage";
import ReportGenPage from "./pages/reviewer/ReportGenPage";
import PackageReviewPage from "./pages/reviewer/PackageReviewPage";
import SystemSettingsPage from "./pages/settings/SystemSettingsPage";

function renderMain(n: Nav): ReactNode {
  switch (n.name) {
    case "dashboard":
      return <DashboardPage />;
    case "about":
      return <AboutPage />;
    case "batch-list":
      return <BatchListPage />;
    case "rule-library":
      return <RuleLibraryPage />;
    case "task-manage":
      return <TaskManagePage />;
    case "review-ledger":
      return <ReviewLedgerPage />;
    case "my-tasks":
      return <MyTasksPage />;
    case "metric-inspect":
      return <ComingSoon title="指标专项检验" hint="对项目关键指标进行专项检验。" />;
    case "opinion-review":
      return <ComingSoon title="审查意见研判" hint="汇总并研判各项审查意见。" />;
    case "report-gen":
      return <ReportGenPage />;
    case "settings":
      return <SystemSettingsPage />;
    case "task-review":
      return <TaskReviewPage taskId={n.taskId} taskName={n.taskName} />;
    case "package-review":
      return <PackageReviewPage packageId={n.packageId} />;
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
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  // 有 token 但内存无 user(刷新场景):向后端校验并水合;失败则登出。
  const [checking, setChecking] = useState(!!token && !user);

  useEffect(() => {
    if (token && !user) {
      getMe()
        .then((u) => setUser(u))
        .catch(() => logout())
        .finally(() => setChecking(false));
    }
  }, [token, user, setUser, logout]);

  if (!token) return <LoginPage />;
  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin tip="加载中…" size="large" />
      </div>
    );
  }
  if (!user) return <LoginPage />;

  return (
    <AppShell menu={<SideMenu />} main={renderMain(nav)} chat={<ChatPanel />} />
  );
}
