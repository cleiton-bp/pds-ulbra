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
  test: {
    // Node por padrao: quase tudo aqui e logica pura e varredura de arquivo. Os
    // testes que montam componente ligam `jsdom` para si, na primeira linha.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
