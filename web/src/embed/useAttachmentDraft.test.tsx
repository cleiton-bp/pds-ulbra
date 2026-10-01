// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import type { EditDoc } from '@/editor/doc'
import type { Anexo } from '@/embed/attachments'
import { useAttachmentDraft } from '@/embed/useAttachmentDraft'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O que a pessoa salvou no editor vale na hora**, antes da miniatura nova: o anexo
 * ja tem o arquivo marcado e as marcas, e a miniatura velha — a do original, com o que
 * a tarja cobre agora — sai no mesmo instante. Nada da imagem sem marcas fica pronto
 * para subir enquanto a nova e preparada.
 *
 * **A imagem entra no relato na linha inteira, e a pessoa escolhe outro tamanho** —
 * so antes de enviar. O tamanho resiste a edicao no editor. **A mostra e a propria
 * imagem**, e nao a miniatura de 320 pixels, que ficaria borrada na linha inteira.
 *
 * **Cada arquivo sobe com a posicao que tinha na lista quando o envio comecou**, e o
 * "Tentar de novo" manda a mesma: o arquivo tentado de novo chega depois dos outros, e
 * e a posicao que o devolve ao lugar.
 */
const dublê = vi.hoisted(() => ({ miniatura: vi.fn(), enviar: vi.fn() }))

vi.mock('@/embed/attachments', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/embed/attachments')>()
  return { ...real, makeThumbnail: dublê.miniatura }
})

vi.mock('@/embed/sendAttachment', () => ({ sendAttachment: dublê.enviar }))

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

const marcas: EditDoc = {
  shapes: [{ type: 'hide', rect: { x: 1, y: 1, width: 10, height: 10 } }],
  crop: null,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('a troca pelo arquivo marcado', () => {
  it('vale na hora: arquivo e marcas no anexo, e a miniatura velha fora, antes da nova', async () => {
    dublê.miniatura.mockResolvedValueOnce(new Blob(['do original'], { type: 'image/webp' }))
    const { result } = renderHook(() => useAttachmentDraft(media))
    const original = new File([new Uint8Array(100)], 'senha.png', { type: 'image/png' })
    await act(() => result.current.adicionar([original]))
    const id = result.current.atual()[0]?.id ?? ''
    expect(result.current.atual()[0]?.thumbnail).not.toBeNull()

    act(() => result.current.editar(id))
    dublê.miniatura.mockReturnValueOnce(new Promise(() => {}))
    const marcado = new File([new Uint8Array(80)], 'senha.webp', { type: 'image/webp' })
    act(() => {
      void result.current.concluirEdicao({ file: marcado, doc: marcas })
    })

    const agora = result.current.atual()[0]
    expect(agora?.file).toBe(marcado)
    expect(agora?.edit).toEqual({ original, doc: marcas })
    expect(agora?.thumbnail).toBeNull()
    expect(result.current.preparando).toBe(true)
  })
})

const credenciais = { trackingCode: '7K2M-9QXP-4TRV', token: 'tok-secreto' }
const png = (nome: string) => new File([new Uint8Array(100)], nome, { type: 'image/png' })

describe('o tamanho em que a imagem aparece', () => {
  it('entra na linha inteira, e muda para o que a pessoa escolher', async () => {
    const { result } = renderHook(() => useAttachmentDraft(media))
    await act(() => result.current.adicionar([png('erro.png')]))
    const id = result.current.atual()[0]?.id ?? ''
    expect(result.current.atual()[0]?.displaySize).toBe('Full')

    act(() => result.current.redimensionar(id, 'Small'))

    expect(result.current.atual()[0]?.displaySize).toBe('Small')
  })

  it('passar pelo editor nao desfaz o tamanho escolhido', async () => {
    dublê.miniatura.mockResolvedValue(null)
    const { result } = renderHook(() => useAttachmentDraft(media))
    await act(() => result.current.adicionar([png('senha.png')]))
    const id = result.current.atual()[0]?.id ?? ''
    act(() => result.current.redimensionar(id, 'Medium'))

    act(() => result.current.editar(id))
    await act(() => result.current.concluirEdicao({ file: png('senha-marcada.png'), doc: marcas }))

    expect(result.current.atual()[0]?.file.name).toBe('senha-marcada.png')
    expect(result.current.atual()[0]?.displaySize).toBe('Medium')
  })

  it('depois que o envio comecou, o tamanho nao muda mais', async () => {
    dublê.enviar.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAttachmentDraft(media))
    await act(() => result.current.adicionar([png('erro.png')]))
    const id = result.current.atual()[0]?.id ?? ''

    act(() => {
      void result.current.enviarAnexos(credenciais, 0)
    })
    act(() => result.current.redimensionar(id, 'Small'))

    expect(result.current.atual()[0]?.status).toBe('sending')
    expect(result.current.atual()[0]?.displaySize).toBe('Full')
  })

  // A miniatura tem 320 pixels: na linha inteira, o texto do print ficaria borrado.
  it('a mostra e a propria imagem, e nao a miniatura', async () => {
    // O ambiente de teste nao cria endereco local: este diz de que arquivo veio.
    const antes = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const criar = vi.fn((blob: Blob) => `blob:${(blob as File).name ?? 'miniatura'}`)
    Object.defineProperty(URL, 'createObjectURL', { value: criar, configurable: true })
    try {
      dublê.miniatura.mockResolvedValue(new Blob(['miniatura'], { type: 'image/webp' }))
      const { result } = renderHook(() => useAttachmentDraft(media))

      await act(() => result.current.adicionar([png('erro.png')]))

      expect(result.current.atual()[0]?.preview).toBe('blob:erro.png')
    } finally {
      if (antes) Object.defineProperty(URL, 'createObjectURL', antes)
      else Reflect.deleteProperty(URL, 'createObjectURL')
    }
  })
})

