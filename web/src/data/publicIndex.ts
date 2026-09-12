import { apiReportService } from '@/data/api/apiReportService'
import type { ReportService } from '@/data/reportService'

/**
 * O ponto de acesso do que roda **sem sessao** — hoje, so a ferramenta embutida.
 *
 * Existe separado de `data/index.ts` por uma razao medida, e nao por gosto: o
 * ponto de acesso do painel liga `authService`, `projectService` e os outros, e
 * junto deles vem `sessionToken`, que le `localStorage`. Com o quadro importando
 * aquele arquivo, o pacote que `embed.html` carrega passava a conter a chave
 * `pds.web.session` — codigo de sessao do administrador dentro de um documento
 * que qualquer site do mundo embute.
 *
 * A regra continua valendo inteira: o quadro fala com a interface do servico e
 * nunca com o cliente HTTP. O que muda e por qual porta.
 */
export const reportService: ReportService = apiReportService

export { describeError, isPanelError, PanelError } from '@/data/errors'
export type { ReportService } from '@/data/reportService'
