// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditDoc } from '@/editor/doc'
import { ImageEditor, type ImageEditorProps } from '@/editor/ImageEditor'
import { INK_COLORS } from '@/editor/palette'
import { hideMarginFor } from '@/editor/render'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **Sem marca nenhuma, o arquivo e o original** — nada passa pelo canvas, e nada
 * perde qualidade a toa. Com marca, o arquivo e gerado de novo com elas.
 *
 * **Cada ferramenta vira a marca certa**, no lugar do gesto e do tamanho com que a
 * imagem aparecia. Ocultar, desfoque e recorte nao usam cor.
 *
 * **Desfazer e refazer andam nas marcas** — pelos botoes e pelo teclado —, e a imagem
 * reaberta desfaz ate as marcas de antes.
 *
 * **Sair com marcas pergunta antes**, e o Esc dentro do texto fecha so o texto.
 *
 * **Nada prende a pessoa**: a imagem que nao abre ainda pode ir sem marcas, e o
 * arquivo que passa do teto ou falha ao gerar deixa o editor aberto, com as marcas.
 *
 * **Da para esconder sem ponteiro**: a caixa do teclado faz o que o arrasto faz, nas
 * ferramentas de caixa. E o foco comeca numa ferramenta, e nao numa saida.
 *
 * O canvas do jsdom nao desenha: o contexto e mudo, a imagem e o arquivo sao dublados,
 * e o que se confere sao as marcas que saem. O pixel e a prova do navegador.
 */
const dublê = vi.hoisted(() => ({
  abrir: vi.fn(),
  exportar: vi.fn(),
  fechar: vi.fn(),
  desenhar: vi.fn(),
}))

vi.mock('@/editor/image', () => ({ openImage: dublê.abrir, exportEdit: dublê.exportar }))

// O desenho de verdade, espiado: a tela tem de pedir a tarja com a folga do arquivo.
vi.mock('@/editor/render', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/editor/render')>()
  dublê.desenhar.mockImplementation(real.drawScene)
  return { ...real, drawScene: dublê.desenhar }
})

const TETO = 5 * 1024 * 1024

/** A cor da paleta pelo nome. */
const corDe = (nome: string) => INK_COLORS.find((cor) => cor.name === nome)?.value
const fonte = new File([new Uint8Array(10)], 'captura.webp', { type: 'image/webp' })

/** Um contexto que aceita tudo e nao desenha nada. */
function contextoMudo(canvas: HTMLCanvasElement) {
  return new Proxy(
    { canvas },
    {
      get: (alvo, prop) => (prop in alvo ? alvo[prop as 'canvas'] : () => {}),
      set: () => true,
    },
  )
}

