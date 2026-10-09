import type { CardParentViewModel } from '@/contracts/report'

/** O que aconteceu com a pessoa avisada: mencionada num comentario interno, ou escolhida como responsavel. */
export type NotificationKind = 'Mention' | 'Assignment'

/** Um aviso do sino. */
export interface NotificationViewModel {
  /** O identificador do aviso: e o que se manda para marcar como lido. */
  PublicId: string
  Kind: NotificationKind
  CreatedAt: string
  /** Quando a pessoa leu. Nulo enquanto nao leu. */
  ReadAt: string | null
  /** Quem fez. Nulo quando a pessoa nao tem nome nem e-mail. */
  ActorName: string | null
  Project: { PublicId: string; Name: string }
  /** O card: o numero e o titulo como a tela mostra. */
  Card: CardParentViewModel
  /** O comentario da mencao, com o comeco do texto. Nulo na atribuicao. */
  Comment: NotificationCommentViewModel | null
}

/** O comentario de uma mencao: o card abre rolado ate ele. */
export interface NotificationCommentViewModel {
  PublicId: string
  /** O comeco do texto, numa linha, com as mencoes como "@Nome". */
  Excerpt: string
}

/** Uma pagina dos avisos, e quantos nao foram lidos — inclusive os que nao vieram. */
export interface NotificationListViewModel {
  Items: NotificationViewModel[]
  UnreadCount: number
  /** Ha avisos mais antigos depois do ultimo desta pagina. */
  HasMore: boolean
}

/** O numero do sino. */
export interface NotificationCountViewModel {
  UnreadCount: number
}

/** O som de um aviso no painel, gerado no navegador. `None` e so o sino, sem som. */
export type NotificationSound = 'None' | 'Bell' | 'Drop' | 'Ping' | 'Chime' | 'Bubble' | 'Soft'

/** O som de um tipo de aviso. */
export interface NotificationSoundSetting {
  Kind: NotificationKind
  Sound: NotificationSound
}

/** As preferencias de aviso da pessoa: o volume e o som de cada tipo — todos os tipos. */
export interface NotificationSettingsViewModel {
  /** De 0 a 100. */
  Volume: number
  Sounds: NotificationSoundSetting[]
}

/** As preferencias gravadas inteiras: o volume e um som para cada tipo de aviso. */
export interface SaveNotificationSettingsRequest {
  Volume: number
  Sounds: NotificationSoundSetting[]
}

/** O volume do som dos avisos vai de 0 a 100. */
export const MIN_NOTIFICATION_VOLUME = 0
export const MAX_NOTIFICATION_VOLUME = 100
