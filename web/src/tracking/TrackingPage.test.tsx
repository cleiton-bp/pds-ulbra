// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicReportViewModel } from '@/contracts'
import { TrackingPage } from '@/tracking/TrackingPage'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Recusado e falhou nao podem virar a mesma tela.** 404 e resposta definitiva —
 * este link nao abre nada, e oferecer "tentar de novo" manda a pessoa repetir o
 * que nunca vai mudar. Rede fora e o oposto: o relato dela esta registrado, e
 * tentar de novo e o que resolve. Tratar os dois igual passa em qualquer teste de
 * caminho feliz, e so aparece para quem estiver com problema.
 *
 * **Link pela metade nao vai a rede.** A resposta seria a mesma recusa, e a
 * asserticao aqui e sobre o servico **nao** ter sido chamado.
 *
 * **E a pagina nao promete andamento.** Nao existe estado interno (etapa 3) nem
 * publicacao dele (etapa 4), entao "quando o time atualizar, aparece aqui"
 * descreveria algo que nunca acontece nesta versao. E a mesma regra que segurou a
 * frase de bloqueio na tela de dominios por tres etapas.
 */

const dublê = vi.hoisted(() => ({ abrir: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()

  return { ...real, reportService: { openReportTracking: dublê.abrir } }
})

const relato: PublicReportViewModel = {
  TrackingCode: '7K2M-9QXP-4TRV',
  Type: 'Bug',
  Text: 'O botão de finalizar compra não responde.\nTentei duas vezes.',
  CreatedAt: '2026-09-12T13:24:00.000Z',
}

function abrirEm(endereco: string): void {
  window.history.replaceState({}, '', endereco)
}

afterEach(cleanup)

beforeEach(() => {
  dublê.abrir.mockReset()
})

describe('a pagina publica de acompanhamento', () => {
  it('mostra o protocolo, o tipo e o texto de quem relatou', async () => {
    dublê.abrir.mockResolvedValue(relato)
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    expect(await screen.findByText('7K2M-9QXP-4TRV')).toBeTruthy()
    expect(screen.getByText('Defeito')).toBeTruthy()
    expect(screen.getByText(/O botão de finalizar compra não responde/)).toBeTruthy()
    expect(dublê.abrir).toHaveBeenCalledWith({
      TrackingCode: '7K2M-9QXP-4TRV',
      Token: 'tok-secreto',
    })
  })

  it('nao promete andamento que nao existe', async () => {
    dublê.abrir.mockResolvedValue(relato)
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    const { container } = render(<TrackingPage />)
    await screen.findByText('7K2M-9QXP-4TRV')

    const texto = container.textContent ?? ''

    expect(texto).toMatch(/Ainda não há andamento/)
    // O que a etapa 4 vai poder dizer, e esta versao nao.
    expect(texto).not.toMatch(/aparece aqui|será avisado|avisaremos|em análise/i)
  })

  it('com o link pela metade, recusa sem ir a rede', async () => {
    // Sem o fragmento: o endereco copiado sem o fim, que e o caso comum.
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV')

    render(<TrackingPage />)

    expect(await screen.findByText(/Este link não abre nenhum relato/)).toBeTruthy()
    expect(dublê.abrir).not.toHaveBeenCalled()
  })

  it('404 nao oferece tentar de novo: repetir nao muda a resposta', async () => {
    const { PanelError } = await import('@/data/publicIndex')
    dublê.abrir.mockRejectedValue(new PanelError('Este link nao abre nenhum relato.', 404))
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-errado')

    render(<TrackingPage />)

    expect(await screen.findByText(/Este link não abre nenhum relato/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('falha de rede oferece tentar de novo, e diz que o relato segue registrado', async () => {
    const { PanelError } = await import('@/data/publicIndex')
    dublê.abrir.mockRejectedValue(new PanelError('Falha de rede ao abrir o relato.', 0))
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(screen.getByText(/continua registrado/)).toBeTruthy()
  })

  it('tentar de novo chama a rota outra vez', async () => {
    const { PanelError } = await import('@/data/publicIndex')
    dublê.abrir.mockRejectedValueOnce(new PanelError('Falha de rede.', 0))
    dublê.abrir.mockResolvedValueOnce(relato)
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)
    const botao = await screen.findByRole('button', { name: 'Tentar de novo' })
    botao.click()

    await waitFor(() => expect(screen.getByText('7K2M-9QXP-4TRV')).toBeTruthy())
    expect(dublê.abrir).toHaveBeenCalledTimes(2)
  })
})
