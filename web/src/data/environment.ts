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
  readText(import.meta.env.VITE_LOADER_URL) || `${window.location.origin}/v1/pds.js`
).replace(/\/+$/, '')

export const environment = {
  /** Sem barra no fim: o caminho de cada rota ja comeca com uma. */
  apiUrl: (readText(import.meta.env.VITE_API_URL) || 'http://localhost:5080').replace(/\/+$/, ''),
  /** Nulo significa "sem Google configurado", e a tela de entrada avisa. */
  googleClientId: readText(import.meta.env.VITE_GOOGLE_CLIENT_ID) || null,
  /**
   * De onde o carregador e servido. Hoje e a propria origem do painel, que e
   * quem publica `/v1/pds.js`; quando houver dominio proprio, muda aqui.
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
} as const
