// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PanelAttachmentViewModel, ReportCommentsViewModel } from '@/contracts'
import { ReportAttachments, useReportAttachments } from '@/features/reports/ReportAttachments'
import { ReportComments } from '@/features/reports/ReportComments'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **Cada arquivo no lugar dele.** O da criacao vai para a secao de arquivos; o de
 * uma resposta vai para a conversa, embaixo da fala que o trouxe. Mostrar o da
 * resposta solto em "Arquivos" tiraria dele o que ele e: a resposta a uma pergunta.
 *
 * **A caixa interna nunca mostra arquivo**, mesmo que alguem passe um para ela. E a
 * estrutura que garante: so a caixa publica recebe o mapa.
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
    Url: 'http://armazenamento/inteiro',
    ThumbnailUrl: 'http://armazenamento/miniatura',
    ExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    SizeBytes: 120 * 1024,
    DurationSeconds: null,
    OriginalName: 'erro-no-pagamento.png',
    CameWithReply: false,
    ReplyPublicId: null,
    CreatedAt: '2026-09-23T12:00:00.000Z',
    ...mudanca,
  }
}

/** Monta como o dialogo monta: uma leitura, duas telas. */
function Dialogo() {
  const anexos = useReportAttachments('p-1', 'r-1')
  return (
    <>
      <ReportAttachments
        anexos={anexos.daCriacao}
        failed={anexos.failed}
        onReload={anexos.reload}
      />
      <ReportComments
        projectPublicId="p-1"
        reportPublicId="r-1"
        aoComentar={() => {}}
        anexosPorFala={anexos.porFala}
        aoExpirar={anexos.reload}
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
    expect(screen.queryByText('Arquivos')).toBeNull()
  })

  it('mostra o nome original e o tamanho ao abrir', async () => {
    dublê.listar.mockResolvedValue([anexo()])
    dublê.comentarios.mockResolvedValue({ Internal: [], Public: [] })
    render(<Dialogo />)

    fireEvent.click(await screen.findByRole('button', { name: /erro-no-pagamento\.png/ }))
    expect(screen.getByText('erro-no-pagamento.png · 120 KB')).toBeDefined()
  })

  it('o arquivo da resposta aparece embaixo da fala, e nao em "Arquivos"', async () => {
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
    expect(await screen.findByRole('button', { name: /tela-pedida\.png/ })).toBeDefined()
    expect(screen.queryByText('Arquivos')).toBeNull()
  })

  it('a caixa interna nunca mostra arquivo, mesmo recebendo um', async () => {
    // Um arquivo apontando para uma fala interna nao deveria existir. Se existir, a
    // caixa interna nao tem por onde mostra-lo.
    dublê.listar.mockResolvedValue([
      anexo({ OriginalName: 'nao-deveria.png', ReplyPublicId: 'i-1' }),
    ])
    dublê.comentarios.mockResolvedValue(conversa)
    render(<Dialogo />)

    await screen.findByText('nota interna')
    expect(screen.queryByRole('button', { name: /nao-deveria\.png/ })).toBeNull()
  })

  it('falha na leitura oferece tentar de novo, e tenta', async () => {
    dublê.listar.mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce([anexo()])
    dublê.comentarios.mockResolvedValue({ Internal: [], Public: [] })
    render(<Dialogo />)

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByText('Arquivos')).toBeDefined()
    expect(dublê.listar).toHaveBeenCalledTimes(2)
  })
})
