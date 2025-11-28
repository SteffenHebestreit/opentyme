/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_API_URL: string;
  readonly VITE_APP_ENVIRONMENT: string;
  readonly VITE_KEYCLOAK_URL: string;
  readonly VITE_KEYCLOAK_REALM: string;
  readonly VITE_KEYCLOAK_CLIENT_ID: string;
  readonly VITE_KEYCLOAK_ENABLED: string;
  readonly DEV: boolean;
  // More environment variables can be added here as they are defined in .env files
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
