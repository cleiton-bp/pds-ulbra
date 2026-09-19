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
  encerrar: vi.fn(),
  pedir: vi.fn(),
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
      closeReport: dublê.encerrar,
      askInfo: dublê.pedir,
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
    PublicStageLabel: null,
    // Aceita, que e o padrao de fabrica. O relato que nao aceita e o caso proprio,
    // e tem teste proprio.
    AcceptsQuestions: true,
    // Sem espera pendente: e o padrao de fabrica, zero minutos.
    PublicStageDueAt: null,
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
  // Falso por padrao: a coluna que encerra e a excecao, e quem diz qual e a API.
  // Deixar o padrao verdadeiro na ultima da lista faria cada teste de movimento
  // esbarrar num dialogo que ele nao pediu.
  closesReport = false,
): ReportStateCountViewModel {
  return {
    StatePublicId: statePublicId,
    StateName: stateName,
    IsActive: isActive,
    ClosesReport: closesReport,
    Total: total,
  }
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
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })

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
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })

    const router = montar('p-1', '/p/p-1/r-1')

    fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/p/p-1'))
    // A lista fica montada atras: fechar nao e recarregar. Uma busca por montagem.
    expect(dublê.listar).toHaveBeenCalledTimes(1)
  })

  it('mover grava a coluna nova, e a lista passa a mostrá-la', async () => {
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'o botao some')], total: 1 })
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1), contagem('s-2', 'Pronto', 0)])
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })
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

  it('mostra o lado de fora, e o atualiza sem buscar o detalhe de novo', async () => {
    // O resumo da lista ganha do detalhe na caixa — os dois dizem a mesma coisa, e
    // o primeiro chega antes. Por isso a etapa precisa vir **no resumo**: e o que
    // torna o campo necessario na lista, mesmo sem ser desenhado nela.
    dublê.listar.mockResolvedValue({
      reports: [relato('r-1', 'o botao some', { PublicStageLabel: 'Em análise' })],
      total: 1,
    })
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1), contagem('s-2', 'Pronto', 0)])
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some', { PublicStageLabel: 'Em análise' }),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })
    dublê.mover.mockResolvedValue(
      relato('r-1', 'o botao some', {
        StatePublicId: 's-2',
        StateName: 'Pronto',
        PublicStageLabel: 'Concluído',
      }),
    )

    montar('p-1', '/p/p-1/r-1')

    expect(await screen.findByText('Em análise')).toBeTruthy()

    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    // A etapa nova sai da resposta do proprio movimento.
    expect(await screen.findByText('Concluído')).toBeTruthy()

    // **E o detalhe nao e buscado de novo.** Abrir o detalhe grava um evento de
    // leitura: refazer essa busca a cada movimento mediria cliques do time em vez
    // de leituras, e a pergunta de pesquisa depende desse instante.
    expect(dublê.abrir).toHaveBeenCalledTimes(1)
  })

  it('diz que o relato ainda não aparece quando ele não está em etapa nenhuma', async () => {
    dublê.listar.mockResolvedValue({
      reports: [relato('r-1', 'o botao some', { PublicStageLabel: null })],
      total: 1,
    })
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1)])
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some', { PublicStageLabel: null }),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })

    montar('p-1', '/p/p-1/r-1')

    // Uma frase so para os tres motivos possiveis: coluna fora do mapa, projeto
    // sem jornada, ou relato anterior a ela. Distinguir exigiria um campo que
    // ficaria desatualizado no primeiro movimento.
    expect(await screen.findByText('Ainda não aparece para quem relatou')).toBeTruthy()
  })

  it('movido para fora do recorte, o relato sai da lista', async () => {
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1), contagem('s-2', 'Pronto', 0)])
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'o botao some')], total: 1 })
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })
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
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })
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
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })

    montar('p-1', '/p/p-1/r-1')

    // São dois campos com nomes próprios, e não um com seletor de visibilidade.
    expect(await screen.findByRole('textbox', { name: 'Entre o time' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Para quem relatou' })).toBeTruthy()
    // Prometer leitura que não existe seria pior do que não ter o campo.
    expect(screen.getByText(/ainda não tem onde ler/)).toBeTruthy()
  })

  it('o histórico usa o nome que a coluna tinha na época', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })
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

