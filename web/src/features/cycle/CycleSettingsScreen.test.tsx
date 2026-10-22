// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CycleSettingsViewModel, ProjectViewModel } from '@/contracts'
import { CycleSettingsScreen } from '@/features/cycle/CycleSettingsScreen'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A tela salva todas as regras, e nao so as que mostra.** A regra sem controle
 * na tela continua no banco; uma tela que mandasse so os campos visiveis
 * apagaria as outras no primeiro salvamento — e ninguem descobriria, porque a
 * resposta viria com os padroes de volta e pareceria certa. E o erro mais caro
 * possivel aqui, e o mais facil de cometer.
 *
 * **Projeto sem configuracao salva nao e projeto sem configuracao.** A API
 * responde com os padroes, e a tela desenha aquilo como escolha corrente — sem
 * nenhum estado de "vazio" que sugira que nada esta valendo.
 *
 * **O botao so age quando ha o que salvar.** Salvar o que ja esta salvo gravaria
 * uma linha nova de auditoria por clique e nao mudaria nada. Hoje o Salvar mora no
 * titulo, preso no topo ao rolar: sem mudanca ele fica desligado, com "Tudo salvo" ao
 * lado, e Descartar volta ao que esta salvo.
 *
 * **As regras do quadro e as sprints sairam desta tela** (para Colunas e Sprints),
 * mas continuam no mesmo registro: o salvar daqui as devolve como vieram.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<CycleSettingsViewModel>>(),
  salvar: vi.fn(),
  colunas: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectCycleSettingsService: {
      getCycleSettings: dublê.ler,
      saveCycleSettings: dublê.salvar,
    },
    // A tela busca as colunas para o destino da reabertura. Sem esta resposta ela
    // cairia no caminho de falha daquele campo, e os testes passariam olhando uma
    // tela meio quebrada.
    projectStateService: { listProjectStates: dublê.colunas },
  }
})

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-08-01T12:00:00.000Z',
  UpdatedAt: '2026-08-01T12:00:00.000Z',
  Account: { PublicId: 'conta-1', Name: 'Conta de teste' },
  Role: 'Administrator',
  IsAccountOwner: true,
  LastReportReceivedAt: null,
  LastActivityAt: null,
}

/** Os padroes de fabrica, que e o que a API responde para quem nunca salvou nada. */
const padroes: CycleSettingsViewModel = {
  ClosureTrigger: 'LastColumn',
  PublicDelayMinutes: 0,
  AllowsReopen: true,
  ReopenStatePublicId: null,
  ReopenRequiresComment: true,
  TrackingCodeCanAct: false,
  SatisfactionEnabled: true,
  SatisfactionStyle: 'Stars',
  SatisfactionRequired: false,
  InfoRequestEnabled: true,
  InfoRequestWarnDays: 7,
  InfoRequestCloseDays: 7,
  AcceptsQuestionsDefault: true,
  AllowsReportArchiving: false,
  LastColumnVisibleDays: 14,
  DueSoonDays: 2,
  SprintsEnabled: false,
  SprintLengthWeeks: 2,
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ project: projeto }} />,
        children: [{ index: true, element: <CycleSettingsScreen /> }],
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
}

// A caixa de escolha do produto desenha a propria lista, e o jsdom nao tem o que
// ela usa para abrir. Sem isto o teste falharia pelo ambiente, nao pelo codigo.
instalarRemendosDoRadix()

/** O resumo do grupo fechado: o `<summary>` tem o titulo, o valor e o "Mudou". */
const resumo = (id: string) => document.getElementById(id)?.textContent ?? ''

/** O grupo inteiro em volta do `<summary>`, com o "Voltar ao padrão" dele. */
const grupo = (id: string) => document.getElementById(id)?.closest('section') as HTMLElement

