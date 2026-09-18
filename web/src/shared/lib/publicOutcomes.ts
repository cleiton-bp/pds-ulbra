import type { PublicOutcome } from '@/contracts'

/**
 * Como um relato termina, na palavra que **quem relatou** le.
 *
 * Fica em `shared/` e nao na tela de configuracao porque quem vai precisar dela
 * de verdade e a pagina de acompanhamento, que roda no outro pacote — e la nao
 * pode entrar nada que dependa de sessao. Um mapa de rotulo nao depende.
 *
 * <b>Nao ha versao "do time" desta lista</b>, diferente do tipo do relato. O
 * desfecho e a ultima coisa que a pessoa de fora le, e o time nao ganha nada
 * chamando o mesmo fim por outro nome.
 */
const LABELS: Record<PublicOutcome, string> = {
  Done: 'Foi feito',
  WontDo: 'Não será feito',
  NoAnswer: 'Sem retorno',
  Duplicate: 'Já existia',
}

/** A ordem em que os desfechos aparecem para escolher. O comum primeiro. */
export const PUBLIC_OUTCOMES: PublicOutcome[] = ['Done', 'WontDo', 'NoAnswer', 'Duplicate']

/**
 * Desfecho que esta tela nao conhece aparece com o proprio valor, em vez de
 * sumir: a API pode ganhar um antes de o painel ser atualizado, e etapa sem
 * desfecho na tela seria pior do que desfecho com nome feio.
 */
export function publicOutcomeLabel(outcome: PublicOutcome): string {
  return LABELS[outcome] ?? outcome
}
