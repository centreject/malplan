/// <reference types="vite/client" />

/** Set at build time (CI secrets), never committed. Without both, Google Drive sync is hidden. */
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
}
