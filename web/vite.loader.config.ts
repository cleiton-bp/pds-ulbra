import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

/**
 * O build do carregador, separado do painel de proposito.
 *
 * Ele sai em **IIFE** e nao em modulo: o trecho que o cliente cola e um
 * `<script src>` comum, que precisa funcionar em pagina antiga, sem `type=module`
 * e sem empacotador do outro lado.
 *
 * `publicDir: false` e **obrigatorio**. Sem ele o Vite copia `public/` inteiro
 * para dentro de `public/v1` a cada build, recursivamente.
 *
 * `emptyOutDir: false` pelo mesmo motivo: `public/v1` mora dentro de `public/`, e
 * limpar a pasta de saida aqui apagaria o que o build principal depois copia.
 */
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Dentro de `public/` para o build principal copiar junto, e a URL final
    // ficar `/v1/pds.js` tanto no `vite dev` quanto no `dist`.
    outDir: 'public/v1',
    emptyOutDir: false,
    // O caminho colado no HTML do cliente e a coisa mais cara de mudar depois:
    // ja nasce com versao, para a troca nunca exigir mexer no site de ninguem.
    lib: {
      entry: fileURLToPath(new URL('./src/loader/main.ts', import.meta.url)),
      formats: ['iife'],
      name: 'PdsLoader',
      fileName: () => 'pds.js',
    },
  },
})
