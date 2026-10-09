import type { SprintState } from '@/contracts/report'

/** Uma sprint, com os numeros dela. */
export interface SprintViewModel {
  PublicId: string
  Number: number
  Name: string
  Goal: string | null
  State: SprintState
  /** O primeiro dia (`aaaa-mm-dd`). */
  StartsOn: string
  /** O ultimo dia (`aaaa-mm-dd`). */
  EndsOn: string
  StartedAt: string | null
  ClosedAt: string | null
  /** Os cards dela, sem as subtarefas e o arquivo. */
  Cards: number
  /** Deles, os que terminaram. */
  DoneCards: number
  Points: number
  DonePoints: number
}

/**
 * Nome, objetivo e datas. Ao criar, o que nao vier nasce com o padrao; ao iniciar, as
 * datas que nao vierem sao hoje e a duracao do projeto.
 */
export interface SaveSprintRequest {
  Name?: string | null
  Goal?: string | null
  StartsOn?: string | null
  EndsOn?: string | null
  /** O dia de hoje no relogio de quem pede (`aaaa-mm-dd`): as datas de fabrica contam dele. */
  Today?: string | null
}

/** Para onde vai o que nao terminou: o backlog, uma sprint planejada, ou uma nova. */
export type SprintCloseDestination = 'Backlog' | 'Sprint' | 'NewSprint'

export interface CloseSprintRequest {
  Destination: SprintCloseDestination
  /** A planejada de destino, quando `Destination` e `Sprint`. */
  SprintPublicId?: string | null
  /** O dia de hoje no relogio de quem conclui: a sprint nova comeca dele. */
  Today?: string | null
}

/** O que aconteceu ao fechar: a sprint fechada, quantos foram, e para qual sprint (nula no backlog). */
export interface CloseSprintResultViewModel {
  Sprint: SprintViewModel
  Moved: number
  Destination: SprintViewModel | null
}

/** Teto do nome e do objetivo da sprint, declarados em `Sprint`. */
export const MAX_SPRINT_NAME_LENGTH = 60
export const MAX_SPRINT_GOAL_LENGTH = 500

/** Teto da estimativa, declarado em `Report.MaxStoryPoints`. */
export const MAX_STORY_POINTS = 999
