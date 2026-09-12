import { describe, expect, it, vi } from 'vitest'
import { resolveWidgetSettings } from '@/embed/resolveSettings'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * AS TRES RESPOSTAS SAO DIFERENTES, E CONFUNDI-LAS QUEBRA COISAS OPOSTAS.
 *
 * - falhar e cair nos padroes: se virasse "nao apareco", uma oscilacao da nossa
 *   API apagaria a ferramenta de todos os clientes — justamente quando alguem
 *   precisa avisar que algo quebrou;
 * - chave invalida e nao desenhar nada: se virasse "padroes", a pessoa escreveria
 *   o relato inteiro para o envio ser recusado pela mesma chave;
 * - sem chave nenhuma e desenhar com os padroes, que e o que torna `embed.html`
 *   demonstravel na mao.
 */
const dublê = vi.hoisted(() => ({ ler: vi.fn() }))

vi.mock('@/data/publicIndex', () => ({
  widgetSettingsService: { loadWidgetSettings: dublê.ler },
}))

describe('a configuracao que vale para esta abertura', () => {
  it('a do cliente, quando a leitura da certo', async () => {
    const doCliente = { ...DEFAULT_WIDGET_SETTINGS, LauncherLabel: 'Fale com a gente' }
    dublê.ler.mockResolvedValue(doCliente)

    expect(await resolveWidgetSettings('pk_DEMO')).toEqual(doCliente)
  })

  it('os padroes quando a leitura falha — a ferramenta abre assim mesmo', async () => {
    dublê.ler.mockRejectedValue(new Error('rede'))

    expect(await resolveWidgetSettings('pk_DEMO')).toEqual(DEFAULT_WIDGET_SETTINGS)
  })

  it('nada quando a chave nao vale: nao ha projeto, e nao ha o que abrir', async () => {
    dublê.ler.mockResolvedValue(null)

    expect(await resolveWidgetSettings('pk_REVOGADA')).toBeNull()
  })

  it('sem chave, nem pergunta — desenha com os padroes', async () => {
    dublê.ler.mockReset()

    expect(await resolveWidgetSettings('   ')).toEqual(DEFAULT_WIDGET_SETTINGS)
    expect(dublê.ler).not.toHaveBeenCalled()
  })
})
