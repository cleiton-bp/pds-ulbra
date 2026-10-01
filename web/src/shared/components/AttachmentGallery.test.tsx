// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttachmentGallery, type GalleryItem } from '@/shared/components/AttachmentGallery'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **A imagem aparece inteira, no tamanho que quem relatou escolheu**, logo abaixo do
 * texto — o arquivo, e nao a miniatura de 320 pixels, que ficaria borrada na linha
 * inteira. Tamanho que a tela nao conhece ocupa a linha inteira. Um clique abre em
 * tamanho real, em outra aba. **O video antigo continua como era**: miniatura na
 * grade, e o player so no clique, baixando so o cabecalho.
 *
 * **A imagem que ja carregou fica no endereco em que carregou.** A renovacao traz
 * enderecos novos a cada poucos minutos, e trocar o `src` baixaria a imagem inteira de
 * novo sem mudar nada na tela. O link de abrir usa o da lista; o guardado que falha
 * passa para o da lista.
 *
 * **Link vencido e tratado, e nunca em laco.** A galeria pede enderecos novos
 * pouco antes do vencimento e quando um arquivo falha. Mas endereco NOVO que tambem
 * falha nao e vencimento: o arquivo vira "nao carregou" e a galeria para. Antes, a
 * trava era por lista, e quem monta a galeria cria a lista a cada desenho: uma
 * miniatura que o navegador nao decodificava fez a pagina de acompanhamento reler
 * a lista **3.609 vezes em 10 segundos**, medido no navegador.
 *
 * **Renovar nao fecha nada.** O video aberto continua aberto, no endereco em que
 * comecou.
 */
function item(mudanca: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'a-1',
    kind: 'Image',
    url: 'http://armazenamento/inteiro',
    thumbnailUrl: 'http://armazenamento/miniatura',
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    caption: 'erro.png · 120 KB',
    ...mudanca,
  }
}

/** Monta como o painel e o acompanhamento montam: lista nova a cada desenho, e enderecos novos a cada renovacao. */
function DonoQueRenova({ aoRenovar }: { aoRenovar: () => void }) {
  const [versao, setVersao] = useState(1)
  return (
    <AttachmentGallery
      items={[
        item({
          url: `http://armazenamento/inteiro?v=${versao}`,
          thumbnailUrl: `http://armazenamento/miniatura?v=${versao}`,
        }),
      ]}
      onExpired={() => {
        aoRenovar()
        setVersao((v) => v + 1)
      }}
    />
  )
}

/** Passado o tempo em que uma falha so pode ser o arquivo, e nao o vencimento. */
const ALEM_DE_RECEM_CHEGADO = 6_000

