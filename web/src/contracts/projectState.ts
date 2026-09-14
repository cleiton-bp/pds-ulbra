import type { ReportType } from '@/contracts/report'

/** Espelho de `Pds.Domain/ViewModels/ProjectStateViewModels.cs`. */

/**
 * Um estado da fila de trabalho do projeto — "Analise", "Corrigindo", o que o
 * time tiver criado.
 *
 * A lista chega **na ordem do cliente**, com os aposentados no lugar onde sempre
 * estiveram: e a mesma lista que a tela mostra e a mesma que a reordenacao
 * reescreve.
 */
export interface ProjectStateViewModel {
  PublicId: string
  Name: string
  /** A ordem na fila, contada a partir de zero. */
  Position: number
  /** Falso quando o estado foi aposentado: continua no historico, mas nao recebe relato novo. */
  IsActive: boolean
  CreatedAt: string
}

/** Limite da coluna `name`: cabe num rotulo de coluna, e nao numa frase. */
export const MAX_STATE_NAME_LENGTH = 40

export interface CreateProjectStateRequest {
  Name: string
}

export interface RenameProjectStateRequest {
  Name: string
}

/** Todos os estados do projeto, do primeiro ao ultimo, uma vez cada. */
export interface ReorderProjectStatesRequest {
  Order: string[]
}

/**
 * Onde cada tipo de relato cai ao entrar.
 *
 * `StatePublicId` nulo quer dizer que o cliente **nunca escolheu** para aquele
 * tipo, e ai vale o padrao: o primeiro estado ativo da fila. Nao e configuracao
 * faltando — o projeto funciona igual.
 */
export interface ProjectInitialStateViewModel {
  ReportType: ReportType
  StatePublicId: string | null
}

export interface SetInitialStateRequest {
  ReportType: ReportType
  /** Nulo **apaga** a escolha e devolve o tipo ao padrao. */
  StatePublicId: string | null
}
