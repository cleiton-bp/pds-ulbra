// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
  ReportType,
} from '@/contracts'
import type { ReportPage } from '@/data'
import { ReportDetailRoute } from '@/features/reports/ReportDetailRoute'
import { ReportsScreen } from '@/features/reports/ReportsScreen'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

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
  contar: vi.fn(),
  mover: vi.fn(),
  listarComentarios: vi.fn(),
  comentarInterno: vi.fn(),
  comentarPublico: vi.fn(),
  historico: vi.fn(),
  abrir: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectReportService: {
      listReports: dublê.listar,
      openReport: dublê.abrir,
      listReportCounts: dublê.contar,
      moveReport: dublê.mover,
      listComments: dublê.listarComentarios,
      addInternalComment: dublê.comentarInterno,
      addPublicComment: dublê.comentarPublico,
      listReportHistory: dublê.historico,
    },
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
    StatePublicId: 's-1',
    StateName: 'Análise',
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

function contagem(
  statePublicId: string | null,
  stateName: string | null,
  total: number,
  isActive = true,
): ReportStateCountViewModel {
  return { StatePublicId: statePublicId, StateName: stateName, IsActive: isActive, Total: total }
}

function montar(publicId = 'p-1', endereco?: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/p/:publicId',
        element: <ProjetoDaRota />,
        children: [
          {
            // O mesmo aninhamento do app: a lista e a casca, e o relato aberto e
            // filho dela. Sem isto o clique navega para um endereco que nao
            // renderiza nada, e o dialogo nunca abre.
            path: '',
            element: <ReportsScreen />,
            children: [{ path: ':reportPublicId', element: <ReportDetailRoute /> }],
          },
        ],
      },
    ],
    { initialEntries: [endereco ?? `/p/${publicId}`] },
  )

  render(<RouterProvider router={router} />)
  return router
}

// A caixa de escolha do produto desenha a propria lista, e o jsdom nao tem o
// que ela usa para abrir. Sem isto o teste falharia pelo ambiente, nao pelo codigo.
instalarRemendosDoRadix()

