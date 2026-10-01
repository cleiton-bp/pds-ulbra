// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreatedReportViewModel, PublicMediaSettingsViewModel } from '@/contracts'
import { PanelError } from '@/data/errors'
import { EmbedApp } from '@/embed/EmbedApp'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O relato vem antes do arquivo, e o texto nunca depende do arquivo.** Enquanto
 * a pessoa escreve nada sobe; o envio comeca depois de o relato existir, com as
 * credenciais que sairam dele. E quando o arquivo falha, o protocolo continua na
 * tela e a frase diz que o texto esta salvo — e a parte que nao pode se perder.
 *
 * **Sem configuracao de midia, nao ha botao.** O quadro nao oferece o que nao sabe
 * se funciona.
 *
 * **Colar anexa.** E como se anexa print de verdade, e um teste que so
 * exercitasse o seletor deixaria a colagem quebrar em silencio.
 *
 * **Recusado nao e falha.** O 409 da API diz que o envio fechou ou encheu, e o
 * arquivo ja foi descartado: a tela diz o motivo e nao oferece tentar de novo. A
 * falha de rede continua oferecendo.
 */
const dublê = vi.hoisted(() => ({ criar: vi.fn(), enviar: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return { ...real, reportService: { createReport: dublê.criar } }
})

vi.mock('@/embed/sendAttachment', () => ({ sendAttachment: dublê.enviar }))

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

const criado: CreatedReportViewModel = {
  TrackingCode: '7K2M-9QXP-4TRV',
  AccessToken: 'tok-secreto',
  CreatedAt: '2026-09-23T12:00:00.000Z',
  ReporterCode: null,
}

const print = () => new File([new Uint8Array(100)], 'erro.png', { type: 'image/png' })

function escolher(arquivo: File) {
  fireEvent.change(screen.getByLabelText('Escolher imagem para anexar'), {
    target: { files: [arquivo] },
  })
}

function montar(comMidia = true) {
  render(
    <EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} media={comMidia ? media : null} />,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('o anexo no formulario', () => {
  it('sem configuracao de midia, nao ha botao', () => {
    montar(false)
    expect(screen.queryByRole('button', { name: /^Anexar/ })).toBeNull()
    expect(screen.queryByLabelText(/para anexar/)).toBeNull()
  })

  it('com midia, o botao aparece', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toBeDefined()
  })

  it('escolher um arquivo o poe na lista, e nada sobe ainda', async () => {
    montar()
    escolher(print())

    await screen.findByRole('button', { name: 'Remover erro.png' })
    expect(dublê.enviar).not.toHaveBeenCalled()
  })

  it('formato que o projeto nao aceita e recusado na hora, dizendo por que', async () => {
    montar()
    escolher(new File(['x'], 'contrato.pdf', { type: 'application/pdf' }))

    await screen.findByText('Só dá para anexar imagem: PNG, JPEG ou WebP.')
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull()
  })

  it('remover tira da lista', async () => {
    montar()
    escolher(print())

    fireEvent.click(await screen.findByRole('button', { name: 'Remover erro.png' }))
    expect(screen.queryByRole('button', { name: 'Remover erro.png' })).toBeNull()
  })

  it('colar um print anexa', async () => {
    montar()
    const formulario = screen.getByRole('textbox').closest('form') as HTMLFormElement

    // Um print de verdade traz so a imagem: texto nenhum.
    fireEvent.paste(formulario, { clipboardData: { files: [print()], getData: () => '' } })

    await screen.findByRole('button', { name: 'Remover erro.png' })
  })

  // O Finder, nos navegadores Chromium, poe o nome do arquivo como texto junto; o
  // gerenciador de arquivos do Linux, o caminho. Nao e texto da pessoa.
  it.each([
    ['o nome, como o Finder', 'erro.png'],
    ['o nome sem a extensão, que o Finder esconde', 'erro'],
    ['o caminho, como o Linux', '/home/ana/Imagens/erro.png'],
  ])('colar arquivo copiado com %s como texto continua anexando', async (_, texto) => {
    montar()
    const formulario = screen.getByRole('textbox').closest('form') as HTMLFormElement

    const colagem = fireEvent.paste(formulario, {
      clipboardData: {
        files: [print()],
        getData: (tipo: string) => (tipo === 'text/plain' ? texto : ''),
      },
    })

    expect(colagem).toBe(false)
    await screen.findByRole('button', { name: 'Remover erro.png' })
  })

  // O nome do arquivo e o do texto podem vir escritos cada um de um jeito: o acento
  // separado da letra, como o Mac grava o nome, ou junto dela, como se digita.
  it.each([
    ['o nome do arquivo com o acento separado', 'relato\u0301rio.png', 'relat\u00f3rio.png'],
    ['o texto com o acento separado', 'relat\u00f3rio.png', 'relato\u0301rio.png'],
  ])('colar arquivo de nome acentuado, com %s, continua anexando', async (_, nome, texto) => {
    montar()
    const formulario = screen.getByRole('textbox').closest('form') as HTMLFormElement
    const arquivo = new File([new Uint8Array(100)], nome, { type: 'image/png' })

    const colagem = fireEvent.paste(formulario, {
      clipboardData: {
        files: [arquivo],
        getData: (tipo: string) => (tipo === 'text/plain' ? texto : ''),
      },
    })

    expect(colagem).toBe(false)
    await screen.findByRole('button', { name: `Remover ${nome}` })
  })

  // A imagem salva de um site que entrega WebP num endereco .jpg, ou o PNG
  // renomeado: o navegador deduz o tipo pela extensao, e a API confere pelos bytes.
  it('imagem com a extensão trocada sobe com o tipo dos bytes', async () => {
    dublê.criar.mockResolvedValue(criado)
    dublê.enviar.mockResolvedValue(undefined)
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(new File([png], 'erro.jpg', { type: 'image/jpeg' }))
    await screen.findByRole('button', { name: 'Remover erro.jpg' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    expect(dublê.enviar.mock.calls[0]?.[1].file.type).toBe('image/png')
    expect(dublê.enviar.mock.calls[0]?.[1].file.name).toBe('erro.jpg')
  })

  it('arquivo vazio é recusado na hora, dizendo que está vazio', async () => {
    montar()
    escolher(new File([], 'erro.png', { type: 'image/png' }))

    await screen.findByText('O arquivo está vazio.')
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull()
  })

  // A planilha copia as celulas e, junto, uma imagem delas. Anexar a imagem
  // engoliria o texto que a pessoa quis colar.
  it('colar texto de planilha, que traz uma imagem junto, continua sendo colar texto', async () => {
    montar()
    const caixa = screen.getByRole('textbox')

    const colagem = fireEvent.paste(caixa, {
      clipboardData: {
        files: [print()],
        getData: (tipo: string) => (tipo === 'text/plain' ? 'pedido\tvalor\n123\t45,00' : ''),
      },
    })

    // O navegador segue com a colagem de texto: ninguem a cancelou.
    expect(colagem).toBe(true)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /^Remover/ })).toBeNull()
  })
})

