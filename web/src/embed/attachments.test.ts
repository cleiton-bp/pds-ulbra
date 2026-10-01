import { describe, expect, it } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import {
  acceptAttribute,
  formatBytes,
  hasRoom,
  kindFor,
  onlyUploadable,
  rejectReason,
} from '@/embed/attachments'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **A recusa cedo e cortesia, e nao trava** — quem trava e o servidor e o
 * armazenamento. Mas ela precisa dizer a mesma coisa que eles diriam: um quadro
 * que aceitasse aqui o que o servidor recusa faria a pessoa esperar o envio para
 * ouvir "nao serve", e um que recusasse o que o servidor aceita tiraria dela um
 * anexo valido.
 *
 * **Os dois limites valem juntos.** O do tipo e o total sao conferidos um depois
 * do outro, e a recusa diz qual dos dois encheu. O "cheio" que desliga os botoes
 * faz a mesma conta: so o total deixaria os botoes ligados com o tipo ja cheio.
 *
 * **A recusa de formato diz o que serve.** Quem mandava video precisa saber que so
 * imagem entra, e em quais formatos.
 *
 * **So imagem entra.** O video saiu do produto, e o quadro nao o oferece nem
 * quando a configuracao ainda o lista — o que acontece na janela da troca, com a
 * API ainda antiga.
 */
const MB = 1024 * 1024

const media: PublicMediaSettingsViewModel = {
  IsEnabled: true,
  AllowsScreenCapture: true,
  AllowsOnInfoRequest: true,
  MaxFilesPerReport: 3,
  Kinds: [
    {
      Kind: 'Image',
      MaxCount: 2,
      MaxBytes: 5 * MB,
      ContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
    },
  ],
}

/** O que uma API anterior a troca responderia: com o video ainda na lista. */
const comVideo: PublicMediaSettingsViewModel = {
  ...media,
  Kinds: [
    ...media.Kinds,
    { Kind: 'Video', MaxCount: 1, MaxBytes: 20 * MB, ContentTypes: ['video/webm'] },
  ],
}

function arquivo(tipo: string, bytes: number) {
  return new File([new Uint8Array(bytes)], 'x', { type: tipo })
}

describe('a categoria de um arquivo', () => {
  it('vem do tipo, e nao da extensao', () => {
    expect(kindFor(arquivo('image/png', 10), media)?.Kind).toBe('Image')
    expect(kindFor(arquivo('application/pdf', 10), media)).toBeNull()
  })

  it('o seletor do navegador recebe todos os tipos da configuracao', () => {
    expect(acceptAttribute(media)).toBe('image/png,image/jpeg,image/webp')
  })
})

describe('o que ainda se pode enviar', () => {
  it('tira o video da configuracao, mesmo quando a API ainda o lista', () => {
    const filtrada = onlyUploadable(comVideo)

    expect(filtrada.Kinds.map((kind) => kind.Kind)).toEqual(['Image'])
    expect(acceptAttribute(filtrada)).toBe('image/png,image/jpeg,image/webp')
    expect(kindFor(arquivo('video/webm', 10), filtrada)).toBeNull()
  })

  it('o resto da configuracao continua como veio', () => {
    const filtrada = onlyUploadable(comVideo)

    expect(filtrada.MaxFilesPerReport).toBe(3)
    expect(filtrada.AllowsScreenCapture).toBe(true)
    expect(filtrada.Kinds[0]).toEqual(media.Kinds[0])
  })

  it('projeto que so aceitava video fica sem tipo nenhum', () => {
    const soVideo = { ...comVideo, Kinds: comVideo.Kinds.filter((kind) => kind.Kind === 'Video') }
    expect(onlyUploadable(soVideo).Kinds).toEqual([])
  })
})

