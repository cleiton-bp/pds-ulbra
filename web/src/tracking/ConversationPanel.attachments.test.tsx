// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PublicAttachmentViewModel,
  PublicMediaSettingsViewModel,
  PublicReportViewModel,
} from '@/contracts'
import { ConversationPanel } from '@/tracking/ConversationPanel'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **A resposta e gravada antes do arquivo, e o arquivo vai marcado como da
 * resposta.** E o que faz o texto nunca depender do upload, e o que faz o servidor
 * prender o print a resposta — e nao a criacao do relato.
 *
 * **Resposta que falha nao sobe arquivo nenhum.** Sem resposta gravada, nao ha a
 * que prender o arquivo.
 *
 * **O print aparece embaixo da fala que o trouxe.** E so com o projeto deixando
 * anexar ao responder o seletor aparece.
 */
const dublê = vi.hoisted(() => ({ responder: vi.fn(), enviar: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return { ...real, reportService: { replyToReport: dublê.responder } }
})

vi.mock('@/embed/sendAttachment', () => ({ sendAttachment: dublê.enviar }))

const media: PublicMediaSettingsViewModel = {
  IsEnabled: true,
  AllowsScreenCapture: true,
  AllowsOnInfoRequest: true,
  MaxFilesPerReport: 4,
  Kinds: [
    {
      Kind: 'Image',
      MaxCount: 3,
      MaxBytes: 5 * 1024 * 1024,
      MaxDurationSeconds: null,
      ContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
    },
  ],
}

function relato(mudanca: Partial<PublicReportViewModel> = {}): PublicReportViewModel {
  return {
    TrackingCode: '7K2M-9QXP-4TRV',
    Type: 'Bug',
    Text: 'o pagamento falha',
    CreatedAt: '2026-09-23T12:00:00.000Z',
    Journey: [],
    Closure: null,
    Conversation: [
      {
        PublicId: 'f-1',
        FromReporter: false,
        Body: 'manda a tela do erro?',
        CreatedAt: '2026-09-23T12:10:00.000Z',
      },
    ],
    InfoRequest: {
      CloseAt: '2026-09-30T12:00:00.000Z',
      IsWarning: false,
    } as PublicReportViewModel['InfoRequest'],
    CanReply: true,
    ...mudanca,
  } as PublicReportViewModel
}

const print = () => new File([new Uint8Array(100)], 'erro.png', { type: 'image/png' })

function montar(extra: Partial<Parameters<typeof ConversationPanel>[0]> = {}) {
  const aoAnexar = vi.fn()
  render(
    <ConversationPanel
      relato={relato()}
      protocolo="7K2M-9QXP-4TRV"
      token="tok-secreto"
      aoResponder={() => {}}
      media={media}
      aoAnexar={aoAnexar}
      {...extra}
    />,
  )
  return { aoAnexar }
}

function escolher(arquivo: File) {
  fireEvent.change(screen.getByLabelText('Escolher arquivo para anexar'), {
    target: { files: [arquivo] },
  })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('anexar ao responder', () => {
  it('com o projeto deixando, o seletor aparece na resposta', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Anexar arquivo' })).toBeDefined()
  })

  it('sem o projeto deixar, a resposta e so texto', () => {
    montar({ media: null })
    expect(screen.queryByRole('button', { name: 'Anexar arquivo' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Responder' })).toBeDefined()
  })

  it('grava a resposta primeiro, e sobe o arquivo marcado como da resposta', async () => {
    const ordem: string[] = []
    dublê.responder.mockImplementation(async () => {
      ordem.push('resposta')
      return relato({ CanReply: false, InfoRequest: null })
    })
    dublê.enviar.mockImplementation(async () => {
      ordem.push('arquivo')
    })
    const { aoAnexar } = montar()

    fireEvent.change(screen.getByLabelText('A sua resposta'), { target: { value: 'aqui está' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    expect(ordem).toEqual(['resposta', 'arquivo'])
    expect(dublê.enviar.mock.calls[0]?.[0]).toEqual({
      trackingCode: '7K2M-9QXP-4TRV',
      token: 'tok-secreto',
    })
    expect(dublê.enviar.mock.calls[0]?.[3]).toEqual({ forReply: true })
    await waitFor(() => expect(aoAnexar).toHaveBeenCalled())
  })

  it('resposta que falha nao sobe arquivo nenhum', async () => {
    dublê.responder.mockRejectedValue(new Error('rede'))
    montar()

    fireEvent.change(screen.getByLabelText('A sua resposta'), { target: { value: 'aqui está' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))

    await waitFor(() => expect(dublê.responder).toHaveBeenCalled())
    // O botao volta, e o arquivo escolhido continua na lista: nada se perde.
    await screen.findByRole('button', { name: 'Responder' })
    expect(screen.getByRole('button', { name: 'Remover erro.png' })).toBeDefined()
    expect(dublê.enviar).not.toHaveBeenCalled()
  })

  it('arquivo que falha depois da resposta avisa que a resposta esta salva', async () => {
    dublê.responder.mockResolvedValue(relato({ CanReply: false, InfoRequest: null }))
    dublê.enviar.mockRejectedValue(new Error('rede'))
    montar()

    fireEvent.change(screen.getByLabelText('A sua resposta'), { target: { value: 'aqui está' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))

    await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(screen.getByText(/A resposta foi enviada e o seu texto está salvo/)).toBeDefined()
  })

  it('o print aparece embaixo da fala que o trouxe', () => {
    const doTime: PublicAttachmentViewModel = {
      PublicId: 'a-1',
      Kind: 'Image',
      Url: 'http://armazenamento/a-1',
      ThumbnailUrl: 'http://armazenamento/a-1-thumb',
      ExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      DurationSeconds: null,
      ReplyPublicId: 'f-2',
      CreatedAt: '2026-09-23T12:20:00.000Z',
    }
    montar({
      relato: relato({
        CanReply: false,
        InfoRequest: null,
        Conversation: [
          {
            PublicId: 'f-1',
            FromReporter: false,
            Body: 'manda a tela?',
            CreatedAt: '2026-09-23T12:10:00.000Z',
          },
          {
            PublicId: 'f-2',
            FromReporter: true,
            Body: 'segue a tela',
            CreatedAt: '2026-09-23T12:20:00.000Z',
          },
        ],
      }),
      anexosPorFala: new Map([['f-2', [doTime]]]),
    })

    const fala = screen.getByText('segue a tela').closest('li') as HTMLElement
    expect(fala.querySelector('img')?.getAttribute('src')).toBe('http://armazenamento/a-1-thumb')
  })
})
