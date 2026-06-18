import "@testing-library/jest-dom/vitest";

// antd Table (rc-table) 在 jsdom 环境中调用 getComputedStyle(elt, pseudoElt) 会触发
// jsdom virtualConsole "jsdomError" 事件（vitest 将其路由到 console.error），产生 stderr 噪音。
// jsdom 内部使用 notImplemented() 函数——它只 emit 事件，不 throw——因此 try/catch 无法捕获。
// 窄化修复：仅过滤掉这条特定的 "Not implemented: window.getComputedStyle" console.error，
// 保留 window.getComputedStyle 本身不变，真实计算样式值对所有普通调用完整保留。
const _origConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === "string" &&
    args[0].includes("Not implemented: window.getComputedStyle")
  ) {
    return; // 仅静默此条 jsdom 伪元素 getComputedStyle 噪音
  }
  _origConsoleError(...args);
};

// antd 组件依赖 matchMedia / ResizeObserver，jsdom 未实现，需补丁
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

if (!("ResizeObserver" in window)) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as Record<string, unknown>)["ResizeObserver"] =
    ResizeObserverMock as unknown as typeof ResizeObserver;
}
