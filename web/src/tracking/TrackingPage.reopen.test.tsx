// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PublicAttachmentViewModel,
  PublicClosureViewModel,
  PublicMediaSettingsViewModel,
  PublicReportViewModel,
} from '@/contracts'
import { PanelError } from '@/data/errors'
import { TrackingPage } from '@/tracking/TrackingPage'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A reabertura e gravada antes do arquivo, e o arquivo vai marcado como da
 * reabertura.** O texto nunca espera o envio, e e a bandeira que faz o servidor
 * prender o print a reabertura — e nao a criacao do relato, que ja fechou.
 *
 * **Os arquivos escolhidos nao moram no bloco do encerramento.** Reaberto, o relato
 * deixa de ter fechamento e aquele bloco sai da tela; com a lista dentro dele, os
 * arquivos sumiriam antes de subir. O teste segura o envio no meio e confere que a
 * lista continua.
 *
 * **O motivo volta para a pagina, e cada print fica junto da sua reabertura.** Sem
 * isso o motivo era gravado e nunca mais lido. O que nao acha a sua reabertura cai
 * na galeria do relato, em vez de sumir.
 *
 * **So com o projeto deixando o seletor aparece.** A chave e propria: ha projeto
 * que quer o print da resposta e nao o da reabertura.
 */
const dublê = vi.hoisted(() => ({
  abrir: vi.fn(),
  reabrir: vi.fn(),
  anexos: vi.fn(),
  midia: vi.fn(),
  enviar: vi.fn(),
}))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()

  return {
    ...real,
    reportService: {
      openReportTracking: dublê.abrir,
      reopenReport: dublê.reabrir,
      confirmReport: vi.fn(),
      replyToReport: vi.fn(),
      openByReporterCode: vi.fn(),
    },
    publicMediaService: {
      listTrackingAttachments: dublê.anexos,
      loadTrackingMediaSettings: dublê.midia,
    },
  }
})

vi.mock('@/embed/sendAttachment', () => ({ sendAttachment: dublê.enviar }))

vi.mock('@/editor/ImageEditor', () => import('@/test/fakeImageEditor'))

const fechamento: PublicClosureViewModel = {
  Outcome: 'Done',
  Reason: 'Corrigido na versão desta semana.',
  ClosedAt: '2026-09-20T10:00:00.000Z',
  ConfirmedAt: null,
  Satisfaction: null,
  SatisfactionDeclined: false,
  Actions: {
    CanConfirm: true,
    CanReopen: true,
    AsksSatisfaction: false,
    SatisfactionStyle: 'Stars',
    SatisfactionRequired: false,
    ReopenRequiresComment: true,
  },
}

const encerrado: PublicReportViewModel = {
  TrackingCode: '7K2M-9QXP-4TRV',
  Type: 'Bug',
  Text: 'O botão de finalizar compra não responde.',
  CreatedAt: '2026-09-12T13:24:00.000Z',
  Journey: [],
  Closure: fechamento,
  Conversation: [],
  InfoRequest: null,
  CanReply: false,
  Reopenings: [],
}

/** O que a API devolve ao reabrir: sem fechamento, e com o motivo na lista. */
const reaberto: PublicReportViewModel = {
  ...encerrado,
  Closure: null,
  Reopenings: [
    { PublicId: 'r-1', ReopenedAt: '2026-09-21T09:00:00.000Z', Comment: 'Voltou a travar.' },
  ],
}

function midia(extra: Partial<PublicMediaSettingsViewModel> = {}): PublicMediaSettingsViewModel {
  return {
    IsEnabled: true,
    AllowsScreenCapture: true,
    AllowsOnInfoRequest: false,
    AllowsOnReopen: true,
    MaxFilesPerReport: 4,
    Kinds: [
      {
        Kind: 'Image',
        MaxCount: 3,
        MaxBytes: 5 * 1024 * 1024,
        ContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
      },
    ],
    ...extra,
  }
}

