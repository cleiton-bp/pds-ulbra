// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttachmentGallery, type GalleryItem } from '@/shared/components/AttachmentGallery'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O arquivo inteiro so carrega quando alguem abre.** A grade usa a miniatura; o
 * endereco do arquivo so entra na pagina depois do clique. Se ele entrasse antes,
 * uma lista de prints baixaria megabytes para desenhar 64 pixels.
 *
 * **Link vencido e tratado, e nunca em laco.** A galeria pede enderecos novos
 * pouco antes do vencimento e quando um arquivo falha. Mas endereco NOVO que tambem
 * falha nao e vencimento: o arquivo vira "nao carregou" e a galeria para. Antes, a
 * trava era por lista, e quem monta a galeria cria a lista a cada desenho: uma
 * miniatura que o navegador nao decodificava fez a pagina de acompanhamento reler
 * a lista **3.609 vezes em 10 segundos**, medido no navegador.
 *
 * **Renovar nao fecha nada.** O que estava aberto continua aberto, e o video
 * continua no endereco em que comecou.
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

const miniatura = (container: HTMLElement) => container.querySelector('li img') as HTMLImageElement

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a galeria', () => {
  it('sem arquivo, nao desenha nada', () => {
    const { container } = render(<AttachmentGallery items={[]} onExpired={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('a grade usa a miniatura, e o arquivo inteiro so aparece depois do clique', () => {
    const { container } = render(<AttachmentGallery items={[item()]} onExpired={() => {}} />)

    expect(container.innerHTML).toContain('miniatura')
    expect(container.innerHTML).not.toContain('inteiro')

    fireEvent.click(screen.getByRole('button', { name: /Imagem/ }))
    expect(container.innerHTML).toContain('inteiro')
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
  it('miniatura que falha pede endereco novo — e so uma vez, enquanto ele nao chega', () => {
    vi.useFakeTimers()
    const renovar = vi.fn()
    const { container, rerender } = render(
      <AttachmentGallery items={[item()]} onExpired={renovar} />,
    )
    act(() => vi.advanceTimersByTime(ALEM_DE_RECEM_CHEGADO))

    fireEvent.error(miniatura(container))
    // O dono desenha de novo com o mesmo endereco, antes de a resposta chegar.
    rerender(<AttachmentGallery items={[item()]} onExpired={renovar} />)
    fireEvent.error(miniatura(container))

    expect(renovar).toHaveBeenCalledOnce()
  })

  it('endereco recem-chegado que falha nao venceu: vira "nao carregou" sem pedir nada', () => {
    const renovacoes = vi.fn()
    const { container } = render(<DonoQueRenova aoRenovar={renovacoes} />)

    // Falhou logo que a lista chegou: renovar so traria o mesmo arquivo — e, no
    // mesmo segundo, ate o mesmo endereco.
    fireEvent.error(miniatura(container))

    expect(renovacoes).not.toHaveBeenCalled()
    expect(container.textContent).toContain('não carregou')
  })

  it('o laco medido: miniatura que nunca decodifica, com endereco novo a cada renovacao', () => {
    vi.useFakeTimers()
    const renovacoes = vi.fn()
    const { container } = render(<DonoQueRenova aoRenovar={renovacoes} />)
    act(() => vi.advanceTimersByTime(ALEM_DE_RECEM_CHEGADO))

    // Cada endereco novo falha tambem — como uma miniatura com bytes que o
    // navegador nao decodifica.
    for (let i = 0; i < 50; i++) {
      const img = miniatura(container)
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

    fireEvent.error(miniatura(container))
    fireEvent.load(miniatura(container))
    // Relogio atrasado: o endereco novo tambem vence antes da hora marcada.
    act(() => vi.advanceTimersByTime(31_000))
    fireEvent.error(miniatura(container))

    expect(renovacoes).toHaveBeenCalledTimes(2)
    expect(container.textContent).not.toContain('não carregou')
  })

  it('varias miniaturas vencendo juntas viram um pedido so', () => {
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
          items={[
            item({ expiresAt: vencido, thumbnailUrl: `http://armazenamento/miniatura?v=${v}` }),
          ]}
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

describe('renovar nao fecha o que esta aberto', () => {
  it('a imagem aberta continua aberta quando os enderecos mudam', () => {
    const { container, rerender } = render(
      <AttachmentGallery items={[item()]} onExpired={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Imagem/ }))

    rerender(
      <AttachmentGallery
        items={[item({ url: 'http://armazenamento/inteiro?novo' })]}
        onExpired={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: /Imagem/ }).getAttribute('aria-pressed')).toBe('true')
    expect(container.innerHTML).toContain('inteiro?novo')
  })

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