/** O Salvar mora no titulo, sempre a vista: liga so com o que salvar. */
const salvarLigado = () =>
  !(screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled

describe('CycleSettingsScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.ler.mockResolvedValue(padroes)
    dublê.colunas.mockResolvedValue([
      { PublicId: 's-1', Name: 'Análise', Position: 0, IsActive: true },
      { PublicId: 's-2', Name: 'Reaberto', Position: 1, IsActive: true },
      { PublicId: 's-3', Name: 'Arquivo', Position: 2, IsActive: false },
    ])
  })

  it('desenha o padrão como escolha corrente, e não como ausência de escolha', async () => {
    montar()

    const porColuna = await screen.findByRole('radio', { name: /Ao cair na última coluna/ })
    expect((porColuna as HTMLInputElement).checked).toBe(true)
    expect(
      (screen.getByRole('radio', { name: /Por um botão de concluir/ }) as HTMLInputElement).checked,
    ).toBe(false)
  })

  it('sem mudança, o botão de salvar não age', async () => {
    montar()
    await screen.findByRole('radio', { name: /Ao cair na última coluna/ })

    // Fica a vista, desligado: um Salvar aceso convidava a clicar sem nada para salvar.
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect(salvarLigado()).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('mudar liga o Salvar com a conta, e descartar volta ao que está salvo sem gravar', async () => {
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Por um botão de concluir/ }))
    expect(screen.getByText('1 mudança não salva')).toBeTruthy()
    expect(salvarLigado()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(
      (screen.getByRole('radio', { name: /Ao cair na última coluna/ }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect(salvarLigado()).toBe(false)
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('salvar manda todas as regras, e não só a que mudou', async () => {
    dublê.salvar.mockResolvedValue({ ...padroes, ClosureTrigger: 'Button' })

    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Por um botão de concluir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    // **O ponto do teste.** Mandar so `ClosureTrigger` faria a API — que
    // substitui, e nao mescla — reescrever as outras com o que viesse do
    // corpo, e o prazo que alguem configurou voltaria ao padrao sem aviso.
    await waitFor(() =>
      expect(dublê.salvar).toHaveBeenCalledWith('p-1', { ...padroes, ClosureTrigger: 'Button' }),
    )
  })

  it('depois de salvar, não sobra mudança por publicar', async () => {
    dublê.salvar.mockResolvedValue({ ...padroes, ClosureTrigger: 'Button' })

    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Por um botão de concluir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    // A base do "ha mudanca" passa a ser o que foi gravado, e nao a leitura
    // inicial: sem isso o Salvar continuaria ligado depois de salvar, e o segundo
    // clique gravaria de novo o que ja estava la.
    await waitFor(() => expect(salvarLigado()).toBe(false))
    expect(dublê.salvar).toHaveBeenCalledTimes(1)
  })

  it('a espera zero diz que é o comportamento de hoje', async () => {
    montar()

    const espera = await screen.findByLabelText('Esperar antes de mostrar')
    expect((espera as HTMLInputElement).value).toBe('0')
    expect(screen.getByText(/vê o movimento na hora/)).toBeTruthy()
  })

  it('e acima de zero avisa que depende da fila', async () => {
    montar()

    fireEvent.change(await screen.findByLabelText('Esperar antes de mostrar'), {
      target: { value: '30' },
    })

    // A API recusa quando nao ha fila, e a tela precisa ter dito isso antes —
    // senao a recusa chega como surpresa depois de a pessoa configurar.
    expect(screen.getByText(/Depende de uma fila configurada/)).toBeTruthy()
  })

  it('apagar o campo vira zero, e não quebra a conta do que mudou', async () => {
    montar()

    const espera = await screen.findByLabelText('Esperar antes de mostrar')
    fireEvent.change(espera, { target: { value: '15' } })
    fireEvent.change(espera, { target: { value: '' } })

    // `NaN` no rascunho faria a comparacao com o publicado dizer "ha mudanca"
    // para sempre, e o Salvar nunca mais desligaria.
    expect((espera as HTMLInputElement).value).toBe('0')
    expect(salvarLigado()).toBe(false)
  })

  it('a espera viaja junto das outras regras', async () => {
    dublê.salvar.mockResolvedValue({ ...padroes, PublicDelayMinutes: 30 })

    montar()

    fireEvent.change(await screen.findByLabelText('Esperar antes de mostrar'), {
      target: { value: '30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(dublê.salvar).toHaveBeenCalledWith('p-1', { ...padroes, PublicDelayMinutes: 30 }),
    )
  })

  it('desligar a reabertura esconde o que só existe dentro dela', async () => {
    montar()

    // Ligada por padrao: os dois campos dependentes estao na tela.
    expect(
      await screen.findByRole('combobox', { name: 'O relato reaberto volta para' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: /Deixar quem relatou reabrir/ }))

    // **Desligada, eles somem em vez de ficarem cinzas.** Um campo desabilitado
    // ainda diz "isto vale para voce"; aqui nao vale nada, porque a pessoa nem
    // consegue reabrir.
    expect(screen.queryByRole('combobox', { name: 'O relato reaberto volta para' })).toBeNull()
    expect(
      screen.queryByRole('checkbox', { name: /conte o que ainda está acontecendo/i }),
    ).toBeNull()
  })

  it('a coluna aposentada não é oferecida como destino da reabertura', async () => {
    montar()

    const destino = await screen.findByRole('combobox', { name: 'O relato reaberto volta para' })
    fireEvent.pointerDown(destino, { button: 0, ctrlKey: false, pointerType: 'mouse' })

    expect(screen.getByRole('option', { name: 'Reaberto' })).toBeTruthy()
    // Mandar o relato reaberto para uma coluna que ninguem olha seria perde-lo de
    // novo — que e o que a reabertura existe para evitar.
    expect(screen.queryByRole('option', { name: 'Arquivo' })).toBeNull()
  })

  it('as regras novas viajam junto das que já existiam', async () => {
    dublê.salvar.mockResolvedValue({ ...padroes, SatisfactionRequired: true })

    montar()

    fireEvent.click(
      await screen.findByRole('checkbox', { name: /Exigir a resposta para confirmar/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
        ...padroes,
        SatisfactionRequired: true,
      }),
    )
  })

  it('as regras do quadro e as sprints moram noutras telas, e o salvar daqui as devolve como vieram', async () => {
    // Fora do padrao de proposito: se a tela mandasse o padrao no lugar do que leu,
    // o teste veria.
    const lido = {
      ...padroes,
      LastColumnVisibleDays: 0,
      DueSoonDays: 5,
      SprintsEnabled: true,
      SprintLengthWeeks: 3,
    }
    dublê.ler.mockResolvedValue(lido)
    dublê.salvar.mockResolvedValue({ ...lido, ClosureTrigger: 'Button' })

    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Por um botão de concluir/ }))
    // Os controles delas nao estao aqui (zero-quer-dizer-alguma-coisa e testado em
    // Colunas; ligar as sprints, em Sprints).
    expect(screen.queryByLabelText(/A última coluna mostra o que entrou nela/)).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /Trabalhar em sprints/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(dublê.salvar).toHaveBeenCalledWith('p-1', { ...lido, ClosureTrigger: 'Button' }),
    )
  })

  it('cada grupo, fechado, diz o que está escolhido em palavras', async () => {
    montar()
    await screen.findByRole('radio', { name: /Ao cair na última coluna/ })

    expect(resumo('encerramento')).toContain('Na última coluna')
    expect(resumo('grupo-reabertura')).toContain('Pode · volta para a primeira coluna')
    expect(resumo('grupo-pedido-de-informacao')).toContain('7 + 7 dias')
    expect(resumo('grupo-espera')).toContain('Na hora')
    expect(resumo('grupo-nota')).toContain('Estrelas · opcional')
    expect(resumo('grupo-arquivar')).toContain('Não permitido')
    // No padrao, nenhum grupo diz "Mudou": seria ruido em todos.
    expect(document.body.textContent).not.toContain('Mudou:')
    // O "Mais opções" acabou: a espera, a nota e o arquivar tem grupo proprio.
    expect(screen.queryByText('Mais opções')).toBeNull()
  })

  it('o resumo acompanha o rascunho, com o nome da coluna da reabertura', async () => {
    dublê.ler.mockResolvedValue({
      ...padroes,
      ClosureTrigger: 'Button',
      ReopenStatePublicId: 's-2',
      InfoRequestCloseDays: 21,
      PublicDelayMinutes: 30,
      SatisfactionRequired: true,
      AllowsReportArchiving: true,
    })
    montar()

    await waitFor(() => expect(resumo('grupo-reabertura')).toContain('Pode · volta para Reaberto'))
    expect(resumo('encerramento')).toContain('Por um botão')
    expect(resumo('grupo-pedido-de-informacao')).toContain('7 + 21 dias')
    expect(resumo('grupo-espera')).toContain('Espera 30 minutos')
    expect(resumo('grupo-nota')).toContain('Estrelas · obrigatória')
    expect(resumo('grupo-arquivar')).toContain('Permitido')

    fireEvent.click(screen.getByRole('checkbox', { name: /Deixar quem relatou reabrir/ }))
    expect(resumo('grupo-reabertura')).toContain('Não pode')
  })

  it('"Voltar ao padrão" de um grupo volta só os campos dele, e o salvar manda o registro inteiro', async () => {
    // Fora do padrao em tres grupos, e nas regras de Sprints e Colunas: o rascunho e o
    // mesmo, e o "Voltar ao padrão" daqui nao pode encostar nelas.
    const lido = {
      ...padroes,
      PublicDelayMinutes: 10,
      AllowsReportArchiving: true,
      AllowsReopen: false,
      LastColumnVisibleDays: 0,
      SprintsEnabled: true,
    }
    dublê.ler.mockResolvedValue(lido)
    dublê.salvar.mockResolvedValue({ ...lido, PublicDelayMinutes: 0 })
    montar()

    await screen.findByRole('radio', { name: /Ao cair na última coluna/ })
    expect(resumo('grupo-espera')).toContain('Mudou: Espera antes de mostrar')
    expect(resumo('grupo-arquivar')).toContain('Mudou: Arquivar relato')
    expect(resumo('grupo-reabertura')).toContain('Mudou: Deixar reabrir')
    expect(resumo('encerramento')).not.toContain('Mudou')

    fireEvent.click(within(grupo('grupo-espera')).getByRole('button', { name: 'Voltar ao padrão' }))

    expect((document.getElementById('espera') as HTMLInputElement).value).toBe('0')
    expect(resumo('grupo-espera')).not.toContain('Mudou')
    // Os outros grupos continuam como estavam.
    expect(resumo('grupo-arquivar')).toContain('Mudou: Arquivar relato')
    expect(
      (screen.getByRole('checkbox', { name: /Deixar quem relatou reabrir/ }) as HTMLInputElement)
        .checked,
    ).toBe(false)
    // Fica no rascunho: e o Salvar do titulo que grava.
    expect(dublê.salvar).not.toHaveBeenCalled()
    expect(salvarLigado()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(dublê.salvar).toHaveBeenCalledWith('p-1', { ...lido, PublicDelayMinutes: 0 }),
    )
  })

  it('o caminho do relato sai do rascunho, e não do salvo', async () => {
    dublê.ler.mockResolvedValue({ ...padroes, ReopenStatePublicId: 's-2' })
    montar()

    const caminho = await screen.findByRole('region', { name: 'Caminho do relato' })
    await waitFor(() => expect(caminho.textContent).toContain('e volta para Reaberto'))
    expect(caminho.textContent).toContain('Ao mover para a última coluna')
    expect(caminho.textContent).toContain('Quem relatou vê na hora')
    expect(caminho.textContent).toContain('Confirma e dá uma nota em estrelas, se quiser.')
    expect(caminho.textContent).toContain('Aviso em 7 dias')
    expect(caminho.textContent).toContain('Encerra 7 dias depois')
    expect(caminho.textContent).toContain('igual ao salvo')

    fireEvent.click(screen.getByRole('radio', { name: /Por um botão de concluir/ }))
    fireEvent.change(screen.getByLabelText('Esperar antes de mostrar'), {
      target: { value: '30' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Deixar quem relatou reabrir/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Pedir uma nota ao confirmar/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Deixar o time devolver o relato/ }))

    expect(caminho.textContent).toContain('Pelo botão de concluir')
    expect(caminho.textContent).toContain('Espera 30 minutos')
    expect(caminho.textContent).toContain('Não pode reabrir: o relato fica encerrado.')
    expect(caminho.textContent).toContain('Confirma, sem nota.')
    expect(caminho.textContent).toContain('Desligado: o time não devolve relato')
    expect(caminho.textContent).toContain('ainda não salvo')
    // E texto em lista, e nao so desenho: o leitor de tela le os passos em ordem.
    expect(within(caminho).getAllByRole('listitem').length).toBeGreaterThan(3)
  })

  it('o grupo em foco contorna, no caminho, a parte que ele muda', async () => {
    montar()

    const reabrir = await screen.findByRole('checkbox', { name: /Deixar quem relatou reabrir/ })
    act(() => reabrir.focus())

    const caminho = screen.getByRole('region', { name: 'Caminho do relato' })
    const contornados = caminho.querySelectorAll('[data-highlighted]')
    expect(contornados).toHaveLength(1)
    expect(contornados[0]?.textContent).toContain('Não resolveu')

    act(() => (screen.getByLabelText('Esperar antes de mostrar') as HTMLInputElement).focus())
    expect(caminho.querySelector('[data-highlighted]')?.textContent).toContain('Quem relatou vê')
  })

  it('sem as colunas, o "volta para" diz por que e oferece tentar de novo', async () => {
    dublê.ler.mockResolvedValue({ ...padroes, ReopenStatePublicId: 's-2' })
    dublê.colunas.mockRejectedValueOnce(new Error('rede'))
    montar()

    expect(await screen.findByText(/Não deu para carregar as colunas/)).toBeTruthy()
    const destino = screen.getByRole('combobox', { name: 'O relato reaberto volta para' })
    // A escolha salva continua com nome, e a caixa nao deixa trocar o que nao se ve.
    expect(destino.textContent).toContain('A coluna já escolhida')
    expect((destino as HTMLButtonElement).disabled).toBe(true)
    // O resto da tela segue configuravel.
    expect(screen.getByRole('checkbox', { name: /Pedir uma nota ao confirmar/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    await waitFor(() => expect(destino.textContent).toContain('Reaberto'))
    expect(dublê.colunas).toHaveBeenCalledTimes(2)
    expect(screen.queryByText(/Não deu para carregar as colunas/)).toBeNull()
  })

  it('as âncoras da busca continuam na tela, e a antiga do "Mais opções" cai na espera', async () => {
    montar()
    await screen.findByRole('radio', { name: /Ao cair na última coluna/ })

    for (const id of [
      'encerramento',
      'espera',
      'reabrir',
      'contar-ao-reabrir',
      'nota',
      'pedir-informacao',
      'aviso',
      'encerrar',
      'arquivar-relato',
    ]) {
      expect(document.getElementById(id), id).toBeTruthy()
    }
    expect(
      document.getElementById('mais-opcoes')?.contains(document.getElementById('espera')),
    ).toBe(true)
  })

  it('o total dos dois prazos aparece somado, porque é ele que importa', async () => {
    montar()

    // Sete e sete sao dois numeros; catorze dias e a coisa que alguem precisa
    // decidir. Fazer a conta de cabeca e onde o engano mora.
    expect(await screen.findByText(/No total, 14 dias/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('E encerrar mais'), { target: { value: '21' } })
    expect(screen.getByText(/No total, 28 dias/)).toBeTruthy()
  })

  it('apagar um prazo vira 1, e não zero: zero não é prazo', async () => {
    montar()

    const aviso = await screen.findByLabelText('Avisar depois de')
    fireEvent.change(aviso, { target: { value: '' } })

    // Zero encerraria o relato no mesmo instante em que a pergunta saiu.
    expect((aviso as HTMLInputElement).value).toBe('1')
  })

  it('desligar o pedido de informação esconde os prazos', async () => {
    montar()

    expect(await screen.findByLabelText('Avisar depois de')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /Deixar o time devolver o relato/ }))

    expect(screen.queryByLabelText('Avisar depois de')).toBeNull()
  })

  it('falha ao carregar não some com a tela, e oferece tentar de novo', async () => {
    dublê.ler.mockRejectedValue(new Error('rede'))

    montar()

    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    // Nada mudou: a falha foi ao consultar, e o projeto continua se comportando
    // como estava. A frase precisa dizer isso, senao a pessoa reconfigura no medo.
    expect(screen.getByText(/continua se comportando como estava/)).toBeTruthy()
  })

  // **A regra do codigo sozinho esta escondida**, e nao removida: confirmar,
  // reabrir e responder so aceitam o token do link, e marcada ela mostrava botoes
  // que a API recusava. Os dois testes pulados abaixo voltam junto com ela.
  it('a regra do código sozinho fica fora da tela enquanto as ações não aceitam o código', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Deixar quem relatou reabrir/ })
    expect(
      screen.queryByRole('checkbox', { name: /O código sozinho também confirma e reabre/ }),
    ).toBeNull()
    expect(screen.queryByText('Quem chega sem o link')).toBeNull()
  })

  it('escondida, o valor salvo dela segue intacto quando outra regra é salva', async () => {
    dublê.ler.mockResolvedValue({ ...padroes, TrackingCodeCanAct: true })
    dublê.salvar.mockResolvedValue({ ...padroes, TrackingCodeCanAct: true, AllowsReopen: false })
    montar()

    fireEvent.click(await screen.findByRole('checkbox', { name: /Deixar quem relatou reabrir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    expect(dublê.salvar.mock.calls[0]?.[1]).toMatchObject({ TrackingCodeCanAct: true })
  })

  it.skip('a regra do código sozinho tem controle, e diz de que modo ela depende', async () => {
    montar()

    const marcador = await screen.findByRole('checkbox', {
      name: /O código sozinho também confirma e reabre/,
    })
    expect((marcador as HTMLInputElement).checked).toBe(false)

    // Sem esta frase, alguem marca esperando um efeito que so existe num modo que
    // ele talvez nao tenha escolhido — e a configuracao vira promessa quebrada.
    expect(screen.getByText(/Só tem efeito quando o projeto usa código pessoal/i)).toBeTruthy()
  })

  it.skip('marcar a regra do código entra no que é salvo', async () => {
    dublê.salvar.mockResolvedValue({ ...padroes, TrackingCodeCanAct: true })
    montar()

    fireEvent.click(
      await screen.findByRole('checkbox', { name: /O código sozinho também confirma e reabre/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    expect(dublê.salvar.mock.calls[0]?.[1]).toMatchObject({ TrackingCodeCanAct: true })
  })
})
