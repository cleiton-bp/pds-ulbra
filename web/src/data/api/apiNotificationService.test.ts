import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiNotificationService } from '@/data/api/apiNotificationService'

/**
 * O QUE ESTES TESTES TRAVAM: a lista do sino na URL (S-09, S-10).
 *
 * - **Sem nada, a lista de sempre**: a URL fica como era.
 * - **"So os nao lidos"** vai como `unread=true`, e a pagina seguinte como `before`, o
 *   ultimo aviso que a tela tem — por chave, e nao por posicao: o aviso novo que chega no
 *   topo nao repete nem pula ninguem.
 */
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))

vi.mock('@/data/api/httpClient', () => ({
  apiGet: http.get,
  apiPost: http.post,
  apiPut: http.put,
}))

describe('a lista do sino na URL', () => {
  beforeEach(() => {
    http.get.mockReset()
    http.get.mockResolvedValue({ Items: [], UnreadCount: 0, HasMore: false })
  })

  it('sem nada, a lista de sempre', async () => {
    await apiNotificationService.listNotifications()
    await apiNotificationService.listNotifications({})
    expect(http.get.mock.calls).toEqual([['/me/notifications'], ['/me/notifications']])
  })

  it('so os nao lidos, e a pagina seguinte depois do ultimo aviso da tela', async () => {
    await apiNotificationService.listNotifications({ unreadOnly: true })
    await apiNotificationService.listNotifications({ unreadOnly: true, before: 'n-9' })
    await apiNotificationService.listNotifications({ unreadOnly: false, before: 'n-9' })
    expect(http.get.mock.calls).toEqual([
      ['/me/notifications?unread=true'],
      ['/me/notifications?unread=true&before=n-9'],
      ['/me/notifications?before=n-9'],
    ])
  })

  it('a pagina seguinte leva tambem a hora do ultimo aviso, para seguir se ele sumiu', async () => {
    await apiNotificationService.listNotifications({
      before: 'n-9',
      beforeAt: '2026-10-08T12:00:00.123456Z',
    })
    expect(http.get.mock.calls).toEqual([
      ['/me/notifications?before=n-9&beforeAt=2026-10-08T12%3A00%3A00.123456Z'],
    ])
  })
})
