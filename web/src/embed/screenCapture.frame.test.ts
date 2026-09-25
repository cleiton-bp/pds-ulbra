// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureFrame } from '@/embed/screenCapture'

/**
 * O QUE ESTE TESTE TRAVA.
 *
 * O print espera um quadro pintado antes de ler o video, porque o primeiro as
 * vezes sai preto. Mas quem escolhe outra janela no seletor deixa esta aba
 * encoberta, e aba encoberta nao pinta: sem prazo, a captura ficava parada ate a
 * pessoa voltar. Aqui o `requestAnimationFrame` nunca responde, e o print tem de
 * sair assim mesmo — e o compartilhamento de tela tem de ser desligado.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('o print da tela', () => {
  it('sai mesmo quando a aba nao pinta, e desliga o compartilhamento', async () => {
    const trilha = { stop: vi.fn() }
    const fluxo = { getTracks: () => [trilha] } as unknown as MediaStream
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn(async () => fluxo) } })
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 0),
    )
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    const canvas = await captureFrame()

    expect(canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(trilha.stop).toHaveBeenCalled()
  })
})
