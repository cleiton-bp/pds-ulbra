// @vitest-environment jsdom

import type { RouteObject } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  // As rotas de verdade carregam o tema, que le a preferencia do sistema; o jsdom nao
  // tem matchMedia.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})

/**
 * O QUE ESTE TESTE TRAVA: **cada tela do painel vem num pedaco proprio do pacote**
 * (`lazy`), e nao no pacote de entrada. Uma tela importada direto em `routes.tsx` voltaria
 * a viajar com todas as outras na primeira carga — e nada quebraria na tela para avisar.
 * No pacote de entrada ficam so as cascas, os guardas e as portas, que nao tem endereco
 * proprio de tela.
 */
describe('as rotas do painel', () => {
  it('toda tela vem sob demanda', async () => {
    const { router } = await import('@/app/routes')
    try {
      const comTelaNaEntrada: string[] = []
      const visitar = (rotas: RouteObject[], acima: string) => {
        for (const rota of rotas) {
          const endereco = rota.path ? `${acima}/${rota.path}`.replace(/\/+/g, '/') : acima
          if (rota.path && !rota.children?.length && rota.element) comTelaNaEntrada.push(endereco)
          visitar(rota.children ?? [], endereco)
        }
      }
      visitar(router.routes as RouteObject[], '')

      expect(comTelaNaEntrada).toEqual([])
    } finally {
      router.dispose()
    }
  })
})
