import type { ObservedOriginViewModel, ProjectOriginViewModel, ProjectViewModel } from '@/contracts'

/**
 * Os sinais de que a instalacao foi feita, **lidos dos dados — nenhum e uma caixa que a
 * pessoa marca**. A pagina central (os primeiros passos) e a Instalação (o passo aberto)
 * usam os mesmos: as duas telas nao podem discordar sobre o que falta.
 *
 * `null` quando a leitura que decide falhou: a tela nao afirma o que nao sabe.
 */

/**
 * O endereco do painel, como a API guarda a origem do relato de teste: o host, com a
 * porta, sem esquema. O relato de teste e feito do painel (`TestReportDialog`), e e o
 * unico que chega com este endereco.
 */
export function panelHost(): string {
  return window.location.host.toLowerCase()
}

/**
 * Script colado: um relato chegou de um endereco que nao e o painel. So o
 * `LastReportReceivedAt` nao bastaria — o relato de teste tambem o acende, e ele nao
 * prova que o sistema tem o script. Sem a lista, vale o `LastReportReceivedAt`.
 */
export function scriptInstalled(
  project: ProjectViewModel,
  observed: ObservedOriginViewModel[] | null,
  host: string = panelHost(),
): boolean {
  return observed === null
    ? project.LastReportReceivedAt !== null
    : observed.some((origem) => origem.Domain !== host)
}

/** Dominio autorizado: a lista de autorizados tem alguem. */
export function domainAuthorized(origins: ProjectOriginViewModel[] | null): boolean | null {
  return origins === null ? null : origins.length > 0
}

/** Relato de teste: um relato chegou com o endereco do painel. */
export function testReportSent(
  observed: ObservedOriginViewModel[] | null,
  host: string = panelHost(),
): boolean | null {
  return observed === null ? null : observed.some((origem) => origem.Domain === host)
}
