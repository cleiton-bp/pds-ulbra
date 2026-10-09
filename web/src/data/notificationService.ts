import type {
  NotificationCountViewModel,
  NotificationListViewModel,
  NotificationSettingsViewModel,
  SaveNotificationSettingsRequest,
} from '@/contracts'

/** Que pagina do sino: so os nao lidos, ou todos; do topo, ou depois de um aviso. */
export interface NotificationListOptions {
  unreadOnly?: boolean
  /** O ultimo aviso da pagina anterior: a seguinte comeca depois dele. */
  before?: string
  /**
   * A hora dele (`CreatedAt`): se o aviso sumiu — o comentario apagado, a pessoa fora do
   * projeto —, a pagina segue por ela, em vez de recusar. Pode repetir algum da mesma hora.
   */
  beforeAt?: string
}

/**
 * Os avisos de quem esta na sessao — o sino — e as preferencias de aviso. Da pessoa,
 * e nao de um projeto: o sino junta todos os projetos em que ela esta.
 */
export interface NotificationService {
  /** Cinquenta avisos, do mais novo para o mais antigo, se ha mais, e quantos nao foram lidos. */
  listNotifications(options?: NotificationListOptions): Promise<NotificationListViewModel>
  /** So o numero do sino: a pergunta barata que o painel repete. */
  countUnread(): Promise<NotificationCountViewModel>
  /** Marca um aviso como lido. Ler de novo nao e erro. */
  markRead(notificationPublicId: string): Promise<NotificationCountViewModel>
  markAllRead(): Promise<NotificationCountViewModel>
  getSettings(): Promise<NotificationSettingsViewModel>
  saveSettings(request: SaveNotificationSettingsRequest): Promise<NotificationSettingsViewModel>
}