beforeEach(() => {
  dublê.abrir.mockResolvedValue({ image: {}, width: 400, height: 300, close: dublê.fechar })
  dublê.exportar.mockImplementation(
    async (_aberta: unknown, _doc: EditDoc, origem: File) =>
      new File([new Uint8Array(20)], `marcada-${origem.name}`, { type: 'image/webp' }),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return contextoMudo(this)
  } as unknown as HTMLCanvasElement['getContext'])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

async function abrir(props: Partial<ImageEditorProps> = {}) {
  const onDone = vi.fn()
  const onCancel = vi.fn()
  const resultado = render(
    <ImageEditor
      source={fonte}
      initial={null}
      mode="add"
      maxBytes={TETO}
      onDone={onDone}
      onCancel={onCancel}
      {...props}
    />,
  )
  const canvas = await screen.findByRole('img', { name: 'A imagem, com as marcas' })
  return { onDone, onCancel, canvas, ...resultado }
}

/** Sem medida no jsdom, a imagem aparece do tamanho dela: um pixel da tela e um da imagem. */
function arrastar(canvas: HTMLElement, de: [number, number], ate: [number, number]) {
  const ponteiro = { pointerId: 1, button: 0, pointerType: 'mouse' }
  fireEvent.pointerDown(canvas, { clientX: de[0], clientY: de[1], ...ponteiro })
  fireEvent.pointerMove(canvas, {
    clientX: (de[0] + ate[0]) / 2,
    clientY: (de[1] + ate[1]) / 2,
    ...ponteiro,
  })
  fireEvent.pointerUp(canvas, { clientX: ate[0], clientY: ate[1], ...ponteiro })
}

function clicarNa(canvas: HTMLElement, x: number, y: number) {
  const ponteiro = { pointerId: 1, button: 0, pointerType: 'mouse', clientX: x, clientY: y }
  fireEvent.pointerDown(canvas, ponteiro)
  fireEvent.pointerUp(canvas, ponteiro)
  fireEvent.click(canvas, { clientX: x, clientY: y })
}

const botao = (nome: string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
const usar = (ferramenta: string) => fireEvent.click(botao(ferramenta))

/** O documento que saiu no `onDone`. */
async function concluido(onDone: ReturnType<typeof vi.fn>, acao = 'Adicionar') {
  fireEvent.click(botao(acao))
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  return onDone.mock.calls[0]?.[0] as { file: File; doc: EditDoc | null }
}

describe('abrir', () => {
  it('traz as ferramentas e as cores; a seta comeca escolhida, e nada a desfazer', async () => {
    await abrir()

    for (const nome of [
      'Seta',
      'Retângulo',
      'Elipse',
      'Desenho livre',
      'Marca-texto',
      'Texto',
      'Numeração',
      'Desfoque',
      'Ocultar',
      'Recortar',
    ])
      expect(botao(nome)).toBeDefined()
    for (const cor of ['Vermelho', 'Amarelo', 'Verde', 'Azul', 'Preto', 'Branco'])
      expect(botao(cor)).toBeDefined()

    expect(botao('Seta').getAttribute('aria-pressed')).toBe('true')
    expect(botao('Desfazer').disabled).toBe(true)
    expect(botao('Refazer').disabled).toBe(true)
  })

  // A captura nao esconde nada sozinha: e aqui que a pessoa fica sabendo onde esconder.
  it('lembra onde se esconde senha, cartao e dado pessoal', async () => {
    await abrir()
    expect(
      screen.getByText('Para esconder senha, cartão ou dado pessoal, use Ocultar.'),
    ).toBeDefined()
  })

  it('fechado, devolve a memoria da imagem', async () => {
    const { unmount } = await abrir()
    unmount()
    expect(dublê.fechar).toHaveBeenCalled()
  })
})

describe('concluir', () => {
  it('sem marca nenhuma, devolve o proprio arquivo, sem desenhar de novo', async () => {
    const { onDone } = await abrir()

    const resultado = await concluido(onDone)

    expect(resultado).toEqual({ file: fonte, doc: null })
    expect(dublê.exportar).not.toHaveBeenCalled()
  })

  it('com marca, gera o arquivo com ela, dentro do teto', async () => {
    const { onDone, canvas } = await abrir()
    usar('Retângulo')
    arrastar(canvas, [10, 20], [110, 120])

    const resultado = await concluido(onDone)

    expect(resultado.file.name).toBe('marcada-captura.webp')
    expect(resultado.doc?.shapes).toEqual([
      {
        type: 'rect',
        rect: { x: 10, y: 20, width: 100, height: 100 },
        color: corDe('Vermelho'),
        width: 3,
      },
    ])
    expect(dublê.exportar).toHaveBeenCalledWith(
      expect.objectContaining({ width: 400, height: 300 }),
      resultado.doc,
      fonte,
      TETO,
    )
  })

  it('marcada maior que o teto: diz, e o editor fica aberto com as marcas', async () => {
    dublê.exportar.mockResolvedValue(new File([new Uint8Array(4096)], 'grande.webp'))
    const { onDone, canvas } = await abrir({ maxBytes: 1024 })
    usar('Ocultar')
    arrastar(canvas, [10, 10], [60, 60])

    fireEvent.click(botao('Adicionar'))

    expect((await screen.findByRole('alert')).textContent).toBe(
      'A imagem marcada passa de 1 KB. Recorte um pedaço menor.',
    )
    expect(onDone).not.toHaveBeenCalled()
    expect(botao('Desfazer').disabled).toBe(false)
  })

  it('falhou ao gerar: diz, e tentar de novo funciona', async () => {
    dublê.exportar.mockRejectedValueOnce(new Error('sem memoria'))
    const { onDone, canvas } = await abrir()
    usar('Ocultar')
    arrastar(canvas, [10, 10], [60, 60])

    fireEvent.click(botao('Adicionar'))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Não deu para gerar a imagem. Tente de novo.',
    )

    const resultado = await concluido(onDone)
    expect(resultado.doc?.shapes).toHaveLength(1)
  })
})

describe('as ferramentas', () => {
  it('o clique curto nao marca', async () => {
    const { onDone, canvas } = await abrir()
    usar('Retângulo')
    arrastar(canvas, [10, 10], [12, 12])

    expect(await concluido(onDone)).toEqual({ file: fonte, doc: null })
  })

  it('a seta vai de onde apertou ate onde soltou', async () => {
    const { onDone, canvas } = await abrir()
    arrastar(canvas, [300, 200], [100, 50])

    const { doc } = await concluido(onDone)
    expect(doc?.shapes[0]).toMatchObject({
      type: 'arrow',
      from: { x: 300, y: 200 },
      to: { x: 100, y: 50 },
    })
  })

  it('arrastar para fora da imagem marca ate a borda', async () => {
    const { onDone, canvas } = await abrir()
    usar('Elipse')
    arrastar(canvas, [350, 250], [900, 900])

    const { doc } = await concluido(onDone)
    expect(doc?.shapes[0]).toMatchObject({ rect: { x: 350, y: 250, width: 50, height: 50 } })
  })

  it('o desenho livre guarda o caminho; o marca-texto e mais grosso', async () => {
    const { onDone, canvas } = await abrir()
    usar('Desenho livre')
    arrastar(canvas, [10, 10], [50, 30])
    usar('Marca-texto')
    arrastar(canvas, [10, 100], [200, 100])

    const { doc } = await concluido(onDone)
    const [livre, marca] = doc?.shapes ?? []
    expect(livre).toMatchObject({ type: 'pen', width: 3 })
    expect(livre?.type === 'pen' && livre.points).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 20 },
      { x: 50, y: 30 },
    ])
    expect(marca).toMatchObject({ type: 'highlight', width: 18 })
  })

  it('a cor escolhida vai na marca', async () => {
    const { onDone, canvas } = await abrir()
    fireEvent.click(botao('Azul'))
    arrastar(canvas, [10, 10], [80, 80])

    const { doc } = await concluido(onDone)
    expect(doc?.shapes[0]).toMatchObject({ color: corDe('Azul') })
    expect(botao('Azul').getAttribute('aria-pressed')).toBe('true')
  })

  it('ocultar poe a tarja, e desliga as cores: ela e sempre preta', async () => {
    const { onDone, canvas } = await abrir()
    usar('Ocultar')

    expect(botao('Vermelho').disabled).toBe(true)
    expect(
      screen.getByText('Cobre com uma tarja preta: o que fica embaixo não vai na imagem.'),
    ).toBeDefined()

    arrastar(canvas, [40, 50], [140, 80])
    const { doc } = await concluido(onDone)
    expect(doc?.shapes).toEqual([{ type: 'hide', rect: { x: 40, y: 50, width: 100, height: 30 } }])
  })

  it('o desfoque guarda o tamanho do borrao, e avisa que ocultar e o que esconde', async () => {
    const { onDone, canvas } = await abrir()
    usar('Desfoque')

    expect(
      screen.getByText('Borra o que fica embaixo. Para senha ou cartão, use Ocultar.'),
    ).toBeDefined()

    arrastar(canvas, [40, 50], [140, 80])
    const { doc } = await concluido(onDone)
    expect(doc?.shapes[0]).toMatchObject({ type: 'blur', block: 14 })
  })

  it('a numeracao poe o proximo numero a cada clique', async () => {
    const { onDone, canvas } = await abrir()
    usar('Numeração')
    clicarNa(canvas, 10, 10)
    clicarNa(canvas, 50, 10)
    clicarNa(canvas, 90, 10)

    const { doc } = await concluido(onDone)
    expect(doc?.shapes.map((shape) => shape.type === 'step' && shape.number)).toEqual([1, 2, 3])
  })

  it('recortar guarda o pedaco; pequeno demais nao vale; "Sem recorte" tira', async () => {
    const { onDone, canvas } = await abrir()
    usar('Recortar')

    arrastar(canvas, [20, 20], [24, 24])
    expect(screen.queryByRole('button', { name: 'Sem recorte' })).toBeNull()

    arrastar(canvas, [20, 30], [220, 230])
    fireEvent.click(botao('Sem recorte'))
    arrastar(canvas, [50, 60], [250, 160])

    const { doc } = await concluido(onDone)
    expect(doc).toEqual({ shapes: [], crop: { x: 50, y: 60, width: 200, height: 100 } })
  })

  // A marca sai do tamanho que a pessoa viu: numa imagem que aparece pela metade, o
  // traco de 3 pixels da tela e de 6 da imagem, e o gesto cai no dobro das coordenadas.
  it('o tamanho da marca e o lugar do gesto seguem o tamanho com que a imagem aparece', async () => {
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(432)
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(332)
    dublê.abrir.mockResolvedValue({ image: {}, width: 800, height: 600, close: dublê.fechar })
    const { onDone, canvas } = await abrir()
    usar('Retângulo')

    arrastar(canvas, [10, 10], [60, 60])

    const { doc } = await concluido(onDone)
    expect(doc?.shapes[0]).toMatchObject({
      rect: { x: 20, y: 20, width: 100, height: 100 },
      width: 6,
    })
  })
})