/**
 * O ENCERRAMENTO, E O QUE ELE TRAVA.
 *
 * **O motivo e a regra, e nao um campo a mais.** Sem ele o produto reproduz
 * exatamente o que existe para resolver: a pessoa fica sabendo que acabou, e nao o
 * que aconteceu. Por isso o teste mais importante deste bloco e o que prova que
 * **nada foi movido** enquanto o motivo nao existe — e nao o do caminho feliz.
 *
 * **Qual coluna encerra vem da API.** Deduzir na tela pela ordem da lista parece
 * obvio e erra em dois casos reais: a lista traz as aposentadas junto, e a regra
 * vai virar configuracao do projeto. Os testes escolhem `ClosesReport` a mao
 * justamente para que o dia em que alguem trocar isso por "a ultima da lista"
 * quebre aqui.
 */
describe('encerrar um relato', () => {
  afterEach(cleanup)

  beforeEach(() => {
    // Zerado aqui tambem: sem isto a contagem de chamadas soma a dos blocos de
    // cima, e "nao moveu nada" — a asserticao que este bloco existe para fazer —
    // passaria a falhar por causa de um movimento de outro teste.
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.listarComentarios.mockResolvedValue({ Internal: [], Public: [] })
    dublê.historico.mockResolvedValue([])
    dublê.contar.mockResolvedValue([])
  })

  /**
   * Quatro colunas, e a ordem delas e o teste.
   *
   * A que encerra e a **segunda**, nao a ultima; a ultima ativa e "Revisao", que
   * nao encerra; e a ultima da lista e uma aposentada. Qualquer tentativa de
   * deduzir na tela qual coluna encerra — pela posicao, pela ultima ativa, pela
   * ultima da lista — escolhe a errada aqui.
   */
  function cenario() {
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'o botao some')], total: 1 })
    dublê.contar.mockResolvedValue([
      contagem('s-1', 'Análise', 1),
      contagem('s-2', 'Pronto', 0, true, true),
      contagem('s-3', 'Revisão', 0),
      contagem('s-4', 'Arquivo morto', 2, false),
    ])
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })
  }

  it('a coluna que encerra pergunta antes, e não move nada', async () => {
    cenario()
    montar('p-1', '/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    expect(await screen.findByText(/Mover para Pronto encerra este relato/)).toBeTruthy()
    // **O ponto do teste.** Perguntar depois de mover deixaria o relato encerrado
    // sem motivo enquanto o diálogo estivesse aberto — e encerrado sem motivo é
    // justamente o que não pode existir.
    expect(dublê.mover).not.toHaveBeenCalled()
  })

  it('sem motivo escrito, o botão de encerrar não age', async () => {
    cenario()
    montar('p-1', '/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    const encerrar = await screen.findByRole('button', { name: 'Encerrar' })
    expect(encerrar.hasAttribute('disabled')).toBe(true)

    fireEvent.click(encerrar)
    expect(dublê.mover).not.toHaveBeenCalled()
  })

  it('só espaço em branco continua sendo sem motivo', async () => {
    cenario()
    montar('p-1', '/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    const campo = await screen.findByRole('textbox', { name: 'Por que acabou' })
    fireEvent.change(campo, { target: { value: '   \n  ' } })

    expect(screen.getByRole('button', { name: 'Encerrar' }).hasAttribute('disabled')).toBe(true)
  })

  it('com motivo, o movimento leva o desfecho junto', async () => {
    cenario()
    dublê.mover.mockResolvedValue(
      relato('r-1', 'o botao some', { StatePublicId: 's-2', StateName: 'Pronto' }),
    )

    montar('p-1', '/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    const campo = await screen.findByRole('textbox', { name: 'Por que acabou' })
    fireEvent.change(campo, { target: { value: 'Corrigimos na versão desta semana.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }))

    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', {
        StatePublicId: 's-2',
        // O padrão é o final comum, e é o que a tela já mostra escolhido.
        Outcome: 'Done',
        // Aparado: o espaço no fim não é motivo, e a comparação do servidor com o
        // tamanho máximo contaria ele.
        Reason: 'Corrigimos na versão desta semana.',
      }),
    )

    // O diálogo sai da tela sozinho quando a gravação passa.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Encerrar' })).toBeNull())
  })

  it('o desfecho escolhido é o que viaja', async () => {
    cenario()
    dublê.mover.mockResolvedValue(
      relato('r-1', 'o botao some', { StatePublicId: 's-2', StateName: 'Pronto' }),
    )

    montar('p-1', '/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    await escolherNoSelect(screen, fireEvent, 'Como terminou', 'Não será feito')

    const campo = await screen.findByRole('textbox', { name: 'Por que acabou' })
    fireEvent.change(campo, { target: { value: 'Sai do escopo deste produto.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }))

    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', {
        StatePublicId: 's-2',
        Outcome: 'WontDo',
        Reason: 'Sai do escopo deste produto.',
      }),
    )
  })

  it('desistir do motivo desiste do movimento inteiro', async () => {
    cenario()
    montar('p-1', '/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

    // Não há "mover sem encerrar" para esta coluna: encerrar sem motivo não
    // existe, então mover sem motivo também não.
    expect(dublê.mover).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByText(/encerra este relato/)).toBeNull())
  })

  it('a última coluna ativa não encerra se a API não disser que encerra', async () => {
    cenario()
    dublê.mover.mockResolvedValue(
      relato('r-1', 'o botao some', { StatePublicId: 's-3', StateName: 'Revisão' }),
    )

    montar('p-1', '/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Revisão')

    // É a última **ativa**, e mesmo assim move direto: quem decide é
    // `ClosesReport`, e aqui ele é falso.
    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', { StatePublicId: 's-3' }),
    )
    expect(screen.queryByText(/encerra este relato/)).toBeNull()
  })
})

/**
 * O ENCERRAMENTO POR BOTAO.
 *
 * **O gatilho e configuracao do projeto, e a tela obedece a API.** Nenhum destes
 * testes calcula qual coluna encerra: eles dizem o que `ClosesReport` traz, que e
 * exatamente o contrato. O dia em que alguem trocar isso por "a ultima da lista"
 * quebra aqui.
 *
 * **O caso que se esquece e o do relato ja parado na coluna que encerra.** Mover
 * para onde ele ja esta nao e movimento, entao sem o botao esse relato nunca
 * poderia ser encerrado — e e o estado de todo relato que chegou la antes de a
 * regra existir.
 */
describe('encerrar por botão', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.listarComentarios.mockResolvedValue({ Internal: [], Public: [] })
    dublê.historico.mockResolvedValue([])
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'o botao some')], total: 1 })
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })
  })

  it('projeto que encerra por botão não pergunta nada ao mover', async () => {
    // Nenhuma coluna encerra: é o que a API responde quando o gatilho é o botão.
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1), contagem('s-2', 'Pronto', 0)])
    dublê.mover.mockResolvedValue(
      relato('r-1', 'o botao some', { StatePublicId: 's-2', StateName: 'Pronto' }),
    )

    montar('p-1', '/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    await waitFor(() =>
      expect(dublê.mover).toHaveBeenCalledWith('p-1', 'r-1', { StatePublicId: 's-2' }),
    )
    expect(screen.queryByText(/encerra este relato/)).toBeNull()
  })

  it('e oferece o botão, que encerra sem mover', async () => {
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1), contagem('s-2', 'Pronto', 0)])
    dublê.encerrar.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: {
        Outcome: 'Done',
        Reason: 'Corrigido.',
        ClosedAt: '2026-09-20T10:00:00.000Z',
        ClosedByName: 'Cleiton',
        ConfirmedAt: null,
        Satisfaction: null,
        SatisfactionDeclined: false,
      },
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })

    montar('p-1', '/p/p-1/r-1')

    fireEvent.click(await screen.findByRole('button', { name: 'Concluir relato' }))

    // Sem coluna de destino: a frase fala do relato ficar onde está.
    expect(await screen.findByText(/continua na coluna em que está/)).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: 'Por que acabou' }), {
      target: { value: 'Corrigido.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }))

    await waitFor(() =>
      expect(dublê.encerrar).toHaveBeenCalledWith('p-1', 'r-1', {
        Outcome: 'Done',
        Reason: 'Corrigido.',
      }),
    )
    // **O relato não sai do lugar.** É para isso que o botão existe.
    expect(dublê.mover).not.toHaveBeenCalled()

    // E o que a API devolveu vira o bloco na tela, com quem encerrou.
    expect(await screen.findByText('Encerrado')).toBeTruthy()
    expect(screen.getByText('por Cleiton')).toBeTruthy()
  })

  it('o relato já parado na coluna que encerra também ganha o botão', async () => {
    // Encerra pela coluna, e o relato está nela — mover para onde ele já está não
    // é movimento, então sem o botão ele não teria como ser encerrado nunca.
    dublê.contar.mockResolvedValue([
      contagem('s-1', 'Análise', 1, true, true),
      contagem('s-2', 'Pronto', 0),
    ])

    montar('p-1', '/p/p-1/r-1')

    expect(await screen.findByRole('button', { name: 'Concluir relato' })).toBeTruthy()
  })

  it('o relato que está em outra coluna não ganha o botão', async () => {
    dublê.contar.mockResolvedValue([
      contagem('s-1', 'Análise', 1),
      contagem('s-2', 'Pronto', 0, true, true),
    ])

    montar('p-1', '/p/p-1/r-1')

    await screen.findByRole('combobox', { name: 'Mover para a coluna' })
    // Para esse, quem encerra é o movimento — e oferecer as duas portas faria a
    // configuração não querer dizer nada.
    expect(screen.queryByRole('button', { name: 'Concluir relato' })).toBeNull()
  })

  it('relato já encerrado mostra o fim e não oferece encerrar de novo', async () => {
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1)])
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: {
        Outcome: 'WontDo',
        Reason: 'O comportamento é o esperado.',
        ClosedAt: '2026-09-20T10:00:00.000Z',
        ClosedByName: 'Cleiton',
        ConfirmedAt: null,
        Satisfaction: null,
        SatisfactionDeclined: false,
      },
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })

    montar('p-1', '/p/p-1/r-1')

    expect(await screen.findByText('O comportamento é o esperado.')).toBeTruthy()
    expect(screen.getByText('Não será feito')).toBeTruthy()
    // Uma linha por fechamento: encerrar duas vezes contaria a história errada.
    expect(screen.queryByRole('button', { name: 'Concluir relato' })).toBeNull()
  })
})

