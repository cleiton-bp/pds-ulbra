import type { ReportHistoryEntryViewModel, ReportHistoryPageViewModel } from '@/contracts'

/**
 * O historico inteiro dos testes como a rota aos pedacos o entregaria: do mais novo para o
 * mais antigo, os de antes do ponto, com as mesmas regras de leitura (de quem relatou, so a
 * primeira visita, e as voltas a pedido) e a primeira visita dita a parte.
 *
 * Os testes continuam escrevendo o historico como lista, do mais antigo para o mais novo, e
 * o dublê da rota aos pedacos passa por aqui.
 */
export function pedacoDoHistorico(
  entradas: ReportHistoryEntryViewModel[] | undefined,
  opcoes: { before?: string; limit?: number; returns?: boolean } = {},
): ReportHistoryPageViewModel {
  const todas = entradas ?? []
  const visitas = todas.filter(
    (entrada) => entrada.Type === 'ReportViewed' && entrada.Source === 'PublicPage',
  )
  const primeira = visitas[0]?.PublicId ?? null
  const lidas = todas
    .filter(
      (entrada) =>
        opcoes.returns ||
        !(entrada.Type === 'ReportViewed' && entrada.Source === 'PublicPage') ||
        entrada.PublicId === primeira,
    )
    .reverse()

  const depois = opcoes.before
    ? lidas.findIndex((entrada) => entrada.PublicId === opcoes.before)
    : -1
  const resto = depois >= 0 ? lidas.slice(depois + 1) : lidas
  const limite = opcoes.limit ?? 10

  return {
    Items: resto.slice(0, limite),
    HasOlder: resto.length > limite,
    Total: lidas.length,
    ReporterReturns: opcoes.returns ? 0 : Math.max(visitas.length - 1, 0),
    FirstReporterVisit: primeira,
  }
}

/**
 * Acha a linha do historico pela frase inteira. Quem fez fica num destaque a parte ("Ana"
 * em negrito, e "moveu de A para B" ao lado), e o `getByText` sozinho so le o texto de um
 * elemento de cada vez.
 */
export const fraseDoHistorico = (frase: string) => (_: string, elemento: Element | null) =>
  elemento?.tagName === 'P' && elemento.textContent === frase
