import type { CardChangedNotice } from '@/contracts'

/** Em que pe esta a conexao: abrindo, no ar, ou caida e tentando de novo. */
export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting'

/** O que a tela de Trabalho recebe. */
export type RealtimeEvent =
  | { kind: 'card'; notice: CardChangedNotice }
  | { kind: 'project' }
  /** A conexao voltou: avisos podem ter se perdido no meio, e a tela rele tudo. */
  | { kind: 'resync' }
  /** A pessoa saiu do time do projeto. */
  | { kind: 'access-lost' }
  /** Chegou um aviso para quem esta conectado: o sino rele, e toca o som. */
  | { kind: 'notification' }

export interface RealtimeHandlers {
  onEvent: (evento: RealtimeEvent) => void
  onStatus: (status: RealtimeStatus) => void
}

/** Uma conexao aberta. */
export interface RealtimeConnection {
  /** Fecha de vez: sai da tela, troca de projeto, encerra a sessao. */
  stop(): Promise<void>
}

/**
 * O tempo real da tela de Trabalho: avisos de que algo mudou no projeto, so com os
 * identificadores — quem recebe rele pela REST de sempre.
 */
export interface RealtimeService {
  /**
   * Abre a conexao da tela de Trabalho de um projeto: pede o bilhete, entra no projeto,
   * ignora o eco da propria aba e reconecta sozinha, para sempre.
   */
  connectWork(projectPublicId: string, handlers: RealtimeHandlers): RealtimeConnection
}
