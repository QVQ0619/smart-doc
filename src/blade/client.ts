import { BladeClient } from "@blade-hq/agent-kit/client";
import { getBaseUrl, getToken } from "./config";

// token 用 getter 形式注入，便于运行时切换；baseUrl 必须是 origin（不带 pathname）。
export const bladeClient = new BladeClient({
  baseUrl: getBaseUrl(),
  token: () => getToken(),
});
