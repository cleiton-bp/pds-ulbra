import type {
  NotificationCountViewModel,
  NotificationListViewModel,
  NotificationSettingsViewModel,
  SaveNotificationSettingsRequest,
} from '@/contracts'

/**
 * Os avisos de quem esta na sessao — o sino — e as preferencias de aviso. Da pessoa,
 * e nao de um projeto: o sino junta todos os projetos em que ela esta.
 */
export interface NotificationService {
  /** Os cinquenta mais recentes, e quantos nao foram lidos. */
  listNotifications(): Promise<NotificationListViewModel>
  /** So o numero do sino: a pergunta barata que o painel repete. */
  countUnread(): Promise<NotificationCountViewModel>
  /** Marca um aviso como lido. Ler de novo nao e erro. */
  markRead(notificationPublicId: string): Promise<NotificationCountViewModel>
  markAllRead(): Promise<NotificationCountViewModel>
  getSettings(): Promise<NotificationSettingsViewModel>
  saveSettings(request: SaveNotificationSettingsRequest): Promise<NotificationSettingsViewModel>
}
