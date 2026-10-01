// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import type { Anexo } from '@/embed/attachments'
import { EmbedApp } from '@/embed/EmbedApp'
import type { CaptureOutcome } from '@/embed/hostBridge'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **A captura passa pelo editor antes de entrar.** Concluir poe na lista; sair do
 * editor e desistir da captura.
 *
 * **Toda imagem da lista abre no editor** — a escolhida, a colada, a capturada —, e
 * reabrir parte do original, com as marcas de antes: a tarja posta ontem ainda pode
 * sair.
 *
 * **O que sobe e o arquivo marcado, e a miniatura sai dele.** A miniatura do
 * original, com o que a tarja cobriu, iria junto e mostraria o que a pessoa escondeu.
 *
 * **No quadro, o editor pede espaco a pagina**, e devolve quando fecha.
 *
 * O editor aqui e o falso (`test/fakeImageEditor`): o desenho tem os testes dele.
 */
const dublê = vi.hoisted(() => ({ criar: vi.fn(), enviar: vi.fn(), miniatura: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return { ...real, reportService: { createReport: dublê.criar } }
})

vi.mock('@/embed/sendAttachment', () => ({ sendAttachment: dublê.enviar }))

// A miniatura carrega o nome do arquivo de que saiu: e assim que o teste sabe de qual.
vi.mock('@/embed/attachments', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/embed/attachments')>()
  return { ...real, makeThumbnail: dublê.miniatura }
})

vi.mock('@/editor/ImageEditor', () => import('@/test/fakeImageEditor'))

const config = {
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
  viewport: '1280x800',
}

const media: PublicMediaSettingsViewModel = {
  IsEnabled: true,
  AllowsScreenCapture: true,
  AllowsOnInfoRequest: true,
  AllowsOnReopen: true,
  Kinds: [
    {
      Kind: 'Image',
      MaxCount: 3,
      MaxBytes: 5 * 1024 * 1024,
      ContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
    },
  ],
}

function pagina() {
  return {
    init: null,
    show: vi.fn(),
    expand: vi.fn(),
    collapse: vi.fn(),
    enlarge: vi.fn(),
    canCapture: true,
    capture: vi.fn<(maxBytes: number | null) => Promise<CaptureOutcome>>(),
    stop: vi.fn(),
  }
}

function montar(host = pagina()) {
  render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={host} media={media} />)
  fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
  return host
}

const imagem = (nome: string) => new File([new Uint8Array(100)], nome, { type: 'image/png' })
const captura = () => new File([new Uint8Array(100)], 'captura.webp', { type: 'image/webp' })

function escolher(...arquivos: File[]) {
  fireEvent.change(screen.getByLabelText('Escolher imagem para anexar'), {
    target: { files: arquivos },
  })
}

