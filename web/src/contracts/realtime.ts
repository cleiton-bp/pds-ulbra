/**
 * O tempo real da tela de Trabalho. Os avisos **nao levam conteudo**: so os
 * identificadores do que mudou, e a tela rele pela REST de sempre.
 */

/** O bilhete que abre a conexao: um minuto, e so o hub o aceita. */
export interface RealtimeTicketViewModel {
  Ticket: string
  ExpiresAt: string
}

/** Um card do projeto mudou. */
export interface CardChangedNotice {
  ProjectPublicId: string
  ReportPublicId: string
  /** A coluna em que ele esta agora; nula quando nao tem nenhuma. */
  StatePublicId: string | null
  /** Esta no arquivo agora — e, portanto, fora do quadro. */
  Archived: boolean
  /** A conexao que fez a mudanca, quando veio do painel. A aba dela ignora o aviso. */
  Origin: string | null
}

/**
 * O que a tela usa do projeto mudou: colunas, prioridades, etiquetas, o Ciclo, as
 * etapas publicas e o mapa delas, quem esta no time.
 */
export interface ProjectChangedNotice {
  ProjectPublicId: string
  Origin: string | null
}

/** A pessoa saiu do time do projeto. */
export interface AccessLostNotice {
  ProjectPublicId: string
}

/** Chegou um aviso para quem esta conectado. So o tipo: o sino rele pela REST. */
export interface NotificationArrivedNotice {
  ProjectPublicId: string
  Kind: string
}
