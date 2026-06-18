import "@testing-library/jest-dom/vitest";

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
