import type {
  NotificationCountViewModel,
  NotificationListViewModel,
  NotificationSettingsViewModel,
} from '@/contracts'
import { apiGet, apiPost, apiPut } from '@/data/api/httpClient'
import type { NotificationService } from '@/data/notificationService'

export const apiNotificationService: NotificationService = {
  listNotifications: (options) => {
    const query = new URLSearchParams()
    if (options?.unreadOnly) query.set('unread', 'true')
    if (options?.before) query.set('before', options.before)
    if (options?.beforeAt) query.set('beforeAt', options.beforeAt)
    const texto = query.toString()
    return apiGet<NotificationListViewModel>(`/me/notifications${texto ? `?${texto}` : ''}`)
  },

  countUnread: () => apiGet<NotificationCountViewModel>('/me/notifications/unread-count'),

  markRead: (notificationPublicId) =>
    apiPost<NotificationCountViewModel>(`/me/notifications/${notificationPublicId}/read`),

  markAllRead: () => apiPost<NotificationCountViewModel>('/me/notifications/read-all'),

  getSettings: () => apiGet<NotificationSettingsViewModel>('/me/notification-settings'),

  saveSettings: (request) =>
    apiPut<NotificationSettingsViewModel>('/me/notification-settings', request),
}
