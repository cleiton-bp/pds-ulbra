import type { ReportType } from '@/contracts'

/**
 * O nome de cada tipo **como o time o ve**, no painel.
 *
 * <b>Veio de `features/reports/` quando a tela de Estados passou a precisar dele
 * tambem.</b> Uma feature nao importa de outra, e a pergunta que o teste de
 * arquitetura obriga a fazer — "isso e mesmo desta feature?" — tem resposta
 * clara: o vocabulario do time nao pertence a tela de Relatos, pertence ao
 * painel.
 *
 * <b>E continua separado de `reportTypes.ts`</b>, que e a palavra que **quem
 * relata** le. Os dois dizem "Defeito" hoje e vao divergir de proposito: o do
 * cliente vira configuravel, e o do painel precisa continuar igual em todos os
 * projetos justamente para o time nao ter de aprender o vocabulario de cada um.
 *
 * Dai os nomes serem `teamTypeLabel` e `reporterTypeLabel`, e nao duas variacoes
 * de "reportTypeLabel": duas funcoes que diferem por duas letras, na mesma pasta,
 * sao um erro esperando acontecer.
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
export function teamTypeLabel(type: ReportType): string {
  return LABELS[type] ?? type
}