/** Abre a imagem no editor. Ele chega por import dinamico: e preciso esperar. */
async function editar(nome: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Editar ${nome}` }))
  await screen.findByRole('dialog', { name: 'Editor falso' })
}

async function capturar(host: ReturnType<typeof pagina>) {
  host.capture.mockResolvedValue({ outcome: 'file', file: captura() })
  fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
  await screen.findByRole('dialog', { name: 'Editor falso' })
}

beforeEach(() => {
  dublê.miniatura.mockImplementation(
    async (arquivo: File) => new Blob([arquivo.name], { type: 'image/webp' }),
  )
  dublê.enviar.mockResolvedValue(undefined)
  dublê.criar.mockResolvedValue({
    TrackingCode: '7K2M-9QXP-4TRV',
    AccessToken: 'tok-secreto',
    CreatedAt: '2026-09-23T12:00:00.000Z',
    ReporterCode: null,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('o foco, quando o editor fecha', () => {
  it('volta ao "Editar" da miniatura que o abriu', async () => {
    montar()
    escolher(imagem('erro.png'))
    const editarBotao = await screen.findByRole('button', { name: 'Editar erro.png' })
    editarBotao.focus()
    await editar('erro.png')
    ;(document.activeElement as HTMLElement | null)?.blur()

    fireEvent.click(screen.getByRole('button', { name: 'Sair do editor' }))

    await waitFor(() => expect(document.activeElement).toBe(editarBotao))
  })

  it('o da captura volta ao botao de capturar', async () => {
    const host = montar()
    await capturar(host)

    fireEvent.click(screen.getByRole('button', { name: 'Sair do editor' }))

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Capturar tela' })),
    )
  })

  it('com uma captura no editor, capturar de novo nao pede outra', async () => {
    const host = montar()
    await capturar(host)

    fireEvent.click(screen.getByRole('button', { name: 'Capturar tela' }))
    await act(async () => {})

    expect(host.capture).toHaveBeenCalledTimes(1)
    expect(screen.getByText('editando captura.webp')).toBeDefined()
  })
})

describe('a captura passa pelo editor', () => {
  it('abre no editor com o teto de imagem, e so entra ao concluir', async () => {
    const host = montar()
    await capturar(host)

    expect(screen.getByText('editando captura.webp')).toBeDefined()
    expect(screen.getByText('modo add')).toBeDefined()
    expect(screen.getByText(`teto ${5 * 1024 * 1024}`)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Remover captura.webp' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Concluir sem marcas' }))

    await screen.findByRole('button', { name: 'Remover captura.webp' })
    expect(screen.queryByRole('dialog', { name: 'Editor falso' })).toBeNull()
  })

  it('sair do editor e desistir da captura: nada entra', async () => {
    const host = montar()
    await capturar(host)

    fireEvent.click(screen.getByRole('button', { name: 'Sair do editor' }))

    expect(screen.queryByRole('dialog', { name: 'Editor falso' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull()
  })

  it('marcada, entra o arquivo marcado; reabrir traz o original, com as marcas', async () => {
    const host = montar()
    await capturar(host)

    fireEvent.click(screen.getByRole('button', { name: 'Concluir com marcas' }))
    await editar('marcada-captura.webp')

    expect(screen.getByText('editando captura.webp')).toBeDefined()
    expect(screen.getByText('modo save')).toBeDefined()
    expect(screen.getByText('marcas 1')).toBeDefined()
  })

  it('aberto, o quadro pede o tamanho do editor; fechado, volta ao do formulario', async () => {
    const host = montar()
    host.expand.mockClear()
    await capturar(host)

    await waitFor(() => expect(host.enlarge).toHaveBeenCalledTimes(1))
    expect(host.expand).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Sair do editor' }))

    await waitFor(() => expect(host.expand).toHaveBeenCalledTimes(1))
    expect(host.enlarge).toHaveBeenCalledTimes(1)
  })
})

describe('toda imagem da lista abre no editor', () => {
  it('a escolhida abre; salva, o arquivo marcado toma o lugar dela', async () => {
    montar()
    escolher(imagem('erro.png'))

    await editar('erro.png')
    expect(screen.getByText('modo save')).toBeDefined()
    expect(screen.getByText('marcas 0')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Concluir com marcas' }))

    await screen.findByRole('button', { name: 'Remover marcada-erro.png' })
    expect(screen.queryByRole('button', { name: 'Remover erro.png' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Remover/ })).toHaveLength(1)
  })

  it('a colada tambem abre', async () => {
    montar()
    const formulario = screen.getByRole('textbox').closest('form') as HTMLFormElement
    fireEvent.paste(formulario, {
      clipboardData: { files: [imagem('colada.png')], getData: () => '' },
    })

    await editar('colada.png')
    expect(screen.getByText('editando colada.png')).toBeDefined()
  })

  it('diz que da para marcar, esconder e escolher o tamanho, quando ha imagem na lista', async () => {
    montar()
    const dica =
      /^Clique numa imagem para marcar ou esconder algo antes de enviar\. Embaixo dela, escolha o tamanho em que ela aparece\.$/
    expect(screen.queryByText(dica)).toBeNull()

    escolher(imagem('erro.png'))

    await screen.findByText(dica)
  })

  it('sair do editor deixa a imagem como estava', async () => {
    montar()
    escolher(imagem('erro.png'))

    await editar('erro.png')
    fireEvent.click(screen.getByRole('button', { name: 'Sair do editor' }))

    expect(screen.getByRole('button', { name: 'Remover erro.png' })).toBeDefined()
    expect(dublê.miniatura).toHaveBeenCalledTimes(1)
  })

  it('a miniatura sai do arquivo marcado, e nao do original', async () => {
    montar()
    escolher(imagem('senha.png'))

    await editar('senha.png')
    fireEvent.click(screen.getByRole('button', { name: 'Concluir com marcas' }))
    await screen.findByRole('button', { name: 'Remover marcada-senha.png' })

    const ultima = dublê.miniatura.mock.calls.at(-1)?.[0] as File
    expect(ultima.name).toBe('marcada-senha.png')
  })

  it('o que sobe e o arquivo marcado, com a miniatura dele', async () => {
    montar()
    escolher(imagem('senha.png'))
    await editar('senha.png')
    fireEvent.click(screen.getByRole('button', { name: 'Concluir com marcas' }))
    await screen.findByRole('button', { name: 'Remover marcada-senha.png' })

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o login trava' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledTimes(1))
    const enviado = dublê.enviar.mock.calls[0]?.[1] as Anexo
    expect(enviado.file.name).toBe('marcada-senha.png')
    expect(await (enviado.thumbnail as Blob).text()).toBe('marcada-senha.png')
  })

  it('reaberta e concluida sem marcas, volta a ser o original', async () => {
    montar()
    escolher(imagem('erro.png'))
    await editar('erro.png')
    fireEvent.click(screen.getByRole('button', { name: 'Concluir com marcas' }))

    await editar('marcada-erro.png')
    expect(screen.getByText('editando erro.png')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Concluir sem marcas' }))

    await screen.findByRole('button', { name: 'Remover erro.png' })
    // Sem marca nenhuma, nao ha o que reabrir: a proxima edicao comeca vazia.
    await editar('erro.png')
    expect(screen.getByText('marcas 0')).toBeDefined()
  })

  // Trocar um arquivo nao e acrescentar: com a lista no limite, a imagem marcada
  // ocupa a vaga dela mesma.
  it('com a lista cheia, salvar a marcada nao esbarra no limite', async () => {
    montar()
    escolher(imagem('a.png'), imagem('b.png'), imagem('c.png'))
    await screen.findByRole('button', { name: 'Remover c.png' })

    await editar('b.png')
    fireEvent.click(screen.getByRole('button', { name: 'Concluir com marcas' }))

    await screen.findByRole('button', { name: 'Remover marcada-b.png' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Remover/ })).toHaveLength(3)
  })

  it('tirada da lista com o editor aberto, salvar nao a traz de volta', async () => {
    montar()
    escolher(imagem('erro.png'))

    await editar('erro.png')
    fireEvent.click(screen.getByRole('button', { name: 'Remover erro.png' }))
    fireEvent.click(screen.getByRole('button', { name: 'Concluir com marcas' }))

    await act(async () => {})
    expect(screen.queryByRole('button', { name: /^Remover/ })).toBeNull()
  })

  it('com o relato indo, a imagem nao abre mais no editor', async () => {
    dublê.criar.mockReturnValue(new Promise(() => {}))
    montar()
    escolher(imagem('erro.png'))
    await screen.findByRole('button', { name: 'Editar erro.png' })

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o login trava' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Editar erro.png' })).toBeNull(),
    )
  })

  // A miniatura leva um instante. Reaberta nesse meio, a imagem trazia o original sem
  // as marcas — e a edicao seguinte subiria o que a tarja cobria.
  it('reaberta antes de a miniatura sair, traz as marcas, e nao o original', async () => {
    montar()
    escolher(imagem('senha.png'))
    await editar('senha.png')
    let soltar: () => void = () => {}
    dublê.miniatura.mockImplementationOnce(
      (arquivo: File) =>
        new Promise<Blob>((resolve) => {
          soltar = () => resolve(new Blob([arquivo.name], { type: 'image/webp' }))
        }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Concluir com marcas' }))

    await editar('marcada-senha.png')

    expect(screen.getByText('editando senha.png')).toBeDefined()
    expect(screen.getByText('marcas 1')).toBeDefined()
    await act(async () => soltar())
  })

  it('enquanto a miniatura nova nao sai, o envio espera', async () => {
    montar()
    escolher(imagem('senha.png'))
    await editar('senha.png')
    dublê.miniatura.mockImplementationOnce(() => new Promise(() => {}))

    fireEvent.click(screen.getByRole('button', { name: 'Concluir com marcas' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o login trava' } })

    const enviar = screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement
    expect(enviar.disabled).toBe(true)
    expect(dublê.criar).not.toHaveBeenCalled()
  })

  it('recusada, a imagem marcada sai da lista — e nao fica o original sem as marcas', async () => {
    montar()
    escolher(imagem('senha.png'))
    await editar('senha.png')

    fireEvent.click(screen.getByRole('button', { name: 'Concluir em formato recusado' }))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Só dá para anexar imagem: PNG, JPEG ou WebP. A imagem saiu da lista para não ir sem as marcas.',
    )
    expect(screen.queryByRole('button', { name: /^Remover/ })).toBeNull()
  })

  it('com o editor aberto, o relato nao sai', async () => {
    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o login trava' } })
    escolher(imagem('senha.png'))
    await editar('senha.png')

    fireEvent.submit(screen.getByRole('textbox').closest('form') as HTMLFormElement)
    await act(async () => {})

    expect(dublê.criar).not.toHaveBeenCalled()
  })

  it('colar dentro do editor nao anexa outra imagem na lista', async () => {
    montar()
    escolher(imagem('erro.png'))
    await editar('erro.png')

    fireEvent.paste(screen.getByRole('dialog', { name: 'Editor falso' }), {
      clipboardData: { files: [imagem('outra.png')], getData: () => '' },
    })
    await act(async () => {})

    expect(screen.queryByRole('button', { name: 'Remover outra.png' })).toBeNull()
  })
})