describe('o texto', () => {
  it('clicar abre o campo; Enter poe o texto na imagem', async () => {
    const { onDone, canvas } = await abrir()
    usar('Texto')
    clicarNa(canvas, 50, 60)

    const campo = screen.getByRole('textbox', { name: 'Texto da marca' })
    fireEvent.change(campo, { target: { value: 'aqui' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(screen.queryByRole('textbox', { name: 'Texto da marca' })).toBeNull()
    const { doc } = await concluido(onDone)
    expect(doc?.shapes[0]).toMatchObject({
      type: 'text',
      at: { x: 50, y: 60 },
      text: 'aqui',
      size: 18,
    })
  })

  it('o campo recebe o foco no proprio clique — no iPhone, e o que abre o teclado', async () => {
    const { canvas } = await abrir()
    usar('Texto')

    clicarNa(canvas, 50, 60)

    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Texto da marca' }))
  })

  it('no dedo, apertar com o Texto nao cancela o toque — no Safari, isso cancelaria o clique que abre o campo', async () => {
    const { canvas } = await abrir()
    usar('Texto')

    const toque = { pointerId: 3, button: 0, pointerType: 'touch', clientX: 50, clientY: 60 }
    const naoCancelado = fireEvent.pointerDown(canvas, toque)
    fireEvent.pointerUp(canvas, toque)
    fireEvent.click(canvas, { clientX: 50, clientY: 60 })

    expect(naoCancelado).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Texto da marca' }))
  })

  it('no mouse, apertar com o Texto continua segurando o foco', async () => {
    const { canvas } = await abrir()
    usar('Texto')

    const mouse = { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 50, clientY: 60 }
    expect(fireEvent.pointerDown(canvas, mouse)).toBe(false)
  })

  it('o Enter que escolhe o candidato da composicao nao conclui o texto', async () => {
    const { canvas } = await abrir()
    usar('Texto')
    clicarNa(canvas, 50, 60)
    const campo = screen.getByRole('textbox', { name: 'Texto da marca' })

    fireEvent.keyDown(campo, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(campo, { key: 'Enter', keyCode: 229 })

    expect(screen.getByRole('textbox', { name: 'Texto da marca' })).toBe(campo)
  })

  it('o Esc da composicao desiste do candidato, e nao do texto', async () => {
    const { canvas } = await abrir()
    usar('Texto')
    clicarNa(canvas, 50, 60)
    const campo = screen.getByRole('textbox', { name: 'Texto da marca' })

    fireEvent.keyDown(campo, { key: 'Escape', isComposing: true })

    expect(screen.getByRole('textbox', { name: 'Texto da marca' })).toBe(campo)
  })

  it('clicar fora do texto so o conclui, e nao abre outro', async () => {
    const { onDone, canvas } = await abrir()
    usar('Texto')
    clicarNa(canvas, 50, 60)
    fireEvent.change(screen.getByRole('textbox', { name: 'Texto da marca' }), {
      target: { value: 'um' },
    })

    clicarNa(canvas, 200, 200)

    expect(screen.queryByRole('textbox', { name: 'Texto da marca' })).toBeNull()
    const { doc } = await concluido(onDone)
    expect(doc?.shapes).toHaveLength(1)
  })

  it('Shift+Enter quebra a linha, e texto em branco nao marca', async () => {
    const { onDone, canvas } = await abrir()
    usar('Texto')
    clicarNa(canvas, 50, 60)
    const campo = screen.getByRole('textbox', { name: 'Texto da marca' })
    fireEvent.keyDown(campo, { key: 'Enter', shiftKey: true })
    expect(screen.getByRole('textbox', { name: 'Texto da marca' })).toBeDefined()

    fireEvent.change(campo, { target: { value: '   \n  ' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(await concluido(onDone)).toEqual({ file: fonte, doc: null })
  })

  it('o texto ainda aberto vai junto ao concluir', async () => {
    const { onDone, canvas } = await abrir()
    usar('Texto')
    clicarNa(canvas, 5, 5)
    fireEvent.change(screen.getByRole('textbox', { name: 'Texto da marca' }), {
      target: { value: 'não esquecer' },
    })

    const { doc } = await concluido(onDone)
    expect(doc?.shapes[0]).toMatchObject({ type: 'text', text: 'não esquecer' })
  })

  it('Esc desiste so do texto, e o editor fica', async () => {
    const { onCancel, canvas } = await abrir()
    usar('Texto')
    clicarNa(canvas, 5, 5)
    const campo = screen.getByRole('textbox', { name: 'Texto da marca' })
    fireEvent.change(campo, { target: { value: 'rascunho' } })

    fireEvent.keyDown(campo, { key: 'Escape' })

    expect(screen.queryByRole('textbox', { name: 'Texto da marca' })).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()
    expect(botao('Desfazer').disabled).toBe(true)
  })
})

describe('desfazer e refazer', () => {
  it('pelos botoes e pelo teclado', async () => {
    const { onDone, canvas } = await abrir()
    usar('Retângulo')
    arrastar(canvas, [10, 10], [50, 50])
    arrastar(canvas, [100, 100], [150, 150])

    fireEvent.click(botao('Desfazer'))
    expect(botao('Refazer').disabled).toBe(false)

    const dialogo = screen.getByRole('dialog')
    fireEvent.keyDown(dialogo, { key: 'z', ctrlKey: true })
    expect(botao('Desfazer').disabled).toBe(true)

    fireEvent.keyDown(dialogo, { key: 'z', metaKey: true, shiftKey: true })
    fireEvent.keyDown(dialogo, { key: 'y', ctrlKey: true })
    expect(botao('Refazer').disabled).toBe(true)

    const { doc } = await concluido(onDone)
    expect(doc?.shapes).toHaveLength(2)
  })

  it('reaberta, sem mudar nada, salvar nao gera arquivo', async () => {
    const antes: EditDoc = {
      shapes: [{ type: 'hide', rect: { x: 1, y: 1, width: 9, height: 9 } }],
      crop: null,
    }
    const { onDone, onCancel } = await abrir({ mode: 'save', initial: antes })

    fireEvent.click(botao('Salvar'))

    expect(onCancel).toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(dublê.exportar).not.toHaveBeenCalled()
  })

  // O editor nao tem borracha: e desfazendo que a tarja da primeira vez sai.
  it('reaberta, desfazer tira as marcas de antes; sem nenhuma, volta o original', async () => {
    const antes: EditDoc = {
      shapes: [{ type: 'hide', rect: { x: 1, y: 1, width: 9, height: 9 } }],
      crop: null,
    }
    const { onDone } = await abrir({ mode: 'save', initial: antes })

    fireEvent.click(botao('Desfazer'))

    expect(await concluido(onDone, 'Salvar')).toEqual({ file: fonte, doc: null })
  })
})

describe('o teclado', () => {
  // Com as ferramentas desligadas enquanto a imagem abria, o foco ia para "Descartar":
  // um Enter jogava a captura fora sem perguntar.
  it('o foco comeca na primeira ferramenta, mesmo com a imagem ainda abrindo', async () => {
    dublê.abrir.mockReturnValue(new Promise(() => {}))
    render(
      <ImageEditor
        source={fonte}
        initial={null}
        mode="add"
        maxBytes={TETO}
        onDone={() => {}}
        onCancel={() => {}}
      />,
    )

    await waitFor(() => expect(document.activeElement).toBe(botao('Seta')))
  })

  it('Enter poe a caixa no meio; setas movem, Shift e setas mudam o tamanho; Enter confirma', async () => {
    const { onDone, canvas } = await abrir()
    usar('Ocultar')
    canvas.focus()

    fireEvent.keyDown(canvas, { key: 'Enter' })
    expect(
      screen.getByText(
        'Setas movem a caixa; Shift e setas mudam o tamanho; Enter confirma; Esc desiste.',
      ),
    ).toBeDefined()
    fireEvent.keyDown(canvas, { key: 'ArrowRight' })
    fireEvent.keyDown(canvas, { key: 'ArrowUp' })
    fireEvent.keyDown(canvas, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(canvas, { key: 'ArrowLeft', shiftKey: true })
    fireEvent.keyDown(canvas, { key: 'Enter' })

    const { doc } = await concluido(onDone)
    const marca = doc?.shapes[0]
    expect(marca?.type).toBe('hide')
    const rect = marca?.type === 'hide' ? marca.rect : null
    // A terca parte do meio de 400x300, dez pixels para a direita e para cima, dez mais
    // alta e dez mais estreita.
    expect(rect?.x).toBeCloseTo(400 / 3 + 10)
    expect(rect?.y).toBeCloseTo(100 - 10)
    expect(rect?.width).toBeCloseTo(400 / 3 - 10)
    expect(rect?.height).toBeCloseTo(100 + 10)
  })

  it('a caixa nao passa da borda da imagem', async () => {
    const { onDone, canvas } = await abrir()
    usar('Retângulo')
    fireEvent.keyDown(canvas, { key: 'Enter' })
    for (let i = 0; i < 40; i++) fireEvent.keyDown(canvas, { key: 'ArrowLeft' })
    for (let i = 0; i < 40; i++) fireEvent.keyDown(canvas, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(canvas, { key: 'Enter' })

    const { doc } = await concluido(onDone)
    expect(doc?.shapes[0]).toMatchObject({ rect: { x: 0, height: 300 } })
  })

  it('recorta pelo teclado tambem', async () => {
    const { onDone, canvas } = await abrir()
    usar('Recortar')
    fireEvent.keyDown(canvas, { key: 'Enter' })
    fireEvent.keyDown(canvas, { key: 'Enter' })

    const { doc } = await concluido(onDone)
    expect(doc?.crop?.width).toBeCloseTo(400 / 3)
  })

  it('Esc desiste da caixa, e o editor fica', async () => {
    const { onDone, onCancel, canvas } = await abrir()
    usar('Ocultar')
    fireEvent.keyDown(canvas, { key: 'Enter' })

    fireEvent.keyDown(canvas, { key: 'Escape' })

    expect(onCancel).not.toHaveBeenCalled()
    expect(await concluido(onDone)).toEqual({ file: fonte, doc: null })
  })

  it('nas ferramentas de traco, Enter na imagem nao faz nada', async () => {
    const { onDone, canvas } = await abrir()
    fireEvent.keyDown(canvas, { key: 'Enter' })

    expect(await concluido(onDone)).toEqual({ file: fonte, doc: null })
  })

  it('a pergunta de sair e lida junto com o "Voltar", que recebe o foco', async () => {
    const { canvas } = await abrir()
    arrastar(canvas, [10, 10], [80, 80])

    fireEvent.click(botao('Descartar'))

    const pergunta = screen.getByText('Descartar a imagem e as marcas?')
    expect(botao('Voltar').getAttribute('aria-describedby')).toBe(pergunta.id)
  })
})

describe('o que esta na tela e o que vai', () => {
  // Na tela, a caixa do teclado ja e uma tarja preta inteira. Concluir sem ela mandaria
  // o que a pessoa via coberto.
  it('a caixa do teclado ainda nao confirmada vai no arquivo', async () => {
    const { onDone, canvas } = await abrir()
    usar('Ocultar')
    fireEvent.keyDown(canvas, { key: 'Enter' })

    const { doc } = await concluido(onDone)

    expect(doc?.shapes).toHaveLength(1)
    expect(doc?.shapes[0]?.type).toBe('hide')
  })

  it('reaberta, a caixa pendente tambem conta: salvar gera o arquivo', async () => {
    const antes: EditDoc = {
      shapes: [
        {
          type: 'rect',
          rect: { x: 1, y: 1, width: 9, height: 9 },
          color: corDe('Azul') ?? '',
          width: 3,
        },
      ],
      crop: null,
    }
    const { onDone, onCancel, canvas } = await abrir({ mode: 'save', initial: antes })
    usar('Ocultar')
    fireEvent.keyDown(canvas, { key: 'Enter' })

    const { doc } = await concluido(onDone, 'Salvar')

    expect(onCancel).not.toHaveBeenCalled()
    expect(doc?.shapes.map((shape) => shape.type)).toEqual(['rect', 'hide'])
  })

  it('o recorte pendente do teclado tambem vai', async () => {
    const { onDone, canvas } = await abrir()
    usar('Recortar')
    fireEvent.keyDown(canvas, { key: 'Enter' })

    const { doc } = await concluido(onDone)
    expect(doc?.crop?.width).toBeCloseTo(400 / 3)
  })

  it('com a caixa pendente, descartar pergunta antes', async () => {
    const { onCancel, canvas } = await abrir()
    usar('Ocultar')
    fireEvent.keyDown(canvas, { key: 'Enter' })

    fireEvent.click(botao('Descartar'))

    expect(screen.getByText('Descartar a imagem e as marcas?')).toBeDefined()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('o texto e a caixa pendentes ficam na historia se o arquivo falhar', async () => {
    dublê.exportar.mockRejectedValueOnce(new Error('sem memoria'))
    const { canvas } = await abrir()
    usar('Ocultar')
    fireEvent.keyDown(canvas, { key: 'Enter' })

    fireEvent.click(botao('Adicionar'))
    await screen.findByRole('alert')

    expect(botao('Desfazer').disabled).toBe(false)
  })

  // A foto grande sai reduzida, e a tarja do arquivo ganha folga. A tela desenha com a
  // mesma folga: nunca mostra mais cobertura do que o arquivo vai ter.
  it('a tela desenha a tarja com a folga do arquivo', async () => {
    dublê.abrir.mockResolvedValue({ image: {}, width: 8000, height: 6000, close: dublê.fechar })
    const { canvas } = await abrir()
    usar('Ocultar')
    arrastar(canvas, [100, 100], [400, 300])

    await waitFor(() => {
      const ultimo = dublê.desenhar.mock.calls.at(-1)
      expect(ultimo?.[2].shapes).toHaveLength(1)
    })
    const [, , doc, , extras] = dublê.desenhar.mock.calls.at(-1) ?? []
    const esperada = hideMarginFor(doc, { width: 8000, height: 6000 })
    expect(esperada).toBeGreaterThan(0)
    expect(extras.hideMargin).toBe(esperada)
  })
})

describe('os gestos que dao errado', () => {
  it('o ponteiro que perde a captura nao prende o gesto', async () => {
    const { onDone, canvas } = await abrir()
    usar('Retângulo')
    fireEvent.pointerDown(canvas, {
      clientX: 10,
      clientY: 10,
      pointerId: 7,
      button: 0,
      pointerType: 'touch',
    })
    fireEvent.lostPointerCapture(canvas, { pointerId: 7, pointerType: 'touch' })

    arrastar(canvas, [100, 100], [200, 200])

    const { doc } = await concluido(onDone)
    expect(doc?.shapes).toHaveLength(1)
    expect(doc?.shapes[0]).toMatchObject({ rect: { x: 100, y: 100 } })
  })
})

describe('sair', () => {
  it('sem marcas, descartar sai direto', async () => {
    const { onCancel } = await abrir()
    fireEvent.click(botao('Descartar'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('com marcas, pergunta; "Voltar" continua editando, e comeca com o foco', async () => {
    const { onCancel, canvas } = await abrir()
    arrastar(canvas, [10, 10], [80, 80])

    fireEvent.click(botao('Descartar'))

    expect(screen.getByText('Descartar a imagem e as marcas?')).toBeDefined()
    await waitFor(() => expect(document.activeElement).toBe(botao('Voltar')))
    fireEvent.click(botao('Voltar'))
    expect(screen.queryByText('Descartar a imagem e as marcas?')).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.click(botao('Descartar'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Descartar' }).at(-1) as HTMLElement)
    expect(onCancel).toHaveBeenCalled()
  })

  it('Esc com marcas pergunta, e Esc de novo volta a editar', async () => {
    const { onCancel, canvas } = await abrir({ mode: 'save' })
    arrastar(canvas, [10, 10], [80, 80])
    const dialogo = screen.getByRole('dialog')

    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(screen.getByText('Sair sem salvar as marcas?')).toBeDefined()

    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(screen.queryByText('Sair sem salvar as marcas?')).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('colar dentro do editor nao chega a quem esta atras', async () => {
    const colou = vi.fn()
    render(
      <div onPaste={colou}>
        <ImageEditor
          source={fonte}
          initial={null}
          mode="add"
          maxBytes={TETO}
          onDone={() => {}}
          onCancel={() => {}}
        />
      </div>,
    )
    await screen.findByRole('img', { name: 'A imagem, com as marcas' })

    fireEvent.paste(screen.getByRole('dialog'), { clipboardData: { files: [], getData: () => '' } })

    expect(colou).not.toHaveBeenCalled()
  })
})

describe('a imagem que nao abre', () => {
  it('diz isso, e a captura ainda pode ir sem marcas', async () => {
    dublê.abrir.mockRejectedValue(new Error('formato estranho'))
    const onDone = vi.fn()
    render(
      <ImageEditor
        source={fonte}
        initial={null}
        mode="add"
        maxBytes={TETO}
        onDone={onDone}
        onCancel={() => {}}
      />,
    )

    await screen.findByText('Não deu para abrir esta imagem para marcar.')
    fireEvent.click(botao('Adicionar sem marcas'))

    expect(onDone).toHaveBeenCalledWith({ file: fonte, doc: null })
  })

  it('a que ja esta na lista so fecha, e continua como estava', async () => {
    dublê.abrir.mockRejectedValue(new Error('formato estranho'))
    const onCancel = vi.fn()
    render(
      <ImageEditor
        source={fonte}
        initial={null}
        mode="save"
        maxBytes={TETO}
        onDone={() => {}}
        onCancel={onCancel}
      />,
    )

    await screen.findByText('Não deu para abrir esta imagem para marcar.')
    expect(screen.queryByRole('button', { name: 'Adicionar sem marcas' })).toBeNull()
    fireEvent.click(botao('Fechar'))

    expect(onCancel).toHaveBeenCalled()
  })
})
