// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { appendReportFilters } from '@/data/api/apiProjectReportService'
import { NO_REPORT_FILTERS } from '@/data/projectReportService'

/**
 * O QUE ESTE TESTE TRAVA: os filtros da tela de Trabalho na URL.
 *
 * - **So entra o que esta ligado** — sem filtro, a URL fica como sempre foi.
 * - **Repetir o filtro soma**: um parametro por valor.
 * - **O vencido leva o dia de quem olha**, e nao o do servidor.
 */
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
