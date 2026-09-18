// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicReportViewModel, PublicStageViewModel } from '@/contracts'
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
 * **Projeto sem jornada continua nao prometendo andamento.** A jornada vazia e um
 * caso real — o cliente que nunca configurou —, e ali a frase volta a ser "nao ha
 * andamento" em vez de uma promessa de movimento que nao vai acontecer.
 *
 * **O que ja passou vem das datas, e nao da posicao.** Este e o erro facil de
 * cometer e impossivel de ver: pintar como percorrido tudo que esta antes do passo
 * atual parece certo e mente sempre que o relato pula uma etapa — o que acontece
 * quando o estado interno dele aponta direto para o meio da jornada.
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
  // Sem jornada: e o projeto que nao configurou nenhuma, e continua sendo o caso
  // em que a pagina nao pode prometer movimento.
  Journey: [],
}

function passo(
  label: string,
  reachedAt: string | null,
  isCurrent = false,
  nextStep: string | null = null,
): PublicStageViewModel {
  return {
    Label: label,
    Description: `O que acontece em ${label}.`,
    NextStep: nextStep,
    ReachedAt: reachedAt,
    IsCurrent: isCurrent,
  }
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

  it('sem jornada configurada, nao promete andamento', async () => {
    dublê.abrir.mockResolvedValue(relato)
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    const { container } = render(<TrackingPage />)
    await screen.findByText('7K2M-9QXP-4TRV')

    const texto = container.textContent ?? ''

    expect(texto).toMatch(/Ainda não há andamento/)
    // Nada de prometer movimento para um projeto que nao configurou jornada.
    expect(texto).not.toMatch(/se atualiza sozinha|será avisado|avisaremos/i)
  })

  it('desenha a jornada e marca onde o relato está', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [
        passo('Recebido', '2026-09-12T13:24:00.000Z'),
        passo('Em análise', '2026-09-13T09:00:00.000Z', true, 'A equipe decide o que fazer.'),
        passo('Concluído', null),
      ],
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    expect(await screen.findByText('Em análise')).toBeTruthy()
    expect(screen.getByLabelText('Passo atual')).toBeTruthy()
    expect(screen.getAllByLabelText('Já passou por aqui')).toHaveLength(1)
    expect(screen.getAllByLabelText('Ainda não chegou aqui')).toHaveLength(1)
  })

  it('com jornada, também não promete que a página anda sozinha', async () => {
    // O caso vazio ja era coberto. **Este é o que estava faltando**, e era nele que
    // a promessa morava: com jornada, a página dizia "esta página se atualiza
    // sozinha conforme a equipe trabalha", e não se atualiza — há um `fetch` só, na
    // montagem. Quem deixasse a aba aberta esperaria para sempre.
    //
    // Buscar de novo sozinho não é a saída: cada leitura grava um evento de
    // visualização, e a página passaria a registrar leituras que ninguém fez.
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [passo('Recebido', '2026-09-12T13:24:00.000Z', true), passo('Concluído', null)],
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    const { container } = render(<TrackingPage />)
    await screen.findByText('Recebido')

    expect(container.textContent ?? '').not.toMatch(/se atualiza sozinha|será avisado|avisaremos/i)
  })

  it('passo pulado não conta como percorrido, mesmo vindo antes do atual', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [
        passo('Recebido', '2026-09-12T13:24:00.000Z'),
        // Pulado: o estado interno apontava direto para o passo seguinte.
        passo('Em análise', null),
        passo('Em desenvolvimento', '2026-09-13T09:00:00.000Z', true),
        passo('Concluído', null),
      ],
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)
    await screen.findByText('Em desenvolvimento')

    // Um percorrido só — o "Recebido". Contar pela posição diria dois.
    expect(screen.getAllByLabelText('Já passou por aqui')).toHaveLength(1)
    expect(screen.getAllByLabelText('Ainda não chegou aqui')).toHaveLength(2)
  })

  it('o que vem depois aparece só no passo atual', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [
        passo('Recebido', '2026-09-12T13:24:00.000Z', false, 'Alguém vai analisar em breve.'),
        passo('Em análise', '2026-09-13T09:00:00.000Z', true, 'A equipe decide o que fazer.'),
      ],
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    expect(await screen.findByText('A equipe decide o que fazer.')).toBeTruthy()
    // No passo que já passou, o "depois" já aconteceu: repeti-lo é ruído.
    expect(screen.queryByText('Alguém vai analisar em breve.')).toBeNull()
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
