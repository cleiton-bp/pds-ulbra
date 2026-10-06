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

/** As preferencias de aviso da pessoa. */
export interface NotificationSettingsViewModel {
  /** Receber e-mail quando a escolhem como responsavel. A mencao so avisa no sino. */
  AssignmentByEmail: boolean
  /** Se esta instalacao manda e-mail. Sem isso a preferencia fica guardada, e nada sai. */
  EmailAvailable: boolean
}

export interface SaveNotificationSettingsRequest {
  AssignmentByEmail: boolean
}
