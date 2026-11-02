/**
 * O jsdom ja e dependencia do projeto (o ambiente dos testes de tela), mas nao traz
 * tipos proprios. O teste do design system so usa o DOMParser dele, para conferir o
 * XML do icone da aba como o navegador confere, e roda no ambiente node: o ambiente
 * jsdom troca o `import.meta.url` e o teste perde o caminho dos arquivos.
 */
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string)
    readonly window: Window & typeof globalThis
  }
}
