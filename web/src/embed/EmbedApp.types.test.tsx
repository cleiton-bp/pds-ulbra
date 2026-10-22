// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CreateReportRequest,
  WidgetReportTypeViewModel,
  WidgetSettingsViewModel,
} from '@/contracts'
import { EmbedApp } from '@/embed/EmbedApp'
import { resolveWidgetSettings } from '@/embed/resolveSettings'
import { DEFAULT_WIDGET_SETTINGS, FALLBACK_REPORT_TYPES } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM: o formulario e o do tipo escolhido.
 *
 * - **As perguntas sao as do tipo**, na ordem dele, e trocar de tipo troca os campos.
 *   O tipo sem caixa livre nao a mostra — nem quando guarda o texto dela para depois.
 * - **Pelo menos uma resposta** libera o envio. O titulo nao conta: ele e a manchete,
 *   e nao o relato.
 * - **O envio leva as perguntas que a pessoa leu** (`Questions`) e uma resposta para
 *   cada, na mesma ordem, a pulada em branco. E com elas que a API confere que nada
 *   mudou desde a abertura; sem elas, a resposta poderia cair embaixo de outra pergunta.
 * - **Sem os tipos do projeto, os de fabrica**: a leitura que falha desenha os tipos de
 *   `FALLBACK_REPORT_TYPES`, que precisam ser os mesmos de `ReportTypeDefaults.cs`, e
 *   o envio procura o tipo de verdade antes de sair.
 */
