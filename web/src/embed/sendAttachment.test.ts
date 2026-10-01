import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Anexo } from '@/embed/attachments'
import { type AttachmentEnvio, sendAttachment } from '@/embed/sendAttachment'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O envio vira a bandeira certa, e nunca as duas.** A criacao nao leva bandeira,
 * a resposta leva `ForReply` e a reabertura leva `ForReopen`. O servidor recusa as
 * duas juntas, e uma bandeira trocada prenderia o arquivo ao envio errado — com a
 * cota e o lugar na tela do outro.
 */
const dublê = vi.hoisted(() => ({
  pedir: vi.fn(),
  subir: vi.fn(),
  confirmar: vi.fn(),
}))

vi.mock('@/data/publicIndex', () => ({
  publicMediaService: {
    requestUpload: dublê.pedir,
    uploadToStorage: dublê.subir,
    confirm: dublê.confirmar,
  },
}))

const credenciais = { trackingCode: '7K2M-9QXP-4TRV', token: 'tok-secreto' }

const anexo: Anexo = {
  id: 'a-1',
  file: new File([new Uint8Array(100)], 'erro.png', { type: 'image/png' }),
  kind: 'Image',
  preview: null,
  thumbnail: null,
  status: 'waiting',
  progress: 0,
  error: null,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('a ordem do envio', () => {
  // A permissao da miniatura nasce junto com a do arquivo e vale os mesmos minutos.
  // Depois de um arquivo grande numa conexao lenta, ela ja teria vencido.
  it('a miniatura sobe antes do arquivo, e a confirmação vem por último', async () => {
    const ordem: string[] = []
    dublê.pedir.mockResolvedValue({
      PublicId: 'p-1',
      File: { Url: 'arquivo' },
      Thumbnail: { Url: 'miniatura' },
    })
    dublê.subir.mockImplementation(async (destino: { Url: string }) => {
      ordem.push(destino.Url)
    })
    dublê.confirmar.mockImplementation(async () => {
      ordem.push('confirmar')
    })

    await sendAttachment(
      credenciais,
      { ...anexo, thumbnail: new Blob(['x'], { type: 'image/webp' }) },
      () => {},
    )

    expect(ordem).toEqual(['miniatura', 'arquivo', 'confirmar'])
  })

  it('miniatura que falha não impede o arquivo', async () => {
    dublê.pedir.mockResolvedValue({
      PublicId: 'p-1',
      File: { Url: 'arquivo' },
      Thumbnail: { Url: 'miniatura' },
    })
    dublê.subir.mockImplementation(async (destino: { Url: string }) => {
      if (destino.Url === 'miniatura') throw new Error('rede')
    })

    await sendAttachment(
      credenciais,
      { ...anexo, thumbnail: new Blob(['x'], { type: 'image/webp' }) },
      () => {},
    )

    expect(dublê.subir).toHaveBeenCalledTimes(2)
    expect(dublê.confirmar).toHaveBeenCalledOnce()
  })
})

describe('a que envio o arquivo pertence', () => {
  it.each<[AttachmentEnvio | undefined, boolean, boolean]>([
    [undefined, false, false],
    ['creation', false, false],
    ['reply', true, false],
    ['reopen', false, true],
  ])('envio %s: ForReply %s, ForReopen %s', async (envio, forReply, forReopen) => {
    dublê.pedir.mockResolvedValue({ PublicId: 'p-1', File: {}, Thumbnail: null })

    await sendAttachment(credenciais, anexo, () => {}, envio ? { envio } : undefined)

    const pedido = dublê.pedir.mock.calls[0]?.[0]
    expect(pedido.ForReply).toBe(forReply)
    expect(pedido.ForReopen).toBe(forReopen)
    expect(pedido.TrackingCode).toBe('7K2M-9QXP-4TRV')
    expect(pedido.Token).toBe('tok-secreto')
    expect(dublê.confirmar).toHaveBeenCalledWith({
      TrackingCode: '7K2M-9QXP-4TRV',
      Token: 'tok-secreto',
      AttachmentPublicId: 'p-1',
    })
  })
})
