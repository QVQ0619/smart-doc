/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BLADE_API_BASE?: string;
  readonly VITE_BLADE_TOKEN?: string;
  readonly VITE_BLADE_SOLUTION_ID?: string;
  readonly VITE_BLADE_BIZ_ROLE_ID?: string;
  readonly VITE_SMART_DOC_API?: string;
}

declare module "*?raw" {
  const s: string;
  export default s;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
