import { afterEach, describe, expect, it, vi } from 'vitest'
import { PanelError } from '@/data/errors'
import type { Anexo } from '@/embed/attachments'
import { type AttachmentEnvio, sendAttachment } from '@/embed/sendAttachment'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O envio vira a bandeira certa, e nunca as duas.** A criacao nao leva bandeira,
 * a resposta leva `ForReply` e a reabertura leva `ForReopen`. O servidor recusa as
 * duas juntas, e uma bandeira trocada prenderia o arquivo ao envio errado — com a
 * cota e o lugar na tela do outro.
 *
 * **O arquivo que ja subiu so confirma de novo.** A confirmacao pode ter entrado
 * com a resposta perdida no caminho; recomecar poria o mesmo print duas vezes no
 * relato. So quando a API diz que nao ha o que confirmar o envio recomeca.
 */
const dublê = vi.hoisted(() => ({
  pedir: vi.fn(),
  subir: vi.fn(),
  confirmar: vi.fn(),
}))

// So o que o envio usa: o indice inteiro le `window`, e este teste roda sem ele.
vi.mock('@/data/publicIndex', async () => {
  const { isPanelError } = await import('@/data/errors')
  return {
    isPanelError,
    publicMediaService: {
      requestUpload: dublê.pedir,
      uploadToStorage: dublê.subir,
      confirm: dublê.confirmar,
    },
  }
})

const credenciais = { trackingCode: '7K2M-9QXP-4TRV', token: 'tok-secreto' }

const anexo: Anexo = {
  id: 'a-1',
  file: new File([new Uint8Array(100)], 'erro.png', { type: 'image/png' }),
  kind: 'Image',
  preview: null,
  displaySize: 'Full',
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

describe('o formato da miniatura', () => {
  // No Safari a miniatura sai em JPEG: a assinatura tem de ser feita para ele, ou o
  // armazenamento recusa o envio dela.
  it.each([['image/webp'], ['image/jpeg']])(
    'a miniatura em %s pede a permissao para esse formato',
    async (tipo) => {
      dublê.pedir.mockResolvedValue({ PublicId: 'p-1', File: {}, Thumbnail: null })

      await sendAttachment(
        credenciais,
        { ...anexo, thumbnail: new Blob(['x'], { type: tipo }) },
        () => {},
      )

      expect(dublê.pedir.mock.calls[0]?.[0]).toMatchObject({
        WithThumbnail: true,
        ThumbnailContentType: tipo,
      })
    },
  )

  it('sem miniatura, nao diz formato nenhum', async () => {
    dublê.pedir.mockResolvedValue({ PublicId: 'p-1', File: {}, Thumbnail: null })

    await sendAttachment(credenciais, anexo, () => {})

    expect(dublê.pedir.mock.calls[0]?.[0]).toMatchObject({ WithThumbnail: false })
    expect(dublê.pedir.mock.calls[0]?.[0].ThumbnailContentType).toBeUndefined()
  })
})

// O relato mostra o que a pessoa montou: o tamanho e o lugar de cada imagem vao no
// pedido de cada arquivo, e a lista sai na ordem da montagem.
describe('como a imagem aparece no relato', () => {
  it('o tamanho escolhido e a posicao no envio vao no pedido', async () => {
    dublê.pedir.mockResolvedValue({ PublicId: 'p-1', File: {}, Thumbnail: null })

    await sendAttachment(credenciais, { ...anexo, displaySize: 'Small', displayOrder: 2 }, () => {})

    expect(dublê.pedir.mock.calls[0]?.[0]).toMatchObject({ DisplaySize: 'Small', DisplayOrder: 2 })
  })

  it('sem posicao guardada, vai a primeira', async () => {
    dublê.pedir.mockResolvedValue({ PublicId: 'p-1', File: {}, Thumbnail: null })

    await sendAttachment(credenciais, anexo, () => {})

    expect(dublê.pedir.mock.calls[0]?.[0]).toMatchObject({ DisplaySize: 'Full', DisplayOrder: 0 })
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

describe('tentar de novo depois de o arquivo subir', () => {
  it('diz qual permissão subiu antes de confirmar', async () => {
    dublê.pedir.mockResolvedValue({ PublicId: 'p-1', File: {}, Thumbnail: null })
    dublê.confirmar.mockRejectedValue(new Error('rede'))
    const subiu = vi.fn()

    await expect(
      sendAttachment(credenciais, anexo, () => {}, { onUploaded: subiu }),
    ).rejects.toThrow('rede')

    expect(subiu).toHaveBeenCalledWith('p-1')
  })

  it('arquivo que já subiu só confirma de novo', async () => {
    dublê.confirmar.mockResolvedValue(undefined)

    await sendAttachment(credenciais, { ...anexo, uploaded: 'p-1' }, () => {})

    expect(dublê.pedir).not.toHaveBeenCalled()
    expect(dublê.subir).not.toHaveBeenCalled()
    expect(dublê.confirmar).toHaveBeenCalledOnce()
    expect(dublê.confirmar).toHaveBeenCalledWith({
      TrackingCode: '7K2M-9QXP-4TRV',
      Token: 'tok-secreto',
      AttachmentPublicId: 'p-1',
    })
  })

  // 404: a permissao nao esta pendente nem virou anexo. 400: o arquivo sumiu, ou nao
  // conferiu e foi descartado. Nos dois, so recomecar resolve.
  it.each([404, 400])('a confirmação de novo respondendo %i recomeça do zero', async (status) => {
    dublê.confirmar
      .mockRejectedValueOnce(new PanelError('Nao ha anexo pendente.', status))
      .mockResolvedValue(undefined)
    dublê.pedir.mockResolvedValue({ PublicId: 'p-2', File: {}, Thumbnail: null })
    const subiu = vi.fn()

    await sendAttachment(credenciais, { ...anexo, uploaded: 'p-1' }, () => {}, {
      onUploaded: subiu,
    })

    expect(dublê.pedir).toHaveBeenCalledOnce()
    expect(subiu).toHaveBeenCalledWith('p-2')
    expect(dublê.confirmar).toHaveBeenLastCalledWith(
      expect.objectContaining({ AttachmentPublicId: 'p-2' }),
    )
  })

  // A recusa e a resposta: o arquivo foi descartado, e recomecar levaria a mesma.
  it('a recusa da confirmação de novo é a resposta, e não recomeça', async () => {
    dublê.confirmar.mockRejectedValue(
      new PanelError('Este relato ja tem o maximo de arquivos que o projeto permite.', 409),
    )

    await expect(
      sendAttachment(credenciais, { ...anexo, uploaded: 'p-1' }, () => {}),
    ).rejects.toMatchObject({ status: 409 })
    expect(dublê.pedir).not.toHaveBeenCalled()
  })
})
