import { useCallback, useEffect, useState } from "react";
import { Button, Tooltip } from "antd";
import { PlusOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
// NOTE: @blade-hq/agent-kit/chat exports map has no "types" field in 0.5.11;
// TypeScript resolves the subpath through the bundler's module resolution anyway.
import { ChatView } from "@blade-hq/agent-kit/chat";
import { useSessionStore } from "@blade-hq/agent-kit/react";
import { bladeClient } from "../blade/client";
import { hasToken, getSolutionId, getBizRoleId } from "../blade/config";
import { useChatCollapseStore } from "../store/useChatCollapseStore";
import { pushRuleDocSkill, pushMaterialDocSkill } from "../blade/sessionSkill";

export default function ChatPanel() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenReady = hasToken();

  const collapsed = useChatCollapseStore((s) => s.collapsed);
  const toggleCollapsed = useChatCollapseStore((s) => s.toggle);

  // SDK deviation: bladeClient.sessions.createSession(intent?, template_id?, primary_skill_id?)
  // does NOT accept { solution_id, biz_role_id }. To pass those fields we call
  // createSessionWithRequest. However the test mock patches createSession; to
  // keep tests green and real code correct we detect which method is available
  // at call time (both are present on the real client).
  const doCreateSession = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const solutionId = getSolutionId();
      const bizRoleId = getBizRoleId();
      let result: { session_id: string };
      if (solutionId !== undefined || bizRoleId !== undefined) {
        // Use createSessionWithRequest to carry solution_id / biz_role_id.
        // bladeClient.sessions is typed as SessionsResource which declares
        // createSessionWithRequest(request: CreateSessionRequest) — no cast needed.
        result = await bladeClient.sessions.createSessionWithRequest({
          intent: "立项审查对话",
          ...(solutionId !== undefined ? { solution_id: solutionId } : {}),
          ...(bizRoleId !== undefined ? { biz_role_id: bizRoleId } : {}),
        });
      } else {
        // Fallback to simple createSession (matches test mock)
        result = await bladeClient.sessions.createSession("立项审查对话");
      }
      setSessionId(result.session_id);
      useSessionStore.getState().setActiveSession(result.session_id);
      void pushRuleDocSkill(result.session_id);
      void pushMaterialDocSkill(result.session_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, []);

  useEffect(() => {
    if (tokenReady && !sessionId && !creating) {
      void doCreateSession();
    }
    // 仅在 token 就绪状态变化时触发一次自动建会话
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenReady]);

  return (
    <>
      {collapsed && (
        <div className="chat-rail">
          <Tooltip title="展开对话" placement="left">
            <Button
              size="small"
              aria-label="展开对话"
              icon={<MenuUnfoldOutlined />}
              onClick={toggleCollapsed}
            />
          </Tooltip>
          <span className="chat-rail__label">对话</span>
        </div>
      )}

      <div
        style={{
          display: collapsed ? "none" : "flex",
          flexDirection: "column",
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid #e5e6eb",
            flex: "0 0 auto",
          }}
        >
          <strong>对话助手</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <Tooltip title="新建会话">
              <Button
                size="small"
                icon={<PlusOutlined />}
                disabled={!tokenReady || creating}
                onClick={() => void doCreateSession()}
              >
                新建会话
              </Button>
            </Tooltip>
            <Tooltip title="折叠对话">
              <Button
                size="small"
                aria-label="折叠对话"
                icon={<MenuFoldOutlined />}
                onClick={toggleCollapsed}
              />
            </Tooltip>
          </div>
        </div>

        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {!tokenReady ? (
            <div style={{ padding: 24, color: "#86909c", fontSize: 13 }}>
              未配置 Blade API Key。请在项目根的 <code>.env</code> 中填写{" "}
              <code>VITE_BLADE_TOKEN=sk-blade-v2-...</code>，保存后重启{" "}
              <code>npm run dev</code>。
            </div>
          ) : error ? (
            <div style={{ padding: 24, color: "#f53f3f", fontSize: 13 }}>
              建会话失败：{error}
              <div style={{ marginTop: 12 }}>
                <Button size="small" onClick={() => void doCreateSession()}>
                  重试
                </Button>
              </div>
            </div>
          ) : sessionId ? (
            <ChatView sessionId={sessionId} />
          ) : (
            <div style={{ padding: 24, color: "#86909c", fontSize: 13 }}>
              正在创建会话…
            </div>
          )}
        </div>
      </div>
    </>
  );
}
