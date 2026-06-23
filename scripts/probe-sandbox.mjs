// 一次性探针：用 Blade SDK 驱动远端 agent，在沙箱里跑只读 curl，验证沙箱能否起+出网。
// 跑法: node --env-file=.env scripts/probe-sandbox.mjs
import { BladeClient } from "@blade-hq/agent-kit/client";

const baseUrl = process.env.VITE_BLADE_API_BASE;
const token = process.env.VITE_BLADE_TOKEN;
const tunnel = process.env.VITE_SMART_DOC_API; // 旧隧道域名，预期断（顺带验判读矩阵）
if (!baseUrl || !token) {
  console.error("缺 VITE_BLADE_API_BASE / VITE_BLADE_TOKEN");
  process.exit(2);
}

const client = new BladeClient({ baseUrl, token: () => token });

const PROBE = [
  "请使用 bash 工具执行下面这一整段命令，然后把命令的完整原始 stdout 一字不改贴回给我，不要解释、不要改写、不要总结：",
  "",
  "```bash",
  'echo "SANDBOX_ALIVE=yes"; uname -srm',
  'curl -m 5 -sS -o /dev/null -w "GONGWANG_http=%{http_code}\\n" https://www.baidu.com; echo "gongwang_exit=$?"',
  `curl -m 5 -sS -o /dev/null -w "SUIDAO_http=%{http_code}\\n" ${tunnel || "https://example.invalid"}/api/health; echo "suidao_exit=$?"`,
  "```",
].join("\n");

const main = async () => {
  console.log("baseUrl:", baseUrl);
  const created = await client.sessions.createSession("sandbox egress probe");
  const session_id = created.session_id ?? created.id;
  console.log("session_id:", session_id);

  const socket = client.socket();
  let done = false;
  const finish = async (why) => {
    if (done) return;
    done = true;
    console.log("=== finish:", why, "===");
    try {
      const turns = await client.sessions.getSessionTurns(session_id);
      for (const t of turns) {
        for (const tc of t.tool_calls ?? []) {
          console.log(`\n[tool ${tc.tool_name ?? tc.name}] status=${tc.status}`);
          const a = tc.arguments;
          console.log("  args:", typeof a === "string" ? a : JSON.stringify(a));
          const r = tc.result;
          console.log("  result:", typeof r === "string" ? r : JSON.stringify(r));
        }
      }
    } catch (e) {
      console.error("getSessionTurns 失败:", e?.message ?? e);
    }
    try { socket.disconnect(); } catch {}
    process.exit(0);
  };

  socket.on("system:error", (p) => console.error("SYSTEM_ERROR:", p?.message ?? JSON.stringify(p)));
  socket.on("connect_error", (e) => console.error("CONNECT_ERROR:", e?.message ?? e));
  socket.on("chat:end", (p) => { console.log("chat:end status=", p?.status); finish("chat:end"); });

  socket.connect();
  socket.emit("session:subscribe", { session_id });
  socket.emit("chat:send", { session_id, message: PROBE, mode: "executing" });

  setTimeout(() => finish("timeout-120s"), 120000);
};

main().catch((e) => { console.error("FATAL:", e?.message ?? e); process.exit(1); });
