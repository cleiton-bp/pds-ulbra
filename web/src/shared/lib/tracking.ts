import { environment } from '@/data/environment'

/**
 * O link que quem relatou guarda, e o que a propria pagina le de volta dele.
 *
 * **O token vai no fragmento, e o protocolo na query.** A diferenca nao e
 * estetica: o que vem depois do `#` nunca e enviado ao servidor — nao entra em
 * log de acesso, nem no `Referer` que sai da pagina se ela abrir um link, nem no
 * historico que um proxy enxerga. O protocolo pode ficar a vista porque ele nao
 * abre nada sozinho, e e o que faz o link dizer a qual relato ele pertence.
 *
 * E por isso que a consulta na API e um `POST` com o token no corpo: o fragmento
 * so existe no navegador, e passa-lo para a query na hora de chamar desfaria o
 * cuidado inteiro.
 */
export function buildTrackingLink(trackingCode: string, token: string): string {
  const code = encodeURIComponent(trackingCode)

  return `${environment.trackingUrl}?c=${code}#t=${encodeURIComponent(token)}`
}

/**
 * O link da lista pessoal, que leva ao mesmo lugar por outra credencial.
 *
 * **O codigo pessoal vai no fragmento, pelo mesmo motivo do token**: ele e o que
 * identifica a pessoa, e o que vem depois do `#` nunca chega ao servidor. A chave
 * publica vai na query porque ela ja e publica por definicao — e a pagina precisa
 * dela para saber em qual projeto o codigo vale.
 *
 * **Leva menos poder que o link do token.** Aberto assim, confirmar e reabrir
 * chegam desligados, a menos que o projeto tenha ligado isso.
 */
export function buildReporterCodeLink(
  trackingCode: string,
  publicKey: string,
  reporterCode: string,
): string {
  const code = encodeURIComponent(trackingCode)
  const key = encodeURIComponent(publicKey)

  return `${environment.trackingUrl}?c=${code}&k=${key}#p=${encodeURIComponent(reporterCode)}`
}

/** O que o link carrega, vazio quando ele chegou pela metade. */
export interface TrackingLink {
  code: string
  token: string
  /** A chave publica, so no link que veio da lista pessoal. */
  key: string
  /** O codigo pessoal, so no link que veio da lista pessoal. */
  reporterCode: string
}

/**
 * Le o link da barra de endereco.
 *
 * Nao decide nada sobre o que fazer com metade dele: quem chama e que sabe se um
 * link incompleto e "recusa" ou "ainda carregando".
 */
export function readTrackingLink(search: string, hash: string): TrackingLink {
  const query = new URLSearchParams(search)
  // O `#` entra na string como primeiro caractere e nao faz parte do parametro.
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)

  return {
    code: query.get('c')?.trim() ?? '',
    token: fragment.get('t')?.trim() ?? '',
    key: query.get('k')?.trim() ?? '',
    reporterCode: fragment.get('p')?.trim() ?? '',
  }
}
