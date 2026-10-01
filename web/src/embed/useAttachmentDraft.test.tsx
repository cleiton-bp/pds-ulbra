// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import type { EditDoc } from '@/editor/doc'
import { useAttachmentDraft } from '@/embed/useAttachmentDraft'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O que a pessoa salvou no editor vale na hora**, antes da miniatura nova: o anexo
 * ja tem o arquivo marcado e as marcas, e a miniatura velha — a do original, com o que
 * a tarja cobre agora — sai no mesmo instante. Nada da imagem sem marcas fica pronto
 * para subir enquanto a nova e preparada.
 */
const dublê = vi.hoisted(() => ({ miniatura: vi.fn() }))

vi.mock('@/embed/attachments', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/embed/attachments')>()
  return { ...real, makeThumbnail: dublê.miniatura }
})

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
