import { apiPublicMediaService } from '@/data/api/apiPublicMediaService'
import { apiReportService } from '@/data/api/apiReportService'
import { apiWidgetSettingsService } from '@/data/api/apiWidgetSettingsService'
import type { PublicMediaService } from '@/data/publicMediaService'
import type { ReportService } from '@/data/reportService'
import type { WidgetSettingsService } from '@/data/widgetSettingsService'

/**
 * O ponto de acesso do que roda **sem sessao**: a ferramenta embutida no site do
 * cliente e a pagina de acompanhamento que quem relatou abre pelo link. Dois
 * documentos, duas pessoas diferentes, e nenhuma das duas tem conta aqui.
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
export const widgetSettingsService: WidgetSettingsService = apiWidgetSettingsService
export const publicMediaService: PublicMediaService = apiPublicMediaService

export { describeError, isPanelError, PanelError } from '@/data/errors'
export type { PublicMediaService } from '@/data/publicMediaService'
export type { ReportService } from '@/data/reportService'
export type { WidgetSettingsService } from '@/data/widgetSettingsService'
