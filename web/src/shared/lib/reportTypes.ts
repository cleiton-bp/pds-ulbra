import type { ReportType } from '@/contracts'

/**
 * Os tres tipos, com a palavra que aparece para **quem relata**.
 *
 * O rotulo mora aqui e nao no contrato: `Bug` e o nome do valor no C#, "Defeito"
 * e o que se mostra. Sao coisas diferentes, e o dia em que uma empresa escolher
 * as proprias palavras (etapa 8) e este arquivo que passa a vir do servidor.
 *
 * <b>Saiu de `embed/` na pds-017</b>, quando a pagina de acompanhamento passou a
 * ser a segunda tela que quem relata le: enquanto havia uma so, o rotulo morava
 * dentro dela.
 *
 * <b>E continua separado de `features/reports/reportTypeLabel.ts`</b>, que e o
 * nome do tipo como o **time** o ve. Os dois dizem "Defeito" hoje e vao divergir
 * na etapa 8 de proposito: o do cliente vira configuravel, o do painel precisa
 * continuar igual em todos os projetos justamente para o time nao ter de aprender
 * o vocabulario de cada um.
 *
 * Sem cor para distinguir: tres cores em tres botoes de um formulario de uma
 * caixa de texto so viram enfeite, e cor sozinha nao informa.
 */
export const REPORT_TYPES: ReadonlyArray<{ value: ReportType; label: string }> = [
  { value: 'Bug', label: 'Defeito' },
  { value: 'Improvement', label: 'Melhoria' },
  { value: 'Question', label: 'Dúvida' },
]

/**
 * O rotulo de um tipo so, para quem mostra um relato e nao a lista de escolhas.
 *
 * Tipo que esta versao nao conhece aparece com o proprio valor, em vez de sumir:
 * a API pode ganhar um tipo antes de o pacote publicado ser atualizado, e relato
 * sem nome e melhor do que relato invisivel.
 */
export function reporterTypeLabel(type: ReportType): string {
  return REPORT_TYPES.find((option) => option.value === type)?.label ?? type
}