/**
 * O QUE O TIME PRECISA SABER ANTES DE PERGUNTAR.
 *
 * **Tres estados, e a tela diz os tres.** Aceitou, nao aceitou, e — o que se
 * esquece — nao foi perguntado: o relato que entrou antes de a pergunta existir.
 * Mostrar esse ultimo como "nao aceita responder" poria na boca da pessoa uma
 * resposta que ela nunca deu, e e o tipo de erro que ninguem vai conferir.
 *
 * **E precisa aparecer antes de alguem tentar.** Descobrir depois, ao esbarrar
 * numa recusa, faria a pessoa do time escrever a pergunta para so entao saber que
 * ela nao vai sair.
 */
describe('a escolha de quem relatou sobre responder dúvidas', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.listarComentarios.mockResolvedValue({ Internal: [], Public: [] })
    dublê.historico.mockResolvedValue([])
    dublê.contar.mockResolvedValue([])
  })

  function comEscolha(escolha: boolean | null) {
    const alvo = relato('r-1', 'o botao some', { AcceptsQuestions: escolha })
    dublê.listar.mockResolvedValue({ reports: [alvo], total: 1 })
    dublê.abrir.mockResolvedValue({
      ...alvo,
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })
    montar('p-1', '/p/p-1/r-1')
  }

  it('quem aceitou não vira etiqueta nenhuma', async () => {
    comEscolha(true)
    // O relato aparece duas vezes: no cartao da lista e no dialogo aberto por
    // cima dele. Esperar o botao do dialogo e o que garante que ele ja desenhou.
    await screen.findByRole('button', { name: 'Fechar' })

    // Poder perguntar é o caso comum. Uma etiqueta em todo relato para dizer que
    // está tudo normal vira ruído que se aprende a não ler — e aí a etiqueta que
    // importa passa despercebida junto.
    expect(screen.queryByText(/dúvidas/i)).toBeNull()
    expect(screen.queryByText(/Não foi perguntado/)).toBeNull()
  })

  it('quem não aceitou aparece avisado', async () => {
    comEscolha(false)
    expect(await screen.findByText('Não aceita responder dúvidas')).toBeTruthy()
  })

  it('e o relato antigo diz que ninguém perguntou, e não que ele recusou', async () => {
    comEscolha(null)

    // **O ponto do teste.** Os dois bloqueiam o pedido de informação do mesmo
    // jeito, e por isso a tentação é mostrá-los iguais. Mas um é uma recusa e o
    // outro é uma pergunta que nunca foi feita.
    expect(await screen.findByText('Não foi perguntado se responde')).toBeTruthy()
    expect(screen.queryByText('Não aceita responder dúvidas')).toBeNull()
  })
})