const dublê = vi.hoisted(() => ({ criar: vi.fn(), ler: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return {
    ...real,
    reportService: { createReport: dublê.criar, listByReporterCode: vi.fn() },
    widgetSettingsService: { loadWidgetSettings: dublê.ler },
  }
})

const config = {
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
  viewport: '1280x800',
}
const pagina = {
  init: null,
  show: vi.fn(),
  expand: vi.fn(),
  collapse: vi.fn(),
  enlarge: vi.fn(),
  place: vi.fn(),
  canCapture: false,
  capture: vi.fn(),
  stop: vi.fn(),
}

const criado = {
  TrackingCode: 'ABCD-EFGH-IJKL',
  AccessToken: 'token-secreto',
  CreatedAt: '2026-09-12T00:00:00Z',
  // Nulo: estes testes rodam em projeto no modo protocolo, que nao entrega codigo.
  ReporterCode: null,
  Identified: null,
}

/** So perguntas. A caixa esta escondida, mas o texto dela fica guardado. */
const DEFEITO: WidgetReportTypeViewModel = {
  PublicId: '0b6a3c1e-0000-4000-8000-000000000001',
  Name: 'Defeito',
  Icon: 'Bug',
  Questions: ['Onde você estava?', 'O que aconteceu?', 'O que você esperava?'],
  ShowsTextBox: false,
  TextBoxPrompt: 'Texto guardado para quando a caixa voltar',
}

/** So a caixa livre, com o texto cinza dentro. */
const SUGESTAO: WidgetReportTypeViewModel = {
  PublicId: '0b6a3c1e-0000-4000-8000-000000000002',
  Name: 'Sugestão',
  Icon: 'Idea',
  Questions: [],
  ShowsTextBox: true,
  TextBoxPrompt: 'Conte a sua ideia',
}

/** Perguntas e a caixa depois delas. */
const PEDIDO: WidgetReportTypeViewModel = {
  PublicId: '0b6a3c1e-0000-4000-8000-000000000003',
  Name: 'Pedido',
  Icon: 'Other',
  Questions: ['Qual tela?', 'Para quem?'],
  ShowsTextBox: true,
  TextBoxPrompt: 'Algo mais?',
}

function comSettings(mudanca: Partial<WidgetSettingsViewModel>): WidgetSettingsViewModel {
  return { ...DEFAULT_WIDGET_SETTINGS, ...mudanca }
}

const comTipos = comSettings({ Types: [DEFEITO, SUGESTAO, PEDIDO], DefaultReportType: null })

const campo = (nome: string) => screen.getByRole('textbox', { name: nome }) as HTMLTextAreaElement
const escrever = (nome: string, valor: string) =>
  fireEvent.change(campo(nome), { target: { value: valor } })
const enviar = () => screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement
const tipoBotao = (nome: string) => screen.getByRole('button', { name: nome })
const textareas = () => Array.from(document.querySelectorAll('textarea'))
/** O corpo do primeiro envio, como o servico o recebeu. */
const corpo = () => dublê.criar.mock.calls[0]?.[0] as CreateReportRequest

beforeEach(() => {
  dublê.criar.mockResolvedValue(criado)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('o formulario de cada tipo', () => {
  it('mostra as perguntas do tipo pre-marcado, na ordem dele, e so elas', () => {
    render(<EmbedApp settings={comTipos} config={config} />)

    expect(tipoBotao('Defeito').getAttribute('aria-pressed')).toBe('true')
    expect(DEFEITO.Questions.map((pergunta) => textareas().indexOf(campo(pergunta)))).toEqual([
      0, 1, 2,
    ])
    expect(textareas()).toHaveLength(3)
    expect(screen.getByText('Responda o que souber.')).toBeTruthy()
    for (const pergunta of PEDIDO.Questions)
      expect(screen.queryByRole('textbox', { name: pergunta })).toBeNull()
  })

  it('o pre-marcado da configuracao abre com as perguntas dele', () => {
    render(
      <EmbedApp settings={{ ...comTipos, DefaultReportType: PEDIDO.PublicId }} config={config} />,
    )

    expect(tipoBotao('Pedido').getAttribute('aria-pressed')).toBe('true')
    expect(campo('Qual tela?')).toBeTruthy()
    expect(campo('Para quem?')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'O que aconteceu?' })).toBeNull()
  })

  it('trocar de tipo troca os campos pelos do tipo escolhido', () => {
    render(<EmbedApp settings={comTipos} config={config} />)

    fireEvent.click(tipoBotao('Pedido'))

    expect(tipoBotao('Pedido').getAttribute('aria-pressed')).toBe('true')
    expect(tipoBotao('Defeito').getAttribute('aria-pressed')).toBe('false')
    expect(PEDIDO.Questions.map((pergunta) => textareas().indexOf(campo(pergunta)))).toEqual([0, 1])
    for (const pergunta of DEFEITO.Questions)
      expect(screen.queryByRole('textbox', { name: pergunta })).toBeNull()
  })

  it('o tipo sem caixa livre nao a mostra, nem com o texto dela guardado', () => {
    render(<EmbedApp settings={comTipos} config={config} />)

    expect(screen.queryByPlaceholderText(DEFEITO.TextBoxPrompt ?? '')).toBeNull()
    expect(screen.queryByText(DEFAULT_WIDGET_SETTINGS.MoreDetailsLabel)).toBeNull()
    // So os campos das perguntas: nenhuma caixa a mais.
    expect(textareas()).toHaveLength(DEFEITO.Questions.length)
  })

  it('o tipo so com a caixa mostra a caixa, com o texto do tipo dentro, e nenhuma pergunta', () => {
    render(<EmbedApp settings={comTipos} config={config} />)

    fireEvent.click(tipoBotao('Sugestão'))

    const caixa = campo('Conte a sua ideia')
    expect(caixa.getAttribute('placeholder')).toBe('Conte a sua ideia')
    expect(textareas()).toEqual([caixa])
    expect(screen.queryByText(DEFAULT_WIDGET_SETTINGS.MoreDetailsLabel)).toBeNull()
    expect(screen.queryByText('Responda o que souber.')).toBeNull()
  })

  it('com perguntas e caixa, a caixa vem depois delas, com o nome "Mais detalhes"', () => {
    render(<EmbedApp settings={comTipos} config={config} />)

    fireEvent.click(tipoBotao('Pedido'))

    const caixa = campo(`${DEFAULT_WIDGET_SETTINGS.MoreDetailsLabel} (opcional)`)
    expect(caixa.getAttribute('placeholder')).toBe('Algo mais?')
    expect(textareas().indexOf(caixa)).toBe(PEDIDO.Questions.length)
  })
})

describe('o envio pede pelo menos uma resposta', () => {
  it('sem resposta o botao nao libera; uma resposta basta', () => {
    render(<EmbedApp settings={comTipos} config={config} />)

    expect(enviar().disabled).toBe(true)
    escrever('O que aconteceu?', '   ')
    expect(enviar().disabled).toBe(true)
    escrever('O que aconteceu?', 'A tela ficou branca')
    expect(enviar().disabled).toBe(false)
    escrever('O que aconteceu?', '')
    expect(enviar().disabled).toBe(true)
  })

  it('o titulo sozinho nao conta como resposta', () => {
    render(<EmbedApp settings={comTipos} config={config} />)

    fireEvent.change(screen.getByRole('textbox', { name: /Em poucas palavras/ }), {
      target: { value: 'Tela branca no carrinho' },
    })
    expect(enviar().disabled).toBe(true)
  })

  it('no tipo so com a caixa, e a caixa que libera', () => {
    render(<EmbedApp settings={comTipos} config={config} />)
    fireEvent.click(tipoBotao('Sugestão'))

    expect(enviar().disabled).toBe(true)
    escrever('Conte a sua ideia', 'Um modo escuro')
    expect(enviar().disabled).toBe(false)
  })

  it('no tipo com perguntas e caixa, so a caixa ja libera', () => {
    render(<EmbedApp settings={comTipos} config={config} />)
    fireEvent.click(tipoBotao('Pedido'))

    expect(enviar().disabled).toBe(true)
    escrever(`${DEFAULT_WIDGET_SETTINGS.MoreDetailsLabel} (opcional)`, 'Para o time do caixa')
    expect(enviar().disabled).toBe(false)
  })

  it('a resposta escrita em outro tipo nao libera o tipo escolhido', () => {
    render(<EmbedApp settings={comTipos} config={config} />)

    escrever('O que aconteceu?', 'A tela ficou branca')
    fireEvent.click(tipoBotao('Sugestão'))
    expect(enviar().disabled).toBe(true)
  })
})

describe('o que o envio leva', () => {
  it('as perguntas que a pessoa leu e uma resposta para cada, na ordem, aparada, e a pulada em branco', async () => {
    render(<EmbedApp settings={comTipos} config={config} />)

    escrever('Onde você estava?', '  No carrinho  ')
    escrever('O que você esperava?', 'Ver o resumo do pedido')
    fireEvent.click(enviar())

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())
    expect(corpo().TypeId).toBe(DEFEITO.PublicId)
    expect(corpo().Questions).toEqual(DEFEITO.Questions)
    expect(corpo().Answers).toEqual(['No carrinho', '', 'Ver o resumo do pedido'])
    // O tipo sem caixa manda nulo: texto para ele e recusado.
    expect(corpo().Text).toBeNull()
  })

  it('com perguntas e caixa, a caixa vai em Text, aparada, separada das respostas', async () => {
    render(<EmbedApp settings={comTipos} config={config} />)
    fireEvent.click(tipoBotao('Pedido'))

    escrever('Para quem?', 'Para quem vende')
    escrever(`${DEFAULT_WIDGET_SETTINGS.MoreDetailsLabel} (opcional)`, '  Com urgencia  ')
    fireEvent.click(enviar())

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())
    expect(corpo()).toMatchObject({
      TypeId: PEDIDO.PublicId,
      Questions: ['Qual tela?', 'Para quem?'],
      Answers: ['', 'Para quem vende'],
      Text: 'Com urgencia',
    })
  })

  it('so com a caixa, perguntas e respostas vao vazias e o texto vai em Text', async () => {
    render(<EmbedApp settings={comTipos} config={config} />)
    fireEvent.click(tipoBotao('Sugestão'))

    escrever('Conte a sua ideia', 'Um modo escuro')
    fireEvent.click(enviar())

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())
    expect(corpo()).toMatchObject({
      TypeId: SUGESTAO.PublicId,
      Questions: [],
      Answers: [],
      Text: 'Um modo escuro',
    })
  })

  it('so vai o que foi escrito no tipo escolhido, e voltar ao tipo anterior devolve o que estava nele', async () => {
    render(<EmbedApp settings={comTipos} config={config} />)

    escrever('O que aconteceu?', 'A tela ficou branca')
    fireEvent.click(tipoBotao('Sugestão'))
    fireEvent.click(tipoBotao('Defeito'))
    expect(campo('O que aconteceu?').value).toBe('A tela ficou branca')

    fireEvent.click(tipoBotao('Sugestão'))
    escrever('Conte a sua ideia', 'Um modo escuro')
    fireEvent.click(enviar())

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())
    expect(corpo()).toMatchObject({
      TypeId: SUGESTAO.PublicId,
      Questions: [],
      Answers: [],
      Text: 'Um modo escuro',
    })
  })

  it('com o seletor escondido, vai o pre-marcado, com as perguntas dele', async () => {
    render(
      <EmbedApp
        settings={{ ...comTipos, ShowsTypeField: false, DefaultReportType: PEDIDO.PublicId }}
        config={config}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Defeito' })).toBeNull()
    escrever('Qual tela?', 'Checkout')
    fireEvent.click(enviar())

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())
    expect(corpo()).toMatchObject({
      TypeId: PEDIDO.PublicId,
      Questions: PEDIDO.Questions,
      Answers: ['Checkout', ''],
      Text: null,
    })
  })
})

