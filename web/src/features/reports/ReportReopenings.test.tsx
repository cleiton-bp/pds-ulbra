// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PanelAttachmentViewModel, ReportReopeningViewModel } from '@/contracts'
import { ReportAttachments, useReportAttachments } from '@/features/reports/ReportAttachments'
import { ReportReopenings } from '@/features/reports/ReportReopenings'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O time le por que o relato voltou.** O motivo da reabertura era gravado e so
 * virava "quem relatou reabriu" no historico: o time sabia que voltou, e nao o que
 * faltou. Sem motivo, a tela diz que reabriu sem comentario, em vez de um vazio.
 *
 * **O print da reabertura fica junto do motivo, e nao em "Arquivos".** Ali ele
 * pareceria ter chegado com o relato — e ele e a prova de que o problema voltou
 * depois do encerramento.
 *
 * **Relato nunca reaberto nao ganha secao.**
 */
const dublê = vi.hoisted(() => ({ listar: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return { ...real, projectReportAttachmentService: { listAttachments: dublê.listar } }
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
    CameWithReopen: false,
    ReopenPublicId: null,
    CreatedAt: '2026-09-23T12:00:00.000Z',
    ...mudanca,
  }
}

function reabertura(mudanca: Partial<ReportReopeningViewModel> = {}): ReportReopeningViewModel {
  return {
    PublicId: 'r-1',
    Outcome: 'Done',
    ClosedAt: '2026-09-20T10:00:00.000Z',
    ReopenedAt: '2026-09-21T09:00:00.000Z',
    Comment: 'Voltou a travar depois da atualização.',
    ...mudanca,
  }
}

/** Monta como o dialogo monta: uma leitura, e cada arquivo no lugar dele. */
function Dialogo({ reaberturas }: { reaberturas: ReportReopeningViewModel[] }) {
  const anexos = useReportAttachments('p-1', 'r-1')
  return (
    <>
      <ReportAttachments
        anexos={anexos.daCriacao}
        failed={anexos.failed}
        onReload={anexos.reload}
        onExpired={anexos.refresh}
      />
      <ReportReopenings
        reaberturas={reaberturas}
        anexosPorReabertura={anexos.porReabertura}
        aoExpirar={anexos.refresh}
      />
    </>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('as reaberturas no relato do painel', () => {
  it('mostra o motivo, o desfecho contestado e quando reabriu', async () => {
    dublê.listar.mockResolvedValue([])
    render(<Dialogo reaberturas={[reabertura()]} />)

    expect(await screen.findByText('Reaberturas')).toBeDefined()
    expect(screen.getByText('Voltou a travar depois da atualização.')).toBeDefined()
    expect(screen.getByText(/Encerramento contestado: Foi feito/)).toBeDefined()
    expect(screen.getByText(/Quem relatou reabriu/)).toBeDefined()
  })

  it('sem motivo, diz que reabriu sem comentário', async () => {
    dublê.listar.mockResolvedValue([])
    render(<Dialogo reaberturas={[reabertura({ Comment: null })]} />)

    expect(await screen.findByText('Reabriu sem comentário.')).toBeDefined()
  })

  it('o arquivo da reabertura fica junto do motivo, e não em "Arquivos"', async () => {
    dublê.listar.mockResolvedValue([
      anexo({ PublicId: 'a-criacao', OriginalName: 'do-relato.png' }),
      anexo({
        PublicId: 'a-reabertura',
        OriginalName: 'ainda-quebrado.png',
        CameWithReopen: true,
        ReopenPublicId: 'r-2',
      }),
    ])
    render(
      <Dialogo
        reaberturas={[
          reabertura({ PublicId: 'r-1', Comment: 'Primeira volta.' }),
          reabertura({ PublicId: 'r-2', Comment: 'Segunda volta.' }),
        ]}
      />,
    )

    const doRelato = await screen.findByRole('button', { name: /do-relato\.png/ })
    const daReabertura = await screen.findByRole('button', { name: /ainda-quebrado\.png/ })

    // Na segunda reabertura, e so nela.
    const segunda = screen.getByText('Segunda volta.').closest('li') as HTMLElement
    const primeira = screen.getByText('Primeira volta.').closest('li') as HTMLElement
    expect(segunda.contains(daReabertura)).toBe(true)
    expect(primeira.contains(daReabertura)).toBe(false)

    // "Arquivos" e o que veio com o relato.
    const secaoArquivos = screen.getByText('Arquivos').closest('section') as HTMLElement
    expect(secaoArquivos.contains(doRelato)).toBe(true)
    expect(secaoArquivos.contains(daReabertura)).toBe(false)
  })

  it('relato nunca reaberto não ganha seção', async () => {
    dublê.listar.mockResolvedValue([anexo()])
    render(<Dialogo reaberturas={[]} />)

    await screen.findByText('Arquivos')
    expect(screen.queryByText('Reaberturas')).toBeNull()
  })
})