const imagem = (container: HTMLElement) => container.querySelector('li img') as HTMLImageElement

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a galeria', () => {
  it('sem arquivo, nao desenha nada', () => {
    const { container } = render(<AttachmentGallery items={[]} onExpired={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('a imagem aparece inteira, no tamanho que quem relatou escolheu, e nao a miniatura', () => {
    render(
      <AttachmentGallery
        label="O que você anexou"
        items={[
          item({ id: 'p', displaySize: 'Small' }),
          item({ id: 'm', displaySize: 'Medium' }),
          item({ id: 'g', displaySize: 'Large' }),
          item({ id: 't', displaySize: 'Full' }),
        ]}
        onExpired={() => {}}
      />,
    )

    const lista = screen.getByRole('list', { name: 'O que você anexou' })
    const linhas = Array.from(lista.querySelectorAll(':scope > li'))
    expect(linhas.map((li) => li.className)).toEqual([
      'col-span-4',
      'col-span-6',
      'col-span-9',
      'col-span-12',
    ])
    for (const img of lista.querySelectorAll('img')) {
      expect(img.getAttribute('src')).toBe('http://armazenamento/inteiro')
      // So baixa quando chega perto da tela.
      expect(img.getAttribute('loading')).toBe('lazy')
    }
    expect(lista.innerHTML).not.toContain('miniatura')
  })

  // Tres links "Imagem anexada" seguidos nao dizem qual e qual.
  it('com mais de uma, cada imagem tem um nome proprio para o leitor de tela', () => {
    render(
      <AttachmentGallery
        items={[item({ id: 'a', caption: undefined }), item({ id: 'b', caption: undefined })]}
        onExpired={() => {}}
      />,
    )

    expect(
      screen.getAllByRole('link').map((link) => link.textContent || link.querySelector('img')?.alt),
    ).toEqual(['Imagem 1 de 2', 'Imagem 2 de 2'])
  })

  it('sem tamanho, ou com um que a tela nao conhece, a imagem ocupa a linha inteira', () => {
    const { container } = render(
      <AttachmentGallery
        items={[
          item({ id: 'sem', displaySize: undefined }),
          item({ id: 'novo', displaySize: 'Enorme' as never }),
          item({ id: 'proto', displaySize: 'constructor' as never }),
        ]}
        onExpired={() => {}}
      />,
    )

    const linhas = Array.from(container.querySelectorAll('ul > li'))
    expect(linhas.map((li) => li.className)).toEqual(['col-span-12', 'col-span-12', 'col-span-12'])
  })

  it('um clique abre a imagem em tamanho real, em outra aba, sem alcancar esta pagina', () => {
    render(<AttachmentGallery items={[item()]} onExpired={() => {}} />)

    const link = screen.getByRole('link', { name: /Imagem anexada/ })
    expect(link.getAttribute('href')).toBe('http://armazenamento/inteiro')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noreferrer')
  })

  it('o painel mostra o nome e o tamanho embaixo da imagem', () => {
    render(<AttachmentGallery items={[item()]} onExpired={() => {}} />)

    const legenda = screen.getByText('erro.png · 120 KB')
    expect(legenda.tagName).toBe('FIGCAPTION')
    // Cortada na imagem pequena; inteira ao passar o mouse.
    expect(legenda.getAttribute('title')).toBe('erro.png · 120 KB')
  })

  it('video abre num player, e so baixa o cabecalho ate alguem apertar play', () => {
    const { container } = render(
      <AttachmentGallery items={[item({ kind: 'Video' })]} onExpired={() => {}} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Vídeo/ }))

    const video = container.querySelector('video')
    expect(video?.getAttribute('src')).toBe('http://armazenamento/inteiro')
    expect(video?.getAttribute('preload')).toBe('metadata')
  })
})

