import { describe, expect, it } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import { acceptAttribute, formatBytes, kindFor, rejectReason } from '@/embed/attachments'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **A recusa cedo e cortesia, e nao trava** — quem trava e o servidor e o
 * armazenamento. Mas ela precisa dizer a mesma coisa que eles diriam: um quadro
 * que aceitasse aqui o que o servidor recusa faria a pessoa esperar o envio para
 * ouvir "nao serve", e um que recusasse o que o servidor aceita tiraria dela um
 * anexo valido.
 *
 * **Os dois limites valem juntos.** So o do tipo deixaria tres imagens e um video
 * passarem num projeto que queria dois arquivos no total; so o total deixaria
 * quatro videos num projeto que queria um.
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
      MaxDurationSeconds: null,
      ContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
    },
    {
      Kind: 'Video',
      MaxCount: 1,
      MaxBytes: 20 * MB,
      MaxDurationSeconds: 60,
      ContentTypes: ['video/webm'],
    },
  ],
}

function arquivo(tipo: string, bytes: number) {
  return new File([new Uint8Array(bytes)], 'x', { type: tipo })
}

describe('a categoria de um arquivo', () => {
  it('vem do tipo, e nao da extensao', () => {
    expect(kindFor(arquivo('image/png', 10), media)?.Kind).toBe('Image')
    expect(kindFor(arquivo('video/webm', 10), media)?.Kind).toBe('Video')
    expect(kindFor(arquivo('application/pdf', 10), media)).toBeNull()
  })

  it('o seletor do navegador recebe todos os tipos aceitos', () => {
    expect(acceptAttribute(media)).toBe('image/png,image/jpeg,image/webp,video/webm')
  })
})

describe('a recusa cedo', () => {
  it('aceita o que cabe', () => {
    expect(rejectReason(arquivo('image/png', 1024), [], media)).toBeNull()
  })

  it('recusa formato que o projeto nao aceita', () => {
    expect(rejectReason(arquivo('video/mp4', 1024), [], media)).toMatch(/formato/)
  })

  it('recusa acima do teto do tipo', () => {
    expect(rejectReason(arquivo('image/png', 6 * MB), [], media)).toMatch(/5 MB/)
  })

  it('o teto do video e o dele, e nao o da imagem', () => {
    expect(rejectReason(arquivo('video/webm', 15 * MB), [], media)).toBeNull()
  })

  it('recusa quando o tipo ja chegou ao limite dele', () => {
    const duas = [{ kind: 'Image' as const }, { kind: 'Image' as const }]
    expect(rejectReason(arquivo('image/png', 1024), duas, media)).toMatch(/2 imagens/)
  })

  it('recusa quando o total ja chegou ao limite, mesmo com vaga no tipo', () => {
    const tres = [
      { kind: 'Image' as const },
      { kind: 'Image' as const },
      { kind: 'Video' as const },
    ]
    expect(rejectReason(arquivo('image/png', 1024), tres, media)).toMatch(/3 arquivos/)
  })
})

describe('o tamanho para ler', () => {
  it('fala em KB abaixo de um mega, e em MB acima', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB')
    expect(formatBytes(5 * MB)).toBe('5 MB')
    expect(formatBytes(2.5 * MB)).toBe('2.5 MB')
  })
})