describe('a ordem em que a pessoa montou', () => {
  it('cada arquivo sobe com a posicao que tinha na lista', async () => {
    dublê.enviar.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAttachmentDraft(media))
    await act(() => result.current.adicionar([png('a.png'), png('b.png'), png('c.png')]))

    await act(() => result.current.enviarAnexos(credenciais, 0))

    expect(
      dublê.enviar.mock.calls.map(([, anexo]) => [anexo.file.name, anexo.displayOrder]),
    ).toEqual([
      ['a.png', 0],
      ['b.png', 1],
      ['c.png', 2],
    ])
  })

  it('"Tentar de novo" manda a mesma posicao — e nao a de quem chegou por ultimo', async () => {
    dublê.enviar
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValue(undefined)
    const { result } = renderHook(() => useAttachmentDraft(media))
    await act(() => result.current.adicionar([png('a.png'), png('b.png'), png('c.png')]))
    await act(() => result.current.enviarAnexos(credenciais, 0))

    const falhou = result.current.atual().find((anexo) => anexo.status === 'failed')
    expect(falhou?.file.name).toBe('b.png')
    await act(() => result.current.enviarAnexo(credenciais, falhou as Anexo, 0))

    const tentativa = dublê.enviar.mock.calls.at(-1)?.[1]
    expect([tentativa?.file.name, tentativa?.displayOrder]).toEqual(['b.png', 1])
  })

  it('o que tirou um da lista antes de enviar nao deixa buraco', async () => {
    dublê.enviar.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAttachmentDraft(media))
    await act(() => result.current.adicionar([png('a.png'), png('b.png'), png('c.png')]))
    act(() => result.current.remover(result.current.atual()[0]?.id ?? ''))

    await act(() => result.current.enviarAnexos(credenciais, 0))

    expect(dublê.enviar.mock.calls.map(([, anexo]) => anexo.displayOrder)).toEqual([0, 1])
  })
})
