/// <reference types="vite/client" />

/** As variaveis do painel, tipadas. Ver `.env.example` para o que cada uma faz. */
interface ImportMetaEnv {
  readonly VITE_USE_API?: string
  readonly VITE_API_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
