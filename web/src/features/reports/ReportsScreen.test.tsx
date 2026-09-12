// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectViewModel, ReportSummaryViewModel, ReportType } from '@/contracts'
import type { ReportPage } from '@/data'
import { ReportsScreen } from '@/features/reports/ReportsScreen'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * Tres deles guardam coisas que ja deram errado neste projeto e nao aparecem
 * lendo o codigo:
 *
 * - **o relato repetido.** A paginacao e por posicao, entao um relato que entra
 *   entre a primeira pagina e a segunda empurra a lista e faz o ultimo de uma
 *   voltar como primeiro da outra. Sem juntar por identificador, ele aparece duas
 *   vezes — e com a mesma chave no React.
 * - **a resposta atrasada do projeto anterior.** Trocar de projeto dispara uma
 *   busca sem cancelar a que estava voando; sem o contador de geracao, a antiga
 *   chega depois e pinta relato de um projeto no endereco de outro.
 * - **abrir grava.** A visualizacao so pode ser registrada no clique. Uma tela
 *   que abrisse os relatos por adiantamento inventaria leituras que ninguem fez,
 *   e a pesquisa nao teria como saber.
 *
 * O quarto e de honestidade com quem usa: falhar ao carregar o contexto nao pode
 * esconder o texto do relato, que a lista ja tinha em maos.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<(publicId: string, page: number) => Promise<ReportPage>>(),
  abrir: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectReportService: { listReports: dublê.listar, openReport: dublê.abrir },
  }
})

function projeto(publicId: string): ProjectViewModel {
  return {
    PublicId: publicId,
    Name: `Projeto ${publicId}`,
    Status: 'Active',
    CreatedAt: '2026-08-01T12:00:00.000Z',
    UpdatedAt: '2026-08-01T12:00:00.000Z',
  }
}

function relato(
  publicId: string,
  text: string,
  extra: Partial<ReportSummaryViewModel> = {},
): ReportSummaryViewModel {
  return {
    PublicId: publicId,
    TrackingCode: `COD-${publicId.toUpperCase()}`,
    Type: 'Bug',
    Text: text,
    Route: '/checkout',
    Origin: 'loja.exemplo.com',
    CreatedAt: '2026-09-01T12:00:00.000Z',
    ...extra,
  }
}

/** Uma promessa que so resolve quando o teste mandar. */
function emVoo<T>() {
  let resolver: (value: T) => void = () => {}
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve
  })
  return { promessa, resolver: (value: T) => resolver(value) }
}

function ProjetoDaRota() {
  const { publicId = '' } = useParams()
  return <Outlet context={{ project: projeto(publicId) }} />
}

function montar(publicId = 'p-1') {
  const router = createMemoryRouter(
    [
      {
        path: '/p/:publicId',
        element: <ProjetoDaRota />,
        children: [{ index: true, element: <ReportsScreen /> }],
      },
    ],
    { initialEntries: [`/p/${publicId}`] },
  )

  render(<RouterProvider router={router} />)
  return router
}

