// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiProjectReportService, appendReportFilters } from '@/data/api/apiProjectReportService'
import { NO_REPORT_FILTERS, type ReportSortField } from '@/data/projectReportService'

/**
 * O QUE ESTE TESTE TRAVA: os filtros da tela de Trabalho na URL.
 *
 * - **So entra o que esta ligado** — sem filtro, a URL fica como sempre foi.
 * - **Repetir o filtro soma**: um parametro por valor.
 * - **O vencido leva o dia de quem olha**, e nao o do servidor.
 * - **"Em aberto" e as subtarefas escondidas** vao como `open=true` e `subtasks=hide`
 *   (L-02, L-25), na lista e na contagem.
 * - **So a lista leva as colunas e a ordem**: `column` repetido, inclusive `none` (L-07),
 *   e `sort`/`dir` com os nomes que a API aceita (L-01). A contagem nunca os leva —
 *   cada coluna desmarcada contaria zero no proprio menu. O tamanho da pagina da lista
 *   e da API: ela nao o manda.
 */
const http = vi.hoisted(() => ({
  pagina: vi.fn(async (_caminho: string) => ({ items: [] as unknown[], total: 0 })),
  ler: vi.fn(async (_caminho: string) => [] as unknown[]),
}))

// So o caminho importa aqui: o pedido de verdade e do `httpClient`, com testes proprios.
vi.mock('@/data/api/httpClient', () => ({
  apiGetPage: http.pagina,
  apiGet: http.ler,
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

describe('os filtros na URL', () => {
  it('sem filtro ligado, nada entra', () => {
    const query = new URLSearchParams({ page: '1' })
    appendReportFilters(query, NO_REPORT_FILTERS)
    appendReportFilters(query, undefined)
    expect(query.toString()).toBe('page=1')
  })

  it('cada valor vira um parametro; a busca vai aparada; o vencido leva o dia local', () => {
    const query = new URLSearchParams()
    appendReportFilters(
      query,
      {
        assignees: ['me', 'none'],
        labels: ['l-1', 'l-2'],
        priorities: ['none'],
        types: ['bug', 'team'],
        overdue: true,
        open: false,
        hideSubtasks: false,
        search: '  #42 ',
      },
      // 23h30 do dia 3 no horario local: o dia que vale e o 3, mesmo que em UTC ja seja 4.
      new Date(2026, 9, 3, 23, 30),
    )

    expect(query.getAll('assignee')).toEqual(['me', 'none'])
    expect(query.getAll('label')).toEqual(['l-1', 'l-2'])
    expect(query.getAll('priority')).toEqual(['none'])
    expect(query.getAll('type')).toEqual(['bug', 'team'])
    expect(query.get('due')).toBe('overdue')
    expect(query.get('today')).toBe('2026-10-03')
    expect(query.get('q')).toBe('#42')
  })

  it('a busca so de espacos nao entra', () => {
    const query = new URLSearchParams()
    appendReportFilters(query, { ...NO_REPORT_FILTERS, search: '   ' })
    expect(query.has('q')).toBe(false)
  })
})

describe('a lista e a contagem na URL', () => {
  beforeEach(() => {
    http.pagina.mockClear()
    http.ler.mockClear()
  })

  /** O endereco que a ultima leitura pediu, para olhar parametro por parametro. */
  const pedido = (chamadas: { mock: { calls: [string][] } }) => {
    const caminho = chamadas.mock.calls.at(-1)?.[0] ?? ''
    const [rota, busca = ''] = caminho.split('?')
    return { rota, query: new URLSearchParams(busca), caminho }
  }

  it('"Em aberto" e as subtarefas escondidas entram como open=true e subtasks=hide; desligados, nao entram', () => {
    const ligados = new URLSearchParams()
    appendReportFilters(ligados, { ...NO_REPORT_FILTERS, open: true, hideSubtasks: true })
    expect(ligados.get('open')).toBe('true')
    expect(ligados.get('subtasks')).toBe('hide')

    const desligados = new URLSearchParams()
    appendReportFilters(desligados, { ...NO_REPORT_FILTERS, open: false, hideSubtasks: false })
    expect(desligados.has('open')).toBe(false)
    expect(desligados.has('subtasks')).toBe(false)
  })

  it('a lista leva as colunas repetidas (inclusive "none"), a ordem em sort e dir, e os filtros — sem o tamanho da pagina', async () => {
    await apiProjectReportService.listReports('p-1', 2, null, false, {
      filters: { ...NO_REPORT_FILTERS, open: true, hideSubtasks: true },
      columns: ['s-1', 'none'],
      sort: { field: 'due', dir: 'asc' },
    })

    const { rota, query } = pedido(http.pagina)
    expect(rota).toBe('/projects/p-1/reports')
    expect(query.get('page')).toBe('2')
    // Uma coluna por parametro — basta o card estar numa delas; "none" e o sem coluna.
    expect(query.getAll('column')).toEqual(['s-1', 'none'])
    expect(query.get('sort')).toBe('due')
    expect(query.get('dir')).toBe('asc')
    expect(query.get('open')).toBe('true')
    expect(query.get('subtasks')).toBe('hide')
    // O recorte de uma coluna so e o do quadro, e o tamanho da pagina e da API.
    expect(query.has('state')).toBe(false)
    expect(query.has('pageSize')).toBe(false)
  })

  it('cada ordem da tabela vai com o nome que a API aceita, nas duas direcoes', async () => {
    const campos: ReportSortField[] = [
      'number',
      'state',
      'assignee',
      'priority',
      'due',
      'created',
      'updated',
    ]
    for (const field of campos)
      for (const dir of ['asc', 'desc'] as const) {
        await apiProjectReportService.listReports('p-1', 1, null, false, { sort: { field, dir } })
        const { query } = pedido(http.pagina)
        expect([query.get('sort'), query.get('dir')]).toEqual([field, dir])
      }
  })

  it('sem colunas nem ordem, a URL da lista e a de sempre', async () => {
    await apiProjectReportService.listReports('p-1', 1, null, false, { columns: [] })
    expect(pedido(http.pagina).caminho).toBe('/projects/p-1/reports?page=1')

    await apiProjectReportService.listReports('p-1', 1)
    expect(pedido(http.pagina).caminho).toBe('/projects/p-1/reports?page=1')
  })

  it('a contagem leva os filtros e a sprint, e nunca colunas nem ordem', async () => {
    await apiProjectReportService.listReportCounts(
      'p-1',
      { ...NO_REPORT_FILTERS, open: true, hideSubtasks: true },
      'active',
    )
    const { rota, query } = pedido(http.ler)
    expect(rota).toBe('/projects/p-1/reports/counts')
    expect(query.get('open')).toBe('true')
    expect(query.get('subtasks')).toBe('hide')
    expect(query.get('sprint')).toBe('active')
    for (const parametro of ['column', 'sort', 'dir', 'page'])
      expect(query.has(parametro)).toBe(false)

    // Sem filtro, a contagem de sempre.
    await apiProjectReportService.listReportCounts('p-1')
    expect(pedido(http.ler).caminho).toBe('/projects/p-1/reports/counts')
  })
})
