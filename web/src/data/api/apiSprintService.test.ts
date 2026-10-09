// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiSprintService } from '@/data/api/apiSprintService'
import { environment } from '@/data/environment'

/**
 * O QUE ESTES TESTES TRAVAM: as sprints na URL e no corpo.
 *
 * - **As concluidas so vem quando pedidas** (decisao 83): `listSprints` sem nada, ou com
 *   `closed: false`, e o endereco de sempre — o Backlog, o quadro e o card novo leem
 *   so as que nao fecharam; com `closed: true`, `?closed=true`, que so o filtro de
 *   sprint da Lista pede.
 * - **O dia de quem pede vai inteiro** (`Today`, S-15): criar, iniciar e concluir mandam
 *   o pedido como veio, e iniciar sem pedido manda um corpo vazio — a API comeca hoje,
 *   com a duracao do projeto.
 */
const chamadas: Array<{ url: string; init: RequestInit }> = []

/** A rede de mentira: guarda o que foi pedido e responde o envelope da API. */
function fingirRede(dado: unknown = null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      chamadas.push({ url, init })
      return new Response(JSON.stringify({ Success: true, Message: null, Data: dado }), {
        status: 200,
      })
    }),
  )
}

/** O caminho pedido, sem a origem da API. */
const caminho = (indice = 0) => chamadas[indice]?.url.replace(environment.apiUrl, '')
const corpo = (indice = 0) => JSON.parse(String(chamadas[indice]?.init.body))

afterEach(() => {
  chamadas.length = 0
  vi.unstubAllGlobals()
})

describe('as sprints do projeto', () => {
  it('sem pedir as concluidas, o endereco e o de sempre', async () => {
    fingirRede([])

    await apiSprintService.listSprints('p-1')
    await apiSprintService.listSprints('p-1', {})
    await apiSprintService.listSprints('p-1', { closed: false })

    expect(chamadas.map((_, indice) => caminho(indice))).toEqual([
      '/projects/p-1/sprints',
      '/projects/p-1/sprints',
      '/projects/p-1/sprints',
    ])
    expect(chamadas.every((chamada) => chamada.init.method === 'GET')).toBe(true)
  })

  it('pedidas as concluidas, vai `closed=true`, e a resposta vem como a API mandou', async () => {
    const sprints = [
      { PublicId: 'sp-2', State: 'Active' },
      { PublicId: 'sp-1', State: 'Closed' },
    ]
    fingirRede(sprints)

    const lidas = await apiSprintService.listSprints('p-1', { closed: true })

    expect(caminho()).toBe('/projects/p-1/sprints?closed=true')
    expect(chamadas[0]?.init.method).toBe('GET')
    expect(lidas).toEqual(sprints)
  })

  it('criar, iniciar e concluir levam o dia de quem pede; iniciar sem pedido manda um corpo vazio', async () => {
    fingirRede({})

    await apiSprintService.createSprint('p-1', { Today: '2026-10-08' })
    await apiSprintService.startSprint('p-1', 'sp-3', {
      Name: 'Sprint 3',
      Goal: '',
      StartsOn: '2026-10-08',
      EndsOn: '2026-10-21',
      Today: '2026-10-08',
    })
    await apiSprintService.startSprint('p-1', 'sp-3')
    await apiSprintService.closeSprint('p-1', 'sp-2', {
      Destination: 'Sprint',
      SprintPublicId: 'sp-3',
      Today: '2026-10-08',
    })

    expect(chamadas.map((chamada) => chamada.init.method)).toEqual(['POST', 'POST', 'POST', 'POST'])
    expect(caminho(0)).toBe('/projects/p-1/sprints')
    expect(corpo(0)).toEqual({ Today: '2026-10-08' })
    expect(caminho(1)).toBe('/projects/p-1/sprints/sp-3/start')
    expect(corpo(1)).toEqual({
      Name: 'Sprint 3',
      Goal: '',
      StartsOn: '2026-10-08',
      EndsOn: '2026-10-21',
      Today: '2026-10-08',
    })
    expect(caminho(2)).toBe('/projects/p-1/sprints/sp-3/start')
    expect(corpo(2)).toEqual({})
    expect(caminho(3)).toBe('/projects/p-1/sprints/sp-2/close')
    expect(corpo(3)).toEqual({ Destination: 'Sprint', SprintPublicId: 'sp-3', Today: '2026-10-08' })
  })

  it('editar substitui a sprint inteira, e apagar e um DELETE no endereco dela', async () => {
    fingirRede(null)

    await apiSprintService.updateSprint('p-1', 'sp-3', {
      Name: 'Sprint 3',
      Goal: 'Fechar o checkout',
      StartsOn: '2026-10-19',
      EndsOn: '2026-11-01',
      Today: '2026-10-08',
    })
    await apiSprintService.deleteSprint('p-1', 'sp-3')

    expect(chamadas[0]?.init.method).toBe('PUT')
    expect(caminho(0)).toBe('/projects/p-1/sprints/sp-3')
    expect(corpo(0)).toEqual({
      Name: 'Sprint 3',
      Goal: 'Fechar o checkout',
      StartsOn: '2026-10-19',
      EndsOn: '2026-11-01',
      Today: '2026-10-08',
    })
    expect(chamadas[1]?.init.method).toBe('DELETE')
    expect(caminho(1)).toBe('/projects/p-1/sprints/sp-3')
    expect(chamadas[1]?.init.body).toBeUndefined()
  })
})
