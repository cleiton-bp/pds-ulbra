// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_REPORT_FILTERS } from '@/data'
import { FIRST_SORT_DIR, SEARCH_DELAY_MS, useWorkFilters } from '@/features/reports/useWorkFilters'

/**
 * O QUE ESTES TESTES TRAVAM: os filtros da tela de Trabalho.
 *
 * - **Lembrados na aba, por projeto**: voltar a tela os traz; outro projeto tem os seus.
 * - **A busca espera a pessoa parar de digitar** para valer nas leituras; apagar vale
 *   na hora. Os outros filtros valem na hora.
 * - **Limpar zera tudo**, e o que veio guardado estranho nao vira filtro.
 * - **O que so a lista recorta mora junto** (L-07): as colunas e a sprint, com "Em
 *   aberto" e as subtarefas (L-02, L-25), sao lembradas e limpas com os outros; contam
 *   em `active`, mas nao em `activeShared` (o quadro nao as tem).
 * - **A ordem e guardada a parte** (L-01): o primeiro clique vai na direcao de cada dado
 *   (o prazo mais perto, a prioridade mais alta), o segundo inverte; o "mais novo
 *   primeiro" e a de sempre, nula e nao guardada; o "Limpar" nao a desfaz; a guardada
 *   estranha nao vira ordem; cada projeto tem a sua.
 * - **A chave da lista** muda com as colunas, a sprint e a ordem — e a dos filtros, que
 *   o quadro e a contagem olham, nao.
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

describe('o que so a lista recorta, e a ordem', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  const guardado = (chave: string) => JSON.parse(window.sessionStorage.getItem(chave) ?? 'null')

  it('"Em aberto", as subtarefas, as colunas e a sprint ficam lembrados e voltam; so os da lista ficam fora do quadro', () => {
    const { result, unmount } = renderHook(() => useWorkFilters('p-1'))
    act(() => result.current.setFilters({ ...NO_REPORT_FILTERS, open: true, hideSubtasks: true }))
    act(() => result.current.setList({ columns: ['s-1', 'none'], sprint: 'sp-2' }))
    // Quatro ligados na lista; o quadro so tem dois deles.
    expect(result.current.active).toBe(4)
    expect(result.current.activeShared).toBe(2)
    expect(guardado('pds.web.trabalho.filtros.p-1')).toMatchObject({
      open: true,
      hideSubtasks: true,
      columns: ['s-1', 'none'],
      sprint: 'sp-2',
    })
    unmount()

    const volta = renderHook(() => useWorkFilters('p-1'))
    expect(volta.result.current.filters.open).toBe(true)
    expect(volta.result.current.filters.hideSubtasks).toBe(true)
    expect(volta.result.current.list).toEqual({ columns: ['s-1', 'none'], sprint: 'sp-2' })
    expect(volta.result.current.active).toBe(4)

    // So a coluna tambem fica guardada: e filtro, mesmo sem nenhum dos outros.
    const outro = renderHook(() => useWorkFilters('p-2'))
    act(() => outro.result.current.setList({ columns: ['s-9'], sprint: null }))
    expect(guardado('pds.web.trabalho.filtros.p-2')).toMatchObject({ columns: ['s-9'] })
    expect(outro.result.current.key).toBe('')
  })

  it('o guardado estranho nas colunas, na sprint, no "Em aberto" e nas subtarefas nao vira filtro', () => {
    window.sessionStorage.setItem(
      'pds.web.trabalho.filtros.p-1',
      JSON.stringify({ columns: ['s-1', 7, null], sprint: 3, open: 'sim', hideSubtasks: 1 }),
    )
    const { result } = renderHook(() => useWorkFilters('p-1'))
    expect(result.current.list).toEqual({ columns: ['s-1'], sprint: null })
    expect(result.current.filters.open).toBe(false)
    expect(result.current.filters.hideSubtasks).toBe(false)

    // A sprint vazia e "sem sprint", e a lista que nao e lista e "nenhuma coluna".
    window.sessionStorage.setItem(
      'pds.web.trabalho.filtros.p-2',
      JSON.stringify({ columns: 's-1', sprint: '' }),
    )
    const outro = renderHook(() => useWorkFilters('p-2'))
    expect(outro.result.current.list).toEqual({ columns: [], sprint: null })
    expect(outro.result.current.active).toBe(0)
  })

  it('"Limpar" zera tambem as colunas e a sprint, e apaga o guardado', () => {
    const { result } = renderHook(() => useWorkFilters('p-1'))
    act(() => result.current.setFilters({ ...NO_REPORT_FILTERS, open: true }))
    act(() => result.current.setList({ columns: ['s-1'], sprint: 'backlog' }))
    expect(result.current.active).toBe(3)

    act(() => result.current.clear())
    expect(result.current.list).toEqual({ columns: [], sprint: null })
    expect(result.current.filters.open).toBe(false)
    expect(result.current.active).toBe(0)
    expect(window.sessionStorage.getItem('pds.web.trabalho.filtros.p-1')).toBeNull()
  })

  it('o cabecalho ordena: o primeiro clique na direcao que responde a pergunta, o segundo inverte', () => {
    const { result } = renderHook(() => useWorkFilters('p-1'))
    expect(result.current.sort).toBeNull()

    // O prazo mais perto, a prioridade mais alta e o que mudou agora vem primeiro; o
    // numero, a coluna e o responsavel, de cima para baixo.
    const primeiro = {
      number: 'asc',
      state: 'asc',
      assignee: 'asc',
      priority: 'desc',
      due: 'asc',
      updated: 'desc',
    } as const
    for (const [campo, dir] of Object.entries(primeiro) as [
      keyof typeof primeiro,
      'asc' | 'desc',
    ][]) {
      // E a direcao que a tabela publica: a seta do cabecalho sai dela.
      expect(FIRST_SORT_DIR[campo]).toBe(dir)
      act(() => result.current.sortBy(campo))
      expect(result.current.sort).toEqual({ field: campo, dir })
      act(() => result.current.sortBy(campo))
      expect(result.current.sort).toEqual({ field: campo, dir: dir === 'asc' ? 'desc' : 'asc' })
    }
    expect(guardado('pds.web.trabalho.ordem.p-1')).toEqual({ field: 'updated', dir: 'asc' })
  })

  it('voltar ao "mais novo primeiro" e voltar a ordem de sempre: nula, e nada fica guardado', () => {
    const { result } = renderHook(() => useWorkFilters('p-1'))

    // "Criado" ja e a ordem de sempre: o clique inverte, e o seguinte volta a ela.
    act(() => result.current.sortBy('created'))
    expect(result.current.sort).toEqual({ field: 'created', dir: 'asc' })
    expect(guardado('pds.web.trabalho.ordem.p-1')).toEqual({ field: 'created', dir: 'asc' })
    act(() => result.current.sortBy('created'))
    expect(result.current.sort).toBeNull()
    expect(window.sessionStorage.getItem('pds.web.trabalho.ordem.p-1')).toBeNull()

    // De outra ordem, "Criado" vai direto ao mais novo primeiro — a de sempre.
    act(() => result.current.sortBy('due'))
    act(() => result.current.sortBy('created'))
    expect(result.current.sort).toBeNull()
    expect(window.sessionStorage.getItem('pds.web.trabalho.ordem.p-1')).toBeNull()

    // O menu "Ordem" escolhe direto; nula e a de sempre.
    act(() => result.current.setSort({ field: 'priority', dir: 'desc' }))
    expect(result.current.sort).toEqual({ field: 'priority', dir: 'desc' })
    expect(guardado('pds.web.trabalho.ordem.p-1')).toEqual({ field: 'priority', dir: 'desc' })
    act(() => result.current.setSort(null))
    expect(result.current.sort).toBeNull()
    expect(window.sessionStorage.getItem('pds.web.trabalho.ordem.p-1')).toBeNull()
  })

  it('a ordem e guardada a parte: nao conta como filtro, e o "Limpar" nao a desfaz', () => {
    const { result } = renderHook(() => useWorkFilters('p-1'))
    act(() => result.current.sortBy('due'))
    // Ordem nao e filtro: nao esconde card nenhum, e nao vai na chave dos filtros.
    expect(result.current.active).toBe(0)
    expect(result.current.key).toBe('')
    expect(window.sessionStorage.getItem('pds.web.trabalho.filtros.p-1')).toBeNull()

    act(() => result.current.setFilters({ ...NO_REPORT_FILTERS, overdue: true }))
    act(() => result.current.setList({ columns: ['s-1'], sprint: null }))
    act(() => result.current.clear())
    expect(result.current.active).toBe(0)
    expect(result.current.sort).toEqual({ field: 'due', dir: 'asc' })
    expect(guardado('pds.web.trabalho.ordem.p-1')).toEqual({ field: 'due', dir: 'asc' })
  })

  it('a ordem lembrada volta; a guardada estranha nao vira ordem; cada projeto tem a sua', () => {
    window.sessionStorage.setItem(
      'pds.web.trabalho.ordem.p-1',
      JSON.stringify({ field: 'due', dir: 'desc' }),
    )
    const { result, rerender } = renderHook(({ projeto }) => useWorkFilters(projeto), {
      initialProps: { projeto: 'p-1' },
    })
    expect(result.current.sort).toEqual({ field: 'due', dir: 'desc' })

    // Outro projeto, outra ordem — nenhuma guardada, a de sempre —, ja na troca.
    rerender({ projeto: 'p-2' })
    expect(result.current.sort).toBeNull()
    act(() => result.current.sortBy('priority'))
    rerender({ projeto: 'p-1' })
    expect(result.current.sort).toEqual({ field: 'due', dir: 'desc' })
    rerender({ projeto: 'p-2' })
    expect(result.current.sort).toEqual({ field: 'priority', dir: 'desc' })

    // O que nao e ordem que a tabela conhece fica na de sempre.
    const estranhas = [
      JSON.stringify({ field: 'inventado', dir: 'asc' }),
      JSON.stringify({ field: 'due', dir: 'de lado' }),
      JSON.stringify({ field: 'due' }),
      '"due"',
      '{quebrado',
    ]
    for (const [i, bruto] of estranhas.entries()) {
      window.sessionStorage.setItem(`pds.web.trabalho.ordem.q-${i}`, bruto)
      expect(renderHook(() => useWorkFilters(`q-${i}`)).result.current.sort).toBeNull()
    }
  })

  it('a chave da lista muda com as colunas, a sprint e a ordem; a dos filtros nao', () => {
    const { result } = renderHook(() => useWorkFilters('p-1'))
    expect(result.current.listKey).toBe('')

    act(() => result.current.setList({ columns: ['s-2', 's-1'], sprint: null }))
    const comColunas = result.current.listKey
    expect(comColunas).not.toBe('')
    // O quadro e a contagem nao recebem as colunas: a chave deles fica.
    expect(result.current.key).toBe('')
    // A ordem em que as colunas foram marcadas nao e outra lista.
    act(() => result.current.setList({ columns: ['s-1', 's-2'], sprint: null }))
    expect(result.current.listKey).toBe(comColunas)

    act(() => result.current.setList({ columns: ['s-1', 's-2'], sprint: 'backlog' }))
    const comSprint = result.current.listKey
    expect(comSprint).not.toBe(comColunas)

    act(() => result.current.sortBy('due'))
    expect(result.current.listKey).not.toBe(comSprint)

    // So a ordem, sem filtro nenhum, ainda e outra lista.
    act(() => result.current.clear())
    expect(result.current.key).toBe('')
    expect(result.current.listKey).not.toBe('')
    act(() => result.current.setSort(null))
    expect(result.current.listKey).toBe('')
  })
})
