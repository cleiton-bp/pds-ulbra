import type { ReportType } from '@/contracts'

/**
 * Os tres tipos, com a palavra que aparece para quem relata.
 *
 * O rotulo mora aqui e nao no contrato: `Bug` e o nome do valor no C#, "Defeito"
 * e o que se mostra. Sao coisas diferentes, e o dia em que uma empresa escolher
 * as proprias palavras (etapa 8) e este arquivo que passa a vir do servidor.
 *
 * Sem cor para distinguir: tres cores em tres botoes de um formulario de uma
 * caixa de texto so viram enfeite, e cor sozinha nao informa.
 */
export const REPORT_TYPES: ReadonlyArray<{ value: ReportType; label: string }> = [
  { value: 'Bug', label: 'Defeito' },
  { value: 'Improvement', label: 'Melhoria' },
  { value: 'Question', label: 'Dúvida' },
]
