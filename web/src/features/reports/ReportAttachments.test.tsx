// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PanelAttachmentViewModel, ReportCommentsViewModel } from '@/contracts'
import { ReportAttachments, useReportAttachments } from '@/features/reports/ReportAttachments'
import { ReportComments, useReportComments } from '@/features/reports/ReportComments'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **Cada arquivo no lugar dele, no tamanho que quem relatou escolheu.** O da criacao
 * vai para baixo do texto do relato; o de uma resposta vai para a conversa, embaixo
 * da fala que o trouxe. Mostrar o da resposta embaixo do relato tiraria dele o que
 * ele e: a resposta a uma pergunta.
 *
 * **A caixa interna nunca mostra arquivo**, mesmo que alguem passe um para ela. E a
 * estrutura que garante: so a caixa publica recebe o mapa.
 *
 * **O arquivo que nao acha a sua fala cai embaixo do relato, e nao some** — a conversa
 * que nao carregou, a resposta que chegou com o dialogo aberto. Enquanto a conversa
 * carrega, ele espera, em vez de aparecer num lugar e pular para outro.
 *
 * **Relato sem arquivo nao ganha secao**, e o time ve o nome original, que do lado
 * de fora nunca sai.
 */
const dublê = vi.hoisted(() => ({ listar: vi.fn(), comentarios: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportAttachmentService: { listAttachments: dublê.listar },
    projectReportService: { ...real.projectReportService, listComments: dublê.comentarios },
  }
})

function anexo(mudanca: Partial<PanelAttachmentViewModel> = {}): PanelAttachmentViewModel {
  return {
    PublicId: 'a-1',
    Kind: 'Image',
    DisplaySize: 'Full',
    ContentType: 'image/png',
    Url: 'http://armazenamento/inteiro',
    ThumbnailUrl: 'http://armazenamento/miniatura',
    ExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    SizeBytes: 120 * 1024,
    DurationSeconds: null,
    OriginalName: 'erro-no-pagamento.png',
    CameWithReply: false,
    ReplyPublicId: null,
    CameWithReopen: false,
    ReopenPublicId: null,
    CreatedAt: '2026-09-23T12:00:00.000Z',
    ...mudanca,
  }
}

/** Monta como o dialogo monta: a conversa e os arquivos lidos uma vez, duas telas. */
function Dialogo() {
  const conversa = useReportComments('p-1', 'r-1')
  const anexos = useReportAttachments('p-1', 'r-1', null, conversa.falas)
  return (
    <>
      <ReportAttachments
        anexos={anexos.daCriacao}
        failed={anexos.failed}
        onReload={anexos.reload}
        onExpired={anexos.refresh}
      />
      <ReportComments
        projectPublicId="p-1"
        reportPublicId="r-1"
        conversa={conversa}
        aoComentar={() => {}}
        anexosPorFala={anexos.porFala}
        aoExpirar={anexos.refresh}
      />
    </>
  )
}

