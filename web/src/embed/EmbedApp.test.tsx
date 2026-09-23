// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CreatedReportViewModel,
  ReporterCodeReportsViewModel,
  WidgetSettingsViewModel,
} from '@/contracts'
import { EmbedApp } from '@/embed/EmbedApp'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * O quadro tem dois modos e a diferenca entre eles nao e estetica: dentro de uma
 * pagina ele comeca **recolhido**, porque quem visita o site do cliente nao pediu
 * um formulario no meio da tela. Aberto direto, comeca no formulario, que e como
 * ele se demonstra sem carregador.
 *
 * E o token de acompanhamento **nao aparece como texto, e existe dentro do
 * link**. As duas metades importam, e a pds-017 trocou a razao da primeira: antes
 * nao havia pagina de acompanhamento e mostrar o segredo nao servia para nada;
 * agora ele serve, e continua nao podendo ser lido na tela — ninguem decora 43
 * caracteres, e imprimir segredo ensina quem le a tratar segredo como enfeite.
 *
 * A metade nova e a **forma do endereco**: o token depois do `#`, o protocolo
 * antes. Trocar a ordem dos dois argumentos de `buildTrackingLink` continuaria
 * abrindo a pagina — o link funciona igual — e poria o segredo na parte do
 * endereco que viaja para o servidor. Por isso a asserticao e sobre o `href`, e
 * nao sobre a tela.
 */
const dublê = vi.hoisted(() => ({ criar: vi.fn(), listar: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return {
    ...real,
    reportService: { createReport: dublê.criar, listByReporterCode: dublê.listar },
  }
})

const config = {
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
  viewport: '1280x800',
}
const pagina = {
  init: null,
  show: vi.fn(),
  expand: vi.fn(),
  collapse: vi.fn(),
  enlarge: vi.fn(),
  stop: vi.fn(),
}

function comSettings(mudanca: Partial<WidgetSettingsViewModel>): WidgetSettingsViewModel {
  return { ...DEFAULT_WIDGET_SETTINGS, ...mudanca }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('o quadro dentro de uma pagina', () => {
  it('comeca recolhido, mostrando so o gatilho', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} />)

    expect(screen.getByRole('button', { name: 'Relatar' })).toBeDefined()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('abrir o gatilho pede o tamanho maior a pagina', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} />)
    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))

    expect(pagina.expand).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('o rotulo do gatilho vem da configuracao', () => {
    render(
      <EmbedApp
        settings={comSettings({ LauncherLabel: 'Fale com a gente' })}
        config={config}
        host={pagina}
      />,
    )

    expect(screen.getByRole('button', { name: 'Fale com a gente' })).toBeDefined()
  })
})

describe('o quadro aberto direto, sem pagina', () => {
  it('ja nasce no formulario', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)

    expect(screen.getByRole('textbox')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Fechar' })).toBeNull()
  })
})

