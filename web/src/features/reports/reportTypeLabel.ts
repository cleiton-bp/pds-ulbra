import type { ReportType } from '@/contracts'

/**
 * O nome de cada tipo na lista do painel.
 *
 * Existe separado de `shared/lib/reportTypes.ts` de proposito, e nao por
 * descuido: la esta a palavra que **quem relata** le — no formulario e na pagina
 * de acompanhamento —, e a etapa 8 promete deixar cada cliente escolher a dele.
 * Aqui esta o nome do tipo como o **time** o ve, e ele precisa continuar igual em
 * todos os projetos justamente no dia em que o outro variar.
 */
const LABELS: Record<ReportType, string> = {
  Bug: 'Defeito',
  Improvement: 'Melhoria',
  Question: 'Dúvida',
}

/**
 * Tipo que esta tela nao conhece aparece com o proprio valor, em vez de sumir: a
 * API pode ganhar um tipo antes de o painel ser atualizado, e relato invisivel e
 * pior do que relato com nome feio.
 */
export function reportTypeLabel(type: ReportType): string {
  return LABELS[type] ?? type
}
