import type {
  NotificationCountViewModel,
  NotificationListViewModel,
  NotificationSettingsViewModel,
} from '@/contracts'
import { apiGet, apiPost, apiPut } from '@/data/api/httpClient'
import type { NotificationService } from '@/data/notificationService'

export const apiNotificationService: NotificationService = {
  listNotifications: () => apiGet<NotificationListViewModel>('/me/notifications'),

  countUnread: () => apiGet<NotificationCountViewModel>('/me/notifications/unread-count'),

  markRead: (notificationPublicId) =>
    apiPost<NotificationCountViewModel>(`/me/notifications/${notificationPublicId}/read`),

  markAllRead: () => apiPost<NotificationCountViewModel>('/me/notifications/read-all'),

  getSettings: () => apiGet<NotificationSettingsViewModel>('/me/notification-settings'),

  saveSettings: (request) =>
    apiPut<NotificationSettingsViewModel>('/me/notification-settings', request),
}