describe('a recusa cedo', () => {
  it('aceita o que cabe', () => {
    expect(rejectReason(arquivo('image/png', 1024), [], media)).toBeNull()
  })

  it('recusa formato que o projeto nao aceita, dizendo quais servem', () => {
    expect(rejectReason(arquivo('application/pdf', 1024), [], media)).toBe(
      'Só dá para anexar imagem: PNG, JPEG ou WebP.',
    )
  })

  it('recusa video, dizendo que so imagem entra', () => {
    expect(rejectReason(arquivo('video/webm', 1024), [], media)).toBe(
      'Só dá para anexar imagem: PNG, JPEG ou WebP.',
    )
    expect(rejectReason(arquivo('video/mp4', 1024), [], media)).toBe(
      'Só dá para anexar imagem: PNG, JPEG ou WebP.',
    )
  })

  it('os formatos saem da configuracao, e nao de uma lista fixa aqui', () => {
    const soPng = {
      ...media,
      Kinds: media.Kinds.map((kind) => ({ ...kind, ContentTypes: ['image/png'] })),
    }
    expect(rejectReason(arquivo('image/jpeg', 1024), [], soPng)).toBe(
      'Só dá para anexar imagem: PNG.',
    )
  })

  it('recusa acima do teto do tipo', () => {
    expect(rejectReason(arquivo('image/png', 6 * MB), [], media)).toMatch(/5 MB/)
  })

  it('recusa quando o tipo ja chegou ao limite dele', () => {
    const duas = [{ kind: 'Image' as const }, { kind: 'Image' as const }]
    expect(rejectReason(arquivo('image/png', 1024), duas, media)).toBe(
      'Cabem até 2 imagens por envio.',
    )
  })

  it('recusa quando o total ja chegou ao limite, mesmo com vaga no tipo', () => {
    const duas = [{ kind: 'Image' as const }, { kind: 'Image' as const }]
    const totalDoisComVagaNoTipo = {
      ...media,
      MaxFilesPerReport: 2,
      Kinds: media.Kinds.map((kind) => ({ ...kind, MaxCount: 3 })),
    }
    expect(rejectReason(arquivo('image/png', 1024), duas, totalDoisComVagaNoTipo)).toBe(
      'Cabem até 2 arquivos por envio.',
    )
  })

  // O limite vale para cada envio: a criacao do relato e cada resposta. "Por
  // relato" faria quem responde achar que a cota ja tinha acabado na criacao.
  it('fala em envio, e concorda o verbo e a palavra com o numero', () => {
    const soUm = { ...media, MaxFilesPerReport: 1 }
    const umaImagem = [{ kind: 'Image' as const }]
    expect(rejectReason(arquivo('image/png', 1024), umaImagem, soUm)).toBe(
      'Cabe até 1 arquivo por envio.',
    )

    const umaPorVez = { ...media, Kinds: media.Kinds.map((kind) => ({ ...kind, MaxCount: 1 })) }
    expect(rejectReason(arquivo('image/png', 1024), umaImagem, umaPorVez)).toBe(
      'Cabe até 1 imagem por envio.',
    )
  })
})

describe('ainda cabe arquivo', () => {
  // O padrao de fabrica: quatro no total, tres imagens.
  const fabrica = {
    ...media,
    MaxFilesPerReport: 4,
    Kinds: media.Kinds.map((kind) => ({ ...kind, MaxCount: 3 })),
  }
  const imagens = (n: number) => Array.from({ length: n }, () => ({ kind: 'Image' as const }))

  it('cabe enquanto o tipo e o total tem vaga', () => {
    expect(hasRoom([], fabrica)).toBe(true)
    expect(hasRoom(imagens(2), fabrica)).toBe(true)
    expect(hasRoom(imagens(2), fabrica, 'Image')).toBe(true)
  })

  it('o tipo cheio enche, mesmo com vaga no total', () => {
    expect(hasRoom(imagens(3), fabrica)).toBe(false)
    expect(hasRoom(imagens(3), fabrica, 'Image')).toBe(false)
  })

  it('o total cheio enche, mesmo com vaga no tipo', () => {
    const totalDois = { ...fabrica, MaxFilesPerReport: 2 }
    expect(hasRoom(imagens(2), totalDois)).toBe(false)
  })

  it('tipo que o projeto nao aceita nunca tem vaga', () => {
    expect(hasRoom([], fabrica, 'Video')).toBe(false)
  })
})

describe('o tamanho para ler', () => {
  it('fala em KB abaixo de um mega, e em MB acima', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB')
    expect(formatBytes(5 * MB)).toBe('5 MB')
    expect(formatBytes(2.5 * MB)).toBe('2.5 MB')
  })
})
