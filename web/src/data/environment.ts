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

export const environment = {
  /** Sem barra no fim: o caminho de cada rota ja comeca com uma. */
  apiUrl: (readText(import.meta.env.VITE_API_URL) || 'http://localhost:5080').replace(/\/+$/, ''),
  /** Nulo significa "sem Google configurado", e a tela de entrada avisa. */
  googleClientId: readText(import.meta.env.VITE_GOOGLE_CLIENT_ID) || null,
} as const
