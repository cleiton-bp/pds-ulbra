// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectLabelViewModel,
  ReportDetailViewModel,
  ReportHistoryEntryViewModel,
  ReportSummaryViewModel,
} from '@/contracts'
import { PanelError } from '@/data'
import { CardFields } from '@/features/reports/CardFields'
import { ReportHistory } from '@/features/reports/ReportHistory'
import { ReportTitle, textInHeadline } from '@/features/reports/ReportTitle'
import { Toaster } from '@/shared/components/Toaster'
import { useToastStore } from '@/shared/components/toastStore'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: os campos que o time da ao card, e o titulo.
 *
 * - **Cada mudanca e uma chamada, e a resposta vira o card.** A tela nao inventa o
 *   que ficou gravado.
 * - **Quem saiu do time continua no card**, marcado, e nao se escolhe de novo.
 * - **Etiquetar e escrever**: o que existe entra, o nome novo cria e entra. Enter
 *   poe a de nome igual, e nunca uma parecida.
 * - **Uma mudanca de cada vez**, partindo da resposta da anterior — e sem desligar
 *   os campos, que tirava o foco de quem estava escolhendo.
 * - **O valor escolhido aparece na hora, com "Salvando…"** embaixo, ate a resposta. A
 *   falha volta o campo ao que vale e diz qual campo foi, embaixo dele e no aviso.
 * - **A lista que nao carregou tenta de novo** ali mesmo, sem fechar o card.
 * - **O prazo digitado e rascunho** ate sair do campo: o navegador devolve uma data
 *   inteira a cada tecla, e nenhuma delas e pedido.
 * - **O prazo vem por extenso** embaixo do campo, que segue o idioma do navegador, e com
 *   o destaque da lista: vencido em vermelho, perto em amarelo, sempre com as palavras.
 * - **O titulo de quem relatou nunca some**: reescrito, ele aparece embaixo, e um
 *   clique volta a ele.
 *
 * A regra de verdade mora na API; aqui entra o que a tela faz com a resposta.
 */
const dublê = vi.hoisted(() => ({
  membros: vi.fn(),
  prioridades: vi.fn(),
  etiquetas: vi.fn(),
  criarEtiqueta: vi.fn(),
  titulo: vi.fn(),
  responsavel: vi.fn(),
  prioridade: vi.fn(),
  etiquetasDoCard: vi.fn(),
  prazo: vi.fn(),
  historico: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectTeamService: { listMembers: dublê.membros },
    projectPriorityService: { listPriorities: dublê.prioridades },
    projectLabelService: { listLabels: dublê.etiquetas, addLabel: dublê.criarEtiqueta },
    projectReportService: {
      setTitle: dublê.titulo,
      setAssignee: dublê.responsavel,
      setPriority: dublê.prioridade,
      setLabels: dublê.etiquetasDoCard,
      setDueDate: dublê.prazo,
      listReportHistory: dublê.historico,
    },
  }
})

function card(extra: Partial<ReportSummaryViewModel> = {}): ReportSummaryViewModel {
  return {
    PublicId: 'r-1',
    Kind: 'Report',
    Number: 12,
    Title: null,
    ReporterTitle: null,
    TrackingCode: 'ABCD-EFGH',
    Type: 'Bug',
    Text: 'O botao de pagar nao responde.',
    Route: '/checkout',
    Origin: null,
    StatePublicId: 's-1',
    StateName: 'Análise',
    PublicStageLabel: null,
    AcceptsQuestions: true,
    PublicStageDueAt: null,
    ArchivedAt: null,
    CreatedAt: '2026-10-02T12:00:00.000Z',
    Assignee: null,
    Priority: null,
    Labels: [],
    DueDate: null,
    CommentCount: 0,
    AttachmentCount: 0,
    Closed: false,
    ClosureConfirmed: false,
    Finished: false,
    Parent: null,
    SubtaskCount: 0,
    SubtasksDone: 0,
    BlockedBy: [],
    DuplicateOf: null,
    DuplicateReporters: 0,
    Sprint: null,
    StoryPoints: null,
    UpdatedAt: '2026-10-03T12:00:00.000Z',
    ...extra,
  }
}

function aberto(resumo: ReportSummaryViewModel): ReportDetailViewModel {
  return {
    ...resumo,
    Description: null,
    CreatedByName: null,
    CanArchive: false,
    ArchiveCloses: true,
    Closure: null,
    InfoRequest: null,
    CanAskInfo: false,
    ModerationState: 'Pending',
    Contexts: [],
    Reopenings: [],
  }
}

const pagamento: ProjectLabelViewModel = {
  PublicId: 'l-pag',
  Name: 'pagamento',
  Color: 'Blue',
  CardCount: 3,
  CreatedAt: '2026-10-01T12:00:00.000Z',
}
const celular: ProjectLabelViewModel = {
  PublicId: 'l-cel',
  Name: 'celular',
  Color: 'Green',
  CardCount: 1,
  CreatedAt: '2026-10-01T12:00:00.000Z',
}
const revenda: ProjectLabelViewModel = { ...celular, PublicId: 'l-rev', Name: 'revenda' }
const pais: ProjectLabelViewModel = { ...celular, PublicId: 'l-pais', Name: 'pais' }