const conversa: ReportCommentsViewModel = {
  Internal: [
    {
      PublicId: 'i-1',
      AuthorName: 'Ana',
      Body: 'nota interna',
      CreatedAt: '2026-09-23T12:00:00.000Z',
      EditedAt: null,
      IsYours: false,
    },
  ],
  Public: [
    {
      PublicId: 'c-1',
      FromReporter: true,
      AuthorName: null,
      Body: 'segue a tela',
      CreatedAt: '2026-09-23T12:05:00.000Z',
    },
  ],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('os arquivos no relato do painel', () => {
  it('sem arquivo, nao aparece secao', async () => {
    dublê.listar.mockResolvedValue([])
    dublê.comentarios.mockResolvedValue({ Internal: [], Public: [] })
    render(<Dialogo />)

    await vi.waitFor(() => expect(dublê.listar).toHaveBeenCalledWith('p-1', 'r-1'))
    expect(screen.queryByRole('list', { name: 'Imagens do relato' })).toBeNull()
  })

  // O time ve o relato como quem relatou o montou: a imagem inteira, no tamanho
  // escolhido. O nome original e o tamanho ficam embaixo, so para o time.
  it('mostra a imagem no tamanho escolhido, com o nome original e o tamanho embaixo', async () => {
    dublê.listar.mockResolvedValue([anexo({ DisplaySize: 'Small' })])
    dublê.comentarios.mockResolvedValue({ Internal: [], Public: [] })
    render(<Dialogo />)

    const lista = await screen.findByRole('list', { name: 'Imagens do relato' })
    expect(lista.querySelector('li')?.className).toBe('col-span-4')
    expect(lista.querySelector('img')?.getAttribute('src')).toBe('http://armazenamento/inteiro')
    expect(screen.getByText('erro-no-pagamento.png · 120 KB').tagName).toBe('FIGCAPTION')
  })

  it('o arquivo da resposta aparece embaixo da fala, e nao embaixo do relato', async () => {
    dublê.listar.mockResolvedValue([
      anexo({
        PublicId: 'a-2',
        OriginalName: 'tela-pedida.png',
        CameWithReply: true,
        ReplyPublicId: 'c-1',
      }),
    ])
    dublê.comentarios.mockResolvedValue(conversa)
    render(<Dialogo />)

    await screen.findByText('segue a tela')
    const daResposta = await screen.findByRole('list', { name: 'Imagens da resposta' })
    expect(within(daResposta).getByRole('img', { name: /tela-pedida\.png/ })).toBeDefined()
    expect(screen.queryByRole('list', { name: 'Imagens do relato' })).toBeNull()
  })

  it('a caixa interna nunca mostra arquivo, mesmo recebendo um', async () => {
    // Um arquivo apontando para uma fala interna nao deveria existir. Se existir, a
    // caixa interna nao tem por onde mostra-lo — e ele cai embaixo do relato, como
    // qualquer arquivo cuja fala nao esta na conversa publica.
    dublê.listar.mockResolvedValue([
      anexo({ OriginalName: 'nao-deveria.png', ReplyPublicId: 'i-1' }),
    ])
    dublê.comentarios.mockResolvedValue(conversa)
    render(<Dialogo />)

    await screen.findByText('nota interna')
    const doRelato = await screen.findByRole('list', { name: 'Imagens do relato' })
    expect(within(doRelato).getByRole('img', { name: /nao-deveria\.png/ })).toBeDefined()
    expect(screen.getAllByRole('img', { name: /nao-deveria\.png/ })).toHaveLength(1)
    expect(screen.queryByRole('list', { name: 'Imagens da resposta' })).toBeNull()
  })

  it('o arquivo de uma resposta que nao esta na conversa cai embaixo do relato, e nao some', async () => {
    // A resposta chegou com o dialogo aberto: a renovacao dos enderecos trouxe o
    // arquivo, e a conversa, lida antes, nao tem a fala.
    dublê.listar.mockResolvedValue([
      anexo({ PublicId: 'a-1', OriginalName: 'da-criacao.png' }),
      anexo({
        PublicId: 'a-2',
        OriginalName: 'resposta-nova.png',
        CameWithReply: true,
        ReplyPublicId: 'c-9',
      }),
    ])
    dublê.comentarios.mockResolvedValue(conversa)
    render(<Dialogo />)

    await screen.findByText('segue a tela')
    const doRelato = await screen.findByRole('list', { name: 'Imagens do relato' })
    const nomes = within(doRelato)
      .getAllByRole('img')
      .map((img) => img.getAttribute('alt'))
    // Depois dos da criacao, e nao no meio deles.
    expect(nomes).toEqual([
      'Imagem 1 de 2: da-criacao.png · 120 KB',
      'Imagem 2 de 2: resposta-nova.png · 120 KB · veio numa resposta',
    ])
  })

  it('o de uma reabertura que nao esta na tela tambem cai embaixo do relato, dizendo de onde veio', async () => {
    dublê.listar.mockResolvedValue([
      anexo({ OriginalName: 'ainda-quebra.png', CameWithReopen: true, ReopenPublicId: 'fx-1' }),
    ])
    dublê.comentarios.mockResolvedValue(conversa)
    // O detalhe falhou: nenhuma reabertura na tela.
    function SemReaberturas() {
      const leitura = useReportComments('p-1', 'r-1')
      const anexos = useReportAttachments('p-1', 'r-1', new Set(), leitura.falas)
      return (
        <ReportAttachments
          anexos={anexos.daCriacao}
          failed={anexos.failed}
          onReload={anexos.reload}
          onExpired={anexos.refresh}
        />
      )
    }
    render(<SemReaberturas />)

    expect(
      await screen.findByRole('img', {
        name: 'Imagem anexada: ainda-quebra.png · 120 KB · veio numa reabertura',
      }),
    ).toBeDefined()
  })

  it('a conversa que nao carregou: o arquivo da resposta cai embaixo do relato', async () => {
    dublê.listar.mockResolvedValue([
      anexo({ OriginalName: 'tela-pedida.png', CameWithReply: true, ReplyPublicId: 'c-1' }),
    ])
    dublê.comentarios.mockRejectedValue(new Error('rede'))
    render(<Dialogo />)

    await screen.findByText(/Não deu para carregar os comentários/)
    const doRelato = await screen.findByRole('list', { name: 'Imagens do relato' })
    expect(within(doRelato).getByRole('img', { name: /tela-pedida\.png/ })).toBeDefined()
  })

  it('enquanto a conversa carrega, o arquivo da resposta espera', async () => {
    dublê.listar.mockResolvedValue([
      anexo({ OriginalName: 'tela-pedida.png', CameWithReply: true, ReplyPublicId: 'c-1' }),
    ])
    let entregar!: (valor: ReportCommentsViewModel) => void
    dublê.comentarios.mockReturnValue(
      new Promise<ReportCommentsViewModel>((resolve) => {
        entregar = resolve
      }),
    )
    render(<Dialogo />)

    // Os arquivos ja chegaram; a conversa, nao. Embaixo do relato ele apareceria e,
    // um instante depois, pularia para a conversa.
    await waitFor(() => expect(dublê.listar).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('img', { name: /tela-pedida\.png/ })).toBeNull()

    await act(async () => entregar(conversa))
    const daResposta = await screen.findByRole('list', { name: 'Imagens da resposta' })
    expect(within(daResposta).getByRole('img', { name: /tela-pedida\.png/ })).toBeDefined()
    expect(screen.queryByRole('list', { name: 'Imagens do relato' })).toBeNull()
  })

  it('falha na leitura oferece tentar de novo, e tenta', async () => {
    dublê.listar.mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce([anexo()])
    dublê.comentarios.mockResolvedValue({ Internal: [], Public: [] })
    render(<Dialogo />)

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('list', { name: 'Imagens do relato' })).toBeDefined()
    expect(dublê.listar).toHaveBeenCalledTimes(2)
  })
})
