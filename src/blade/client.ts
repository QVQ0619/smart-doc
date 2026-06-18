import { bootstrapBladeClient } from "@blade-hq/agent-kit/react";
import { getBaseUrl, getToken } from "./config";

// bootstrapBladeClient（而非 `new BladeClient`）才会调用 attachClientToStores，
// 将客户端注入 SDK 的内部 session/chat store 的 _client 字段，并建立 Socket.IO
// streaming bridge（bridgeSocketEvents）。仅用 new BladeClient + BladeClientProvider
// 时 _client 始终为 null，getClient() 会抛 "bootstrapBladeClient() must be called
// before any SDK usage"，导致真实对话在运行时失败（即使单元测试因 mock 而通过）。
export const bladeClient = bootstrapBladeClient({
  baseUrl: getBaseUrl(),
  token: () => getToken(),
});
