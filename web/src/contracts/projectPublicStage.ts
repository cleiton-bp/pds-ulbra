/** Espelho de `Pds.Domain/ViewModels/ProjectPublicStageViewModels.cs`. */

/**
 * Como um relato termina, do lado de fora.
 *
 * A lista e **nossa e curta de proposito**: os estados de dentro sao do cliente,
 * mas cada time inventando o proprio vocabulario de encerramento levaria de volta
 * ao jargao que a camada publica existe para esconder.
 */
export type PublicOutcome = 'Done' | 'WontDo' | 'NoAnswer' | 'Duplicate'

/**
 * Um passo da jornada que quem relatou acompanha.
 *
 * **Nao e o estado de dentro com outro nome.** Varios estados internos caem numa
 * etapa daqui, e e essa perda de detalhe que e o produto.
 */
export interface ProjectPublicStageViewModel {
  PublicId: string
  /** O nome do passo, como quem relatou le. */
  Label: string
  /** A frase que explica o passo. Obrigatoria. */
  Description: string
  /** O que vem depois, ou nulo quando o cliente nao quis dizer. */
  NextStep: string | null
  /** A ordem da jornada, contada a partir de zero. */
  Position: number
  /** A etapa em que o trabalho do time acaba. Nao quer dizer encerrado. */
  IsTerminal: boolean
  /** A jornada pode voltar para ca. Por padrao ela nao anda para tras. */
  AllowsReturn: boolean
  /** A etapa espera quem relatou. Ainda nao muda nada em lugar nenhum. */
  AwaitsReporter: boolean
  /** Qual final a etapa representa. Nulo fora da terminal. */
  Outcome: PublicOutcome | null
  CreatedAt: string
}

/** Limite da coluna `label`: cabe num rotulo de linha do tempo, e nao numa frase. */
export const MAX_PUBLIC_STAGE_LABEL_LENGTH = 40

/** Limite da frase e do "o que vem depois". Curto porque esta tela se le no telefone. */
export const MAX_PUBLIC_STAGE_SENTENCE_LENGTH = 160

/** Abaixo disso a jornada nao conta uma historia: vira "chegou" e "acabou". */
export const MIN_PUBLIC_STAGES = 3

/** Acima disso a jornada vira o organograma de dentro, so que com palavras mais bonitas. */
export const MAX_PUBLIC_STAGES = 7

/**
 * Criar e editar mandam os mesmos campos: nao ha nada que so se escolha uma vez.
 *
 * `Outcome` e obrigatorio quando `IsTerminal` e verdadeiro, e recusado quando nao
 * e — a API confere os dois lados.
 */
export interface SaveProjectPublicStageRequest {
  Label: string
  Description: string
  NextStep: string | null
  IsTerminal: boolean
  AllowsReturn: boolean
  AwaitsReporter: boolean
  Outcome: PublicOutcome | null
}

/** Todas as etapas do projeto, da primeira a ultima, uma vez cada. */
export interface ReorderProjectPublicStagesRequest {
  Order: string[]
}
