// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_REPORT_FILTERS } from '@/data'
import { SEARCH_DELAY_MS, useWorkFilters } from '@/features/reports/useWorkFilters'

/**
 * O QUE ESTES TESTES TRAVAM: os filtros da tela de Trabalho.
 *
 * - **Lembrados na aba, por projeto**: voltar a tela os traz; outro projeto tem os seus.
 * - **A busca espera a pessoa parar de digitar** para valer nas leituras; apagar vale
 *   na hora. Os outros filtros valem na hora.
 * - **Limpar zera tudo**, e o que veio guardado estranho nao vira filtro.
 */
describe('os filtros da tela de Trabalho', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ficam lembrados por projeto, e voltar a tela os traz', () => {
    const { result, unmount } = renderHook(() => useWorkFilters('p-1'))
    act(() => result.current.setFilters({ ...NO_REPORT_FILTERS, overdue: true, labels: ['l-1'] }))
    expect(result.current.active).toBe(2)
    unmount()

    const volta = renderHook(() => useWorkFilters('p-1'))
    expect(volta.result.current.filters.overdue).toBe(true)
    expect(volta.result.current.filters.labels).toEqual(['l-1'])

    const outro = renderHook(() => useWorkFilters('p-2'))
    expect(outro.result.current.active).toBe(0)
  })

  it('trocar de projeto troca os filtros, a busca junto, sem esperar', () => {
    const { result, rerender } = renderHook(({ projeto }) => useWorkFilters(projeto), {
      initialProps: { projeto: 'p-1' },
    })
    act(() => result.current.setFilters({ ...NO_REPORT_FILTERS, search: 'pagamento' }))
    act(() => vi.advanceTimersByTime(SEARCH_DELAY_MS))
    expect(result.current.applied.search).toBe('pagamento')

    rerender({ projeto: 'p-2' })
    expect(result.current.applied.search).toBe('')
    expect(result.current.key).toBe(renderHook(() => useWorkFilters('p-3')).result.current.key)
  })

  it('a busca vale depois que a pessoa para de digitar; apagar vale na hora', () => {
    const { result } = renderHook(() => useWorkFilters('p-1'))
    const antes = result.current.key

    act(() => result.current.setFilters({ ...NO_REPORT_FILTERS, search: 'pag' }))
    expect(result.current.filters.search).toBe('pag')
    expect(result.current.key).toBe(antes)

    act(() => vi.advanceTimersByTime(SEARCH_DELAY_MS - 1))
    act(() => result.current.setFilters({ ...NO_REPORT_FILTERS, search: 'pagamento' }))
    act(() => vi.advanceTimersByTime(SEARCH_DELAY_MS - 1))
    expect(result.current.applied.search).toBe('')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.applied.search).toBe('pagamento')

    act(() => result.current.setFilters({ ...NO_REPORT_FILTERS, search: '' }))
    expect(result.current.applied.search).toBe('')
  })

  it('os outros filtros valem na hora, e limpar zera tudo — inclusive o guardado', () => {
    const { result } = renderHook(() => useWorkFilters('p-1'))
    act(() => result.current.setFilters({ ...NO_REPORT_FILTERS, assignees: ['me'] }))
    expect(result.current.applied.assignees).toEqual(['me'])

    act(() => result.current.clear())
    expect(result.current.active).toBe(0)
    expect(window.sessionStorage.getItem('pds.web.trabalho.filtros.p-1')).toBeNull()
  })

  it('o que veio guardado estranho nao vira filtro', () => {
    window.sessionStorage.setItem(
      'pds.web.trabalho.filtros.p-1',
      JSON.stringify({ types: ['bug', 'inventado'], overdue: 'sim', labels: [1, 'l-1'] }),
    )
    const { result } = renderHook(() => useWorkFilters('p-1'))
    expect(result.current.filters.types).toEqual(['bug'])
    expect(result.current.filters.overdue).toBe(false)
    expect(result.current.filters.labels).toEqual(['l-1'])

    window.sessionStorage.setItem('pds.web.trabalho.filtros.p-2', '{quebrado')
    expect(renderHook(() => useWorkFilters('p-2')).result.current.active).toBe(0)
  })
})
