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
}

/** Os avisos mais recentes, e quantos nao foram lidos — inclusive os que nao vieram. */
export interface NotificationListViewModel {
  Items: NotificationViewModel[]
  UnreadCount: number
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