describe('o endereco que vence', () => {
  it('imagem que falha pede endereco novo — e so uma vez, enquanto ele nao chega', () => {
    vi.useFakeTimers()
    const renovar = vi.fn()
    const { container, rerender } = render(
      <AttachmentGallery items={[item()]} onExpired={renovar} />,
    )
    act(() => vi.advanceTimersByTime(ALEM_DE_RECEM_CHEGADO))

    fireEvent.error(imagem(container))
    // O dono desenha de novo com o mesmo endereco, antes de a resposta chegar.
    rerender(<AttachmentGallery items={[item()]} onExpired={renovar} />)
    fireEvent.error(imagem(container))

    expect(renovar).toHaveBeenCalledOnce()
  })

  it('endereco recem-chegado que falha nao venceu: vira "nao carregou" sem pedir nada', () => {
    const renovacoes = vi.fn()
    const { container } = render(<DonoQueRenova aoRenovar={renovacoes} />)

    // Falhou logo que a lista chegou: renovar so traria o mesmo arquivo — e, no
    // mesmo segundo, ate o mesmo endereco.
    fireEvent.error(imagem(container))

    expect(renovacoes).not.toHaveBeenCalled()
    expect(container.textContent).toContain('não carregou')
  })

  it('o laco medido: imagem que nunca decodifica, com endereco novo a cada renovacao', () => {
    vi.useFakeTimers()
    const renovacoes = vi.fn()
    const { container } = render(<DonoQueRenova aoRenovar={renovacoes} />)
    act(() => vi.advanceTimersByTime(ALEM_DE_RECEM_CHEGADO))

    // Cada endereco novo falha tambem — como uma imagem com bytes que o navegador
    // nao decodifica.
    for (let i = 0; i < 50; i++) {
      const img = imagem(container)
      if (!img) break
      fireEvent.error(img)
    }

    expect(renovacoes).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('não carregou')
  })

  it('endereco novo que carrega zera a trava: o proximo vencimento renova de novo', () => {
    vi.useFakeTimers()
    const renovacoes = vi.fn()
    const { container } = render(<DonoQueRenova aoRenovar={renovacoes} />)
    act(() => vi.advanceTimersByTime(ALEM_DE_RECEM_CHEGADO))

    fireEvent.error(imagem(container))
    fireEvent.load(imagem(container))
    // Relogio atrasado: o endereco novo tambem vence antes da hora marcada.
    act(() => vi.advanceTimersByTime(31_000))
    fireEvent.error(imagem(container))

    expect(renovacoes).toHaveBeenCalledTimes(2)
    expect(container.textContent).not.toContain('não carregou')
  })

  it('varias imagens vencendo juntas viram um pedido so', () => {
    vi.useFakeTimers()
    const renovar = vi.fn()
    const { container } = render(
      <AttachmentGallery
        items={[item({ id: 'a-1' }), item({ id: 'a-2' }), item({ id: 'a-3' })]}
        onExpired={renovar}
      />,
    )
    act(() => vi.advanceTimersByTime(ALEM_DE_RECEM_CHEGADO))

    for (const img of container.querySelectorAll('li img')) fireEvent.error(img)

    expect(renovar).toHaveBeenCalledOnce()
  })

  it('pede enderecos novos pouco antes do vencimento, sem esperar quebrar', () => {
    vi.useFakeTimers()
    const renovar = vi.fn()

    render(
      <AttachmentGallery
        items={[item({ expiresAt: new Date(Date.now() + 90_000).toISOString() })]}
        onExpired={renovar}
      />,
    )

    act(() => vi.advanceTimersByTime(50_000))
    expect(renovar).not.toHaveBeenCalled()

    // Vence em 90s, e a renovacao sai 30s antes.
    act(() => vi.advanceTimersByTime(15_000))
    expect(renovar).toHaveBeenCalledOnce()
  })

  it('relogio adiantado nao vira laco: com tudo "vencido", espera o piso entre pedidos', () => {
    vi.useFakeTimers()
    const renovacoes = vi.fn()
    // Para o navegador, o endereco ja chega vencido.
    const vencido = new Date(Date.now() - 10 * 60_000).toISOString()

    function Adiantado() {
      const [v, setV] = useState(1)
      return (
        <AttachmentGallery
          items={[item({ expiresAt: vencido, url: `http://armazenamento/inteiro?v=${v}` })]}
          onExpired={() => {
            renovacoes()
            setV((n) => n + 1)
          }}
        />
      )
    }
    render(<Adiantado />)

    act(() => vi.advanceTimersByTime(29_000))
    expect(renovacoes).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(2 * 60_000))
    // Dois minutos e meio: no maximo um pedido a cada 30 s, e nao milhares.
    expect(renovacoes.mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('renovacao que falha nao trava a galeria: o relogio tenta de novo no piso', () => {
    vi.useFakeTimers()
    const renovar = vi.fn()
    // O dono pede e a resposta nunca chega: a lista fica igual.
    render(
      <AttachmentGallery
        items={[item({ expiresAt: new Date(Date.now() + 40_000).toISOString() })]}
        onExpired={renovar}
      />,
    )

    act(() => vi.advanceTimersByTime(30_000))
    expect(renovar).toHaveBeenCalledOnce()

    act(() => vi.advanceTimersByTime(30_000))
    expect(renovar).toHaveBeenCalledTimes(2)
  })
})

describe('a imagem que ja carregou nao baixa de novo a cada renovacao', () => {
  it('fica no endereco em que carregou; o link de abrir usa o da lista', () => {
    const { container, rerender } = render(
      <AttachmentGallery items={[item()]} onExpired={() => {}} />,
    )
    fireEvent.load(imagem(container))

    rerender(
      <AttachmentGallery
        items={[item({ url: 'http://armazenamento/inteiro?novo' })]}
        onExpired={() => {}}
      />,
    )

    expect(imagem(container).getAttribute('src')).toBe('http://armazenamento/inteiro')
    expect(screen.getByRole('link').getAttribute('href')).toBe('http://armazenamento/inteiro?novo')
  })

  it('a que ainda nao carregou segue a lista', () => {
    const { container, rerender } = render(
      <AttachmentGallery items={[item()]} onExpired={() => {}} />,
    )

    rerender(
      <AttachmentGallery
        items={[item({ url: 'http://armazenamento/inteiro?novo' })]}
        onExpired={() => {}}
      />,
    )

    expect(imagem(container).getAttribute('src')).toBe('http://armazenamento/inteiro?novo')
  })

  it('o endereco guardado que falha passa para o da lista, sem pedir nada', () => {
    vi.useFakeTimers()
    const renovar = vi.fn()
    const { container, rerender } = render(
      <AttachmentGallery items={[item()]} onExpired={renovar} />,
    )
    fireEvent.load(imagem(container))
    rerender(
      <AttachmentGallery
        items={[item({ url: 'http://armazenamento/inteiro?novo' })]}
        onExpired={renovar}
      />,
    )
    act(() => vi.advanceTimersByTime(ALEM_DE_RECEM_CHEGADO))

    fireEvent.error(imagem(container))

    expect(imagem(container).getAttribute('src')).toBe('http://armazenamento/inteiro?novo')
    expect(renovar).not.toHaveBeenCalled()
  })

  // A ordem "falhou, depois renovou": sem soltar o guardado, a imagem ficaria presa no
  // endereco que falhou, com a lista ja renovada.
  it('o guardado que falha antes da renovacao pede um novo, e depois segue a lista', () => {
    vi.useFakeTimers()
    const renovacoes = vi.fn()
    const { container } = render(<DonoQueRenova aoRenovar={renovacoes} />)
    fireEvent.load(imagem(container))
    act(() => vi.advanceTimersByTime(ALEM_DE_RECEM_CHEGADO))

    fireEvent.error(imagem(container))

    expect(renovacoes).toHaveBeenCalledOnce()
    expect(imagem(container).getAttribute('src')).toBe('http://armazenamento/inteiro?v=2')
  })
})

describe('renovar nao fecha o video aberto', () => {
  it('o video aberto fica no endereco em que comecou — trocar o src voltaria ao inicio', () => {
    const video = item({ kind: 'Video' })
    const { container, rerender } = render(
      <AttachmentGallery items={[video]} onExpired={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Vídeo/ }))

    rerender(
      <AttachmentGallery
        items={[{ ...video, url: 'http://armazenamento/inteiro?novo' }]}
        onExpired={() => {}}
      />,
    )

    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      'http://armazenamento/inteiro',
    )
  })

  it('se o endereco do video aberto falhar, ele passa para o da lista', () => {
    const video = item({ kind: 'Video' })
    const { container, rerender } = render(
      <AttachmentGallery items={[video]} onExpired={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Vídeo/ }))
    rerender(
      <AttachmentGallery
        items={[{ ...video, url: 'http://armazenamento/inteiro?novo' }]}
        onExpired={() => {}}
      />,
    )

    fireEvent.error(container.querySelector('video') as HTMLVideoElement)

    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      'http://armazenamento/inteiro?novo',
    )
  })
})

