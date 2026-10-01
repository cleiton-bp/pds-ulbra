/**
 * O que a pessoa marcou na pagina: um retangulo, em pixels da janela como ela a
 * ve, ou a tela inteira que se ve agora.
 *
 * **Em pixels da janela, e nao da pagina.** E o que o arrastar mede. Quem desenha
 * soma a rolagem na hora — e a mesma rolagem, porque a pagina fica parada enquanto
 * a pessoa marca.
 */
export type CaptureArea = { x: number; y: number; width: number; height: number } | 'viewport'

/**
 * O que o arquivo da captura oferece ao carregador. Ele chega **so no clique**, e
 * por isso mora num arquivo proprio: a biblioteca que desenha a pagina pesa mais
 * que o carregador inteiro, e quem nunca captura nao a baixa.
 */
export interface CaptureModule {
  /**
   * Desenha a area da pagina e devolve o arquivo de imagem.
   *
   * @param maxBytes O teto de imagem do projeto, para o formato caber nele.
   */
  capturePage(area: CaptureArea, maxBytes: number | null): Promise<File>
}

/**
 * O nome global com que o arquivo da captura se apresenta. Ele entra na pagina do
 * cliente como `<script>` comum — um modulo pediria CORS do servidor dos
 * arquivos —, e um script comum so tem o `window` para entregar o que traz.
 */
export const CAPTURE_GLOBAL = 'PdsCaptura'
