import "@testing-library/jest-dom/vitest";

// antd Table (rc-table) 依赖 getComputedStyle 计算滚动条宽度；jsdom 的实现会通过 virtualConsole
// 触发 "Not implemented" jsdomError（即 stderr 输出）。用 Proxy 完全替换以避免 stderr 污染，
// 同时通过 Proxy 使 dom-accessibility-api 所需的 getPropertyValue 等方法正常工作。
window.getComputedStyle = (_elt: Element, _pseudo?: string | null): CSSStyleDeclaration => {
  return new Proxy({} as CSSStyleDeclaration, {
    get(_target, prop: string | symbol) {
      if (prop === "getPropertyValue") return () => "";
      if (prop === "setProperty") return () => undefined;
      if (prop === "removeProperty") return () => "";
      if (prop === "item") return () => "";
      if (prop === "length") return 0;
      if (prop === Symbol.iterator) return function* () {};
      return "";
    },
  });
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
