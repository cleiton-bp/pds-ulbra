// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IdentitySettingsViewModel,
  ProjectViewModel,
  SaveWidgetSettingsRequest,
  WidgetSettingsViewModel,
} from '@/contracts'
import { MESSAGE_SOURCE } from '@/embed/protocol'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { FormTextsScreen } from '@/features/widgetSettings/FormTextsScreen'
import { actAsPreviewFrame, lastPreview } from '@/test/previewFrame'

/**
 * O QUE ESTES TESTES TRAVAM: Formulário, a tela que recebeu os textos, as perguntas e o
 * tema que moravam em O botão e a pergunta do nome que morava em Quem relata.
 *
 * - **O tema mora aqui**: claro, escuro ou automatico, gravado com o resto da tela.
 * - **A previa abre com o formulario aberto**, sem tirar o foco da tela.
 *
 * - **Publicar manda o registro inteiro da ferramenta, lido de novo**: so os campos
 *   desta tela mudam; o botao que outra tela salvou vai como esta agora.
 * - **"Perguntar o nome" grava em Quem relata**, com o modo e a visibilidade de agora —
 *   e a ferramenta nao e gravada se so ele mudou.
 * - **Os grupos seguem a ordem do formulario** (Topo, Tipo, Título do relato, Caixa,
 *   Nome, Enviar), cada um dizendo, fechado, o que esta escolhido e o que mudou — e sem
 *   o "Mais opções" de antes.
 * - **"Voltar ao padrão" de um grupo volta so os campos dele, no rascunho certo**: o do
 *   nome mexe em Quem relata e na ferramenta; os outros, so na ferramenta.
 * - **A previa recebe o rascunho**, com a pergunta do nome junto, e **contorna a parte
 *   do grupo aberto ou em foco**.
 * - **Toda ancora antiga continua na tela**, dentro do grupo: a busca abre o certo.
 * - **O tipo pre-marcado muda de nome** quando o seletor esta escondido.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<WidgetSettingsViewModel>>(),
  salvar: vi.fn(),
  lerQuem: vi.fn<() => Promise<IdentitySettingsViewModel>>(),
  salvarQuem: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    // A previa so desenha o quadro com a ferramenta na mesma origem do painel.
    environment: { ...real.environment, embedUrl: `${window.location.origin}/embed.html` },
    projectWidgetSettingsService: {
      getWidgetSettings: dublê.ler,
      saveWidgetSettings: dublê.salvar,
    },
    projectIdentitySettingsService: {
      getIdentitySettings: dublê.lerQuem,
      saveIdentitySettings: dublê.salvarQuem,
    },
  }
})

const QUEM: IdentitySettingsViewModel = {
  Mode: 'Protocol',
  Visibility: 'Private',
  AsksForName: false,
  IdentityPublicKey: null,
  IdentityTokenMaxMinutes: 15,
  IdentityRequired: false,
}

function projeto(publicId: string): ProjectViewModel {
  return {
    PublicId: publicId,
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
}

function ProjetoDaRota() {
  const { publicId = '' } = useParams()
  return <Outlet context={{ project: projeto(publicId) }} />
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/p/:publicId',
        element: <ProjetoDaRota />,
        children: [{ path: 'form-texts', element: <FormTextsScreen /> }],
      },
    ],
    { initialEntries: ['/p/p-1/form-texts'] },
  )
  render(<RouterProvider router={router} />)
}

const titulo = () => screen.findByRole('textbox', { name: 'Título do formulário' })
const publicar = () => screen.getByRole('button', { name: 'Publicar' })
/** O grupo do acordeao: a ancora fica no `<summary>`. */
const grupo = (id: string) => document.getElementById(id)?.closest('details') as HTMLDetailsElement
/** A secao em volta do grupo: o "Voltar ao padrão" mora nela, fora do `<summary>`. */
const secao = (id: string) => grupo(id).closest('section') as HTMLElement
const resumoDo = (id: string) => grupo(id).querySelector('summary')?.textContent ?? ''
const voltarAoPadrao = (id: string) =>
  within(secao(id)).getByRole('button', { name: 'Voltar ao padrão' })

/** Os grupos, na ordem do formulario: a ancora de cada um e o titulo dele. */
const GRUPOS = [
  ['topo-do-formulario', 'Topo'],
  ['tipo-do-relato', 'Tipo'],
  ['titulo-do-relato', 'Título do relato'],
  ['caixa-depois-das-perguntas', 'Caixa depois das perguntas'],
  ['nome-de-quem-relata', 'Nome de quem relata'],
  ['enviar-o-relato', 'Enviar'],
] as const

