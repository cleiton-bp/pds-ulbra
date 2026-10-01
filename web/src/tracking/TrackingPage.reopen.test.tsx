// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function escolher(arquivo: File) {
  fireEvent.change(screen.getByLabelText('Escolher imagem para anexar'), {
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
    escolher(print())
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
    expect(dublê.enviar.mock.calls[0]?.[3]).toEqual({ envio: 'reopen' })
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
    escolher(print())
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

    escolher(print())
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

    escolher(print())
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
    let pronto: (imagem: { width: number; height: number }) => void = () => {}
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
      escolher(print())

      const reabrir = screen.getByRole('button', { name: 'Reabrir o relato' }) as HTMLButtonElement
      await waitFor(() => expect(reabrir.disabled).toBe(true))

      // Sem largura, a miniatura nao sai e o arquivo entra sem ela.
      await act(async () => pronto({ width: 0, height: 0 }))

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
    escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    await screen.findByText('não enviado')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
    expect(screen.getByText(/O relato foi reaberto e o seu texto está salvo/)).toBeDefined()
  })

  it('falha de rede na reabertura oferece tentar de novo', async () => {
    dublê.enviar.mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(undefined)
    await reabrindo()

    fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
      target: { value: 'Voltou a travar.' },
    })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover ainda-quebrado.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledTimes(2))
    expect(dublê.enviar.mock.calls[1]?.[3]).toEqual({ envio: 'reopen' })
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
      anexo({ PublicId: 'a-criacao', ThumbnailUrl: 'http://armazenamento/criacao-thumb' }),
      anexo({
        PublicId: 'a-reabertura',
        ThumbnailUrl: 'http://armazenamento/reabertura-thumb',
        ReopenPublicId: 'r-1',
      }),
    ])
    render(<TrackingPage />)

    await screen.findByText('O que você anexou ao reabrir')

    const reabertura = screen.getByText('Você reabriu este relato').closest('li') as HTMLElement
    const imagens = (onde: ParentNode) =>
      Array.from(onde.querySelectorAll('img')).map((img) => img.getAttribute('src'))

    expect(imagens(reabertura)).toEqual(['http://armazenamento/reabertura-thumb'])

    const doRelato = screen.getByText('O que você anexou').parentElement as HTMLElement
    expect(imagens(doRelato)).toEqual(['http://armazenamento/criacao-thumb'])
  })

  it('print de uma reabertura que a página não conhece cai na galeria do relato', async () => {
    reabertoAntes()
    dublê.anexos.mockResolvedValue([
      anexo({
        ThumbnailUrl: 'http://armazenamento/perdido-thumb',
        ReopenPublicId: 'r-desconhecida',
      }),
    ])
    render(<TrackingPage />)

    await screen.findByText('O que você anexou')
    const doRelato = screen.getByText('O que você anexou').parentElement as HTMLElement
    expect(doRelato.querySelector('img')?.getAttribute('src')).toBe(
      'http://armazenamento/perdido-thumb',
    )
    expect(screen.queryByText('O que você anexou ao reabrir')).toBeNull()
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
