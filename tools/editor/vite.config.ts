import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileApi } from './server/plugin'

/** Caminho absoluto de uma pasta da raiz — ver o `watch.ignored` abaixo. */
const here = (folder: string): string => fileURLToPath(new URL(`./${folder}/**`, import.meta.url))

export default defineConfig({
  plugins: [react(), fileApi()],
  server: {
    port: 5180,
    // Abre o navegador sozinho. NO_OPEN=1 desliga, para checagem automatizada.
    open: process.env.NO_OPEN !== '1',
    watch: {
      // Os arquivos dos ambientes ficam em `database-models/`, dentro da raiz do Vite. Sem isto,
      // cada gravacao do autosave passaria pelo watcher do dev server — o editor
      // recarregando a si mesmo enquanto a pessoa digita. Caminho absoluto, e nao
      // `**/use-cases/**`: esse padrao pegaria tambem o codigo em `src/use-cases`.
      ignored: [here('database-models')],
    },
  },
})