describe('o formulario', () => {
  it('nao envia vazio: o botao so libera com texto', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)
    const enviar = screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement

    expect(enviar.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    expect(enviar.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'algo quebrou' } })
    expect(enviar.disabled).toBe(false)
  })

  it('esconde o seletor de tipo quando a configuracao manda, e envia o tipo padrao', async () => {
    dublê.criar.mockResolvedValue({
      TrackingCode: 'ABCD-EFGH-IJKL',
      AccessToken: 'token-secreto',
      CreatedAt: '2026-09-12T00:00:00Z',
      // Nulo: estes testes rodam em projeto no modo protocolo, que nao entrega codigo.
      ReporterCode: null,
    })

    render(
      <EmbedApp
        settings={comSettings({ ShowsTypeField: false, DefaultReportType: 'Question' })}
        config={config}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Defeito' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'como faço isso?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())
    expect(dublê.criar.mock.calls[0]?.[0]).toMatchObject({ Type: 'Question', Route: '/checkout' })
  })

  it('mostra o protocolo, e o token so dentro do link — nunca como texto', async () => {
    dublê.criar.mockResolvedValue({
      TrackingCode: 'ABCD-EFGH-IJKL',
      AccessToken: 'token-secreto-que-nao-pode-vazar',
      CreatedAt: '2026-09-12T00:00:00Z',
      // Nulo: estes testes rodam em projeto no modo protocolo, que nao entrega codigo.
      ReporterCode: null,
    })

    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'algo quebrou' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(screen.getByText('ABCD-EFGH-IJKL')).toBeDefined())
    expect(document.body.textContent).not.toContain('token-secreto-que-nao-pode-vazar')

    // `textContent` nao ve atributo, entao a asserticao acima ficaria verde com o
    // token no `href` de qualquer forma. Esta e a que olha o endereco.
    const link = screen.getByRole('link', { name: 'Acompanhar este relato' })
    const endereco = link.getAttribute('href') ?? ''
    const [antesDoFragmento, fragmento] = endereco.split('#')

    expect(antesDoFragmento).toContain('c=ABCD-EFGH-IJKL')
    expect(antesDoFragmento).not.toContain('token-secreto-que-nao-pode-vazar')
    expect(fragmento).toBe('t=token-secreto-que-nao-pode-vazar')
  })

  /**
   * O quadro vive o tempo da pagina. Numa aplicacao de pagina unica isso sao
   * horas, e `created` ficava gravado o tempo todo: quem relatava, fechava e
   * abria de novo reencontrava o protocolo antigo, sem caminho de volta para
   * escrever. So recarregando a pagina dava para relatar de novo.
   */
  it('depois de enviar da para relatar outra coisa, sem recarregar', async () => {
    dublê.criar.mockResolvedValue({
      TrackingCode: 'ABCD-EFGH-IJKL',
      AccessToken: 'x',
      CreatedAt: '2026-09-12T00:00:00Z',
      // Nulo: estes testes rodam em projeto no modo protocolo, que nao entrega codigo.
      ReporterCode: null,
    })

    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'algo quebrou' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(screen.getByText('ABCD-EFGH-IJKL')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Relatar outra coisa' }))

    // Formulario de volta, e vazio: nada do relato anterior sobra.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByText('ABCD-EFGH-IJKL')).toBeNull()
  })

  it('fechar o quadro limpa o relato enviado, e reabrir mostra o formulario', async () => {
    dublê.criar.mockResolvedValue({
      TrackingCode: 'ABCD-EFGH-IJKL',
      AccessToken: 'x',
      CreatedAt: '2026-09-12T00:00:00Z',
      // Nulo: estes testes rodam em projeto no modo protocolo, que nao entrega codigo.
      ReporterCode: null,
    })

    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} />)
    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'algo quebrou' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(screen.getByText('ABCD-EFGH-IJKL')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))

    expect(screen.getByRole('textbox')).toBeDefined()
    expect(screen.queryByText('ABCD-EFGH-IJKL')).toBeNull()
  })

  /**
   * As tres corridas que a revisao encontrou depois da primeira correcao. Todas
   * tem a mesma causa: fechar o quadro **com o envio em voo**. O pedido ja saiu
   * e o relato existe no servidor; o que nao pode e a resposta voltar para a
   * tela de quem desistiu.
   */
  describe('fechar com o envio em voo', () => {
    /** Uma promessa que so resolve quando o teste mandar. */
    function emVoo<T>() {
      let entregar: (valor: T) => void = () => {}
      let falhar: (erro: unknown) => void = () => {}
      const promessa = new Promise<T>((ok, erro) => {
        entregar = ok
        falhar = erro
      })
      return { promessa, entregar, falhar }
    }

    it('sucesso que chega depois do fechamento nao reaparece', async () => {
      const voo = emVoo<CreatedReportViewModel>()
      dublê.criar.mockReturnValue(voo.promessa)

      render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} />)
      fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'algo quebrou' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
      voo.entregar({
        TrackingCode: 'VELHO-VELHO-VELH',
        AccessToken: 'x',
        CreatedAt: '2026-09-12T00:00:00Z',
        // Nulo: estes testes rodam em projeto no modo protocolo, que nao entrega codigo.
        ReporterCode: null,
      })
      await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())

      fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
      expect(screen.queryByText('VELHO-VELHO-VELH')).toBeNull()
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('')
    })

    it('erro que chega depois do fechamento nao reaparece', async () => {
      const voo = emVoo<CreatedReportViewModel>()
      dublê.criar.mockReturnValue(voo.promessa)

      render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} />)
      fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'algo quebrou' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
      voo.falhar(new Error('caiu'))
      await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())

      fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('o relato escrito depois nao e engolido pela resposta do anterior', async () => {
      const voo = emVoo<CreatedReportViewModel>()
      dublê.criar.mockReturnValue(voo.promessa)

      render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={pagina} />)
      fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'primeiro' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
      fireEvent.click(screen.getByRole('button', { name: 'Relatar' }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'segundo, escrito agora' } })

      voo.entregar({
        TrackingCode: 'VELHO-VELHO-VELH',
        AccessToken: 'x',
        CreatedAt: '2026-09-12T00:00:00Z',
        // Nulo: estes testes rodam em projeto no modo protocolo, que nao entrega codigo.
        ReporterCode: null,
      })
      await waitFor(() => expect(dublê.criar).toHaveBeenCalledOnce())

      expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
        'segundo, escrito agora',
      )
      expect(screen.queryByText('VELHO-VELHO-VELH')).toBeNull()
    })
  })

  /**
   * O defeito era o `Button` do painel: toda variante dele traz
   * `enabled:hover:bg-surface-sunken`, o `cn` nao descarta esse conflito (o
   * prefixo de variante e outro eixo) e no hover a cor do cliente sumia. O
   * conserto foi abandonar o `Button` no quadro — e a causa raiz continua no
   * `cn`, entao so um teste impede alguem de voltar a usa-lo aqui.
   */
  it('nenhum controle com a cor do cliente carrega hover de superficie', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)

    const comACorDoCliente = [...document.querySelectorAll('*')].filter((elemento) =>
      elemento.className?.toString().includes('--widget-accent'),
    )

    expect(comACorDoCliente.length).toBeGreaterThan(0)

    const infratores = comACorDoCliente
      .map((elemento) => elemento.className.toString())
      .filter((classes) => /(?:hover|focus|active):bg-(?!\[var)/.test(classes))

    expect(infratores).toEqual([])
  })

  /**
   * Em janela baixa o carregador entrega um quadro menor do que o formulario
   * gostaria. O textarea tinha `min-h-28` e travava em 112px, empurrando o botao
   * para fora de um documento que nao rola: a pessoa escrevia o relato inteiro e
   * o "Enviar" ficava inalcancavel. jsdom nao faz layout, entao o que da para
   * travar aqui e a **causa**: a caixa precisa poder encolher, e o rodape nao.
   */
  it('a caixa de texto pode encolher e o botao nao', () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)

    const caixa = screen.getByRole('textbox').className
    expect(caixa).toMatch(/\bmin-h-0\b/)
    expect(caixa).not.toMatch(/\bmin-h-(?!0\b)[\w.[\]]+/)

    const enviar = screen.getByRole('button', { name: 'Enviar' }).className
    expect(enviar).toMatch(/\bshrink-0\b/)

    // E o formulario rola quando nem assim couber.
    const formulario = screen.getByRole('textbox').closest('form')
    expect(formulario?.className).toMatch(/\boverflow-y-auto\b/)
  })

  it('falha de envio vira aviso na tela, e o texto escrito nao se perde', async () => {
    dublê.criar.mockRejectedValue(new Error('caiu'))

    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'algo quebrou' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('algo quebrou')
  })
})