describe('ReportsScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.listar.mockReset()
    dublê.abrir.mockReset()
    dublê.contar.mockReset()
    dublê.mover.mockReset()
    for (const mock of [
      dublê.listarComentarios,
      dublê.comentarInterno,
      dublê.comentarPublico,
      dublê.historico,
    ])
      mock.mockReset()
    // O diálogo busca comentários e histórico; sem resposta eles caem no caminho
    // de falha e os testes olhariam uma tela meio quebrada.
    dublê.listarComentarios.mockResolvedValue({ Internal: [], Public: [] })
    dublê.historico.mockResolvedValue([])
    // A tela busca lista e contagem. Sem esta resposta a barra de filtro nao
    // desenha, e os testes da lista passariam olhando uma tela incompleta.
    dublê.contar.mockResolvedValue([])
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
    // Sem zerar aqui tambem, a contagem de chamadas soma a dos testes do bloco de
    // cima e qualquer asserticao sobre "quantas vezes" vira ruido.
    dublê.contar.mockReset()
    dublê.mover.mockReset()
    for (const mock of [
      dublê.listarComentarios,
      dublê.comentarInterno,
      dublê.comentarPublico,
      dublê.historico,
    ])
      mock.mockReset()
    // O diálogo busca comentários e histórico; sem resposta eles caem no caminho
    // de falha e os testes olhariam uma tela meio quebrada.
    dublê.listarComentarios.mockResolvedValue({ Internal: [], Public: [] })
    dublê.historico.mockResolvedValue([])
    dublê.contar.mockResolvedValue([])
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

  it('a ficha "Todos" soma as colunas, e não chama a API de novo', async () => {
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'um')], total: 1 })
    dublê.contar.mockResolvedValue([
      contagem('s-1', 'Análise', 12),
      contagem('s-2', 'Pronto', 40),
      contagem(null, null, 3),
    ])

    montar()

    // 12 + 40 + 3, com um unico relato na tela: contar as linhas que vieram daria 1.
    expect(await screen.findByRole('button', { name: 'Todos, 55 relatos' })).toBeTruthy()
    // E "Todos" e a ausencia de recorte, e nao um recorte chamado "todos".
    expect(dublê.listar).toHaveBeenLastCalledWith('p-1', 1, null)
  })

  it('escolher uma coluna refaz a busca com o recorte', async () => {
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'um')], total: 1 })
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 12), contagem('s-2', 'Pronto', 40)])

    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Análise, 12 relatos' }))

    // Página 1 de novo: trocar de coluna é começar uma lista nova, e não
    // acrescentar à que estava na tela.
    await waitFor(() => expect(dublê.listar).toHaveBeenLastCalledWith('p-1', 1, 's-1'))
  })

  it('a coluna sem relato aparece, mas a aposentada vazia não', async () => {
    dublê.listar.mockResolvedValue({ reports: [], total: 0 })
    dublê.contar.mockResolvedValue([
      contagem('s-1', 'Análise', 0),
      contagem('s-2', 'Parado', 0, false),
      contagem('s-3', 'Encerrado', 4, false),
    ])

    montar()

    // Coluna ativa vazia fica: some do filtro no dia em que o último relato dela
    // é movido, e quem olha acharia que ela deixou de existir.
    expect(await screen.findByRole('button', { name: 'Análise, 0 relatos' })).toBeTruthy()
    // Aposentada e vazia não serve para nada.
    expect(screen.queryByRole('button', { name: 'Parado (aposentada), 0 relatos' })).toBeNull()
    // Aposentada com relato fica: é o único caminho até esses relatos.
    expect(screen.getByRole('button', { name: 'Encerrado (aposentada), 4 relatos' })).toBeTruthy()
  })

  it('os sem coluna viram o recorte "none"', async () => {
    dublê.listar.mockResolvedValue({ reports: [], total: 0 })
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 2), contagem(null, null, 3)])

    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Sem coluna, 3 relatos' }))

    // A linha sem coluna não tem identificador: a rota espera uma palavra.
    await waitFor(() => expect(dublê.listar).toHaveBeenLastCalledWith('p-1', 1, 'none'))
  })

  it('coluna vazia não é o mesmo que projeto sem relato', async () => {
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 0), contagem('s-2', 'Pronto', 9)])
    dublê.listar.mockResolvedValue({ reports: [], total: 0 })

    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Análise, 0 relatos' }))

    // O convite para instalar a ferramenta seria mentira duas vezes: sobre o que
    // existe, e sobre o que a pessoa precisa fazer.
    await waitFor(() => expect(screen.queryByText('Nenhum relato ainda')).toBeNull())
    expect(screen.queryByRole('link', { name: /instalar/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ver todos' })).toBeTruthy()
  })

  it('o link aberto direto abre o relato que a lista não tem', async () => {
    // A lista traz outro relato: o de interesse esta na pagina cinco, ou fora do
    // recorte. E o caso que so passou a existir quando o relato ganhou endereco.
    dublê.listar.mockResolvedValue({ reports: [relato('r-9', 'outro qualquer')], total: 1 })
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Contexts: [{ Key: 'language', Value: 'pt-BR' }],
    })

    montar('p-1', '/p/p-1/r-1')

    // Sem resumo na lista, o texto vem da resposta da abertura.
    expect(await screen.findByText('o botao some')).toBeTruthy()
    expect(dublê.abrir).toHaveBeenCalledWith('p-1', 'r-1')
  })

  it('fechar volta para a lista, e a lista não foi buscada de novo', async () => {
    dublê.abrir.mockResolvedValue({ ...relato('r-1', 'o botao some'), Contexts: [] })

    const router = montar('p-1', '/p/p-1/r-1')

    fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/p/p-1'))
    // A lista fica montada atras: fechar nao e recarregar. Uma busca por montagem.
    expect(dublê.listar).toHaveBeenCalledTimes(1)
  })

  it('mover grava a coluna nova, e a lista passa a mostrá-la', async () => {
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'o botao some')], total: 1 })
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1), contagem('s-2', 'Pronto', 0)])
    dublê.abrir.mockResolvedValue({ ...relato('r-1', 'o botao some'), Contexts: [] })
    dublê.mover.mockResolvedValue(
      relato('r-1', 'o botao some', { StatePublicId: 's-2', StateName: 'Pronto' }),
    )

    montar('p-1', '/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', { StatePublicId: 's-2' }),
    )
    // A contagem muda em duas colunas de uma vez; sem recontar, as fichas
    // passariam a discordar da lista na frente de quem está olhando.
    await waitFor(() => expect(dublê.contar).toHaveBeenCalledTimes(2))
  })

  it('movido para fora do recorte, o relato sai da lista', async () => {
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1), contagem('s-2', 'Pronto', 0)])
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'o botao some')], total: 1 })
    dublê.abrir.mockResolvedValue({ ...relato('r-1', 'o botao some'), Contexts: [] })
    dublê.mover.mockResolvedValue(
      relato('r-1', 'o botao some', { StatePublicId: 's-2', StateName: 'Pronto' }),
    )

    montar()

    // Filtra em Análise, abre o relato de lá e manda ele para Pronto.
    fireEvent.click(await screen.findByRole('button', { name: 'Análise, 1 relato' }))
    fireEvent.click(await screen.findByRole('link', { name: /o botao some/ }))

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    await waitFor(() => expect(dublê.mover).toHaveBeenCalled())

    // Fecha antes de conferir: com o diálogo aberto, a Radix marca o resto da
    // página como `aria-hidden` e a busca por `role` não enxerga a lista — a
    // primeira versão deste teste passava por isso, e não pelo comportamento.
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))

    // Deixar o cartão ali mostraria, debaixo do nome de uma coluna, um relato
    // que não está mais nela.
    await waitFor(() => expect(screen.queryByRole('link', { name: /o botao some/ })).toBeNull())
  })

  it('cada caixa escreve na sua, e nunca na outra', async () => {
    dublê.abrir.mockResolvedValue({ ...relato('r-1', 'o botao some'), Contexts: [] })
    dublê.comentarInterno.mockResolvedValue({
      PublicId: 'c-1',
      AuthorName: 'Cleiton',
      Body: 'suspeito do cache',
      CreatedAt: '2026-09-14T12:00:00.000Z',
    })

    montar('p-1', '/p/p-1/r-1')

    const interno = await screen.findByRole('textbox', { name: 'Entre o time' })
    fireEvent.change(interno, { target: { value: 'suspeito do cache' } })
    fireEvent.click(screen.getByRole('button', { name: 'Comentar entre o time' }))

    await waitFor(() =>
      expect(dublê.comentarInterno).toHaveBeenCalledWith('p-1', 'r-1', {
        Body: 'suspeito do cache',
      }),
    )
    // O erro caro: o texto interno acabar na tabela que vai ser lida de fora.
    expect(dublê.comentarPublico).not.toHaveBeenCalled()
  })

  it('a caixa que sai para fora é a destacada, e diz que ainda não tem leitor', async () => {
    dublê.abrir.mockResolvedValue({ ...relato('r-1', 'o botao some'), Contexts: [] })

    montar('p-1', '/p/p-1/r-1')

    // São dois campos com nomes próprios, e não um com seletor de visibilidade.
    expect(await screen.findByRole('textbox', { name: 'Entre o time' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Para quem relatou' })).toBeTruthy()
    // Prometer leitura que não existe seria pior do que não ter o campo.
    expect(screen.getByText(/ainda não tem onde ler/)).toBeTruthy()
  })

  it('o histórico usa o nome que a coluna tinha na época', async () => {
    dublê.abrir.mockResolvedValue({ ...relato('r-1', 'o botao some'), Contexts: [] })
    dublê.historico.mockResolvedValue([
      {
        PublicId: 'e-1',
        Type: 'ReportStateChanged',
        AuthorName: 'Cleiton',
        // A coluna hoje se chama outra coisa, ou foi aposentada. O evento guardou
        // este nome, e é ele que precisa aparecer — senão renomear reescreve o
        // passado, dizendo que o relato esteve num estado que não existia.
        FromStateName: 'Testando',
        ToStateName: 'Pronto',
        OccurredAt: '2026-09-14T12:00:00.000Z',
      },
    ])

    montar('p-1', '/p/p-1/r-1')

    expect(await screen.findByText('Movido de Testando para Pronto')).toBeTruthy()
  })
})
