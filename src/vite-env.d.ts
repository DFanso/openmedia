/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev builds only: keep the splash visible at least this many seconds. */
  readonly VITE_SPLASH_MIN_SECONDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