/** A etiqueta como o card a mostra, a partir do identificador. */
function noCard(publicId: string) {
  const conhecida = [pagamento, celular, revenda, pais].find((item) => item.PublicId === publicId)
  return {
    PublicId: publicId,
    Name: conhecida?.Name ?? publicId,
    Color: conhecida?.Color ?? ('Gray' as const),
  }
}

/** A API devolve o card com o que foi pedido: a resposta e o card de verdade. */
function ecoarEtiquetas() {
  dublê.etiquetasDoCard.mockImplementation(
    async (_p: string, _r: string, corpo: { LabelPublicIds: string[] }) =>
      aberto(card({ Labels: corpo.LabelPublicIds.map(noCard) })),
  )
}

function ecoarPrazo() {
  dublê.prazo.mockImplementation(
    async (_p: string, _r: string, corpo: { DueDate: string | null }) =>
      aberto(card({ DueDate: corpo.DueDate })),
  )
}

instalarRemendosDoRadix()

function montar(resumo: ReportSummaryViewModel, aoMudar = vi.fn()) {
  render(<CardFields projectPublicId="p-1" reportPublicId="r-1" card={resumo} aoMudar={aoMudar} />)
  return aoMudar
}

/** O dia de hoje mais `dias`, como o prazo guarda: `aaaa-mm-dd`, no calendario de quem le. */
function dia(dias: number): string {
  const data = new Date()
  data.setDate(data.getDate() + dias)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`
}

/** Uma resposta que so chega quando o teste mandar. */
function aEsperar<T>() {
  let soltar: (valor: T) => void = () => {}
  let falhar: (erro: unknown) => void = () => {}
  const promessa = new Promise<T>((ok, erro) => {
    soltar = ok
    falhar = erro
  })
  return { promessa, soltar, falhar }
}

describe('os campos do card', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.membros.mockResolvedValue([
      {
        UserPublicId: 'u-ana',
        Name: 'Ana Dona',
        Email: 'ana@e8.local',
        AvatarUrl: null,
        Role: 'Administrator',
        IsAccountOwner: true,
        IsYou: true,
        JoinedAt: null,
      },
    ])
    dublê.prioridades.mockResolvedValue([
      {
        PublicId: 'p-baixa',
        Name: 'Baixa',
        Color: 'Blue',
        Position: 0,
        IsActive: true,
        CreatedAt: '',
      },
      {
        PublicId: 'p-alta',
        Name: 'Alta',
        Color: 'Orange',
        Position: 2,
        IsActive: false,
        CreatedAt: '',
      },
      // Aposentada e fora do card: nao e oferecida.
      {
        PublicId: 'p-urgente',
        Name: 'Urgente',
        Color: 'Red',
        Position: 3,
        IsActive: false,
        CreatedAt: '',
      },
    ])
    dublê.etiquetas.mockResolvedValue([pagamento, celular])
  })

  it('escolher o responsavel manda a pessoa, e a resposta vira o card', async () => {
    const resposta = aberto(
      card({
        Assignee: { UserPublicId: 'u-ana', Name: 'Ana Dona', AvatarUrl: null, InTeam: true },
      }),
    )
    dublê.responsavel.mockResolvedValue(resposta)
    const aoMudar = montar(card())

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Responsável' }).hasAttribute('disabled')).toBe(
        false,
      ),
    )
    await escolherNoSelect(screen, fireEvent, 'Responsável', 'Ana Dona')

    await waitFor(() =>
      expect(dublê.responsavel).toHaveBeenCalledWith('p-1', 'r-1', { UserPublicId: 'u-ana' }),
    )
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(resposta))
  })

  it('quem saiu do time aparece marcado, e nao se escolhe de novo', async () => {
    montar(
      card({
        Assignee: { UserPublicId: 'u-bruno', Name: 'Bruno', AvatarUrl: null, InTeam: false },
      }),
    )

    const campo = screen.getByRole('combobox', { name: 'Responsável' })
    expect(campo.textContent).toContain('Bruno (saiu do time)')
    await waitFor(() => expect(campo.hasAttribute('disabled')).toBe(false))
    fireEvent.pointerDown(campo, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    expect(
      screen.getByRole('option', { name: 'Bruno (saiu do time)' }).getAttribute('aria-disabled'),
    ).toBe('true')
  })

  it('a prioridade oferece so as ativas — a desativada do card fica, marcada', async () => {
    dublê.prioridade.mockResolvedValue(aberto(card()))
    montar(
      card({ Priority: { PublicId: 'p-alta', Name: 'Alta', Color: 'Orange', IsActive: false } }),
    )

    const campo = await screen.findByRole('combobox', { name: 'Prioridade' })
    fireEvent.pointerDown(campo, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    const opcoes = screen.getAllByRole('option').map((opcao) => opcao.textContent)
    expect(opcoes).toEqual(['Sem prioridade', 'Baixa', 'Alta (desativada)'])

    fireEvent.click(screen.getByRole('option', { name: 'Sem prioridade' }))
    await waitFor(() =>
      expect(dublê.prioridade).toHaveBeenCalledWith('p-1', 'r-1', { PriorityPublicId: null }),
    )
  })

  it('a configuracao mudou: as listas sao lidas de novo; falhar ao reler deixa a que estava', async () => {
    const campos = (configuracao: number) => (
      <CardFields
        projectPublicId="p-1"
        reportPublicId="r-1"
        card={card()}
        aoMudar={vi.fn()}
        configuracao={configuracao}
      />
    )
    dublê.etiquetas.mockResolvedValue([pagamento])
    const { rerender } = render(campos(0))
    const campo = await screen.findByRole('combobox', { name: 'Adicionar etiqueta' })
    await waitFor(() => expect(dublê.etiquetas).toHaveBeenCalledTimes(1))

    // Outra pessoa criou "revenda".
    dublê.etiquetas.mockResolvedValue([pagamento, revenda])
    rerender(campos(1))
    await waitFor(() => expect(dublê.etiquetas).toHaveBeenCalledTimes(2))
    fireEvent.change(campo, { target: { value: 'rev' } })
    expect(
      await within(screen.getByRole('listbox', { name: 'Etiquetas para escolher' })).findByText(
        'revenda',
      ),
    ).toBeTruthy()

    dublê.etiquetas.mockRejectedValue(new Error('sem rede'))
    rerender(campos(2))
    await waitFor(() => expect(dublê.etiquetas).toHaveBeenCalledTimes(3))
    await act(() => new Promise((pronto) => setTimeout(pronto, 20)))
    expect(screen.queryByText(/Não deu para carregar tudo/)).toBeNull()
  })

  it('etiquetar: a que existe entra pelo nome; tirar manda o conjunto sem ela', async () => {
    ecoarEtiquetas()
    montar(card({ Labels: [noCard('l-cel')] }))

    const campo = await screen.findByRole('combobox', { name: 'Adicionar etiqueta' })
    fireEvent.change(campo, { target: { value: 'PAG' } })
    const sugestoes = screen.getByRole('listbox', { name: 'Etiquetas para escolher' })
    fireEvent.click(within(sugestoes).getByText('pagamento'))
    await waitFor(() =>
      expect(dublê.etiquetasDoCard).toHaveBeenCalledWith('p-1', 'r-1', {
        LabelPublicIds: ['l-cel', 'l-pag'],
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tirar a etiqueta celular' }))
    await waitFor(() =>
      expect(dublê.etiquetasDoCard).toHaveBeenLastCalledWith('p-1', 'r-1', {
        LabelPublicIds: ['l-pag'],
      }),
    )
  })

  it('Enter poe a destacada: a de nome igual primeiro, sem diferenciar maiuscula, depois a que comeca pelo escrito, depois a que o tem no meio', async () => {
    const venda = { ...celular, PublicId: 'l-venda', Name: 'venda' }
    const vendas = { ...celular, PublicId: 'l-vendas', Name: 'vendas' }
    dublê.etiquetas.mockResolvedValue([pagamento, celular, revenda, pais, vendas, venda])
    ecoarEtiquetas()
    montar(card())

    const campo = await screen.findByRole('combobox', { name: 'Adicionar etiqueta' })

    // A de nome igual vem antes, mesmo com outra maiuscula; "revenda", que so tem o
    // escrito no meio, por ultimo. Com a de nome igual, nao ha o que criar.
    fireEvent.change(campo, { target: { value: 'VENDA' } })
    const lista = screen.getByRole('listbox', { name: 'Etiquetas para escolher' })
    const opcoes = within(lista).getAllByRole('option')
    expect(opcoes.map((opcao) => opcao.textContent)).toEqual(['venda', 'vendas', 'revenda'])
    expect(opcoes.map((opcao) => opcao.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ])
    // O campo diz qual esta destacada, para o leitor de tela.
    expect(campo.getAttribute('aria-activedescendant')).toBe(opcoes[0]?.id)
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() =>
      expect(dublê.etiquetasDoCard).toHaveBeenCalledWith('p-1', 'r-1', {
        LabelPublicIds: ['l-venda'],
      }),
    )
    expect((campo as HTMLInputElement).value).toBe('')

    // O comeco do nome: "pag" e Enter poe "pagamento" — e nao cria a etiqueta "pag".
    fireEvent.change(campo, { target: { value: 'pag' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() =>
      expect(dublê.etiquetasDoCard).toHaveBeenLastCalledWith('p-1', 'r-1', {
        LabelPublicIds: ['l-venda', 'l-pag'],
      }),
    )
    expect(dublê.criarEtiqueta).not.toHaveBeenCalled()
  })

  it('criar so pelas setas, pelo clique, ou pelo Enter sem nenhuma parecida — e o acento conta, como na API', async () => {
    dublê.etiquetas.mockResolvedValue([pagamento, celular, revenda, pais])
    dublê.criarEtiqueta.mockImplementation(async (_p: string, corpo: { Name: string }) => ({
      PublicId: `l-${corpo.Name}`,
      Name: corpo.Name,
      Color: 'Gray',
      CardCount: 0,
      CreatedAt: '',
    }))
    ecoarEtiquetas()
    montar(card())

    const campo = await screen.findByRole('combobox', { name: 'Adicionar etiqueta' })

    // "venda" esta dentro de "revenda": ela vem destacada, e o "Criar" fica por ultimo.
    // A seta desce ate ele, e ai o Enter cria.
    fireEvent.change(campo, { target: { value: 'venda' } })
    expect(
      screen.getByText('Enter põe a etiqueta destacada. Para uma nova, escolha Criar.').id,
    ).toBe(campo.getAttribute('aria-describedby'))
    expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
      'revenda',
      'Criar “venda”',
    ])
    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    expect(
      screen.getByRole('option', { name: 'Criar “venda”' }).getAttribute('aria-selected'),
    ).toBe('true')
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() => expect(dublê.criarEtiqueta).toHaveBeenCalledWith('p-1', { Name: 'venda' }))
    await waitFor(() =>
      expect(dublê.etiquetasDoCard).toHaveBeenLastCalledWith('p-1', 'r-1', {
        LabelPublicIds: ['l-venda'],
      }),
    )

    // Sem nenhuma parecida, o "Criar" e a unica escolha, e o Enter cria.
    fireEvent.change(campo, { target: { value: 'urgente' } })
    expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
      'Criar “urgente”',
    ])
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() =>
      expect(dublê.criarEtiqueta).toHaveBeenLastCalledWith('p-1', { Name: 'urgente' }),
    )

    // A busca acha "pais" sem o acento, mas a palavra com acento e outra etiqueta: o
    // "Criar" continua oferecido. A seta para cima da a volta ate ele.
    fireEvent.change(campo, { target: { value: 'país' } })
    expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
      'pais',
      'Criar “país”',
    ])
    fireEvent.keyDown(campo, { key: 'ArrowUp' })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() =>
      expect(dublê.criarEtiqueta).toHaveBeenLastCalledWith('p-1', { Name: 'país' }),
    )
    expect(dublê.criarEtiqueta).toHaveBeenCalledTimes(3)
    await waitFor(() =>
      expect(dublê.etiquetasDoCard).toHaveBeenLastCalledWith('p-1', 'r-1', {
        LabelPublicIds: ['l-venda', 'l-urgente', 'l-país'],
      }),
    )
  })

  it('duas etiquetas em seguida entram as duas: a segunda espera e parte da resposta da primeira', async () => {
    let soltarCriacao: (etiqueta: ProjectLabelViewModel) => void = () => {}
    dublê.criarEtiqueta.mockImplementation(
      () =>
        new Promise<ProjectLabelViewModel>((resolve) => {
          soltarCriacao = resolve
        }),
    )
    ecoarEtiquetas()
    const aoMudar = montar(card())

    const campo = await screen.findByRole('combobox', { name: 'Adicionar etiqueta' })
    fireEvent.change(campo, { target: { value: 'novo1' } })
    fireEvent.click(screen.getByRole('option', { name: 'Criar “novo1”' }))
    // Escolhida enquanto a criacao ainda esta no ar.
    fireEvent.change(campo, { target: { value: 'cel' } })
    fireEvent.click(
      within(screen.getByRole('listbox', { name: 'Etiquetas para escolher' })).getByText('celular'),
    )

    await waitFor(() => expect(dublê.criarEtiqueta).toHaveBeenCalledTimes(1))
    expect(dublê.etiquetasDoCard).not.toHaveBeenCalled()

    soltarCriacao({ ...celular, PublicId: 'l-novo1', Name: 'novo1' })

    await waitFor(() => expect(dublê.etiquetasDoCard).toHaveBeenCalledTimes(2))
    expect(dublê.etiquetasDoCard).toHaveBeenNthCalledWith(1, 'p-1', 'r-1', {
      LabelPublicIds: ['l-novo1'],
    })
    expect(dublê.etiquetasDoCard).toHaveBeenNthCalledWith(2, 'p-1', 'r-1', {
      LabelPublicIds: ['l-novo1', 'l-cel'],
    })
    await waitFor(() => expect(aoMudar).toHaveBeenCalledTimes(2))
  })

  it('os campos nao se desligam enquanto salvam: o foco fica onde a pessoa estava', async () => {
    dublê.prioridade.mockImplementation(() => new Promise(() => {}))
    montar(card())

    await screen.findByRole('combobox', { name: 'Prioridade' })
    await escolherNoSelect(screen, fireEvent, 'Prioridade', 'Baixa')
    await waitFor(() => expect(dublê.prioridade).toHaveBeenCalled())

    expect(screen.getByRole('combobox', { name: 'Prioridade' }).hasAttribute('disabled')).toBe(
      false,
    )
    expect(screen.getByRole('combobox', { name: 'Responsável' }).hasAttribute('disabled')).toBe(
      false,
    )
    expect(
      screen.getByRole('combobox', { name: 'Adicionar etiqueta' }).hasAttribute('disabled'),
    ).toBe(false)
    expect(screen.getByLabelText('Prazo').hasAttribute('disabled')).toBe(false)
  })

  it('digitar no campo fechado abre a lista, e nao grava o primeiro nome com aquela letra', async () => {
    montar(card())
    const campo = screen.getByRole('combobox', { name: 'Responsável' })
    await waitFor(() => expect(campo.hasAttribute('disabled')).toBe(false))

    fireEvent.keyDown(campo, { key: 'A' })

    expect(await screen.findByRole('option', { name: 'Ana Dona' })).toBeTruthy()
    expect(dublê.responsavel).not.toHaveBeenCalled()
  })

  it('a lista do time que nao carrega deixa o responsavel na tela, so para leitura, e a tela avisa', async () => {
    dublê.membros.mockRejectedValue(new Error('sem rede'))
    montar(
      card({
        Assignee: { UserPublicId: 'u-ana', Name: 'Ana Dona', AvatarUrl: null, InTeam: true },
      }),
    )

    expect(await screen.findByText(/Não deu para carregar tudo o que se escolhe aqui/)).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Responsável' })).toBeNull()
    expect(screen.getByText('Ana Dona')).toBeTruthy()
    // As listas que chegaram continuam escolhendo.
    expect(await screen.findByRole('combobox', { name: 'Prioridade' })).toBeTruthy()
  })

  it('o nome que nao existe cria a etiqueta, e ela entra no card', async () => {
    dublê.criarEtiqueta.mockResolvedValue({
      PublicId: 'l-novo',
      Name: 'urgente-cliente',
      Color: 'Purple',
      CardCount: 0,
      CreatedAt: '',
    })
    dublê.etiquetasDoCard.mockResolvedValue(aberto(card()))
    montar(card())

    const campo = await screen.findByRole('combobox', { name: 'Adicionar etiqueta' })
    fireEvent.change(campo, { target: { value: 'urgente-cliente' } })
    fireEvent.click(screen.getByRole('option', { name: 'Criar “urgente-cliente”' }))

    await waitFor(() =>
      expect(dublê.criarEtiqueta).toHaveBeenCalledWith('p-1', { Name: 'urgente-cliente' }),
    )
    await waitFor(() =>
      expect(dublê.etiquetasDoCard).toHaveBeenCalledWith('p-1', 'r-1', {
        LabelPublicIds: ['l-novo'],
      }),
    )
  })

  it('prazo digitado e rascunho: so vira pedido ao sair do campo, com a data inteira', async () => {
    ecoarPrazo()
    montar(card({ DueDate: '2026-03-15' }))
    const campo = screen.getByLabelText('Prazo')

    // O dia "20" por cima do 15, e depois o ano digitado: o navegador devolve uma data
    // inteira a cada tecla — 02, 20, e o ano passando por 0002, 0020 e 0202.
    for (const passo of [
      '2026-03-02',
      '2026-03-20',
      '0002-03-20',
      '0020-03-20',
      '0202-03-20',
      '2026-03-20',
    ]) {
      fireEvent.keyDown(campo, { key: '2' })
      fireEvent.change(campo, { target: { value: passo } })
    }
    expect(dublê.prazo).not.toHaveBeenCalled()

    fireEvent.blur(campo)
    await waitFor(() =>
      expect(dublê.prazo).toHaveBeenCalledWith('p-1', 'r-1', { DueDate: '2026-03-20' }),
    )
    expect(dublê.prazo).toHaveBeenCalledTimes(1)
  })

  it('o prazo que outra pessoa mudou nao apaga o que esta sendo digitado; fora da digitacao, vale o novo', async () => {
    ecoarPrazo()
    const campos = (DueDate: string) => (
      <CardFields
        projectPublicId="p-1"
        reportPublicId="r-1"
        card={card({ DueDate })}
        aoMudar={vi.fn()}
      />
    )
    const { rerender } = render(campos('2026-03-15'))
    const campo = screen.getByLabelText('Prazo') as HTMLInputElement

    fireEvent.keyDown(campo, { key: '2' })
    fireEvent.change(campo, { target: { value: '2026-03-20' } })
    // Chega pelo tempo real o prazo que outra pessoa gravou.
    rerender(campos('2026-04-01'))
    expect(campo.value).toBe('2026-03-20')

    fireEvent.blur(campo)
    await waitFor(() =>
      expect(dublê.prazo).toHaveBeenCalledWith('p-1', 'r-1', { DueDate: '2026-03-20' }),
    )

    rerender(campos('2026-05-05'))
    expect(campo.value).toBe('2026-05-05')
  })

  it('so andar pelo campo, sem mudar a data, e sair nao grava por cima do prazo que outra pessoa pos', async () => {
    ecoarPrazo()
    const campos = (DueDate: string) => (
      <CardFields
        projectPublicId="p-1"
        reportPublicId="r-1"
        card={card({ DueDate })}
        aoMudar={vi.fn()}
      />
    )
    const { rerender } = render(campos('2026-03-15'))
    const campo = screen.getByLabelText('Prazo') as HTMLInputElement

    // As setas andam entre dia, mes e ano; nada muda.
    fireEvent.keyDown(campo, { key: 'ArrowRight' })
    fireEvent.keyDown(campo, { key: 'ArrowLeft' })
    rerender(campos('2026-04-01'))

    fireEvent.blur(campo)
    await waitFor(() => expect(campo.value).toBe('2026-04-01'))
    expect(dublê.prazo).not.toHaveBeenCalled()
  })

  it('prazo pela metade, ou fora de 2000 a 2100, nao vira pedido, e o campo volta ao que vale', () => {
    montar(card({ DueDate: '2026-03-15' }))
    const campo = screen.getByLabelText('Prazo') as HTMLInputElement

    // Apagar o dia deixa a data pela metade, que o campo devolve vazia.
    fireEvent.keyDown(campo, { key: 'Backspace' })
    fireEvent.change(campo, { target: { value: '' } })
    fireEvent.blur(campo)
    expect(campo.value).toBe('2026-03-15')

    fireEvent.keyDown(campo, { key: '9' })
    fireEvent.change(campo, { target: { value: '1999-03-15' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(campo.value).toBe('2026-03-15')

    expect(dublê.prazo).not.toHaveBeenCalled()
  })

  it('prazo escolhido no calendario grava na hora; Enter confirma o digitado; tirar manda nulo', async () => {
    ecoarPrazo()
    montar(card({ DueDate: '2026-10-16' }))
    const campo = screen.getByLabelText('Prazo')

    // Do calendario vem uma mudanca so, sem tecla nenhuma.
    fireEvent.change(campo, { target: { value: '2026-10-20' } })
    await waitFor(() =>
      expect(dublê.prazo).toHaveBeenCalledWith('p-1', 'r-1', { DueDate: '2026-10-20' }),
    )

    fireEvent.keyDown(campo, { key: '1' })
    fireEvent.change(campo, { target: { value: '2026-11-01' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    await waitFor(() =>
      expect(dublê.prazo).toHaveBeenLastCalledWith('p-1', 'r-1', { DueDate: '2026-11-01' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tirar prazo' }))
    await waitFor(() =>
      expect(dublê.prazo).toHaveBeenLastCalledWith('p-1', 'r-1', { DueDate: null }),
    )
    expect(dublê.prazo).toHaveBeenCalledTimes(3)
  })

  it('arquivado so le: nenhum campo de escolha, e os valores na tela', () => {
    montar(
      card({
        ArchivedAt: '2026-10-02T13:00:00.000Z',
        Assignee: { UserPublicId: 'u-ana', Name: 'Ana Dona', AvatarUrl: null, InTeam: true },
        Priority: { PublicId: 'p-baixa', Name: 'Baixa', Color: 'Blue', IsActive: true },
        DueDate: '2026-10-16',
      }),
    )

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Ana Dona')).toBeTruthy()
    expect(screen.getByText('Baixa')).toBeTruthy()
    // Sem fuso: o dia 16 continua sendo o dia 16.
    expect(screen.getByText(/16/)).toBeTruthy()
    expect(dublê.membros).not.toHaveBeenCalled()
  })

  it('o valor escolhido aparece na hora, com "Salvando…" embaixo, ate a resposta chegar', async () => {
    const prioridade = aEsperar<ReportDetailViewModel>()
    dublê.prioridade.mockReturnValue(prioridade.promessa)
    const aoMudar = montar(card())

    await screen.findByRole('combobox', { name: 'Prioridade' })
    await escolherNoSelect(screen, fireEvent, 'Prioridade', 'Baixa')
    const campo = screen.getByRole('combobox', { name: 'Prioridade' })
    expect(campo.textContent).toContain('Baixa')
    const salvando = screen.getByText('Salvando…')
    expect(campo.closest('dd')?.contains(salvando)).toBe(true)
    expect(aoMudar).not.toHaveBeenCalled()

    const resposta = aberto(
      card({ Priority: { PublicId: 'p-baixa', Name: 'Baixa', Color: 'Blue', IsActive: true } }),
    )
    await act(async () => prioridade.soltar(resposta))
    await waitFor(() => expect(screen.queryByText('Salvando…')).toBeNull())
    expect(aoMudar).toHaveBeenCalledWith(resposta)
  })

  it('a falha volta o campo ao que vale, e diz qual campo foi — embaixo dele e no aviso', async () => {
    dublê.responsavel.mockRejectedValue(
      new PanelError('Esta pessoa nao esta no time do projeto.', 400),
    )
    // Os avisos de testes anteriores ainda estao na loja: este comeca sem nenhum.
    useToastStore.setState({ toasts: [], hosts: [] })
    render(<Toaster />)
    const aoMudar = montar(card())

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Responsável' }).hasAttribute('disabled')).toBe(
        false,
      ),
    )
    await escolherNoSelect(screen, fireEvent, 'Responsável', 'Ana Dona')

    expect(await screen.findByText('Não deu para mudar o responsável. Tente de novo.')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Responsável' }).textContent).toContain('Ninguém')
    expect(screen.queryByText('Salvando…')).toBeNull()
    // O aviso diz o campo e o motivo da API.
    expect(screen.getByRole('alert').textContent).toMatch(
      /^Não deu para mudar o responsável\. Esta pessoa não está no time/,
    )
    expect(aoMudar).not.toHaveBeenCalled()
    useToastStore.setState({ toasts: [], hosts: [] })
  })

  it('o prazo e as etiquetas tambem dizem "Salvando…" enquanto gravam', async () => {
    const prazo = aEsperar<ReportDetailViewModel>()
    dublê.prazo.mockReturnValue(prazo.promessa)
    const etiquetas = aEsperar<ReportDetailViewModel>()
    dublê.etiquetasDoCard.mockReturnValue(etiquetas.promessa)
    montar(card({ DueDate: '2026-03-15' }))

    fireEvent.change(screen.getByLabelText('Prazo'), { target: { value: '2026-03-20' } })
    const noPrazo = screen.getByLabelText('Prazo').closest('dd') as HTMLElement
    expect(within(noPrazo).getByText('Salvando…')).toBeTruthy()

    const campo = await screen.findByRole('combobox', { name: 'Adicionar etiqueta' })
    fireEvent.change(campo, { target: { value: 'pag' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    const nasEtiquetas = campo.closest('dd') as HTMLElement
    expect(within(nasEtiquetas).getByText('Salvando…')).toBeTruthy()

    await act(async () => prazo.soltar(aberto(card({ DueDate: '2026-03-20' }))))
    await waitFor(() => expect(within(noPrazo).queryByText('Salvando…')).toBeNull())
    await act(async () => etiquetas.soltar(aberto(card({ Labels: [noCard('l-pag')] }))))
    await waitFor(() => expect(screen.queryByText('Salvando…')).toBeNull())
  })

  it('a lista que nao carregou tenta de novo ali mesmo: o campo volta a escolher', async () => {
    dublê.membros.mockRejectedValueOnce(new Error('sem rede'))
    montar(card())

    expect(await screen.findByText(/Não deu para carregar tudo o que se escolhe aqui/)).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Responsável' })).toBeNull()
    expect(screen.queryByText(/Feche e abra o card/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('combobox', { name: 'Responsável' })).toBeTruthy()
    await waitFor(() =>
      expect(screen.queryByText(/Não deu para carregar tudo o que se escolhe aqui/)).toBeNull(),
    )
    expect(dublê.membros).toHaveBeenCalledTimes(2)
  })

  it('o prazo vem por extenso embaixo do campo, com o destaque da lista: vencido e de hoje', () => {
    montar(card({ DueDate: '2026-10-15' }))
    // Por extenso: o campo segue o idioma do navegador, e em ingles mostrava mes/dia.
    expect(screen.getByText('15 de out. de 2026')).toBeTruthy()
    cleanup()

    montar(card({ DueDate: dia(-2) }))
    const vencido = screen.getByText('venceu há 2 dias')
    expect(vencido.className).toContain('text-chip-red-fg')
    cleanup()

    montar(card({ DueDate: dia(0) }))
    expect(screen.getByText('vence hoje').className).toContain('text-chip-yellow-fg')
    cleanup()

    // Longe, so a data; o card que terminou nao tem prazo a cumprir.
    montar(card({ DueDate: dia(10) }))
    expect(screen.queryByText(/vence|venceu/)).toBeNull()
    cleanup()
    montar(card({ DueDate: dia(-2), Finished: true }))
    expect(screen.queryByText(/vence|venceu/)).toBeNull()
  })

  it('o "perto" segue a regra do projeto', () => {
    render(
      <CardFields
        projectPublicId="p-1"
        reportPublicId="r-1"
        card={card({ DueDate: dia(5) })}
        aoMudar={vi.fn()}
        soonDays={7}
      />,
    )
    expect(screen.getByText('vence em 5 dias')).toBeTruthy()
  })

  it('arquivado, as marcas continuam: quem saiu do time e a prioridade desativada', () => {
    montar(
      card({
        ArchivedAt: '2026-10-02T13:00:00.000Z',
        Assignee: { UserPublicId: 'u-bruno', Name: 'Bruno', AvatarUrl: null, InTeam: false },
        Priority: { PublicId: 'p-alta', Name: 'Alta', Color: 'Orange', IsActive: false },
      }),
    )

    expect(screen.getByText('Bruno (saiu do time)')).toBeTruthy()
    expect(screen.getByText('Alta (desativada)')).toBeTruthy()
  })
})

describe('o titulo do relato', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
  })

  it('reescrever grava o titulo do time; o de quem relatou aparece embaixo, e um clique volta a ele', async () => {
    const reescrito = card({
      Title: 'Pagamento recusado no celular',
      ReporterTitle: 'O botão travou',
    })
    dublê.titulo.mockResolvedValue(aberto(reescrito))
    const aoMudar = vi.fn()
    const { rerender } = render(
      <ReportTitle
        projectPublicId="p-1"
        reportPublicId="r-1"
        card={card({ ReporterTitle: 'O botão travou' })}
        aoMudar={aoMudar}
      />,
    )

    expect(screen.getByRole('heading', { name: 'O botão travou' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reescrever' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Título do time' }), {
      target: { value: 'Pagamento recusado no celular' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(dublê.titulo).toHaveBeenCalledWith('p-1', 'r-1', {
        Title: 'Pagamento recusado no celular',
      }),
    )

    rerender(
      <ReportTitle projectPublicId="p-1" reportPublicId="r-1" card={reescrito} aoMudar={aoMudar} />,
    )
    expect(screen.getByRole('heading', { name: 'Pagamento recusado no celular' })).toBeTruthy()
    expect(screen.getByText('Quem relatou escreveu: “O botão travou”')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao de quem relatou' }))
    await waitFor(() =>
      expect(dublê.titulo).toHaveBeenLastCalledWith('p-1', 'r-1', { Title: null }),
    )
  })

  it('sem titulo nenhum, a manchete e o comeco do texto de quem relatou, entre aspas, e oferece dar um', () => {
    render(
      <ReportTitle projectPublicId="p-1" reportPublicId="r-1" card={card()} aoMudar={vi.fn()} />,
    )

    // Antes era "Sem titulo": o olho caia num rotulo vazio, e nao no problema.
    expect(screen.getByRole('heading', { name: '“O botao de pagar nao responde.”' })).toBeTruthy()
    expect(screen.queryByText('Sem título')).toBeNull()
    expect(screen.getByRole('button', { name: 'Dar um título' })).toBeTruthy()
  })

  it('o texto curto e numa linha so ja esta na manchete; cortado, com quebra ou com titulo, vem embaixo', () => {
    expect(textInHeadline(card())).toBe(true)
    expect(textInHeadline(card({ Text: 'O botao\nde pagar' }))).toBe(false)
    expect(textInHeadline(card({ Text: 'palavra '.repeat(40) }))).toBe(false)
    expect(textInHeadline(card({ ReporterTitle: 'O botão travou' }))).toBe(false)
    expect(textInHeadline(card({ Title: 'Pagamento recusado' }))).toBe(false)
  })
})

describe('a historia dos campos', () => {
  afterEach(cleanup)

  it('cada mudanca de campo vira uma frase com o que mudou', async () => {
    let contador = 0
    const linha = (extra: Partial<ReportHistoryEntryViewModel>): ReportHistoryEntryViewModel => ({
      PublicId: `e-${++contador}`,
      Type: 'CardTitleChanged',
      AuthorName: 'Ana Dona',
      FromStateName: null,
      ToStateName: null,
      OccurredAt: '2026-10-02T12:00:00.000Z',
      From: null,
      To: null,
      Added: [],
      Removed: [],
      TitleRestored: null,
      ...extra,
    })
    dublê.historico.mockResolvedValue([
      linha({ Type: 'CardTitleChanged', TitleRestored: false }),
      linha({ Type: 'CardTitleChanged', TitleRestored: true }),
      linha({ Type: 'CardAssigneeChanged', From: null, To: 'Bruno Membro' }),
      linha({ Type: 'CardAssigneeChanged', From: 'Bruno Membro', To: null }),
      // Alguem sem nome nem e-mail continua sendo alguem.
      linha({ Type: 'CardAssigneeChanged', From: null, To: '' }),
      linha({ Type: 'CardPriorityChanged', To: 'Alta' }),
      linha({ Type: 'CardLabelsChanged', Added: ['pagamento'], Removed: ['celular'] }),
      linha({ Type: 'CardDueDateChanged', To: '2026-10-16' }),
      linha({ Type: 'CardDueDateChanged', To: null }),
    ])

    render(<ReportHistory projectPublicId="p-1" reportPublicId="r-1" versao={0} />)

    for (const frase of [
      'Reescreveu o título',
      'Tirou o título do time',
      'Passou para Bruno Membro',
      'Ficou sem responsável',
      'Passou para alguém sem nome',
      'Prioridade: Alta',
      'Etiquetas: + pagamento, − celular',
      'Ficou sem prazo',
    ]) {
      expect(await screen.findByText(frase)).toBeTruthy()
    }
    // A data sem hora nao passa por fuso: e o dia 16, e nao o 15.
    expect(screen.getByText(/Prazo: 16/)).toBeTruthy()
  })
})