/**
 * A JANELA DE DESFAZER, ENQUANTO ELA ESTA ABERTA.
 *
 * **Sem a data na tela, a espera so funciona por sorte.** Ela existe para quem
 * moveu o card por engano ter tempo de corrigir antes de a pessoa la fora ver — e
 * quem moveu por engano so sabe que ainda da tempo se a tela disser.
 *
 * O caso comum e nao ter espera nenhuma: o padrao de fabrica e zero minutos, e ai
 * nao ha nada a avisar. Um aviso permanente viraria ruido que se aprende a nao ler.
 */
describe('a espera antes de quem relatou ver', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.listarComentarios.mockResolvedValue({ Internal: [], Public: [] })
    dublê.historico.mockResolvedValue([])
    dublê.contar.mockResolvedValue([])
  })

  function comVencimento(vence: string | null) {
    const alvo = relato('r-1', 'o botao some', { PublicStageDueAt: vence })
    dublê.listar.mockResolvedValue({ reports: [alvo], total: 1 })
    dublê.abrir.mockResolvedValue({
      ...alvo,
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
    })
    montar('p-1', '/p/p-1/r-1')
  }

  it('sem espera pendente, a tela não avisa nada', async () => {
    comVencimento(null)
    await screen.findByRole('button', { name: 'Fechar' })

    expect(screen.queryByText(/Quem relatou vê às/)).toBeNull()
  })

  it('com espera pendente, diz até quando dá para desfazer', async () => {
    comVencimento('2026-09-19T00:30:00.000Z')

    // **O ponto do teste.** A janela silenciosa é uma janela inútil: quem arrastou
    // o card por engano não tem como saber que ainda dá tempo de corrigir.
    expect(await screen.findByText(/Quem relatou vê às/)).toBeTruthy()
  })

  it('e o aviso acompanha a resposta do próprio movimento', async () => {
    // As colunas precisam estar respondidas **antes** de montar: a tela busca a
    // contagem na montagem, e o seletor só existe quando ela chega.
    dublê.contar.mockResolvedValue([contagem('s-1', 'Análise', 1), contagem('s-2', 'Pronto', 0)])
    dublê.mover.mockResolvedValue(
      relato('r-1', 'o botao some', {
        StatePublicId: 's-2',
        StateName: 'Pronto',
        PublicStageDueAt: '2026-09-19T00:30:00.000Z',
      }),
    )

    comVencimento(null)
    await screen.findByRole('button', { name: 'Fechar' })
    await escolherNoSelect(screen, fireEvent, 'Mover para a coluna', 'Pronto')

    // Sai da resposta do movimento, e não de uma busca nova: buscar o detalhe de
    // novo **grava um evento de leitura**.
    expect(await screen.findByText(/Quem relatou vê às/)).toBeTruthy()
    expect(dublê.abrir).toHaveBeenCalledTimes(1)
  })
})