/**
 * A ESCOLHA DE QUEM RELATA.
 *
 * **E dela, e nao do projeto** — o projeto so decide como a caixa comeca. Prometer
 * resposta a quem nao vai responder deixa o relato pendurado esperando, e e esse o
 * problema que este campo existe para nao criar.
 *
 * O que apodrece em silencio aqui e o valor **nao sair junto do relato**: a caixa
 * desenha, a pessoa desmarca, e o envio manda o padrao assim mesmo. A tela fica
 * perfeita e a escolha se perde.
 */
describe('aceitar responder dúvidas', () => {
  function abrir(settings = DEFAULT_WIDGET_SETTINGS) {
    dublê.criar.mockResolvedValue({
      TrackingCode: 'ABCD-EFGH-JKLM',
      AccessToken: 'tok',
      CreatedAt: '2026-09-18T12:00:00.000Z',
      // Nulo: estes testes rodam em projeto no modo protocolo, que nao entrega codigo.
      ReporterCode: null,
    } satisfies CreatedReportViewModel)

    render(<EmbedApp settings={settings} config={config} host={null} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'O botão não responde.' } })
  }

  const caixa = () => screen.getByRole('checkbox', { name: /Pode me perguntar algo/ })

  it('a caixa começa marcada, porque é o padrão de fábrica', () => {
    abrir()
    expect((caixa() as HTMLInputElement).checked).toBe(true)
  })

  it('o projeto pode fazê-la começar desmarcada', () => {
    abrir(comSettings({ AcceptsQuestionsDefault: false }))
    expect((caixa() as HTMLInputElement).checked).toBe(false)
  })

  it('desmarcar viaja junto do relato', async () => {
    abrir()
    fireEvent.click(caixa())
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    // **O ponto do teste.** Desenhar a caixa e não mandar o valor deixa a tela
    // perfeita e a escolha perdida — e ninguém descobre, porque o relato entra.
    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith(
        expect.objectContaining({ AcceptsQuestions: false }),
      ),
    )
  })

  it('e o padrão do projeto vale quando ninguém mexe na caixa', async () => {
    abrir(comSettings({ AcceptsQuestionsDefault: false }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() =>
      expect(dublê.criar).toHaveBeenCalledWith(
        expect.objectContaining({ AcceptsQuestions: false }),
      ),
    )
  })

  it('relatar de novo devolve a caixa ao padrão do projeto', async () => {
    abrir(comSettings({ AcceptsQuestionsDefault: true }))
    fireEvent.click(caixa())
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await screen.findByText('ABCD-EFGH-JKLM')
    fireEvent.click(screen.getByRole('button', { name: 'Relatar outra coisa' }))

    // Sem isto, a escolha do relato anterior contaminaria o próximo — e a pessoa
    // não teria como saber que respondeu por engano a mesma coisa duas vezes.
    expect((caixa() as HTMLInputElement).checked).toBe(true)
  })
})
describe('o código pessoal', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  const comCodigo = comSettings({ IdentityMode: 'PersonalCode' })

  async function relatar(resposta: Partial<CreatedReportViewModel> = {}) {
    dublê.criar.mockResolvedValue({
      TrackingCode: 'ABCD-EFGH-JKLM',
      AccessToken: 'tok',
      CreatedAt: '2026-09-19T12:00:00.000Z',
      ReporterCode: 'H7QK-3M2X-P9WD',
      ...resposta,
    } satisfies CreatedReportViewModel)

    render(<EmbedApp settings={comCodigo} config={config} host={null} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'O botão não responde.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await screen.findByText('ABCD-EFGH-JKLM')
  }

  it('a confirmação mostra o código, e diz para que ele serve', async () => {
    await relatar()

    expect(screen.getByText('H7QK-3M2X-P9WD')).toBeTruthy()
    // **Perder o código custa a lista, não os relatos.** Sem essa frase, quem o
    // perde acha que perdeu tudo — e o link continuava valendo o tempo todo.
    expect(screen.getByText(/Perdê-lo custa a lista, não os relatos/i)).toBeTruthy()
  })

  it('guarda o que a API confirmou, e não o que foi mandado', async () => {
    window.localStorage.setItem('pds.reporter-code.pk_DEMO', 'VELHO-VELHO-VELH')

    // A API não reconheceu o antigo e devolveu outro: insistir no antigo deixaria
    // este navegador pedindo para sempre um código que não existe.
    await relatar({ ReporterCode: 'NOVO-NOVO-NOVO' })

    expect(window.localStorage.getItem('pds.reporter-code.pk_DEMO')).toBe('NOVO-NOVO-NOVO')
  })

  it('manda o código guardado no relato seguinte', async () => {
    window.localStorage.setItem('pds.reporter-code.pk_DEMO', 'H7QK-3M2X-P9WD')
    await relatar()

    expect(dublê.criar.mock.calls[0]?.[0]).toMatchObject({ ReporterCode: 'H7QK-3M2X-P9WD' })
  })

  it('sem código guardado, não manda o campo', async () => {
    await relatar()

    expect(dublê.criar.mock.calls[0]?.[0].ReporterCode).toBeUndefined()
  })

  it('no modo protocolo não há código nem entrada para a lista', async () => {
    dublê.criar.mockResolvedValue({
      TrackingCode: 'ABCD-EFGH-JKLM',
      AccessToken: 'tok',
      CreatedAt: '2026-09-19T12:00:00.000Z',
      ReporterCode: null,
    } satisfies CreatedReportViewModel)

    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={null} />)
    expect(screen.queryByRole('button', { name: 'Ver os meus relatos' })).toBeNull()
  })

  it('a entrada para a lista aparece mesmo sem código guardado', async () => {
    // Quem trocou de navegador não tem nada guardado — e é justamente quem mais
    // precisa da entrada, porque é lá dentro que ela digita o código.
    render(<EmbedApp settings={comCodigo} config={config} host={null} />)

    expect(screen.getByRole('button', { name: 'Ver os meus relatos' })).toBeTruthy()
  })

  it('a lista busca sozinha quando o navegador já tem o código', async () => {
    window.localStorage.setItem('pds.reporter-code.pk_DEMO', 'H7QK-3M2X-P9WD')
    dublê.listar.mockResolvedValue({
      Reports: [
        {
          TrackingCode: 'ABCD-EFGH-JKLM',
          Type: 'Bug',
          Excerpt: 'O botão não responde.',
          StageLabel: 'Em análise',
          IsClosed: false,
          CreatedAt: '2026-09-19T12:00:00.000Z',
        },
      ],
      HasMore: false,
      // `satisfies` e o que faz o compilador cobrar a resposta inteira: sem ele,
      // um campo novo no contrato passa em branco por aqui e o teste segue verde
      // exercitando uma resposta que a API nao devolve mais.
    } satisfies ReporterCodeReportsViewModel)

    render(<EmbedApp settings={comCodigo} config={config} host={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver os meus relatos' }))

    await waitFor(() => expect(dublê.listar).toHaveBeenCalledTimes(1))
    expect(dublê.listar).toHaveBeenCalledWith({ Key: 'pk_DEMO', Code: 'H7QK-3M2X-P9WD' })

    // O link de abrir leva o código **no fragmento**, nunca na busca.
    const abrir = await screen.findByRole('link', { name: 'Abrir' })
    const href = abrir.getAttribute('href') ?? ''
    expect(href.split('#')[0]).not.toContain('H7QK')
    expect(href.split('#')[1]).toContain('H7QK-3M2X-P9WD')
  })

  it('lista vazia não diz "código não encontrado"', async () => {
    window.localStorage.setItem('pds.reporter-code.pk_DEMO', 'ZZZZ-ZZZZ-ZZZZ')
    dublê.listar.mockResolvedValue({
      Reports: [],
      HasMore: false,
    } satisfies ReporterCodeReportsViewModel)

    render(<EmbedApp settings={comCodigo} config={config} host={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver os meus relatos' }))

    // A API responde igual para código errado e código sem relato, de propósito.
    // A frase da tela precisa servir aos dois casos sem mentir em nenhum.
    expect(await screen.findByText(/Nenhum relato com esse código/i)).toBeTruthy()
    expect(screen.queryByText(/não encontrado/i)).toBeNull()
  })

  it('o link de abrir leva o código que trouxe a lista, e não o que está no campo', async () => {
    window.localStorage.setItem('pds.reporter-code.pk_DEMO', 'H7QK-3M2X-P9WD')
    dublê.listar.mockResolvedValue({
      Reports: [
        {
          TrackingCode: 'ABCD-EFGH-JKLM',
          Type: 'Bug',
          Excerpt: 'O botão não responde.',
          StageLabel: 'Em análise',
          IsClosed: false,
          CreatedAt: '2026-09-19T12:00:00.000Z',
        },
      ],
      HasMore: false,
    } satisfies ReporterCodeReportsViewModel)

    render(<EmbedApp settings={comCodigo} config={config} host={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver os meus relatos' }))
    await screen.findByRole('link', { name: 'Abrir' })

    // Digitar outro código **sem buscar** não pode mexer nos links já na tela:
    // estes relatos são do código que os listou, e montar o link com o do campo
    // faria cada "Abrir" apontar para uma credencial que nunca os listou.
    fireEvent.change(screen.getByLabelText('O seu código'), {
      target: { value: 'ZZZZ-ZZZZ-ZZZZ' },
    })

    const href = screen.getByRole('link', { name: 'Abrir' }).getAttribute('href') ?? ''
    expect(href).toContain('H7QK-3M2X-P9WD')
    expect(href).not.toContain('ZZZZ')
  })

  it('num projeto público, o aviso aparece ANTES de a pessoa escrever', async () => {
    render(
      <EmbedApp
        settings={comSettings({ Visibility: 'PublicAnonymous' })}
        config={config}
        host={null}
      />,
    )

    const aviso = screen.getByText(/pode virar público/i)
    expect(aviso).toBeTruthy()

    // **A posição é o requisito, e não a existência.** Avisar com o texto já
    // escrito seria avisar tarde: quem descobrisse ali teria de apagar o que
    // escreveu. `compareDocumentPosition` diz quem vem antes no documento.
    const caixa = screen.getByPlaceholderText(DEFAULT_WIDGET_SETTINGS.Placeholder)
    expect(aviso.compareDocumentPosition(caixa) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('e diz que o nome nunca aparece quando o projeto é público anônimo', async () => {
    render(
      <EmbedApp
        settings={comSettings({ Visibility: 'PublicAnonymous' })}
        config={config}
        host={null}
      />,
    )

    expect(screen.getByText(/O seu nome nunca aparece/i)).toBeTruthy()
  })

  it('num projeto privado não há aviso nenhum, porque não há o que avisar', async () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={null} />)

    expect(screen.queryByText(/pode virar público/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ver o que já foi relatado' })).toBeNull()
  })

  it('o campo de nome só existe quando o projeto pergunta', async () => {
    render(<EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} host={null} />)
    expect(screen.queryByLabelText(/Como podemos te chamar/i)).toBeNull()

    cleanup()
    render(<EmbedApp settings={comSettings({ AsksForName: true })} config={config} host={null} />)
    expect(screen.getByLabelText(/Como podemos te chamar/i)).toBeTruthy()
  })

  it('a caixa de assinar só existe onde o nome poderia aparecer', async () => {
    render(
      <EmbedApp
        settings={comSettings({ AsksForName: true, Visibility: 'PublicAnonymous' })}
        config={config}
        host={null}
      />,
    )

    // Público anônimo: o nome não sai de jeito nenhum, então oferecer "quero
    // assinar" prometeria uma vitrine que não existe.
    expect(screen.queryByLabelText(/meu nome apareça/i)).toBeNull()

    cleanup()
    render(
      <EmbedApp
        settings={comSettings({ AsksForName: true, Visibility: 'PublicIdentified' })}
        config={config}
        host={null}
      />,
    )
    expect(screen.getByLabelText(/meu nome apareça/i)).toBeTruthy()
  })

  it('sem nome escrito, não dá para marcar que quer assinar', async () => {
    render(
      <EmbedApp
        settings={comSettings({ AsksForName: true, Visibility: 'PublicIdentified' })}
        config={config}
        host={null}
      />,
    )

    const assinar = screen.getByLabelText(/meu nome apareça/i) as HTMLInputElement
    expect(assinar.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/Como podemos te chamar/i), {
      target: { value: 'Ana' },
    })
    expect((screen.getByLabelText(/meu nome apareça/i) as HTMLInputElement).disabled).toBe(false)
  })

  it('manda o nome e a escolha de assinar', async () => {
    dublê.criar.mockResolvedValue({
      TrackingCode: 'ABCD-EFGH-JKLM',
      AccessToken: 'tok',
      CreatedAt: '2026-09-19T12:00:00.000Z',
      ReporterCode: null,
    } satisfies CreatedReportViewModel)

    render(
      <EmbedApp
        settings={comSettings({ AsksForName: true, Visibility: 'PublicIdentified' })}
        config={config}
        host={null}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Como podemos te chamar/i), {
      target: { value: '  Ana  ' },
    })
    fireEvent.click(screen.getByLabelText(/meu nome apareça/i))
    // Com o campo de nome na tela há dois `textbox`; o relato é o que tem o
    // texto de caixa vazia configurado pelo cliente.
    fireEvent.change(screen.getByPlaceholderText(DEFAULT_WIDGET_SETTINGS.Placeholder), {
      target: { value: 'O botão não responde.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(dublê.criar).toHaveBeenCalledTimes(1))
    expect(dublê.criar.mock.calls[0]?.[0]).toMatchObject({
      ReporterName: 'Ana',
      ReporterNameIsPublic: true,
    })
  })

  it('num projeto que não pergunta o nome, nada de nome é enviado', async () => {
    await relatar()

    expect(dublê.criar.mock.calls[0]?.[0].ReporterName).toBeUndefined()
    expect(dublê.criar.mock.calls[0]?.[0].ReporterNameIsPublic).toBe(false)
  })

  it('quando há mais do que coube, avisa — e não diz quantos', async () => {
    window.localStorage.setItem('pds.reporter-code.pk_DEMO', 'H7QK-3M2X-P9WD')
    dublê.listar.mockResolvedValue({
      Reports: [
        {
          TrackingCode: 'ABCD-EFGH-JKLM',
          Type: 'Bug',
          Excerpt: 'O botão não responde.',
          StageLabel: null,
          IsClosed: false,
          CreatedAt: '2026-09-19T12:00:00.000Z',
        },
      ],
      HasMore: true,
    } satisfies ReporterCodeReportsViewModel)

    render(<EmbedApp settings={comCodigo} config={config} host={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver os meus relatos' }))

    // O aviso existe porque a lista tem teto — e esconder relato sem dizer seria
    // a tela mentindo por omissão. O total fica de fora de propósito: ele é
    // informação sobre o tamanho da lista de outra pessoa.
    const aviso = await screen.findByText(/Estes são os mais recentes/i)
    expect(aviso.textContent).not.toMatch(/\d/)
  })
})
