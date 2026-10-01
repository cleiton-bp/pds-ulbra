import { describe, expect, it } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import {
  acceptAttribute,
  extensionOf,
  formatBytes,
  hasRoom,
  kindFor,
  onlyUploadable,
  rejectReason,
  withDeclaredType,
  withRealType,
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
 * **Cada categoria com o seu limite, e nenhum total.** Imagem cheia ainda deixa
 * anexar arquivo, e o contrario. O "cheio" que desliga os botoes faz a mesma conta.
 *
 * **A imagem pelo tipo, e o arquivo pela extensao.** O tipo da imagem vem dos bytes;
 * o do arquivo, o navegador erra de lugar para lugar — o `.log` chega sem tipo, o
 * `.csv` chega como planilha do Excel no Windows. O arquivo sobe com o tipo que a API
 * da a extensao dele, e nao com o que o navegador deduziu.
 *
 * **A recusa de formato diz o que serve**, da imagem e do arquivo.
 *
 * **Video nao entra.** O video saiu do produto, e o quadro nao o oferece nem
 * quando a configuracao ainda o lista — o que acontece na janela da troca, com a
 * API ainda antiga. O arquivo sem a lista de extensoes, da API de antes dele,
 * tambem nao.
 *
 * **O tipo que vale e o dos bytes.** O navegador deduz o tipo pela extensao e a API
 * confere pelos bytes: o PNG renomeado para .jpg subia inteiro para ser descartado
 * na confirmacao, sempre.
 */
const MB = 1024 * 1024

const media: PublicMediaSettingsViewModel = {
  IsEnabled: true,
  AllowsScreenCapture: true,
  AllowsOnInfoRequest: true,
  AllowsOnReopen: true,
  Kinds: [
    {
      Kind: 'Image',
      MaxCount: 2,
      MaxBytes: 5 * MB,
      ContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
    },
  ],
}

/** O projeto que tambem aceita arquivo: PDF, texto e log, e CSV. */
const comArquivo: PublicMediaSettingsViewModel = {
  ...media,
  Kinds: [
    ...media.Kinds,
    {
      Kind: 'File',
      MaxCount: 2,
      MaxBytes: 10 * MB,
      ContentTypes: ['application/pdf', 'text/plain', 'text/csv'],
      Types: [
        { Extension: '.pdf', ContentType: 'application/pdf' },
        { Extension: '.txt', ContentType: 'text/plain' },
        { Extension: '.log', ContentType: 'text/plain' },
        { Extension: '.csv', ContentType: 'text/csv' },
      ],
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

function arquivo(tipo: string, bytes: number, nome = 'x') {
  return new File([new Uint8Array(bytes)], nome, { type: tipo })
}

describe('a categoria de um arquivo', () => {
  it('a imagem vem do tipo, e nao da extensao', () => {
    expect(kindFor(arquivo('image/png', 10, 'tela.bin'), comArquivo)?.Kind).toBe('Image')
    expect(kindFor(arquivo('application/pdf', 10), media)).toBeNull()
  })

  // O .log chega sem tipo; o .csv, no Windows, como planilha do Excel.
  it.each([
    ['fatura.PDF', 'application/pdf'],
    ['erro.log', ''],
    ['pedidos.csv', 'application/vnd.ms-excel'],
    ['C:\\Users\\ana\\notas.txt', 'text/plain'],
  ])('o arquivo vem da extensao: %s (tipo "%s")', (nome, tipo) => {
    expect(kindFor(arquivo(tipo, 10, nome), comArquivo)?.Kind).toBe('File')
  })

  it('extensao que o projeto nao marcou nao e de categoria nenhuma', () => {
    expect(kindFor(arquivo('application/zip', 10, 'tudo.zip'), comArquivo)).toBeNull()
    expect(kindFor(arquivo('', 10, 'sem-extensao'), comArquivo)).toBeNull()
    expect(kindFor(arquivo('', 10, '.log'), comArquivo)).toBeNull()
  })

  it('o arquivo sobe com o tipo do catalogo, e nao com o que o navegador deduziu', () => {
    const csv = withDeclaredType(
      arquivo('application/vnd.ms-excel', 10, 'pedidos.csv'),
      comArquivo.Kinds[1] as (typeof comArquivo.Kinds)[number],
    )
    const log = withDeclaredType(
      arquivo('', 10, 'erro.log'),
      comArquivo.Kinds[1] as (typeof comArquivo.Kinds)[number],
    )
    expect([csv.type, csv.name]).toEqual(['text/csv', 'pedidos.csv'])
    expect([log.type, log.name]).toEqual(['text/plain', 'erro.log'])

    const png = arquivo('image/png', 10, 'tela.png')
    expect(withDeclaredType(png, comArquivo.Kinds[0] as (typeof comArquivo.Kinds)[number])).toBe(
      png,
    )
  })

  it('a extensao e a do ultimo trecho do nome, em minusculas', () => {
    expect(extensionOf('Relatorio.Final.PDF')).toBe('.pdf')
    expect(extensionOf('pasta/sub.dir/log')).toBeNull()
    expect(extensionOf('nome.')).toBeNull()
    expect(extensionOf(undefined)).toBeNull()
  })

  it('cada seletor recebe o que a categoria dele aceita', () => {
    expect(acceptAttribute(comArquivo, 'Image')).toBe('image/png,image/jpeg,image/webp')
    expect(acceptAttribute(comArquivo, 'File')).toBe('.pdf,.txt,.log,.csv')
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

  it('o arquivo fica — e sai quando a API nao manda as extensoes dele', () => {
    expect(onlyUploadable(comArquivo).Kinds.map((kind) => kind.Kind)).toEqual(['Image', 'File'])

    const semExtensoes = {
      ...comArquivo,
      Kinds: comArquivo.Kinds.map(({ Types: _, ...kind }) => kind),
    }
    expect(onlyUploadable(semExtensoes).Kinds.map((kind) => kind.Kind)).toEqual(['Image'])
  })

  it('o resto da configuracao continua como veio', () => {
    const filtrada = onlyUploadable(comVideo)

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
    expect(rejectReason(arquivo('', 1024, 'erro.log'), [], comArquivo)).toBeNull()
  })

  it('recusa formato que o projeto nao aceita, dizendo quais servem', () => {
    expect(rejectReason(arquivo('application/pdf', 1024), [], media)).toBe(
      'Só dá para anexar imagem: PNG, JPEG ou WebP.',
    )
    expect(rejectReason(arquivo('application/zip', 1024, 'tudo.zip'), [], comArquivo)).toBe(
      'Só dá para anexar imagem (PNG, JPEG ou WebP) ou arquivo (PDF, TXT, LOG ou CSV).',
    )
  })

  it('so arquivo aceito: a recusa fala so de arquivo', () => {
    const soArquivo = { ...comArquivo, Kinds: comArquivo.Kinds.filter((k) => k.Kind === 'File') }
    expect(rejectReason(arquivo('image/png', 1024, 'tela.png'), [], soArquivo)).toBe(
      'Só dá para anexar arquivo: PDF, TXT, LOG ou CSV.',
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

  // "Passa de 5 MB" dito de um arquivo vazio mandaria procurar um arquivo menor.
  it('recusa arquivo vazio dizendo que está vazio', () => {
    expect(rejectReason(arquivo('image/png', 0), [], media)).toBe('O arquivo está vazio.')
  })

  it('recusa acima do teto do tipo — cada categoria com o seu', () => {
    expect(rejectReason(arquivo('image/png', 6 * MB), [], media)).toMatch(/5 MB/)
    expect(rejectReason(arquivo('', 6 * MB, 'grande.log'), [], comArquivo)).toBeNull()
    expect(rejectReason(arquivo('', 11 * MB, 'enorme.log'), [], comArquivo)).toMatch(/10 MB/)
  })

  it('recusa quando o tipo ja chegou ao limite dele', () => {
    const duas = [{ kind: 'Image' as const }, { kind: 'Image' as const }]
    expect(rejectReason(arquivo('image/png', 1024), duas, media)).toBe(
      'Cabem até 2 imagens por envio.',
    )
  })

  // Sem total por envio: imagem cheia ainda deixa anexar arquivo, e o contrario.
  it('imagem cheia nao impede arquivo, e arquivo cheio nao impede imagem', () => {
    const duasImagens = [{ kind: 'Image' as const }, { kind: 'Image' as const }]
    expect(rejectReason(arquivo('', 1024, 'erro.log'), duasImagens, comArquivo)).toBeNull()

    const doisArquivos = [{ kind: 'File' as const }, { kind: 'File' as const }]
    expect(rejectReason(arquivo('image/png', 1024), doisArquivos, comArquivo)).toBeNull()
    expect(rejectReason(arquivo('', 1024, 'mais.log'), doisArquivos, comArquivo)).toBe(
      'Cabem até 2 arquivos por envio.',
    )
  })

  // O limite vale para cada envio: a criacao do relato e cada resposta. "Por
  // relato" faria quem responde achar que a cota ja tinha acabado na criacao.
  it('fala em envio, e concorda o verbo e a palavra com o numero', () => {
    const umArquivo = {
      ...comArquivo,
      Kinds: comArquivo.Kinds.map((kind) => ({ ...kind, MaxCount: 1 })),
    }
    expect(rejectReason(arquivo('', 1024, 'b.log'), [{ kind: 'File' }], umArquivo)).toBe(
      'Cabe até 1 arquivo por envio.',
    )

    const umaImagem = [{ kind: 'Image' as const }]
    expect(rejectReason(arquivo('image/png', 1024), umaImagem, umArquivo)).toBe(
      'Cabe até 1 imagem por envio.',
    )
  })
})

describe('ainda cabe algo', () => {
  const imagens = (n: number) => Array.from({ length: n }, () => ({ kind: 'Image' as const }))

  it('cabe enquanto a categoria tem vaga', () => {
    expect(hasRoom([], media)).toBe(true)
    expect(hasRoom(imagens(1), media, 'Image')).toBe(true)
  })

  it('a categoria cheia enche so ela', () => {
    expect(hasRoom(imagens(2), media)).toBe(false)
    expect(hasRoom(imagens(2), comArquivo, 'Image')).toBe(false)
    expect(hasRoom(imagens(2), comArquivo, 'File')).toBe(true)
    expect(hasRoom(imagens(2), comArquivo)).toBe(true)
  })

  it('tipo que o projeto nao aceita nunca tem vaga', () => {
    expect(hasRoom([], media, 'Video')).toBe(false)
    expect(hasRoom([], media, 'File')).toBe(false)
  })
})

describe('o tamanho para ler', () => {
  it('fala em KB abaixo de um mega, e em MB acima', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB')
    expect(formatBytes(5 * MB)).toBe('5 MB')
    expect(formatBytes(2.5 * MB)).toBe('2.5 MB')
  })
})

describe('o tipo de verdade', () => {
  /** O comeco de cada formato, completando os 12 bytes que a conferencia le. */
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
  const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]
  const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]

  it.each([
    ['PNG salvo como .jpg', PNG, 'erro.jpg', 'image/jpeg', 'image/png'],
    ['WebP salvo como .jpg', WEBP, 'foto.jpg', 'image/jpeg', 'image/webp'],
    ['JPEG salvo como .png', JPEG, 'tela.png', 'image/png', 'image/jpeg'],
  ])('%s sai com o tipo dos bytes, e o nome de antes', async (_, bytes, nome, dito, real) => {
    const certo = await withRealType(new File([new Uint8Array(bytes)], nome, { type: dito }))

    expect(certo.type).toBe(real)
    expect(certo.name).toBe(nome)
    expect(certo.size).toBe(12)
  })

  it('o tipo que já bate volta o mesmo arquivo', async () => {
    const png = new File([new Uint8Array(PNG)], 'erro.png', { type: 'image/png' })
    expect(await withRealType(png)).toBe(png)
  })

  it('bytes de formato nenhum deixam o arquivo como veio: quem recusa é a API', async () => {
    const estranho = arquivo('image/png', 100)
    expect(await withRealType(estranho)).toBe(estranho)
  })
})
