// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreatedReportViewModel, WidgetSettingsViewModel } from '@/contracts'
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
const dublê = vi.hoisted(() => ({ criar: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return { ...real, reportService: { createReport: dublê.criar } }
})

const config = {
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
  viewport: '1280x800',
}
const pagina = { init: null, show: vi.fn(), expand: vi.fn(), collapse: vi.fn(), stop: vi.fn() }

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
