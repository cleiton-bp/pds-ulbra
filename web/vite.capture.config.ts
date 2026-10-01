import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { CAPTURE_GLOBAL } from './src/capture/area'

/**
 * O build do arquivo da captura, ao lado do carregador.
 *
 * **Arquivo proprio, e nao parte do carregador.** A biblioteca que redesenha a
 * pagina pesa mais que o carregador inteiro, e ele roda em todo site de cliente, em
 * toda visita. O carregador baixa este arquivo so quando a pessoa clica em
 * capturar.
 *
 * **IIFE, como o carregador.** Entra na pagina como `<script>` comum: um modulo
 * pediria CORS do servidor dos arquivos, e o carregador nao pode depender disso.
 *
 * `publicDir: false` e `emptyOutDir: false` pelos mesmos motivos do carregador —
 * ver `vite.loader.config.ts`.
 */
export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'public/v1',
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/capture/main.ts', import.meta.url)),
      formats: ['iife'],
      name: CAPTURE_GLOBAL,
      fileName: () => 'pds-captura.js',
    },
  },
})