function anexo(extra: Partial<PublicAttachmentViewModel> = {}): PublicAttachmentViewModel {
  return {
    PublicId: 'a-1',
    Kind: 'Image',
    DisplaySize: 'Full',
    Url: 'http://armazenamento/a-1',
    ThumbnailUrl: 'http://armazenamento/a-1-thumb',
    ExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    DurationSeconds: null,
    ReplyPublicId: null,
    ReopenPublicId: null,
    CreatedAt: '2026-09-21T09:01:00.000Z',
    ...extra,
  }
}

const print = () => new File([new Uint8Array(100)], 'ainda-quebrado.png', { type: 'image/png' })

/** Abre a pagina pelo link e entra no modo de reabrir. */
async function reabrindo() {
  window.history.replaceState({}, '', '/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')
  render(<TrackingPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Não, ainda não' }))
}

/** Espera a configuracao de midia chegar: sem isto, a ausencia do seletor nao provaria nada. */
async function configuracaoLida() {
  await waitFor(() => expect(dublê.midia).toHaveBeenCalled())
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
}

/**
 * Escolhe o arquivo no seletor da reabertura. **Espera o seletor aparecer**: ele
 * depende da configuracao de midia, que a pagina le sem pressa. Procura-lo na hora
 * so dava certo com a maquina livre — sob carga, o teste quebrava em milissegundos
 * sem nada de errado na tela.
 */
async function escolher(arquivo: File) {
  fireEvent.change(await screen.findByLabelText('Escolher imagem para anexar'), {
    target: { files: [arquivo] },
  })
}

afterEach(cleanup)

beforeEach(() => {
  for (const mock of Object.values(dublê)) mock.mockReset()
  dublê.abrir.mockResolvedValue(encerrado)
  dublê.reabrir.mockResolvedValue(reaberto)
  dublê.anexos.mockResolvedValue([])
  dublê.midia.mockResolvedValue(midia())
})

describe('anexar ao reabrir', () => {
  it('com o projeto deixando, o seletor aparece junto do motivo', async () => {
    await reabrindo()

    expect(await screen.findByLabelText('Escolher imagem para anexar')).toBeDefined()
    expect(screen.getByText(/anexe um print do que ainda está acontecendo/)).toBeDefined()
  })

  it('sem a chave da reabertura, reabrir é só texto — mesmo com anexo na resposta ligado', async () => {
    dublê.midia.mockResolvedValue(midia({ AllowsOnReopen: false, AllowsOnInfoRequest: true }))
    await reabrindo()
    await configuracaoLida()

    expect(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ })).toBeDefined()
    expect(screen.queryByLabelText('Escolher imagem para anexar')).toBeNull()
  })

  it('com o anexo desligado no projeto, reabrir é só texto', async () => {
    dublê.midia.mockResolvedValue(midia({ IsEnabled: false }))
    await reabrindo()
    await configuracaoLida()

    expect(screen.queryByLabelText('Escolher imagem para anexar')).toBeNull()
  })

  it('reabre primeiro, e só então sobe o arquivo marcado como da reabertura', async () => {
    // A reabertura fica segurada: um envio que comecasse sem espera-la ja
    // apareceria aqui — e na API ele pediria permissao para uma reabertura que
    // ainda nao existe.
    let gravar: (relato: PublicReportViewModel) => void = () => {}
    dublê.reabrir.mockImplementation(
      () =>
        new Promise<PublicReportViewModel>((resolve) => {
          gravar = resolve
        }),
    )
    dublê.enviar.mockResolvedValue(undefined)
    await reabrindo()

    fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
      target: { value: 'Voltou a travar.' },
    })
    await escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    await waitFor(() => expect(dublê.reabrir).toHaveBeenCalledOnce())
    await act(async () => {})
    expect(dublê.enviar).not.toHaveBeenCalled()

    await act(async () => gravar(reaberto))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    expect(dublê.enviar.mock.calls[0]?.[0]).toEqual({
      trackingCode: '7K2M-9QXP-4TRV',
      token: 'tok-secreto',
    })
    expect(dublê.enviar.mock.calls[0]?.[3]).toMatchObject({ envio: 'reopen' })
  })

  it('a imagem fica logo abaixo do motivo, e o tamanho escolhido vai com o arquivo', async () => {
    dublê.enviar.mockResolvedValue(undefined)
    await reabrindo()

    const motivo = screen.getByRole('textbox', { name: /O que ainda está acontecendo/ })
    fireEvent.change(motivo, { target: { value: 'Voltou a travar.' } })
    await escolher(print())
    const lista = await screen.findByRole('list', { name: 'Imagens a enviar' })
    expect(motivo.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // O convite a anexar sai: com ele, a frase ficaria entre o texto e a imagem.
    expect(screen.queryByText(/anexe um print do que ainda está acontecendo/)).toBeNull()
    const grupo = screen.getByRole('group', { name: 'Tamanho de ainda-quebrado.png' })
    fireEvent.click(within(grupo).getByRole('button', { name: 'Grande' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    expect(dublê.enviar.mock.calls[0]?.[1]).toMatchObject({ displaySize: 'Large', displayOrder: 0 })
  })

  // A reabertura leva a lista como ela esta quando volta. O que entrasse durante
  // "Enviando…" ficaria de fora — e sumiria junto com o bloco do encerramento.
  it('enquanto a reabertura vai, a lista fica travada: nem pôr, nem tirar, nem colar', async () => {
    let gravar: (relato: PublicReportViewModel) => void = () => {}
    dublê.reabrir.mockImplementation(
      () =>
        new Promise<PublicReportViewModel>((resolve) => {
          gravar = resolve
        }),
    )
    dublê.enviar.mockResolvedValue(undefined)
    await reabrindo()

    const caixa = screen.getByRole('textbox', { name: /O que ainda está acontecendo/ })
    fireEvent.change(caixa, { target: { value: 'Voltou a travar.' } })
    await escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))
    await screen.findByRole('button', { name: 'Enviando…' })

    expect(
      (screen.getByRole('button', { name: 'Anexar imagem' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.queryByRole('button', { name: 'Remover ainda-quebrado.png' })).toBeNull()
    const outro = new File([new Uint8Array(100)], 'outro.png', { type: 'image/png' })
    const colagem = fireEvent.paste(caixa.parentElement as HTMLElement, {
      clipboardData: { files: [outro], getData: () => '' },
    })
    expect(colagem).toBe(true)

    await act(async () => gravar(reaberto))
    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    expect(dublê.enviar.mock.calls[0]?.[1].file.name).toBe('ainda-quebrado.png')
  })

  // PrintScreen e Ctrl+V e como se anexa print de verdade. Texto de planilha, que
  // traz uma imagem junto, continua sendo texto.
  it('colar um print na reabertura anexa, e texto colado continua texto', async () => {
    await reabrindo()
    await screen.findByLabelText('Escolher imagem para anexar')
    const caixa = screen.getByRole('textbox', { name: /O que ainda está acontecendo/ })

    expect(fireEvent.paste(caixa, { clipboardData: { files: [print()], getData: () => '' } })).toBe(
      false,
    )
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })

    const celulas = new File([new Uint8Array(100)], 'celulas.png', { type: 'image/png' })
    expect(
      fireEvent.paste(caixa, {
        clipboardData: {
          files: [celulas],
          getData: (tipo: string) => (tipo === 'text/plain' ? 'total\t42' : ''),
        },
      }),
    ).toBe(true)
    expect(screen.queryByRole('button', { name: 'Remover celulas.png' })).toBeNull()
  })

  // Reaberto antes, encerrado de novo e reaberto agora: o envio e da reabertura que
  // acabou de acontecer. E a frase fala dela — sem motivo agora, nao ha texto salvo,
  // mesmo com o motivo da anterior na lista.
  it('o envio aparece na reabertura mais recente, e a frase fala dela', async () => {
    const anterior = {
      PublicId: 'r-1',
      ReopenedAt: '2026-09-15T09:00:00.000Z',
      Comment: 'Da primeira vez.',
    }
    dublê.abrir.mockResolvedValue({
      ...encerrado,
      Reopenings: [anterior],
      Closure: { ...fechamento, Actions: { ...fechamento.Actions, ReopenRequiresComment: false } },
    })
    dublê.reabrir.mockResolvedValue({
      ...reaberto,
      Reopenings: [
        anterior,
        { PublicId: 'r-2', ReopenedAt: '2026-09-21T09:00:00.000Z', Comment: null },
      ],
    })
    dublê.enviar.mockRejectedValue(new Error('rede'))
    await reabrindo()

    await escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    const tentar = await screen.findByRole('button', { name: 'Tentar de novo' })
    const [primeira, segunda] = screen
      .getAllByText('Você reabriu este relato')
      .map((titulo) => titulo.closest('li') as HTMLElement)
    expect(segunda?.contains(tentar)).toBe(true)
    expect(primeira?.contains(tentar)).toBe(false)
    expect(screen.queryByText(/texto está salvo/)).toBeNull()
  })

  it('reabrir sem arquivo não sobe nada', async () => {
    await reabrindo()

    fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
      target: { value: 'Voltou a travar.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    await waitFor(() => expect(dublê.reabrir).toHaveBeenCalled())
    await screen.findByText('Você reabriu este relato')
    expect(dublê.enviar).not.toHaveBeenCalled()
  })

  it('o envio continua na tela depois que o bloco do encerramento sai', async () => {
    // O arquivo fica subindo: e o momento em que o bloco ja saiu e a lista precisa
    // continuar em algum lugar.
    let terminar: () => void = () => {}
    dublê.enviar.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          terminar = resolve
        }),
    )
    await reabrindo()

    fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
      target: { value: 'Voltou a travar.' },
    })
    await escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    await waitFor(() => expect(screen.queryByText('Como terminou')).toBeNull())
    expect(screen.getByText('ainda-quebrado.png')).toBeDefined()

    await act(async () => terminar())
    // Terminado, a lista de envio sai: o arquivo aparece no lugar dele depois de
    // a pagina reler, e duas vezes na tela seria uma a mais.
    await waitFor(() => expect(screen.queryByText('ainda-quebrado.png')).toBeNull())
    await waitFor(() => expect(dublê.anexos).toHaveBeenCalledTimes(2))
  })

  it('motivo em branco leva o arquivo, quando o projeto não pede o motivo', async () => {
    dublê.abrir.mockResolvedValue({
      ...encerrado,
      Closure: { ...fechamento, Actions: { ...fechamento.Actions, ReopenRequiresComment: false } },
    })
    dublê.enviar.mockResolvedValue(undefined)
    await reabrindo()

    await escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    await waitFor(() =>
      expect(dublê.reabrir).toHaveBeenCalledWith({
        TrackingCode: '7K2M-9QXP-4TRV',
        Token: 'tok-secreto',
        Comment: null,
      }),
    )
    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
  })

  // Sem motivo nao ha texto salvo: a frase de sempre afirmaria o que nao houve.
  it('reabertura sem motivo, com o arquivo falhando, não diz que um texto foi salvo', async () => {
    dublê.abrir.mockResolvedValue({
      ...encerrado,
      Closure: { ...fechamento, Actions: { ...fechamento.Actions, ReopenRequiresComment: false } },
    })
    dublê.reabrir.mockResolvedValue({
      ...reaberto,
      Reopenings: [{ PublicId: 'r-1', ReopenedAt: '2026-09-21T09:00:00.000Z', Comment: null }],
    })
    dublê.enviar.mockRejectedValue(new Error('rede'))
    await reabrindo()

    await escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(screen.getByText(/O relato foi reaberto\. Só o arquivo não foi junto/)).toBeDefined()
    expect(screen.queryByText(/texto está salvo/)).toBeNull()
  })

  // A miniatura leva um instante, e o envio sobe a lista como ela esta quando
  // comeca. Um arquivo que entrasse depois nao subiria — e sumiria com o bloco do
  // encerramento, sem aviso.
  it('enquanto um arquivo ainda está entrando na lista, reabrir espera', async () => {
    let pronto: (imagem: { width: number; height: number; close: () => void }) => void = () => {}
    vi.stubGlobal(
      'createImageBitmap',
      () =>
        new Promise((resolve) => {
          pronto = resolve
        }),
    )
    dublê.enviar.mockResolvedValue(undefined)

    try {
      await reabrindo()
      fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
        target: { value: 'Voltou a travar.' },
      })
      await escolher(print())

      const reabrir = screen.getByRole('button', { name: 'Reabrir o relato' }) as HTMLButtonElement
      await waitFor(() => expect(reabrir.disabled).toBe(true))

      // Sem largura, a miniatura nao sai e o arquivo entra sem ela.
      await act(async () => pronto({ width: 0, height: 0, close: () => {} }))

      await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
      expect(reabrir.disabled).toBe(false)

      fireEvent.click(reabrir)
      await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('arquivo recusado na reabertura diz o motivo, sem tentar de novo', async () => {
    dublê.enviar.mockRejectedValue(
      new PanelError(
        'Esta reabertura ja tem o maximo de arquivos que o projeto permite, que e 4.',
        409,
      ),
    )
    await reabrindo()

    fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
      target: { value: 'Voltou a travar.' },
    })
    await escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    await screen.findByText('não enviado')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
    expect(screen.getByText(/O relato foi reaberto e o seu texto está salvo/)).toBeDefined()
  })

  it('desistir do arquivo que falhou na reabertura tira da lista e fecha o envio', async () => {
    dublê.enviar.mockRejectedValue(new PanelError('Sem conexao.', 0))
    await reabrindo()

    fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
      target: { value: 'Voltou a travar.' },
    })
    await escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Desistir' }))

    expect(screen.queryByText('ainda-quebrado.png')).toBeNull()
    // A pagina le os arquivos ao abrir, de novo quando o envio termina com a falha,
    // e mais uma vez ao desistir — e essa terceira leitura e a de fechar o envio.
    // Sem ela, a proxima reabertura iria sem arquivo ate a pagina recarregar.
    await waitFor(() => expect(dublê.anexos).toHaveBeenCalledTimes(3))
  })

  it('falha de rede na reabertura oferece tentar de novo', async () => {
    dublê.enviar.mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(undefined)
    await reabrindo()

    fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
      target: { value: 'Voltou a travar.' },
    })
    await escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledTimes(2))
    expect(dublê.enviar.mock.calls[1]?.[3]).toMatchObject({ envio: 'reopen' })
    await waitFor(() => expect(screen.queryByText('ainda-quebrado.png')).toBeNull())
  })
})

