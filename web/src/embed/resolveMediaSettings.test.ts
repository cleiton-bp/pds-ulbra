// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import { resolveMediaSettings } from '@/embed/resolveMediaSettings'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **Aqui a falha vira "nao mostra", e e o contrario da configuracao da
 * ferramenta.** La, nao conseguir ler cai nos padroes, porque eles ainda desenham
 * um formulario que funciona. Aqui os padroes desenhariam um botao com limites
 * chutados, e o envio falharia depois de a pessoa escolher o arquivo. O teste
 * trava a inversao, porque ela e o tipo de coisa que alguem "conserta" copiando a
 * regra do arquivo vizinho.
 */
const dublê = vi.hoisted(() => ({ ler: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return { ...real, publicMediaService: { loadMediaSettings: dublê.ler } }
})

const ligado: PublicMediaSettingsViewModel = {
  IsEnabled: true,
  AllowsScreenCapture: true,
  AllowsOnInfoRequest: true,
  MaxFilesPerReport: 4,
  Kinds: [
    {
      Kind: 'Image',
      MaxCount: 3,
      MaxBytes: 1024,
      MaxDurationSeconds: null,
      ContentTypes: ['image/png'],
    },
  ],
}

afterEach(() => vi.clearAllMocks())

describe('o que o quadro oferece de anexo', () => {
  it('ligado, devolve a configuracao', async () => {
    dublê.ler.mockResolvedValue(ligado)
    expect(await resolveMediaSettings('pk', null)).toEqual(ligado)
  })

  it('falha de rede vira nada a oferecer, e nao os padroes', async () => {
    dublê.ler.mockRejectedValue(new Error('rede'))
    expect(await resolveMediaSettings('pk', null)).toBeNull()
  })

  it('recusa da chave vira nada a oferecer', async () => {
    dublê.ler.mockResolvedValue(null)
    expect(await resolveMediaSettings('pk', null)).toBeNull()
  })

  it('desligado vira nada a oferecer', async () => {
    dublê.ler.mockResolvedValue({ ...ligado, IsEnabled: false })
    expect(await resolveMediaSettings('pk', null)).toBeNull()
  })

  it('ligado sem nenhum tipo tambem vira nada — nao ha o que escolher', async () => {
    dublê.ler.mockResolvedValue({ ...ligado, Kinds: [] })
    expect(await resolveMediaSettings('pk', null)).toBeNull()
  })
})
