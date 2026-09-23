// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttachmentGallery, type GalleryItem } from '@/shared/components/AttachmentGallery'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O arquivo inteiro so carrega quando alguem abre.** A grade usa a miniatura; o
 * endereco do arquivo so entra na pagina depois do clique. Se ele entrasse antes,
 * uma lista de prints baixaria megabytes para desenhar 64 pixels.
 *
 * **Link vencido e tratado.** A galeria pede enderecos novos pouco antes do
 * vencimento e quando uma imagem falha — mas **uma vez por lista**: se o novo
 * tambem falhar, o problema nao e o vencimento, e insistir martelaria a API.
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

  it('imagem que falha pede enderecos novos — uma vez so por lista', () => {
    const renovar = vi.fn()
    const { container } = render(<AttachmentGallery items={[item()]} onExpired={renovar} />)

    const miniatura = container.querySelector('img') as HTMLImageElement
    fireEvent.error(miniatura)
    fireEvent.error(miniatura)

    expect(renovar).toHaveBeenCalledOnce()
  })

  it('lista nova libera uma nova renovacao', () => {
    const renovar = vi.fn()
    const { container, rerender } = render(
      <AttachmentGallery items={[item()]} onExpired={renovar} />,
    )

    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    rerender(<AttachmentGallery items={[item()]} onExpired={renovar} />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    expect(renovar).toHaveBeenCalledTimes(2)
  })

  it('pede enderecos novos pouco antes do vencimento, sem esperar quebrar', () => {
    vi.useFakeTimers()
    const renovar = vi.fn()

    render(
      <AttachmentGallery
        items={[item({ expiresAt: new Date(Date.now() + 60_000).toISOString() })]}
        onExpired={renovar}
      />,
    )

    act(() => vi.advanceTimersByTime(20_000))
    expect(renovar).not.toHaveBeenCalled()

    // Vence em 60s, e a renovacao sai 30s antes.
    act(() => vi.advanceTimersByTime(15_000))
    expect(renovar).toHaveBeenCalledOnce()
  })
})