describe('as reaberturas na pagina', () => {
  function reabertoAntes(extra: Partial<PublicReportViewModel> = {}) {
    dublê.abrir.mockResolvedValue({ ...reaberto, ...extra })
    window.history.replaceState({}, '', '/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')
  }

  it('o motivo de cada reabertura aparece, com a data', async () => {
    reabertoAntes({
      Reopenings: [
        { PublicId: 'r-1', ReopenedAt: '2026-09-21T09:00:00.000Z', Comment: 'Voltou a travar.' },
        { PublicId: 'r-2', ReopenedAt: '2026-09-25T09:00:00.000Z', Comment: null },
      ],
    })
    render(<TrackingPage />)

    expect(await screen.findByText('Voltou a travar.')).toBeDefined()
    // Sem comentario, o titulo sozinho ja diz o que houve.
    expect(screen.getAllByText('Você reabriu este relato')).toHaveLength(2)
  })

  it('o print da reabertura fica junto dela, e não na galeria do relato', async () => {
    reabertoAntes()
    dublê.anexos.mockResolvedValue([
      anexo({ PublicId: 'a-criacao', Url: 'http://armazenamento/criacao' }),
      anexo({
        PublicId: 'a-reabertura',
        Url: 'http://armazenamento/reabertura',
        ReopenPublicId: 'r-1',
      }),
    ])
    render(<TrackingPage />)

    await screen.findByRole('list', { name: 'O que você anexou ao reabrir' })

    const reabertura = screen.getByText('Você reabriu este relato').closest('li') as HTMLElement
    const imagens = (onde: ParentNode) =>
      Array.from(onde.querySelectorAll('img')).map((img) => img.getAttribute('src'))

    expect(imagens(reabertura)).toEqual(['http://armazenamento/reabertura'])

    const doRelato = screen.getByRole('list', { name: 'O que você anexou' })
    expect(imagens(doRelato)).toEqual(['http://armazenamento/criacao'])
  })

  it('print de uma reabertura que a página não conhece cai na galeria do relato', async () => {
    reabertoAntes()
    dublê.anexos.mockResolvedValue([
      anexo({
        Url: 'http://armazenamento/perdido',
        ReopenPublicId: 'r-desconhecida',
      }),
    ])
    render(<TrackingPage />)

    const doRelato = await screen.findByRole('list', { name: 'O que você anexou' })
    expect(doRelato.querySelector('img')?.getAttribute('src')).toBe('http://armazenamento/perdido')
    expect(screen.queryByRole('list', { name: 'O que você anexou ao reabrir' })).toBeNull()
  })

  // A lista vem na ordem da montagem de cada envio: a posicao 0 da reabertura chega
  // entre a 0 e a 1 da criacao. Sem lugar, ela vai depois das da criacao.
  it('o print sem lugar vai depois dos da criação, e não no meio deles', async () => {
    reabertoAntes()
    dublê.anexos.mockResolvedValue([
      anexo({ PublicId: 'c-0', Url: 'http://armazenamento/c-0' }),
      anexo({ PublicId: 'perdido', Url: 'http://armazenamento/perdido', ReopenPublicId: 'r-x' }),
      anexo({ PublicId: 'c-1', Url: 'http://armazenamento/c-1' }),
    ])
    render(<TrackingPage />)

    const doRelato = await screen.findByRole('list', { name: 'O que você anexou' })
    expect(
      Array.from(doRelato.querySelectorAll('img')).map((img) => img.getAttribute('src')),
    ).toEqual([
      'http://armazenamento/c-0',
      'http://armazenamento/c-1',
      'http://armazenamento/perdido',
    ])
  })

  it('relato nunca reaberto não mostra bloco de reabertura', async () => {
    dublê.abrir.mockResolvedValue({ ...encerrado, Closure: null })
    window.history.replaceState({}, '', '/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')
    render(<TrackingPage />)

    await screen.findByText(/O botão de finalizar compra/)
    expect(screen.queryByText('Você reabriu este relato')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Reaberturas' })).toBeNull()
  })
})

describe('marcar a imagem da reabertura', () => {
  it('a imagem escolhida abre no editor, e a marcada toma o lugar dela', async () => {
    await reabrindo()
    await escolher(new File([new Uint8Array(100)], 'ainda.png', { type: 'image/png' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Editar ainda.png' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir com marcas' }))

    await screen.findByRole('button', { name: 'Remover marcada-ainda.png' })
    expect(screen.queryByRole('button', { name: 'Remover ainda.png' })).toBeNull()
  })

  it('com o editor aberto, a reabertura nao sai', async () => {
    await reabrindo()
    // Com o motivo escrito o botao fica ligado: sem ele, o clique nao faria nada de todo
    // jeito, e o teste passaria sem a trava.
    fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
      target: { value: 'ainda falha no pagamento' },
    })
    await escolher(new File([new Uint8Array(100)], 'ainda.png', { type: 'image/png' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Editar ainda.png' }))
    await screen.findByRole('dialog', { name: 'Editor falso' })

    const reabrir = screen.getByRole('button', { name: 'Reabrir o relato' }) as HTMLButtonElement
    expect(reabrir.disabled).toBe(false)
    fireEvent.click(reabrir)
    await act(async () => {})

    expect(dublê.reabrir).not.toHaveBeenCalled()
  })
})
