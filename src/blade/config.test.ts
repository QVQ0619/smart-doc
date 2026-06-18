import { afterEach, vi } from "vitest";
import { getBaseUrl, getToken, hasToken } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("getBaseUrl 缺省回退到默认地址", () => {
  vi.stubEnv("VITE_BLADE_API_BASE", "");
  expect(getBaseUrl()).toBe("http://115.190.152.1:8020");
});

test("getBaseUrl 读取环境变量并去尾部斜杠", () => {
  vi.stubEnv("VITE_BLADE_API_BASE", "http://example.com:8020/");
  expect(getBaseUrl()).toBe("http://example.com:8020");
});

test("token 留空时 hasToken 为 false", () => {
  vi.stubEnv("VITE_BLADE_TOKEN", "  ");
  expect(getToken()).toBe("");
  expect(hasToken()).toBe(false);
});

test("token 有值时 hasToken 为 true", () => {
  vi.stubEnv("VITE_BLADE_TOKEN", " sk-blade-v2-abc ");
  expect(getToken()).toBe("sk-blade-v2-abc");
  expect(hasToken()).toBe(true);
});
