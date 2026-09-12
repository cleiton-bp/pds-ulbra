import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// O config do Vitest mora aqui para o teste usar a mesma resolucao de modulo e o
// mesmo alias da aplicacao: teste que resolve import diferente nao testa a producao.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      // Tres documentos, um projeto so: o painel, o quadro do relato e a pagina
      // publica de acompanhamento. Eles dividem React e o CSS dos tokens — o que
      // os dois publicos NAO carregam e o roteador, a sessao e as telas, porque
      // nada em `src/embed/` nem em `src/tracking/` os importa.
      //
      // Nao e economia de bytes: e o que mantem `pds.web.session` fora de
      // documento que um estranho abre. O teste de arquitetura cobra os dois.
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        embed: fileURLToPath(new URL('./embed.html', import.meta.url)),
        tracking: fileURLToPath(new URL('./tracking.html', import.meta.url)),
      },
    },
  },
  test: {
    // Node por padrao: quase tudo aqui e logica pura e varredura de arquivo. Os
    // testes que montam componente ligam `jsdom` para si, na primeira linha.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
