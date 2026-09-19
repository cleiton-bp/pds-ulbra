// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CycleSettingsViewModel, ProjectViewModel } from '@/contracts'
import { CycleSettingsScreen } from '@/features/cycle/CycleSettingsScreen'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A tela mostra um campo e salva treze.** As outras doze regras ja existem no
 * banco e ainda nao tem controle na tela; uma tela que mandasse so o campo visivel
 * apagaria as outras no primeiro salvamento — e ninguem descobriria, porque a
 * resposta viria com os padroes de volta e pareceria certa. E o erro mais caro
 * possivel aqui, e o mais facil de cometer.
 *
 * **Projeto sem configuracao salva nao e projeto sem configuracao.** A API
 * responde com os padroes, e a tela desenha aquilo como escolha corrente — sem
 * nenhum estado de "vazio" que sugira que nada esta valendo.
 *
 * **O botao so age quando ha o que salvar.** Salvar o que ja esta salvo gravaria
 * uma linha nova de auditoria por clique e nao mudaria nada.
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

    const salvar = screen.getByRole('button', { name: 'Salvar' })
    expect(salvar.hasAttribute('disabled')).toBe(true)

    fireEvent.click(salvar)
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('salvar manda as treze regras, e não só a que mudou', async () => {
    dublê.salvar.mockResolvedValue({ ...padroes, ClosureTrigger: 'Button' })

    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Por um botão de concluir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    // **O ponto do teste.** Mandar só `ClosureTrigger` faria a API — que
    // substitui, e não mescla — reescrever as outras doze com o que viesse do
    // corpo, e o prazo que alguém configurou voltaria ao padrão sem aviso.
    await waitFor(() =>
      expect(dublê.salvar).toHaveBeenCalledWith('p-1', { ...padroes, ClosureTrigger: 'Button' }),
    )
  })

  it('depois de salvar, não sobra mudança por publicar', async () => {
    dublê.salvar.mockResolvedValue({ ...padroes, ClosureTrigger: 'Button' })

    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Por um botão de concluir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    // A base do "há mudança" passa a ser o que foi gravado, e não a leitura
    // inicial: sem isso o botão continuaria aceso depois de salvar, e o segundo
    // clique gravaria de novo o que já estava lá.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Salvar' }).hasAttribute('disabled')).toBe(true),
    )
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

    // A API recusa quando não há fila, e a tela precisa ter dito isso antes —
    // senão a recusa chega como surpresa depois de a pessoa configurar.
    expect(screen.getByText(/Depende de uma fila configurada/)).toBeTruthy()
  })

  it('apagar o campo vira zero, e não quebra a conta do que mudou', async () => {
    montar()

    const espera = await screen.findByLabelText('Esperar antes de mostrar')
    fireEvent.change(espera, { target: { value: '15' } })
    fireEvent.change(espera, { target: { value: '' } })

    // `NaN` no rascunho faria a comparação com o publicado dizer "há mudança"
    // para sempre, e o botão nunca mais apagaria.
    expect((espera as HTMLInputElement).value).toBe('0')
    expect(screen.getByRole('button', { name: 'Salvar' }).hasAttribute('disabled')).toBe(true)
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

    // Ligada por padrão: os dois campos dependentes estão na tela.
    expect(
      await screen.findByRole('combobox', { name: 'O relato reaberto volta para' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: /Deixar quem relatou reabrir/ }))

    // **Desligada, eles somem em vez de ficarem cinzas.** Um campo desabilitado
    // ainda diz "isto vale para você"; aqui não vale nada, porque a pessoa nem
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
    // Mandar o relato reaberto para uma coluna que ninguém olha seria perdê-lo de
    // novo — que é o que a reabertura existe para evitar.
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

  it('o total dos dois prazos aparece somado, porque é ele que importa', async () => {
    montar()

    // Sete e sete são dois números; catorze dias é a coisa que alguém precisa
    // decidir. Fazer a conta de cabeça é onde o engano mora.
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
    // como estava. A frase precisa dizer isso, senão a pessoa reconfigura no medo.
    expect(screen.getByText(/continua se comportando como estava/)).toBeTruthy()
  })
})