describe('sem os tipos do projeto, os de fabrica', () => {
  // A comparacao dos tipos de fabrica com `ReportTypeDefaults.cs` mora com as outras
  // guardas do C#, em `src/test/widgetDefaults.test.ts`.

  it('a leitura que falha desenha os tipos de fabrica, com o primeiro marcado', async () => {
    dublê.ler.mockRejectedValue(new Error('sem rede'))

    const settings = await resolveWidgetSettings(config.key, config.origin)
    expect(settings?.Types).toEqual(FALLBACK_REPORT_TYPES)
    if (!settings) throw new Error('a leitura que falha nao pode virar recusa')

    render(<EmbedApp settings={settings} config={config} />)

    const nomes = FALLBACK_REPORT_TYPES.map((tipo) => tipo.Name)
    for (const nome of nomes) expect(tipoBotao(nome)).toBeTruthy()
    const primeiro = FALLBACK_REPORT_TYPES[0]
    if (!primeiro) throw new Error('sem tipo de fabrica')
    expect(tipoBotao(primeiro.Name).getAttribute('aria-pressed')).toBe('true')
    expect(primeiro.Questions.map((pergunta) => textareas().indexOf(campo(pergunta)))).toEqual(
      primeiro.Questions.map((_, index) => index),
    )
  })

  it('a releitura ao abrir que nao traz tipo nenhum mantem os que ja estavam', async () => {
    dublê.ler.mockResolvedValue(comSettings({ Types: [], DefaultReportType: null }))
    render(<EmbedApp settings={comTipos} config={config} host={pagina} />)

    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
    await waitFor(() => expect(dublê.ler).toHaveBeenCalledWith('pk_DEMO', 'loja.exemplo.com'))
    await act(async () => {})

    expect(tipoBotao('Defeito').getAttribute('aria-pressed')).toBe('true')
    expect(campo('O que aconteceu?')).toBeTruthy()
    expect(tipoBotao('Pedido')).toBeTruthy()
  })

  it('a releitura ao abrir com outros tipos troca o formulario pelos de agora', async () => {
    dublê.ler.mockResolvedValue(comSettings({ Types: [PEDIDO], DefaultReportType: null }))
    render(<EmbedApp settings={comTipos} config={config} host={pagina} />)

    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))

    expect(await screen.findByRole('textbox', { name: 'Qual tela?' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Defeito' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'O que aconteceu?' })).toBeNull()
  })

  it('enviar com o tipo de fabrica le de novo e manda o identificador do tipo de verdade', async () => {
    const deVerdade = FALLBACK_REPORT_TYPES.map((tipo, index) => ({
      ...tipo,
      PublicId: `0b6a3c1e-0000-4000-9000-00000000000${index}`,
    }))
    dublê.ler.mockResolvedValue(comSettings({ Types: deVerdade }))
    const defeito = FALLBACK_REPORT_TYPES[0]
    if (!defeito) throw new Error('sem tipo de fabrica')
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)

    escrever('O que aconteceu?', 'A tela ficou branca')
    fireEvent.click(enviar())

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())
    expect(dublê.ler).toHaveBeenCalledWith('pk_DEMO', 'loja.exemplo.com')
    expect(corpo()).toMatchObject({
      TypeId: deVerdade[0]?.PublicId,
      Questions: defeito.Questions,
      Answers: defeito.Questions.map((pergunta) =>
        pergunta === 'O que aconteceu?' ? 'A tela ficou branca' : '',
      ),
      Text: null,
    })
  })

  it('com o tipo de fabrica mudado no projeto, nao envia, avisa, e o que foi escrito fica', async () => {
    const defeito = FALLBACK_REPORT_TYPES[0]
    if (!defeito) throw new Error('sem tipo de fabrica')
    dublê.ler.mockResolvedValue(
      comSettings({
        Types: [{ ...defeito, PublicId: 'outro-id', Questions: ['Uma pergunta nova?'] }],
      }),
    )
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)

    escrever('O que aconteceu?', 'A tela ficou branca')
    fireEvent.click(enviar())

    expect(await screen.findByText(/Este formulário mudou desde que foi aberto/)).toBeTruthy()
    expect(dublê.criar).not.toHaveBeenCalled()
    expect(campo('O que aconteceu?').value).toBe('A tela ficou branca')
  })
})
