// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  InternalCommentViewModel,
  PublicCommentViewModel,
  ReportCommentsViewModel,
} from '@/contracts'
import { PanelError } from '@/data'
import { ReportComments, type ReportConversation } from '@/features/reports/ReportComments'
import { Toaster } from '@/shared/components/Toaster'
import { useToastStore } from '@/shared/components/toastStore'

/**
 * O QUE ESTES TESTES TRAVAM: a conversa do card aberto — corrigir, apagar e responder.
 *
 * - **O comentario entre o time se corrige e se apaga, so por quem o escreveu.** Corrigir
 *   e no lugar, com as mencoes de volta a "@Nome"; reenviado, o texto leva as marcas de
 *   quem ficou nele. O corrigido diz "· editado". Apagar pergunta antes.
 * - **A resposta a quem relatou espera 5 s com "Desfazer"** antes de sair: o "Desfazer"
 *   devolve o texto ao campo — sem apagar o que se comecou a escrever enquanto ele
 *   esperava —, e nada sai; fechar o card no meio envia na hora (quem clicou decidiu
 *   enviar). A falha depois da espera devolve o texto, com o motivo.
 * - **Ctrl+Enter (ou ⌘+Enter) envia** nas duas caixas e na correcao, e a dica e lida com
 *   o campo. Na caixa de quem relatou, o atalho passa pela mesma espera.
 */
const BRUNO = 'b1000000-0000-4000-8000-000000000002'
const JOAO = 'c1000000-0000-4000-8000-000000000003'

const dublê = vi.hoisted(() => ({
  comentarInterno: vi.fn(),
  comentarPublico: vi.fn(),
  corrigir: vi.fn(),
  apagar: vi.fn(),
  time: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectReportService: {
      addInternalComment: dublê.comentarInterno,
      addPublicComment: dublê.comentarPublico,
      editInternalComment: dublê.corrigir,
      deleteInternalComment: dublê.apagar,
    },
    projectTeamService: { listMembers: dublê.time },
  }
})

function interno(extra: Partial<InternalCommentViewModel> = {}): InternalCommentViewModel {
  return {
    PublicId: 'c-1',
    AuthorName: 'Ana Dona',
    Body: 'Acho que e o gateway.',
    CreatedAt: '2026-10-07T12:00:00.000Z',
    EditedAt: null,
    IsYours: true,
    ...extra,
  }
}

function publico(extra: Partial<PublicCommentViewModel> = {}): PublicCommentViewModel {
  return {
    PublicId: 'pc-1',
    FromReporter: false,
    AuthorName: 'Ana Dona',
    Body: 'Ja corrigimos, pode testar?',
    CreatedAt: '2026-10-07T12:00:00.000Z',
    ...extra,
  }
}

/** A conversa como o dialogo a entrega: lida, com o `revalidate` de depois de mudar. */
function conversa(data: ReportCommentsViewModel): ReportConversation {
  return {
    data,
    loading: false,
    failed: false,
    reload: vi.fn(),
    refresh: vi.fn(),
    revalidate: vi.fn(),
    falas: new Set(data.Public.map((fala) => fala.PublicId)),
  }
}

function montar(
  data: ReportCommentsViewModel = { Internal: [], Public: [] },
  props: Partial<ComponentProps<typeof ReportComments>> = {},
) {
  const lida = conversa(data)
  const aoComentar = vi.fn()
  const tela = render(
    <MemoryRouter>
      <ReportComments
        projectPublicId="p-1"
        reportPublicId="r-1"
        conversa={lida}
        aoComentar={aoComentar}
        {...props}
      />
      <Toaster />
    </MemoryRouter>,
  )
  return { ...tela, revalidate: lida.revalidate, aoComentar }
}

/** O comentario na tela, pelo texto dele. */
function comentario(texto: string | RegExp): HTMLElement {
  return screen.getByText(texto).closest('li') as HTMLElement
}

const caixaDeFora = () =>
  screen.getByRole('textbox', { name: 'Para quem relatou' }) as HTMLTextAreaElement
const caixaDeDentro = () =>
  screen.getByRole('textbox', { name: 'Entre o time' }) as HTMLTextAreaElement

