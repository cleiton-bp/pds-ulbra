// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  PublicAttachmentViewModel,
  PublicMediaSettingsViewModel,
  PublicReportViewModel,
} from '@/contracts'
import { PanelError } from '@/data/errors'
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
 *
 * **Recusado (409) nao oferece "Tentar de novo", e nao prende a proxima
 * resposta.** A API disse que o envio fechou ou encheu: repetir levaria a mesma
 * resposta. O aviso fica ate a pessoa escolher outro arquivo, e o seletor volta
 * na hora — sem isso, um recusado deixava a pagina sem anexo ate recarregar.
 */
const dublê = vi.hoisted(() => ({ responder: vi.fn(), enviar: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return { ...real, reportService: { replyToReport: dublê.responder } }
})

vi.mock('@/embed/sendAttachment', () => ({ sendAttachment: dublê.enviar }))

vi.mock('@/editor/ImageEditor', () => import('@/test/fakeImageEditor'))

const media: PublicMediaSettingsViewModel = {
  IsEnabled: true,
  AllowsScreenCapture: true,
  AllowsOnInfoRequest: true,
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
  fireEvent.change(screen.getByLabelText('Escolher imagem para anexar'), {
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
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()
  })

  // O mesmo seletor do quadro: com quatro no total e tres imagens, a terceira
  // desliga o botao, em vez de deixa-lo ligado para uma recusa depois.
  it('sem vaga para imagem, o botao desliga', async () => {
    montar()
    const imagem = (nome: string) => new File([new Uint8Array(100)], nome, { type: 'image/png' })

    fireEvent.change(screen.getByLabelText('Escolher imagem para anexar'), {
      target: { files: [imagem('a.png'), imagem('b.png'), imagem('c.png')] },
    })

    await screen.findByRole('button', { name: 'Remover c.png' })
    expect(
      (screen.getByRole('button', { name: 'Anexar imagem' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('sem o projeto deixar, a resposta e so texto', () => {
    montar({ media: null })
    expect(screen.queryByRole('button', { name: /^Anexar/ })).toBeNull()
    expect(screen.queryByLabelText(/para anexar/)).toBeNull()
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
    expect(dublê.enviar.mock.calls[0]?.[3]).toMatchObject({ envio: 'reply' })
    await waitFor(() => expect(aoAnexar).toHaveBeenCalled())
  })

  // A resposta leva a lista como ela esta quando volta. O que entrasse durante
  // "Enviando…" ficaria de fora e sumiria sem aviso; o que saisse subiria mesmo assim.
  it('enquanto a resposta vai, a lista fica travada: nem pôr, nem tirar, nem colar', async () => {
    let gravar: (novo: PublicReportViewModel) => void = () => {}
    dublê.responder.mockImplementation(
      () =>
        new Promise<PublicReportViewModel>((resolve) => {
          gravar = resolve
        }),
    )
    dublê.enviar.mockResolvedValue(undefined)
    montar()

    const caixa = screen.getByLabelText('A sua resposta')
    fireEvent.change(caixa, { target: { value: 'aqui está' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))
    await screen.findByRole('button', { name: 'Enviando…' })

    expect(
      (screen.getByRole('button', { name: 'Anexar imagem' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.queryByRole('button', { name: 'Remover erro.png' })).toBeNull()
    const outro = new File([new Uint8Array(100)], 'outro.png', { type: 'image/png' })
    const colagem = fireEvent.paste(caixa.parentElement as HTMLElement, {
      clipboardData: { files: [outro], getData: () => '' },
    })
    expect(colagem).toBe(true)

    await act(async () => gravar(relato({ CanReply: false, InfoRequest: null })))
    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    expect(dublê.enviar.mock.calls[0]?.[1].file.name).toBe('erro.png')
  })

  // PrintScreen e Ctrl+V e como se anexa print de verdade. Texto de planilha, que
  // traz uma imagem junto, continua sendo texto.
  it('colar um print na resposta anexa, e texto colado continua texto', async () => {
    montar()
    const caixa = screen.getByLabelText('A sua resposta')

    expect(fireEvent.paste(caixa, { clipboardData: { files: [print()], getData: () => '' } })).toBe(
      false,
    )
    await screen.findByRole('button', { name: 'Remover erro.png' })

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

  it('recusado pela API diz o motivo, sem tentar de novo, e a próxima resposta já anexa', async () => {
    dublê.responder.mockResolvedValue(relato())
    dublê.enviar.mockRejectedValue(
      new PanelError(
        'Esta resposta ja tem o maximo de arquivos que o projeto permite, que e 4.',
        409,
      ),
    )
    montar()

    fireEvent.change(screen.getByLabelText('A sua resposta'), { target: { value: 'aqui está' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))

    await screen.findByText('não enviado')
    expect(screen.getByText(/que o projeto permite, que e 4/)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
    // O envio terminou: o seletor volta para a proxima resposta.
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()

    // Escolher outro arquivo e comecar outro envio: o aviso do anterior sai.
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    expect(screen.queryByText('não enviado')).toBeNull()
  })

  it('falha de rede continua oferecendo tentar de novo, e segura o seletor', async () => {
    dublê.responder.mockResolvedValue(relato())
    dublê.enviar.mockRejectedValue(new PanelError('Sem conexao.', 0))
    montar()

    fireEvent.change(screen.getByLabelText('A sua resposta'), { target: { value: 'aqui está' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))

    await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(screen.queryByText('não enviado')).toBeNull()
    // Enquanto um arquivo espera "tentar de novo", a lista e dele.
    expect(screen.queryByRole('button', { name: 'Anexar imagem' })).toBeNull()

    dublê.enviar.mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    await screen.findByRole('button', { name: 'Anexar imagem' })
    expect(screen.queryByText('Arquivos')).toBeNull()
  })

  // So o 409 da API e recusa. O armazenamento recusando uma assinatura vencida
  // (403) resolve com outra permissao, que e o que "tentar de novo" pede.
  it('armazenamento recusando a assinatura continua oferecendo tentar de novo', async () => {
    dublê.responder.mockResolvedValue(relato())
    dublê.enviar
      .mockRejectedValueOnce(new PanelError('O envio do arquivo falhou (erro 403).', 403))
      .mockResolvedValueOnce(undefined)
    montar()

    fireEvent.change(screen.getByLabelText('A sua resposta'), { target: { value: 'aqui está' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    expect(screen.queryByText('não enviado')).toBeNull()

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledTimes(2))
  })

  it('enquanto um arquivo ainda está entrando na lista, responder espera', async () => {
    let pronto: (imagem: { width: number; height: number }) => void = () => {}
    vi.stubGlobal(
      'createImageBitmap',
      () =>
        new Promise((resolve) => {
          pronto = resolve
        }),
    )

    try {
      montar()
      fireEvent.change(screen.getByLabelText('A sua resposta'), { target: { value: 'aqui está' } })
      escolher(print())

      const responder = screen.getByRole('button', { name: 'Responder' }) as HTMLButtonElement
      await waitFor(() => expect(responder.disabled).toBe(true))

      await act(async () => pronto({ width: 0, height: 0 }))
      await screen.findByRole('button', { name: 'Remover erro.png' })
      expect(responder.disabled).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('desistir do arquivo que falhou fecha o envio, e a próxima resposta já anexa', async () => {
    dublê.responder.mockResolvedValue(relato())
    dublê.enviar.mockRejectedValue(new PanelError('Sem conexao.', 0))
    montar()

    fireEvent.change(screen.getByLabelText('A sua resposta'), { target: { value: 'aqui está' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Desistir' }))

    expect(screen.queryByText('Arquivos')).toBeNull()
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()
  })

  it('outra resposta sem arquivo tira o aviso do recusado anterior', async () => {
    dublê.responder.mockResolvedValue(relato())
    dublê.enviar.mockRejectedValue(
      new PanelError('O prazo para anexar este arquivo terminou.', 409),
    )
    montar()

    fireEvent.change(screen.getByLabelText('A sua resposta'), { target: { value: 'aqui está' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))
    await screen.findByText('não enviado')

    fireEvent.change(screen.getByLabelText('A sua resposta'), {
      target: { value: 'mais uma coisa' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))

    await waitFor(() => expect(dublê.responder).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('não enviado')).toBeNull())
    expect(dublê.enviar).toHaveBeenCalledOnce()
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
      ReopenPublicId: null,
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

// A resposta ao pedido de informacao e onde o time pede "manda a tela": e a pessoa
// esconde o que nao quer mostrar ali tambem.
describe('marcar a imagem da resposta', () => {
  it('a imagem escolhida abre no editor, e a marcada toma o lugar dela', async () => {
    montar()
    escolher(print())

    fireEvent.click(await screen.findByRole('button', { name: 'Editar erro.png' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir com marcas' }))

    await screen.findByRole('button', { name: 'Remover marcada-erro.png' })
    expect(screen.queryByRole('button', { name: 'Remover erro.png' })).toBeNull()
  })

  it('com o editor aberto, a resposta nao sai', async () => {
    montar()
    fireEvent.change(screen.getByLabelText('A sua resposta'), { target: { value: 'segue a tela' } })
    escolher(print())
    fireEvent.click(await screen.findByRole('button', { name: 'Editar erro.png' }))
    await screen.findByRole('dialog', { name: 'Editor falso' })

    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))
    await act(async () => {})

    expect(dublê.responder).not.toHaveBeenCalled()
  })
})
