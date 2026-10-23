// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportStateCountViewModel } from '@/contracts'
import { NO_REPORT_FILTERS, type ReportFilters } from '@/data'
import { type ListFilters, NO_LIST_FILTERS } from '@/features/reports/useWorkFilters'
import { WorkFilterBar } from '@/features/reports/WorkFilterBar'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: a barra de filtros do Trabalho.
 *
 * - **O "×" de cada filtro ligado tira so ele** — os outros ficam —, e o "Limpar" no pe
 *   do menu faz o mesmo de dentro dele.
 * - **"Mais filtros · n"** conta os ligados que moram nele (prioridade, tipo, coluna,
 *   sprint) e diz se esta aberto.
 * - **O filtro ligado tem realce suave**, e nao a cor cheia do botao principal.
 * - **O "/" esta a vista dentro da busca**, e sai quando ha texto nela.
 */
const dublê = vi.hoisted(() => ({
  etiquetas: vi.fn(async () => [
    { PublicId: 'l-1', Name: 'pagamentos', Color: 'Blue', Position: 0, CreatedAt: '' },
    { PublicId: 'l-2', Name: 'frete', Color: 'Green', Position: 1, CreatedAt: '' },
  ]),
  time: vi.fn(async () => []),
  prioridades: vi.fn(async () => []),
  tipos: vi.fn(async () => []),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectLabelService: { listLabels: dublê.etiquetas },
    projectTeamService: { listMembers: dublê.time },
    projectPriorityService: { listPriorities: dublê.prioridades },
    projectReportTypeService: { listReportTypes: dublê.tipos },
  }
})

instalarRemendosDoRadix()

const colunas: ReportStateCountViewModel[] = [
  { StatePublicId: 's-1', StateName: 'Análise', IsActive: true, ClosesReport: false, Total: 3 },
]

/** A barra com estado de verdade: o que ela pede muda, e o teste le o que ficou. */
function Barra({
  inicio,
  listaInicio = NO_LIST_FILTERS,
  espiar,
}: {
  inicio: ReportFilters
  listaInicio?: ListFilters
  espiar: (filtros: ReportFilters, lista: ListFilters) => void
}) {
  const [filtros, setFiltros] = useState(inicio)
  const [lista, setLista] = useState(listaInicio)
  espiar(filtros, lista)
  return (
    <WorkFilterBar
      projectPublicId="p-1"
      filters={filtros}
      active={0}
      onChange={setFiltros}
      onClear={() => setFiltros(NO_REPORT_FILTERS)}
      searchInputId="busca"
      lista={{
        filters: lista,
        onChange: setLista,
        colunas,
        colunasFalharam: false,
        aoRecarregarColunas: () => {},
        sprints: null,
        ordem: null,
        aoOrdenar: () => {},
      }}
    />
  )
}

function montar(inicio: Partial<ReportFilters>, listaInicio?: ListFilters) {
  const visto: { filtros: ReportFilters; lista: ListFilters } = {
    filtros: NO_REPORT_FILTERS,
    lista: NO_LIST_FILTERS,
  }
  render(
    <Barra
      inicio={{ ...NO_REPORT_FILTERS, ...inicio }}
      listaInicio={listaInicio}
      espiar={(filtros, lista) => {
        visto.filtros = filtros
        visto.lista = lista
      }}
    />,
  )
  return visto
}

async function abrirMenu(nome: string | RegExp) {
  fireEvent.pointerDown(await screen.findByRole('button', { name: nome }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
  return screen.findByRole('menu')
}

describe('a barra de filtros do Trabalho', () => {
  afterEach(cleanup)

  it('o "×" de um filtro ligado tira so ele: os outros continuam', async () => {
    const visto = montar({ labels: ['l-1'], overdue: true, assignees: ['me'] })
    await screen.findByRole('button', { name: 'Etiqueta: pagamentos' })
    // Desligado, nao ha "×": nada a tirar.
    expect(screen.queryByRole('button', { name: 'Tirar o filtro Prioridade' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Tirar o filtro Etiqueta' }))
    expect(visto.filtros.labels).toEqual([])
    expect(visto.filtros.overdue).toBe(true)
    expect(visto.filtros.assignees).toEqual(['me'])
    expect(screen.queryByRole('button', { name: 'Tirar o filtro Etiqueta' })).toBeNull()

    // O do responsavel tambem: o "Meus cards" sai com ele, que e o mesmo filtro.
    fireEvent.click(screen.getByRole('button', { name: 'Tirar o filtro Responsável' }))
    expect(visto.filtros.assignees).toEqual([])
    expect(visto.filtros.overdue).toBe(true)
  })

  it('o "Limpar" no pe do menu desmarca tudo dele, e so dele', async () => {
    const visto = montar(
      { labels: ['l-1', 'l-2'], priorities: ['none'] },
      {
        columns: ['s-1'],
        sprint: null,
      },
    )
    const menu = await abrirMenu(/^Etiqueta/)
    await within(menu).findByRole('menuitemcheckbox', { name: 'frete' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Limpar' }))
    await waitFor(() => expect(visto.filtros.labels).toEqual([]))
    expect(visto.filtros.priorities).toEqual(['none'])
    expect(visto.lista.columns).toEqual(['s-1'])
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    // O menu sem nada marcado nao tem o que limpar.
    const outro = await abrirMenu('Etiqueta')
    await within(outro).findByRole('menuitemcheckbox', { name: 'frete' })
    expect(within(outro).queryByRole('menuitem', { name: 'Limpar' })).toBeNull()
  })

  it('"Mais filtros · n" conta os ligados que moram nele e diz se esta aberto', async () => {
    montar(
      { priorities: ['none'], types: ['team'], labels: ['l-1'] },
      {
        columns: ['s-1'],
        sprint: null,
      },
    )
    const mais = await screen.findByRole('button', { name: /^Mais filtros/ })
    // Prioridade, tipo e coluna; a etiqueta fica a vista, e nao conta aqui.
    expect(mais.textContent).toContain('Mais filtros · 3')
    expect(mais.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(mais)
    expect(mais.getAttribute('aria-expanded')).toBe('true')
  })

  it('o filtro ligado tem realce suave, e nao a cor cheia do botao principal', async () => {
    montar({ overdue: true })
    const vencidos = await screen.findByRole('button', { name: 'Vencidos' })
    expect(vencidos.getAttribute('aria-pressed')).toBe('true')
    expect(vencidos.className).toContain('bg-accent/8')
    expect(vencidos.className).not.toMatch(/(^|\s)bg-accent(\s|$)/)
    expect(vencidos.className).not.toContain('text-accent-fg')
  })

  it('o "/" esta a vista dentro da busca, e sai quando ela tem texto', async () => {
    montar({})
    const campo = screen.getByRole('searchbox', { name: 'Buscar cards' })
    expect(campo.getAttribute('aria-keyshortcuts')).toBe('/')
    const rotulo = campo.closest('label') as HTMLElement
    expect(rotulo.querySelector('kbd')?.textContent).toBe('/')

    fireEvent.change(campo, { target: { value: 'frete' } })
    expect(rotulo.querySelector('kbd')).toBeNull()
  })
})