/** O relogio anda, e as promessas que ele soltou terminam. */
async function passar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  for (const mock of Object.values(dublê)) mock.mockReset()
  dublê.time.mockResolvedValue([])
  dublê.comentarPublico.mockImplementation(
    async (_p: string, _r: string, corpo: { Body: string }) =>
      publico({ PublicId: 'pc-novo', Body: corpo.Body }),
  )
  dublê.comentarInterno.mockImplementation(
    async (_p: string, _r: string, corpo: { Body: string }) =>
      interno({ PublicId: 'c-novo', Body: corpo.Body }),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  useToastStore.setState({ toasts: [], hosts: [] })
})

describe('corrigir e apagar o comentario entre o time', () => {
  it('so o comentario de quem le tem "Editar" e "Apagar"; o corrigido diz "· editado"', () => {
    montar({
      Internal: [
        interno(),
        interno({
          PublicId: 'c-2',
          AuthorName: 'Bruno Membro',
          Body: 'Do Bruno.',
          EditedAt: '2026-10-07T13:00:00.000Z',
          IsYours: false,
        }),
      ],
      Public: [],
    })

    const meu = comentario('Acho que e o gateway.')
    expect(within(meu).getByRole('button', { name: 'Editar o seu comentário' })).toBeTruthy()
    expect(within(meu).getByRole('button', { name: 'Apagar o seu comentário' })).toBeTruthy()
    expect(within(meu).queryByText('· editado')).toBeNull()

    const doBruno = comentario('Do Bruno.')
    expect(within(doBruno).queryByRole('button')).toBeNull()
    expect(within(doBruno).getByText('· editado')).toBeTruthy()
  })

  it('editar traz as mencoes de volta a "@Nome", e salvar manda as marcas de quem ficou', async () => {
    dublê.corrigir.mockImplementation(
      async (_p: string, _r: string, id: string, corpo: { Body: string }) =>
        interno({ PublicId: id, Body: corpo.Body, EditedAt: '2026-10-08T12:00:00.000Z' }),
    )
    const { revalidate } = montar({
      Internal: [interno({ Body: `Olha @[Bruno Membro](${BRUNO}) e @[João Ávila](${JOAO})` })],
      Public: [],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Editar o seu comentário' }))
    const campo = screen.getByRole('textbox', {
      name: 'Corrigir o comentário',
    }) as HTMLTextAreaElement
    expect(campo.value).toBe('Olha @Bruno Membro e @João Ávila')
    // O foco entra no campo, com o cursor no fim.
    expect(document.activeElement).toBe(campo)
    expect(campo.selectionStart).toBe(campo.value.length)

    // O Bruno saiu do texto: so o Joao continua mencionado.
    fireEvent.change(campo, { target: { value: 'Olha @João Ávila, so ele' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(dublê.corrigir).toHaveBeenCalledWith('p-1', 'r-1', 'c-1', {
        Body: `Olha @[João Ávila](${JOAO}), so ele`,
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Corrigir o comentário' })).toBeNull(),
    )
    const corrigido = comentario('@João Ávila')
    expect(corrigido.textContent).toContain('Olha @João Ávila, so ele')
    expect(within(corrigido).getByText('· editado')).toBeTruthy()
    expect(revalidate).toHaveBeenCalled()
  })

  it('"Cancelar" e salvar sem mudanca saem sem gravar; Ctrl+Enter salva a correcao', async () => {
    dublê.corrigir.mockImplementation(
      async (_p: string, _r: string, id: string, corpo: { Body: string }) =>
        interno({ PublicId: id, Body: corpo.Body, EditedAt: '2026-10-08T12:00:00.000Z' }),
    )
    montar({ Internal: [interno()], Public: [] })
    const corrigir = () =>
      screen.getByRole('textbox', { name: 'Corrigir o comentário' }) as HTMLTextAreaElement

    fireEvent.click(screen.getByRole('button', { name: 'Editar o seu comentário' }))
    fireEvent.change(corrigir(), { target: { value: 'Outra coisa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('Acho que e o gateway.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Editar o seu comentário' }))
    fireEvent.keyDown(corrigir(), { key: 'Enter', ctrlKey: true })
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Corrigir o comentário' })).toBeNull(),
    )
    expect(dublê.corrigir).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Editar o seu comentário' }))
    fireEvent.change(corrigir(), { target: { value: 'E o gateway mesmo.' } })
    fireEvent.keyDown(corrigir(), { key: 'Enter', ctrlKey: true })
    await waitFor(() =>
      expect(dublê.corrigir).toHaveBeenCalledWith('p-1', 'r-1', 'c-1', {
        Body: 'E o gateway mesmo.',
      }),
    )
    expect(await screen.findByText('E o gateway mesmo.')).toBeTruthy()
  })

  it('a correcao recusada fica no campo, com o motivo', async () => {
    dublê.corrigir.mockRejectedValue(new PanelError('So quem escreveu corrige o comentario.', 403))
    montar({ Internal: [interno()], Public: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Editar o seu comentário' }))
    const campo = screen.getByRole('textbox', {
      name: 'Corrigir o comentário',
    }) as HTMLTextAreaElement
    fireEvent.change(campo, { target: { value: 'E o gateway mesmo.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(await screen.findByText(/corrige o comentário\./)).toBeTruthy()
    expect(campo.value).toBe('E o gateway mesmo.')
  })

  it('apagar pergunta antes; confirmado, o comentario sai e o aviso diz', async () => {
    dublê.apagar.mockResolvedValue(undefined)
    const { revalidate } = montar({ Internal: [interno()], Public: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Apagar o seu comentário' }))
    let pergunta = await screen.findByRole('alertdialog', { name: 'Apagar o comentário?' })
    expect(
      within(pergunta).getByText(
        'O comentário sai da conversa, e quem foi mencionado nele deixa de ver o aviso no sino.',
      ),
    ).toBeTruthy()
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(dublê.apagar).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Apagar o seu comentário' }))
    pergunta = await screen.findByRole('alertdialog', { name: 'Apagar o comentário?' })
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Apagar' }))

    await waitFor(() => expect(dublê.apagar).toHaveBeenCalledWith('p-1', 'r-1', 'c-1'))
    await waitFor(() => expect(screen.queryByText('Acho que e o gateway.')).toBeNull())
    expect(await screen.findByText('Comentário apagado.')).toBeTruthy()
    expect(revalidate).toHaveBeenCalled()
  })

  it('apagar que falha deixa o comentario, e o aviso diz o que nao foi feito', async () => {
    dublê.apagar.mockRejectedValue(new PanelError('So quem escreveu apaga o comentario.', 403))
    montar({ Internal: [interno()], Public: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Apagar o seu comentário' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Apagar' }),
    )

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /^Não deu para apagar o comentário\./,
    )
    expect(screen.getByText('Acho que e o gateway.')).toBeTruthy()
  })
})

describe('a resposta a quem relatou espera antes de sair', () => {
  it('espera 5 s com "Desfazer" na tela, e so entao sai', async () => {
    const { aoComentar } = montar()
    vi.useFakeTimers()

    fireEvent.change(caixaDeFora(), { target: { value: '  Ja corrigimos, pode testar?  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Escrever para quem relatou' }))

    const esperando = screen.getByRole('status')
    expect(esperando.textContent).toContain('Enviando para quem relatou…')
    expect(within(esperando).getByRole('button', { name: 'Desfazer' })).toBeTruthy()
    expect(caixaDeFora().value).toBe('')
    expect(
      (screen.getByRole('button', { name: 'Escrever para quem relatou' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    await passar(4999)
    expect(dublê.comentarPublico).not.toHaveBeenCalled()
    await passar(1)
    expect(dublê.comentarPublico).toHaveBeenCalledWith('p-1', 'r-1', {
      Body: 'Ja corrigimos, pode testar?',
    })
    expect(dublê.comentarPublico).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Enviando para quem relatou…')).toBeNull()
    expect(screen.getByText('Ja corrigimos, pode testar?')).toBeTruthy()
    expect(aoComentar).toHaveBeenCalled()
  })

  it('"Desfazer" devolve o texto ao campo, e nada sai', async () => {
    montar()
    vi.useFakeTimers()

    fireEvent.change(caixaDeFora(), { target: { value: 'Ja corrigimos, pode testar?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Escrever para quem relatou' }))
    await passar(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))

    expect(caixaDeFora().value).toBe('Ja corrigimos, pode testar?')
    expect(screen.queryByText('Enviando para quem relatou…')).toBeNull()
    await passar(10_000)
    expect(dublê.comentarPublico).not.toHaveBeenCalled()
  })

  it('o "Desfazer" nao apaga o que se escreveu no campo enquanto esperava', async () => {
    montar()
    vi.useFakeTimers()

    fireEvent.change(caixaDeFora(), { target: { value: 'Ja corrigimos.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Escrever para quem relatou' }))
    // Esqueceu de pedir o teste: comeca a escrever, e desfaz o envio para juntar.
    fireEvent.change(caixaDeFora(), { target: { value: 'Pode testar?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))

    expect(caixaDeFora().value).toBe('Ja corrigimos.\nPode testar?')
    await passar(10_000)
    expect(dublê.comentarPublico).not.toHaveBeenCalled()
  })

  it('fechar o card no meio da espera envia na hora: quem clicou decidiu enviar', () => {
    const { unmount } = montar()
    vi.useFakeTimers()

    fireEvent.change(caixaDeFora(), { target: { value: 'Ja corrigimos, pode testar?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Escrever para quem relatou' }))
    expect(dublê.comentarPublico).not.toHaveBeenCalled()

    unmount()
    expect(dublê.comentarPublico).toHaveBeenCalledWith('p-1', 'r-1', {
      Body: 'Ja corrigimos, pode testar?',
    })
  })

  it('desfeito, fechar o card nao envia nada', () => {
    const { unmount } = montar()
    vi.useFakeTimers()

    fireEvent.change(caixaDeFora(), { target: { value: 'Ja corrigimos, pode testar?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Escrever para quem relatou' }))
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    unmount()
    expect(dublê.comentarPublico).not.toHaveBeenCalled()
  })

  it('a resposta que falha depois da espera volta ao campo, com o motivo', async () => {
    dublê.comentarPublico.mockRejectedValue(
      new PanelError('Relato arquivado nao recebe resposta.', 409),
    )
    montar()
    vi.useFakeTimers()

    fireEvent.change(caixaDeFora(), { target: { value: 'Ja corrigimos, pode testar?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Escrever para quem relatou' }))
    await passar(5000)

    expect(dublê.comentarPublico).toHaveBeenCalledTimes(1)
    expect(caixaDeFora().value).toBe('Ja corrigimos, pode testar?')
    expect(screen.getByText(/não recebe resposta\./)).toBeTruthy()
  })

  it('no relato arquivado, a caixa de quem relatou so se le', () => {
    montar({ Internal: [], Public: [publico()] }, { paraQuemRelatou: 'ler' })
    expect(screen.getByText('Ja corrigimos, pode testar?')).toBeTruthy()
    expect(
      screen.getByText('O relato está arquivado. Para escrever a quem relatou, desarquive antes.'),
    ).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Para quem relatou' })).toBeNull()
  })
})

describe('Ctrl+Enter envia', () => {
  it('entre o time sai na hora; para quem relatou passa pela espera — e a dica e lida com o campo', async () => {
    montar()

    for (const campo of [caixaDeDentro(), caixaDeFora()]) {
      const dica = document.getElementById(campo.getAttribute('aria-describedby') ?? '')
      expect(dica?.textContent).toBe('Ctrl+Enter envia')
    }

    fireEvent.change(caixaDeDentro(), { target: { value: 'Acho que e o gateway.' } })
    fireEvent.keyDown(caixaDeDentro(), { key: 'Enter', ctrlKey: true })
    await waitFor(() =>
      expect(dublê.comentarInterno).toHaveBeenCalledWith('p-1', 'r-1', {
        Body: 'Acho que e o gateway.',
      }),
    )
    await waitFor(() => expect(caixaDeDentro().value).toBe(''))

    vi.useFakeTimers()
    fireEvent.change(caixaDeFora(), { target: { value: 'Ja corrigimos, pode testar?' } })
    // O ⌘ do Mac vale o mesmo.
    fireEvent.keyDown(caixaDeFora(), { key: 'Enter', metaKey: true })
    expect(screen.getByText('Enviando para quem relatou…')).toBeTruthy()
    expect(dublê.comentarPublico).not.toHaveBeenCalled()
    await passar(5000)
    expect(dublê.comentarPublico).toHaveBeenCalledTimes(1)
  })

  it('so o Enter, sem Ctrl, e quebra de linha: nada sai', () => {
    montar()
    fireEvent.change(caixaDeDentro(), { target: { value: 'Primeira linha' } })
    fireEvent.keyDown(caixaDeDentro(), { key: 'Enter' })
    fireEvent.change(caixaDeFora(), { target: { value: 'Primeira linha' } })
    fireEvent.keyDown(caixaDeFora(), { key: 'Enter' })
    expect(dublê.comentarInterno).not.toHaveBeenCalled()
    expect(screen.queryByText('Enviando para quem relatou…')).toBeNull()
  })
})
