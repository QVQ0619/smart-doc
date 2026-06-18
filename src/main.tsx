import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BladeClientProvider } from "@blade-hq/agent-kit/react";
import { Toaster } from "sonner";
import App from "./App";
import { themeConfig } from "./styles/theme";
import { bladeClient } from "./blade/client";
import "@blade-hq/agent-kit/style.css";
import "antd/dist/reset.css";

// NOTE: BladeClientProvider in @blade-hq/agent-kit@0.5.11 accepts `client?: BladeClient`,
// NOT `baseUrl`/`token` props as the brief assumed. We pass our pre-constructed
// bladeClient singleton (from blade/client.ts, which already carries the token getter
// and baseUrl) as the `client` prop.

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BladeClientProvider client={bladeClient}>
        <ConfigProvider theme={themeConfig}>
          <App />
          <Toaster position="top-center" richColors />
        </ConfigProvider>
      </BladeClientProvider>
    </QueryClientProvider>
  </StrictMode>,
);
