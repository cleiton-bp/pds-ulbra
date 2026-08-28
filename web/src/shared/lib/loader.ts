/**
 * O carregador que o cliente cola no site.
 *
 * Fica em `shared/` porque duas telas o mostram: a de entrada, para provar que e
 * mesmo uma linha so, e a de instalacao, ja com a chave do projeto no lugar.
 * O endereco e provisorio — o definitivo depende do dominio (cards IN-01 e
 * E2-01) — e muda **aqui**, num arquivo.
 */
export const LOADER_URL = 'https://cdn.pds.app/pds.js'

/** Sem chave sai o exemplo, que e o que a tela de entrada mostra a quem nem entrou. */
export function buildSnippet(publicKey: string): string {
  // `data-key` em ingles (§1 do decisoes-de-projeto.md): vai aparecer no HTML de
  // todo cliente.
  return `<script\n  src="${LOADER_URL}"\n  data-key="${publicKey || 'pk_...'}"\n  defer></script>`
}