describe('ReportsScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.listar.mockReset()
    dublê.abrir.mockReset()
  })

  it('mostra o que chegou, com protocolo e pagina de origem', async () => {
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'o botao some')], total: 1 })

    montar()

    expect(await screen.findByText('o botao some')).toBeTruthy()
    expect(screen.getByText('COD-R-1')).toBeTruthy()
    expect(screen.getByText('/checkout')).toBeTruthy()
    expect(screen.getByText('Defeito')).toBeTruthy()
  })

  it('tipo que esta tela nao conhece aparece com o proprio valor, em vez de sumir', async () => {
    dublê.listar.mockResolvedValue({
      // O elenco existe para simular a API ganhando um tipo antes do painel.
      reports: [relato('r-1', 'algo', { Type: 'Praise' as ReportType })],
      total: 1,
    })

    montar()

    expect(await screen.findByText('Praise')).toBeTruthy()
  })

  it('lista vazia manda instalar, em vez de so constatar', async () => {
    dublê.listar.mockResolvedValue({ reports: [], total: 0 })

    montar()

    expect(await screen.findByText('Nenhum relato ainda')).toBeTruthy()
    expect(screen.getByRole('link', { name: /instalar/ })).toBeTruthy()
  })

  it('falha deixa tentar de novo, e a segunda tentativa pinta a lista', async () => {
    dublê.listar.mockRejectedValueOnce(new Error('rede'))
    dublê.listar.mockResolvedValueOnce({ reports: [relato('r-1', 'voltou')], total: 1 })

    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByText('voltou')).toBeTruthy()
  })

  it('carregar mais soma a pagina seguinte sem repetir o que ja estava na tela', async () => {
    dublê.listar.mockImplementation(async (_publicId, page) =>
      page === 1
        ? { reports: [relato('r-1', 'primeiro'), relato('r-2', 'segundo')], total: 3 }
        : // O `r-2` volta porque um relato novo entrou e empurrou a lista.
          { reports: [relato('r-2', 'segundo'), relato('r-3', 'terceiro')], total: 3 },
    )

    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }))

    expect(await screen.findByText('terceiro')).toBeTruthy()
    expect(screen.getAllByText('segundo')).toHaveLength(1)
    expect(screen.getByText('3 de 3')).toBeTruthy()
  })

  it('com tudo na tela, nao oferece carregar mais', async () => {
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'unico')], total: 1 })

    montar()

    await screen.findByText('unico')
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })

  it('resposta atrasada do projeto anterior nao pinta a tela do projeto novo', async () => {
    const primeira = emVoo<ReportPage>()

    dublê.listar.mockImplementation(async (publicId) =>
      publicId === 'p-1'
        ? primeira.promessa
        : { reports: [relato('r-2', 'do segundo projeto')], total: 1 },
    )

    const router = montar('p-1')
    await router.navigate('/p/p-2')

    // A ordem e o teste inteiro: a resposta velha so pode chegar **depois** de a
    // nova ja estar na tela. Resolvida antes, ela seria sobrescrita pela seguinte
    // e o teste passaria mesmo sem a guarda que ele diz cobrir.
    expect(await screen.findByText('do segundo projeto')).toBeTruthy()

    await act(async () => {
      primeira.resolver({ reports: [relato('r-1', 'do primeiro projeto')], total: 1 })
    })

    expect(screen.queryByText('do primeiro projeto')).toBeNull()
    expect(screen.getByText('do segundo projeto')).toBeTruthy()
  })
})

describe('abrir um relato', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.listar.mockReset()
    dublê.abrir.mockReset()
    dublê.listar.mockResolvedValue({
      reports: [relato('r-1', 'o botao some'), relato('r-2', 'a conta esta errada')],
      total: 2,
    })
  })

  it('so registra a visualizacao no clique, e uma vez por abertura', async () => {
    dublê.abrir.mockResolvedValue({ ...relato('r-1', 'o botao some'), Contexts: [] })

    montar()

    await screen.findByText('o botao some')
    expect(dublê.abrir).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('o botao some'))

    await waitFor(() => expect(dublê.abrir).toHaveBeenCalledTimes(1))
    expect(dublê.abrir).toHaveBeenCalledWith('p-1', 'r-1')
  })

  it('mostra o texto antes de a abertura responder', async () => {
    const voo = emVoo<{ Contexts: [] }>()
    dublê.abrir.mockReturnValue(voo.promessa)

    montar()

    fireEvent.click(await screen.findByText('o botao some'))

    // O dialogo ja esta de pe com o texto que a lista tinha, e nao vazio.
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo.textContent).toContain('o botao some')
    expect(dialogo.textContent).toContain('COD-R-1')
  })

  it('contexto que falha nao esconde o relato', async () => {
    dublê.abrir.mockRejectedValue(new Error('rede'))

    montar()

    fireEvent.click(await screen.findByText('a conta esta errada'))

    expect(await screen.findByText(/O resto do contexto não carregou/)).toBeTruthy()
    expect(screen.getByRole('dialog').textContent).toContain('a conta esta errada')
  })

  it('abrir outro relato antes da resposta do primeiro nao mistura o contexto', async () => {
    const primeiro = emVoo<{ Contexts: Array<{ Key: string; Value: string }> }>()

    dublê.abrir.mockImplementation(async (_projeto: string, reportPublicId: string) =>
      reportPublicId === 'r-1'
        ? primeiro.promessa
        : { Contexts: [{ Key: 'user_agent', Value: 'Firefox do segundo' }] },
    )

    montar()

    fireEvent.click(await screen.findByText('o botao some'))
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }))
    fireEvent.click(screen.getByText('a conta esta errada'))

    expect(await screen.findByText('Firefox do segundo')).toBeTruthy()

    // Mesma razao do teste da lista: a resposta do primeiro relato so vale como
    // prova se chegar depois de a do segundo ja estar desenhada.
    await act(async () => {
      primeiro.resolver({ Contexts: [{ Key: 'user_agent', Value: 'Chrome do primeiro' }] })
    })

    expect(screen.queryByText('Chrome do primeiro')).toBeNull()
    expect(screen.getByText('Firefox do segundo')).toBeTruthy()
  })
})