// O arquivo que nao e imagem so baixa: a linha diz o que e e quanto pesa, e o nome
// original so aparece no painel (pela legenda).
describe('o arquivo que nao e imagem', () => {
  const pdf = (mudanca: Partial<GalleryItem> = {}) =>
    item({
      id: 'f-1',
      kind: 'File',
      url: 'http://armazenamento/fatura?assinado',
      thumbnailUrl: null,
      contentType: 'application/pdf',
      sizeBytes: 120 * 1024,
      caption: undefined,
      ...mudanca,
    })

  it('vira uma linha de baixar, com o tipo e o tamanho, e nunca uma imagem', () => {
    const { container } = render(
      <AttachmentGallery
        fileLabel="Arquivos que você anexou"
        items={[pdf()]}
        onExpired={() => {}}
      />,
    )

    const lista = screen.getByRole('list', { name: 'Arquivos que você anexou' })
    const link = screen.getByRole('link', { name: 'Baixar PDF · 120 KB' })
    expect(lista.contains(link)).toBe(true)
    expect(link.getAttribute('href')).toBe('http://armazenamento/fatura?assinado')
    expect(link.hasAttribute('download')).toBe(true)
    // Em outra aba: se o endereco falhar mesmo assim, o erro nao toma o lugar da pagina.
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noreferrer')
    expect(container.querySelector('img')).toBeNull()
  })

  // O computador dormiu e a renovacao nao rodou: abrir o endereco vencido daria o erro
  // do armazenamento. O clique pede um novo, e diz o que houve.
  it('com o endereco vencendo, o clique pede um novo em vez de abrir', () => {
    const renovar = vi.fn()
    render(
      <AttachmentGallery
        items={[pdf({ expiresAt: new Date(Date.now() + 10_000).toISOString() })]}
        onExpired={renovar}
      />,
    )

    const clique = fireEvent.click(screen.getByRole('link', { name: /^Baixar/ }))

    expect(clique).toBe(false)
    expect(renovar).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toMatch(/tinha vencido/)
  })

  it('com o endereco valido, o clique segue para o download', () => {
    const renovar = vi.fn()
    render(<AttachmentGallery items={[pdf()]} onExpired={renovar} />)

    expect(fireEvent.click(screen.getByRole('link', { name: /^Baixar/ }))).toBe(true)
    expect(renovar).not.toHaveBeenCalled()
  })

  it('o aviso do painel fica embaixo da lista, e nao dentro dela', () => {
    render(<AttachmentGallery items={[pdf()]} fileNote="Abra com cuidado." onExpired={() => {}} />)

    const aviso = screen.getByText('Abra com cuidado.')
    expect(screen.getByRole('list', { name: 'Arquivos anexados' }).contains(aviso)).toBe(false)
  })

  it('no painel, a legenda traz o nome original', () => {
    render(
      <AttachmentGallery
        items={[pdf({ caption: 'fatura-março.pdf · 120 KB' })]}
        onExpired={() => {}}
      />,
    )

    expect(screen.getByRole('link', { name: 'Baixar fatura-março.pdf · 120 KB' })).toBeDefined()
  })

  it('um tipo que a tela nao conhece tambem so baixa', () => {
    render(
      <AttachmentGallery
        items={[pdf({ kind: 'Audio' as never, contentType: 'audio/ogg' })]}
        onExpired={() => {}}
      />,
    )

    expect(screen.getByRole('link', { name: /^Baixar Arquivo/ })).toBeDefined()
  })

  it('imagens na grade, e arquivos na lista, cada um no seu lugar', () => {
    render(<AttachmentGallery items={[pdf(), item({ id: 'i-1' })]} onExpired={() => {}} />)

    expect(
      screen.getByRole('list', { name: 'Imagens anexadas' }).querySelectorAll('img'),
    ).toHaveLength(1)
    expect(
      screen.getByRole('list', { name: 'Arquivos anexados' }).querySelectorAll('a'),
    ).toHaveLength(1)
  })
})