describe('o envio', () => {
  it('cria o relato primeiro, e so depois sobe o arquivo com as credenciais dele', async () => {
    const ordem: string[] = []
    dublê.criar.mockImplementation(async () => {
      ordem.push('relato')
      return criado
    })
    dublê.enviar.mockImplementation(async () => {
      ordem.push('arquivo')
    })

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    expect(ordem).toEqual(['relato', 'arquivo'])
    expect(dublê.enviar.mock.calls[0]?.[0]).toEqual({
      trackingCode: '7K2M-9QXP-4TRV',
      token: 'tok-secreto',
    })
  })

  it('o protocolo aparece mesmo com o arquivo ainda subindo', async () => {
    dublê.criar.mockResolvedValue(criado)
    // Nunca resolve: o arquivo fica "subindo" para sempre.
    dublê.enviar.mockReturnValue(new Promise(() => {}))

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await screen.findByText('7K2M-9QXP-4TRV')
  })

  it('arquivo que falha nao leva o texto: o protocolo fica, e da para tentar de novo', async () => {
    dublê.criar.mockResolvedValue(criado)
    dublê.enviar.mockRejectedValue(new Error('rede'))

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(screen.getByText('7K2M-9QXP-4TRV')).toBeDefined()
    expect(screen.getByText(/seu texto está salvo/)).toBeDefined()
  })

  // A confirmacao pode entrar com a resposta perdida no caminho. Tentar de novo leva
  // a permissao cujo arquivo ja subiu — e a API responde que ele entrou, em vez de
  // outro igual entrar junto.
  it('tentar de novo depois de o arquivo subir leva a permissão que subiu', async () => {
    dublê.criar.mockResolvedValue(criado)
    dublê.enviar
      .mockImplementationOnce(
        async (
          _credenciais: unknown,
          _anexo: unknown,
          _progresso: unknown,
          opcoes: { onUploaded?: (publicId: string) => void },
        ) => {
          opcoes.onUploaded?.('p-1')
          throw new Error('rede')
        },
      )
      .mockResolvedValueOnce(undefined)

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    await screen.findByText('enviado')
    expect(dublê.enviar.mock.calls[0]?.[1].uploaded).toBeNull()
    expect(dublê.enviar.mock.calls[1]?.[1].uploaded).toBe('p-1')
  })

  it('tentar de novo manda o mesmo arquivo outra vez', async () => {
    dublê.criar.mockResolvedValue(criado)
    dublê.enviar.mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(undefined)

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    await screen.findByText('enviado')
    expect(dublê.enviar).toHaveBeenCalledTimes(2)
  })

  // O prazo da criacao fechou, ou o envio encheu: a API responde 409 e ja apagou o
  // arquivo. "Tentar de novo" levaria a mesma resposta.
  it('arquivo recusado pela API diz o motivo, e não oferece tentar de novo', async () => {
    dublê.criar.mockResolvedValue(criado)
    dublê.enviar.mockRejectedValue(
      new PanelError('O prazo para anexar arquivos a este relato terminou.', 409),
    )

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await screen.findByText('não enviado')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
    expect(screen.getByText(/seu texto está salvo/)).toBeDefined()
    expect(screen.getByText(/O prazo para anexar arquivos a este relato terminou/)).toBeDefined()
    expect(screen.getByText('7K2M-9QXP-4TRV')).toBeDefined()
  })

  // O envio sobe a lista como ela esta quando comeca: um arquivo que ainda esta
  // virando miniatura ficaria de fora sem ninguem saber.
  it('enquanto um arquivo ainda está entrando na lista, enviar espera', async () => {
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
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
      escolher(print())

      const enviar = screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement
      await waitFor(() => expect(enviar.disabled).toBe(true))

      await act(async () => pronto({ width: 0, height: 0 }))
      await screen.findByRole('button', { name: 'Remover erro.png' })
      expect(enviar.disabled).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // O dono desligou o anexo depois de o quadro abrir: a configuracao que o quadro leu
  // ainda deixava, e a API recusa no pedido. Repetir levaria a mesma resposta.
  it('projeto que deixou de aceitar anexo depois de o quadro abrir: não enviado, com o motivo', async () => {
    dublê.criar.mockResolvedValue(criado)
    dublê.enviar.mockRejectedValue(new PanelError('Este projeto nao aceita anexo.', 409))

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await screen.findByText('não enviado')
    expect(screen.getByText('Este projeto nao aceita anexo.')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
    expect(screen.getByText(/seu texto está salvo/)).toBeDefined()
  })

  // O envio leva a lista como ela esta. Tirar um arquivo durante "Enviando…" nao o
  // impediria de subir — e o que sai da tela nao pode ir para o time —, e o que
  // entrasse ficaria "na fila" para sempre.
  it('durante o envio a lista fica travada: nem tirar, nem pôr, nem colar, nem capturar', async () => {
    let criar: (relato: CreatedReportViewModel) => void = () => {}
    dublê.criar.mockImplementation(
      () =>
        new Promise<CreatedReportViewModel>((resolve) => {
          criar = resolve
        }),
    )
    dublê.enviar.mockResolvedValue(undefined)

    montar()
    const formulario = screen.getByRole('textbox').closest('form') as HTMLFormElement
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findByRole('button', { name: 'Enviando…' })

    expect(screen.queryByRole('button', { name: 'Remover erro.png' })).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Anexar imagem' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    const outro = new File([new Uint8Array(100)], 'outro.png', { type: 'image/png' })
    expect(
      fireEvent.paste(formulario, { clipboardData: { files: [outro], getData: () => '' } }),
    ).toBe(true)

    await act(async () => criar(criado))
    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    expect(dublê.enviar.mock.calls[0]?.[1].file.name).toBe('erro.png')
    expect(screen.queryByText('outro.png')).toBeNull()
  })

  // Com arquivos na lista e o codigo pessoal, a confirmacao passa da altura do
  // quadro. O que ficaria fora e o link que aparece uma vez so, e o "Fechar".
  it('a confirmação rola quando passa da altura do quadro', async () => {
    dublê.criar.mockResolvedValue(criado)

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    const protocolo = await screen.findByText('7K2M-9QXP-4TRV')
    expect(protocolo.closest('section')?.classList.contains('overflow-y-auto')).toBe(true)
  })

  it('sem arquivo, nada sobe', async () => {
    dublê.criar.mockResolvedValue(criado)

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await screen.findByText('7K2M-9QXP-4TRV')
    expect(dublê.enviar).not.toHaveBeenCalled()
  })
})

/**
 * A FILA DEPOIS DO ENVIO, E ENQUANTO OS ARQUIVOS SAO PREPARADOS.
 *
 * **Fechar o quadro nao abandona os arquivos de um relato que ja existe.** A tela
 * nova nao ve o envio antigo, mas ele vai ate o fim.
 *
 * **Uma escolha que termina depois de o quadro reiniciar nao entra no formulario
 * novo**, e duas escolhas ao mesmo tempo nao passam juntas do limite.
 */
describe('a fila de arquivos', () => {
  const nomeado = (nome: string) => new File([new Uint8Array(100)], nome, { type: 'image/png' })
  const pagina = {
    init: null,
    show: vi.fn(),
    expand: vi.fn(),
    collapse: vi.fn(),
    enlarge: vi.fn(),
    stop: vi.fn(),
  }

  /** A miniatura so sai quando o teste mandar: e o arquivo "ainda sendo preparado". */
  function segurarMiniatura() {
    const prontos: Array<(imagem: { width: number; height: number }) => void> = []
    vi.stubGlobal(
      'createImageBitmap',
      () =>
        new Promise((resolve) => {
          prontos.push(resolve)
        }),
    )
    return prontos
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('relatar outra coisa no meio do envio não abandona os arquivos do relato', async () => {
    dublê.criar.mockResolvedValue(criado)
    let terminarPrimeiro: () => void = () => {}
    dublê.enviar
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            terminarPrimeiro = resolve
          }),
      )
      .mockResolvedValue(undefined)

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(nomeado('primeiro.png'))
    await screen.findByRole('button', { name: 'Remover primeiro.png' })
    escolher(nomeado('segundo.png'))
    await screen.findByRole('button', { name: 'Remover segundo.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Relatar outra coisa' }))

    // O formulario novo esta limpo...
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText('segundo.png')).toBeNull()

    // ...e o segundo arquivo do relato anterior sobe mesmo assim.
    await act(async () => terminarPrimeiro())
    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledTimes(2))
    expect(dublê.enviar.mock.calls[1]?.[1].file.name).toBe('segundo.png')
    expect(dublê.enviar.mock.calls[1]?.[0]).toEqual({
      trackingCode: '7K2M-9QXP-4TRV',
      token: 'tok-secreto',
    })
    expect(screen.queryByText('segundo.png')).toBeNull()
  })

  it('arquivo escolhido antes de fechar o quadro não aparece no formulário reaberto', async () => {
    const prontos = segurarMiniatura()
    render(
      <EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} media={media} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))

    escolher(nomeado('antigo.png'))
    await waitFor(() => expect(prontos).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))

    await act(async () => prontos[0]?.({ width: 0, height: 0 }))
    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))

    expect(screen.queryByRole('button', { name: 'Remover antigo.png' })).toBeNull()
  })

  it('duas escolhas ao mesmo tempo não passam juntas do limite', async () => {
    const prontos = segurarMiniatura()
    render(
      <EmbedApp
        settings={DEFAULT_WIDGET_SETTINGS}
        config={config}
        media={{ ...media, MaxFilesPerReport: 1 }}
      />,
    )

    escolher(nomeado('primeiro.png'))
    await waitFor(() => expect(prontos).toHaveLength(1))
    // O primeiro ainda nao entrou na lista, mas ja ocupa a vaga.
    escolher(nomeado('segundo.png'))

    expect(await screen.findByText('Cabe até 1 arquivo por envio.')).toBeDefined()
    await act(async () => prontos[0]?.({ width: 0, height: 0 }))

    await screen.findByRole('button', { name: 'Remover primeiro.png' })
    expect(screen.queryByRole('button', { name: 'Remover segundo.png' })).toBeNull()
  })

  it('fechar com o relato ainda sendo criado não abandona os arquivos, nem o código', async () => {
    let criar: (relato: CreatedReportViewModel) => void = () => {}
    dublê.criar.mockImplementation(
      () =>
        new Promise<CreatedReportViewModel>((resolve) => {
          criar = resolve
        }),
    )
    dublê.enviar.mockResolvedValue(undefined)
    window.localStorage.clear()

    render(
      <EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} media={media} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(nomeado('erro.png'))
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await act(async () => criar({ ...criado, ReporterCode: 'H7QK-3M2X-P9WD' }))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    expect(dublê.enviar.mock.calls[0]?.[1].file.name).toBe('erro.png')
    expect(dublê.enviar.mock.calls[0]?.[0]).toEqual({
      trackingCode: '7K2M-9QXP-4TRV',
      token: 'tok-secreto',
    })
    expect(JSON.stringify(window.localStorage)).toContain('H7QK-3M2X-P9WD')

    // O quadro reaberto e o formulario de quem ainda nao relatou.
    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
    expect(screen.queryByText('7K2M-9QXP-4TRV')).toBeNull()
  })

  it('arquivo que falha pode ser deixado de lado', async () => {
    dublê.criar.mockResolvedValue(criado)
    dublê.enviar.mockRejectedValue(new Error('rede'))

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(nomeado('erro.png'))
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Desistir' }))

    expect(screen.queryByText('erro.png')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
    expect(screen.getByText('7K2M-9QXP-4TRV')).toBeDefined()
  })
})