/**
 * DEVOLVER NAO E ENCERRAR.
 *
 * **E a distincao que da nome ao passo.** "Nao reproduzi" e "nao vamos fazer" sao
 * decisoes opostas, e chegando iguais do outro lado a pessoa entende que acabou e
 * para de responder — o relato morre por ruido. A tela precisa oferecer as duas
 * saidas **lado a lado**: esconder uma atras da outra e o que faz a primeira chegar
 * como a segunda.
 *
 * E quem decide se da para devolver e a API, em `CanAskInfo` — que ja e a conclusao
 * de quatro coisas, e nao a configuracao de nenhuma.
 */
describe('devolver o relato pedindo informação', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.listarComentarios.mockResolvedValue({ Internal: [], Public: [] })
    dublê.historico.mockResolvedValue([])
    dublê.contar.mockResolvedValue([])
    dublê.listar.mockResolvedValue({ reports: [relato('r-1', 'o botao some')], total: 1 })
  })

  function aberto(extra: Record<string, unknown>) {
    dublê.abrir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      InfoRequest: null,
      CanAskInfo: false,
      Contexts: [],
      ...extra,
    })
    montar('p-1', '/p/p-1/r-1')
  }

  it('as duas saídas aparecem juntas quando dá para devolver', async () => {
    aberto({ CanAskInfo: true })

    expect(await screen.findByRole('button', { name: 'Pedir informação' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Concluir relato' })).toBeTruthy()
  })

  it('e a de devolver some quando a API diz que não dá', async () => {
    // Quem escreveu não aceitou responder dúvidas, o relato já está encerrado, já
    // há um pedido aberto, ou o projeto desligou o recurso. A tela não precisa
    // saber qual — ela lê a conclusão.
    aberto({ CanAskInfo: false })

    await screen.findByRole('button', { name: 'Concluir relato' })
    expect(screen.queryByRole('button', { name: 'Pedir informação' })).toBeNull()
  })

  it('pedir manda o texto, e não encerra nada', async () => {
    aberto({ CanAskInfo: true })
    dublê.pedir.mockResolvedValue({
      ...relato('r-1', 'o botao some'),
      Closure: null,
      CanAskInfo: false,
      InfoRequest: {
        AskedByName: 'Cleiton',
        AskedAt: '2026-09-19T00:00:00.000Z',
        WarnAt: '2026-09-26T00:00:00.000Z',
        CloseAt: '2026-10-03T00:00:00.000Z',
      },
      Contexts: [],
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Pedir informação' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'O que falta' }), {
      target: { value: 'Em qual navegador isso aconteceu?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pedir' }))

    await waitFor(() =>
      expect(dublê.pedir).toHaveBeenCalledWith('p-1', 'r-1', {
        Body: 'Em qual navegador isso aconteceu?',
      }),
    )
    // **O ponto do teste.** Devolver e encerrar são rotas diferentes porque são
    // decisões diferentes.
    expect(dublê.encerrar).not.toHaveBeenCalled()

    // E a tela passa a mostrar que a bola está com quem relatou.
    expect(await screen.findByText('Esperando quem relatou')).toBeTruthy()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Pedir informação' })).toBeNull(),
    )
  })

  it('o relato já devolvido mostra os dois prazos, e que dá para reabrir', async () => {
    aberto({
      InfoRequest: {
        AskedByName: 'Cleiton',
        AskedAt: '2026-09-19T00:00:00.000Z',
        WarnAt: '2026-09-26T00:00:00.000Z',
        CloseAt: '2026-10-03T00:00:00.000Z',
      },
    })

    // Sem isto, alguém do time abre o relato dias depois, vê que está parado, e
    // pergunta de novo — e quem está do outro lado recebe duas perguntas iguais.
    expect(await screen.findByText('Esperando quem relatou')).toBeTruthy()
    expect(screen.getByText(/pedido por Cleiton/)).toBeTruthy()
    expect(screen.getByText(/ainda assim poderá ser reaberto/)).toBeTruthy()
  })
})
