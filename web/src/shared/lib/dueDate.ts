/**
 * Em que pe esta o prazo de um card, para o destaque da frente dele.
 *
 * - `overdue`: o dia ja passou.
 * - `soon`: e hoje, ou faltam ate `soonDays` dias (a regra do projeto, no Ciclo).
 * - `later`: ainda ha tempo.
 */
export type DueState = 'overdue' | 'soon' | 'later'

const DIA = 86_400_000

/**
 * Quantos dias faltam para o prazo — negativo quando ja passou.
 *
 * **Conta em dias do calendario de quem olha**, e nao em horas: o prazo e so a
 * data, e "vence amanha" quer dizer amanha no relogio de quem le. As duas datas
 * viram meia-noite em UTC so para a conta, e assim a diferenca e sempre um numero
 * inteiro de dias, com horario de verao ou sem.
 */
export function daysUntil(day: string, today: Date = new Date()): number | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!partes) return null

  const prazo = Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))
  const hoje = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())

  return Math.round((prazo - hoje) / DIA)
}

export function dueState(day: string, soonDays: number, today: Date = new Date()): DueState {
  const faltam = daysUntil(day, today)
  if (faltam === null) return 'later'
  if (faltam < 0) return 'overdue'
  if (faltam <= soonDays) return 'soon'
  return 'later'
}

/**
 * O que o destaque diz, em palavras: a cor nunca vem sozinha. Nulo quando ainda ha
 * tempo e nao ha o que destacar.
 */
export function dueWords(day: string, soonDays: number, today: Date = new Date()): string | null {
  const faltam = daysUntil(day, today)
  if (faltam === null) return null
  if (faltam < 0) return faltam === -1 ? 'venceu ontem' : `venceu há ${-faltam} dias`
  if (faltam > soonDays) return null
  if (faltam === 0) return 'vence hoje'
  return faltam === 1 ? 'vence amanhã' : `vence em ${faltam} dias`
}
