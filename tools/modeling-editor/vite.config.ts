import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { modelingApi } from './server/plugin'

export default defineConfig({
  plugins: [react(), modelingApi()],
  server: {
    port: 5180,
    // Abre o navegador sozinho. NO_OPEN=1 desliga, para checagem automatizada.
    open: process.env.NO_OPEN !== '1',
    watch: {
      // A pasta de conteudo fica dentro da raiz do Vite. Sem isto, cada gravacao do
      // autosave passaria pelo watcher do dev server — o editor recarregando a si mesmo
      // enquanto a pessoa digita.
      ignored: ['**/database-models/**'],
    },
  },
})
