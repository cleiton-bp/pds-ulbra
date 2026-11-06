/**
 * Variaveis do painel. As duas sao obrigatorias: sem API nao ha dado nenhum, e
 * sem client id o Google recusa antes de desenhar o botao.
 *
 * Elas nao sao segredo — o Vite injeta toda `VITE_*` no bundle, entao qualquer
 * pessoa as le no navegador. Quem guarda segredo e a API: chave de assinatura e
 * string de conexao nunca chegam aqui.
 */

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const loaderUrl = (
  readText(import.meta.env.VITE_LOADER_URL) || `${window.location.origin}/v1/relatofacil.js`
).replace(/\/+$/, '')

/** A origem de um endereco, ou nulo se ele faltar ou nao for um endereco. */
function originOf(value: string): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export const environment = {
  /** Sem barra no fim: o caminho de cada rota ja comeca com uma. */
  apiUrl: (readText(import.meta.env.VITE_API_URL) || 'http://localhost:5080').replace(/\/+$/, ''),
  /** Nulo significa "sem Google configurado", e a tela de entrada avisa. */
  googleClientId: readText(import.meta.env.VITE_GOOGLE_CLIENT_ID) || null,
  /**
   * De onde o carregador e servido: em producao, a CDN do quadro (`VITE_LOADER_URL`);
   * sem ela, a propria origem do painel, como no desenvolvimento.
   *
   * O caminho ja nasce com versao porque ele vai estar colado no HTML de todo
   * cliente — e aquela linha e a coisa mais cara de mudar depois.
   */
  loaderUrl,

  /**
   * O documento do quadro, derivado da origem do carregador — os dois saem
   * sempre do mesmo lugar, e derivar em vez de declarar impede que eles apontem
   * para hosts diferentes no dia em que um mudar.
   *
   * O painel usa isto no relato de teste: e a mesma pagina que o site do cliente
   * abre.
   */
  embedUrl: `${new URL(loaderUrl).origin}/embed.html`,

  /**
   * A pagina de mentira do sistema do cliente, onde o relato de teste e feito: ao lado
   * do carregador, na origem do quadro. Na do painel, o carregador dividiria a origem
   * com a sessao do time, e por isso o painel nem serve esta pagina.
   */
  testPageUrl: `${new URL(loaderUrl).origin}/teste-do-botao.html`,

  /**
   * A pagina publica de acompanhamento, derivada da mesma origem — ela e o
   * terceiro documento deste projeto, e o unico cujo endereco vai num link que
   * uma pessoa guarda.
   *
   * `tracking.html` e nao `/r/CODIGO`: o caminho bonito exige regra de reescrita
   * no servidor, e o que serve estes arquivos e hospedagem estatica. Quando
   * houver dominio proprio, a reescrita entra e este valor muda em um lugar so.
   */
  trackingUrl: `${new URL(loaderUrl).origin}/tracking.html`,

  /**
   * A origem do painel quando ele e o quadro saem de enderecos diferentes: em producao,
   * o painel na raiz e o quadro na CDN (`VITE_PANEL_URL`). E a unica origem de fora que o
   * quadro em previa aceita (`connectToPreviewPanel`), e o que deixa a previa ao vivo
   * funcionar entre os dois enderecos. Painel e quadro saem do mesmo build, entao os dois
   * sabem o mesmo valor. Sem ela, so a propria origem, como no desenvolvimento.
   */
  panelOrigin: originOf(readText(import.meta.env.VITE_PANEL_URL)),
} as const