describe('FormTextsScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const dublé of Object.values(dublê)) dublé.mockReset()
    dublê.ler.mockResolvedValue(DEFAULT_WIDGET_SETTINGS)
    dublê.lerQuem.mockResolvedValue(QUEM)
    dublê.salvar.mockImplementation(async (_id: string, pedido: SaveWidgetSettingsRequest) => ({
      ...DEFAULT_WIDGET_SETTINGS,
      ...pedido,
    }))
    dublê.salvarQuem.mockImplementation(
      async (_id: string, pedido: IdentitySettingsViewModel) => pedido,
    )
  })

  it('publicar relê e manda o registro inteiro, com o botão salvo em outra tela como está agora', async () => {
    const agora = {
      ...DEFAULT_WIDGET_SETTINGS,
      LauncherLabel: 'Ajuda',
      LauncherIcon: 'Chat' as const,
    }
    dublê.ler.mockResolvedValueOnce(DEFAULT_WIDGET_SETTINGS).mockResolvedValue(agora)

    montar()
    fireEvent.change(await titulo(), { target: { value: 'Conte para a gente' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Obrigatório' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome da caixa depois das perguntas' }), {
      target: { value: 'Algo mais' },
    })
    fireEvent.click(publicar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    const enviado = dublê.salvar.mock.calls[0]?.[1] as SaveWidgetSettingsRequest
    expect(enviado.Title).toBe('Conte para a gente')
    expect(enviado.ReportTitleMode).toBe('Required')
    expect(enviado.MoreDetailsLabel).toBe('Algo mais')
    // Os campos desta tela que ninguem mexeu vao como estao, e nenhum fica de fora.
    expect(enviado.SubmitLabel).toBe(DEFAULT_WIDGET_SETTINGS.SubmitLabel)
    expect(enviado.NameQuestion).toBe(DEFAULT_WIDGET_SETTINGS.NameQuestion)
    expect(enviado.TypeFieldLabel).toBe(DEFAULT_WIDGET_SETTINGS.TypeFieldLabel)
    expect(enviado.Theme).toBe(DEFAULT_WIDGET_SETTINGS.Theme)
    // O que e de O botão vai como esta salvo agora, e nao volta ao que era.
    expect(enviado.LauncherLabel).toBe('Ajuda')
    expect(enviado.LauncherIcon).toBe('Chat')
    // So a ferramenta mudou: Quem relata nao e gravado.
    expect(dublê.salvarQuem).not.toHaveBeenCalled()
  })

  it('"perguntar o nome" grava em Quem relata, com o modo e a visibilidade de agora', async () => {
    dublê.lerQuem
      .mockResolvedValueOnce(QUEM)
      .mockResolvedValue({ ...QUEM, Mode: 'PersonalCode', Visibility: 'PublicAnonymous' })

    montar()
    await titulo()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Perguntar o nome de quem relata' }))
    fireEvent.click(publicar())

    await waitFor(() => expect(dublê.salvarQuem).toHaveBeenCalledTimes(1))
    expect(dublê.salvarQuem.mock.calls[0]?.[1]).toEqual({
      Mode: 'PersonalCode',
      Visibility: 'PublicAnonymous',
      AsksForName: true,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
    })
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('a pergunta do nome fica desligada até perguntar o nome', async () => {
    montar()
    await titulo()

    const pergunta = screen.getByRole('textbox', { name: 'Texto da pergunta do nome' })
    expect((pergunta as HTMLInputElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Perguntar o nome de quem relata' }))
    expect((pergunta as HTMLInputElement).disabled).toBe(false)
  })

  it('os grupos seguem a ordem do formulário, cada um nomeado pela seção', async () => {
    montar()
    await titulo()

    const titulos = Array.from(document.querySelectorAll('details[name="formulario"]')).map(
      (detalhes) => detalhes.closest('section')?.getAttribute('aria-labelledby'),
    )
    expect(titulos).toEqual(GRUPOS.map(([id]) => `${id}-nome`))
    for (const [id, nome] of GRUPOS) {
      expect(screen.getByRole('region', { name: nome })).toBe(secao(id))
      expect(document.getElementById(id)?.tagName).toBe('SUMMARY')
    }
    // O topo abre sozinho; o "Mais opções" de antes nao existe mais.
    expect(grupo('topo-do-formulario').open).toBe(true)
    expect(screen.queryByText('Mais opções')).toBeNull()
  })

  it('cada grupo diz, fechado, o que está escolhido, e o que mudou', async () => {
    montar()
    await titulo()

    expect(resumoDo('topo-do-formulario')).toContain(
      `Automático · “${DEFAULT_WIDGET_SETTINGS.Title}”`,
    )
    expect(resumoDo('tipo-do-relato')).toContain('A pessoa escolhe · marcado: Defeito')
    expect(resumoDo('titulo-do-relato')).toContain(
      `Opcional · “${DEFAULT_WIDGET_SETTINGS.ReportTitleQuestion}”`,
    )
    expect(resumoDo('caixa-depois-das-perguntas')).toContain('“Mais detalhes”')
    expect(resumoDo('nome-de-quem-relata')).toContain('Não pergunta')
    expect(resumoDo('enviar-o-relato')).toContain('“Enviar”')
    // No padrao, nenhum grupo diz "Mudou", nem oferece voltar.
    for (const [id] of GRUPOS) {
      expect(resumoDo(id), id).not.toContain('Mudou')
      expect(within(secao(id)).queryByRole('button', { name: 'Voltar ao padrão' }), id).toBeNull()
    }

    fireEvent.click(screen.getByRole('radio', { name: 'Escuro' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Escondido' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /escolher o tipo/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Perguntar o nome de quem relata' }))

    expect(resumoDo('topo-do-formulario')).toContain('Escuro ·')
    expect(resumoDo('topo-do-formulario')).toContain('Mudou: Tema')
    expect(resumoDo('titulo-do-relato')).toContain('Escondido')
    expect(resumoDo('titulo-do-relato')).toContain('Mudou: O título é')
    expect(resumoDo('tipo-do-relato')).toContain('Sem seletor · tudo entra como Defeito')
    expect(resumoDo('nome-de-quem-relata')).toContain(
      `Pergunta: “${DEFAULT_WIDGET_SETTINGS.NameQuestion}”`,
    )
    expect(resumoDo('nome-de-quem-relata')).toContain('Mudou: Perguntar o nome')
    expect(resumoDo('enviar-o-relato')).not.toContain('Mudou')
  })

  it('"Voltar ao padrão" de um grupo volta só os campos dele', async () => {
    montar()
    fireEvent.change(await titulo(), { target: { value: 'Conte para a gente' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Obrigatório' }))
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Exemplo dentro da pergunta do título' }),
      {
        target: { value: 'O carrinho some' },
      },
    )
    expect(resumoDo('titulo-do-relato')).toContain('Mudou: O título é, Exemplo')

    fireEvent.click(voltarAoPadrao('titulo-do-relato'))

    expect(resumoDo('titulo-do-relato')).not.toContain('Mudou')
    expect((screen.getByRole('radio', { name: 'Opcional' }) as HTMLInputElement).checked).toBe(true)
    // O titulo do formulario e do Topo: continua como foi escrito.
    expect((await titulo()).getAttribute('value')).toBe('Conte para a gente')
    expect(resumoDo('topo-do-formulario')).toContain('Mudou: Título')
  })

  it('o "Voltar ao padrão" do nome volta os dois rascunhos, e só os campos do nome', async () => {
    montar()
    await titulo()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Perguntar o nome de quem relata' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Texto da pergunta do nome' }), {
      target: { value: 'Quem é você?' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Texto do botão de enviar' }), {
      target: { value: 'Mandar' },
    })
    expect(resumoDo('nome-de-quem-relata')).toContain('Mudou: Perguntar o nome, Texto da pergunta')
    expect(screen.getByText('3 mudanças não publicadas')).toBeTruthy()

    fireEvent.click(voltarAoPadrao('nome-de-quem-relata'))

    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Perguntar o nome de quem relata',
        }) as HTMLInputElement
      ).checked,
    ).toBe(false)
    expect(
      screen.getByRole('textbox', { name: 'Texto da pergunta do nome' }).getAttribute('value'),
    ).toBe(DEFAULT_WIDGET_SETTINGS.NameQuestion)
    // So o enviar continua mudado: Quem relata nao tem mais o que gravar.
    expect(screen.getByText('1 mudança não publicada')).toBeTruthy()
    fireEvent.click(publicar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    const enviado = dublê.salvar.mock.calls[0]?.[1] as SaveWidgetSettingsRequest
    expect(enviado.SubmitLabel).toBe('Mandar')
    expect(dublê.salvarQuem).not.toHaveBeenCalled()
  })

  it('toda âncora antiga continua na tela, dentro do grupo certo', async () => {
    montar()
    await titulo()

    const dentroDe: Record<string, string> = {
      textos: 'topo-do-formulario',
      'titulo-do-formulario': 'topo-do-formulario',
      'aparencia-do-formulario': 'topo-do-formulario',
      tema: 'topo-do-formulario',
      'escolher-tipo': 'tipo-do-relato',
      'nome-do-seletor-de-tipo': 'tipo-do-relato',
      'tipo-pre-marcado': 'tipo-do-relato',
      'mais-opcoes': 'titulo-do-relato',
      'modo-do-titulo': 'titulo-do-relato',
      'texto-pergunta-titulo': 'titulo-do-relato',
      'exemplo-do-titulo': 'titulo-do-relato',
      'nome-da-caixa': 'caixa-depois-das-perguntas',
      'perguntar-nome': 'nome-de-quem-relata',
      'pergunta-do-nome': 'nome-de-quem-relata',
      'botao-enviar': 'enviar-o-relato',
    }
    for (const [ancora, id] of Object.entries(dentroDe)) {
      expect(document.getElementById(ancora)?.closest('details'), ancora).toBe(grupo(id))
    }
  })

  it('a prévia contorna a parte do grupo aberto, e a do grupo em foco vence', async () => {
    montar()
    await titulo()
    const lidas = actAsPreviewFrame()

    // O Topo abre sozinho, e a previa ja contorna o topo do formulario.
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBe('form-top'))

    grupo('titulo-do-relato').open = true
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBe('form-title'))

    // O foco num campo de outro grupo realca o dele, mesmo com o titulo aberto.
    act(() => screen.getByRole('textbox', { name: 'Texto do botão de enviar' }).focus())
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBe('form-submit'))

    // Saindo dele, volta o do grupo aberto.
    act(() => (document.activeElement as HTMLElement).blur())
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBe('form-title'))

    grupo('titulo-do-relato').open = false
    await waitFor(() => expect(lastPreview(lidas)?.highlight).toBeNull())
  })

  it('a dica da caixa diz em que tipos o nome dela aparece', async () => {
    montar()
    await titulo()
    // Os tipos de fabrica: nenhum tem perguntas e a caixa juntos.
    expect(secao('caixa-depois-das-perguntas').textContent).toContain(
      'Hoje nenhum tipo tem os dois',
    )
    cleanup()

    dublê.ler.mockResolvedValue({
      ...DEFAULT_WIDGET_SETTINGS,
      Types: [
        {
          PublicId: 't-1',
          Name: 'Pedido',
          Icon: 'Other',
          Questions: ['Qual tela?'],
          ShowsTextBox: true,
          TextBoxPrompt: null,
        },
      ],
    })
    montar()
    await titulo()
    expect(secao('caixa-depois-das-perguntas').textContent).toContain('Hoje aparece em: Pedido.')
  })

  it('a prévia recebe o rascunho, com a pergunta do nome', async () => {
    montar()
    fireEvent.change(await titulo(), { target: { value: 'Conte para a gente' } })
    const lidas = actAsPreviewFrame()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Perguntar o nome de quem relata' }))

    await waitFor(() => expect(lastPreview(lidas)?.settings.AsksForName).toBe(true))
    expect(lastPreview(lidas)?.settings.Title).toBe('Conte para a gente')
    expect(screen.getByText('ainda não publicado')).toBeTruthy()
  })

  it('o tema do formulário mora aqui, e vai com o Publicar da tela', async () => {
    montar()
    await titulo()
    expect(screen.getByRole('heading', { name: 'Formulário' })).toBeTruthy()

    const tema = screen.getByRole('radiogroup', { name: 'Tema do formulário' })
    expect(tema.closest('#tema')).not.toBeNull()
    expect((screen.getByRole('radio', { name: 'Automático' }) as HTMLInputElement).checked).toBe(
      true,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Escuro' }))
    expect(screen.getByText('1 mudança não publicada')).toBeTruthy()
    fireEvent.click(publicar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    const enviado = dublê.salvar.mock.calls[0]?.[1] as SaveWidgetSettingsRequest
    expect(enviado.Theme).toBe('Dark')
  })

  it('a prévia abre com o formulário aberto, sem levar o foco da tela', async () => {
    montar()
    await titulo()
    const lidas = actAsPreviewFrame()
    const quadro = document.querySelector<HTMLIFrameElement>('iframe[title="Prévia da ferramenta"]')
    const enviado = vi.mocked(quadro?.contentWindow?.postMessage as (mensagem: unknown) => void)

    // O quadro responde com o tamanho do botao: a previa pede para abrir, sem foco.
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            source: MESSAGE_SOURCE,
            type: 'resize',
            width: 120,
            height: 48,
            position: 'BottomRight',
          },
          origin: window.location.origin,
          source: quadro?.contentWindow ?? null,
        }),
      )
    })

    expect(lidas().length).toBeGreaterThan(0)
    const aberturas = enviado.mock.calls
      .map(([mensagem]) => mensagem as { type: string; focus?: boolean })
      .filter((mensagem) => mensagem.type === 'open')
    expect(aberturas).toEqual([{ source: MESSAGE_SOURCE, type: 'open', focus: false }])
    expect(document.activeElement).not.toBe(quadro)
  })

  it('o rótulo do tipo muda de significado quando o seletor está escondido', async () => {
    montar()

    expect(await screen.findByText('Tipo pré-marcado')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /escolher o tipo/ }))

    expect(screen.getByText('Tipo de todos os relatos')).toBeTruthy()
    expect(screen.queryByText('Tipo pré-marcado')).toBeNull()
  })
})
