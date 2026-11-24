// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type JourneyStage, PublicJourney } from '@/shared/components/PublicJourney'
import {
  PersonalCodeCard,
  SentConfirmation,
  SentDetails,
} from '@/shared/components/SentConfirmation'

/**
 * O QUE ESTES TESTES TRAVAM: as duas pecas que a pagina publica, o widget e as previas
 * do painel dividem — sem elas iguais, a previa mostraria uma coisa e quem relatou
 * veria outra.
 *
 * - **A linha do tempo marca pelo que aconteceu**: anel no passo atual, cheio no que
 *   tem data, vazio no resto — e o "depois" so no atual.
 * - **So a previa e clicavel**: sem `onSelect`, nenhum botao.
 * - **A confirmacao troca as variaveis e mostra o protocolo.**
 */
afterEach(cleanup)

function passo(id: string, reachedAt: string | null, nextStep: string | null = null): JourneyStage {
  return {
    id,
    Label: id,
    Description: `Frase de ${id}.`,
    NextStep: nextStep,
    ReachedAt: reachedAt,
  }
}

describe('PublicJourney', () => {
  it('marca o atual, o que já passou e o que falta, e o "depois" só no atual', () => {
    render(
      <PublicJourney
        stages={[
          passo('Recebido', '2026-09-12T13:24:00.000Z', 'Depois de receber.'),
          passo('Em análise', '2026-09-13T09:00:00.000Z', 'A equipe decide.'),
          passo('Concluído', null, 'Fim.'),
        ]}
        currentId="Em análise"
      />,
    )

    expect(screen.getByLabelText('Passo atual')).toBeTruthy()
    expect(screen.getAllByLabelText('Já passou por aqui')).toHaveLength(1)
    expect(screen.getAllByLabelText('Ainda não chegou aqui')).toHaveLength(1)
    expect(screen.getByText('agora')).toBeTruthy()
    expect(screen.getByText('A equipe decide.')).toBeTruthy()
    expect(screen.queryByText('Depois de receber.')).toBeNull()
    expect(screen.queryByText('Fim.')).toBeNull()
    // Na pagina publica nada e clicavel.
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('sem passo atual, diz que o relato ainda não entrou; vazia, que não há andamento', () => {
    const { rerender } = render(
      <PublicJourney stages={[passo('Recebido', null)]} currentId={null} />,
    )
    expect(screen.getByText(/ainda não entrou nesta jornada/)).toBeTruthy()

    rerender(<PublicJourney stages={[]} currentId={null} />)
    expect(screen.getByText(/Ainda não há andamento para mostrar/)).toBeTruthy()
  })

  it('na prévia, clicar num passo pede para pôr o relato nele', () => {
    const escolher = vi.fn()
    render(
      <PublicJourney
        stages={[passo('Recebido', '2026-09-12T13:24:00.000Z'), passo('Pronto', null)]}
        currentId="Recebido"
        onSelect={escolher}
      />,
    )

    const atual = screen.getByRole('button', { name: 'Ver o relato em Recebido' })
    expect(atual.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Ver o relato em Pronto' }))
    expect(escolher).toHaveBeenCalledWith('Pronto')
  })
})

describe('SentConfirmation', () => {
  it('diz que deu certo e troca as variáveis do texto do projeto', () => {
    render(
      <SentConfirmation
        message="Obrigado, {{primeiroNome}}! Seu {{tipo}} é o {{protocolo}}."
        values={{ primeiroNome: 'Ana', tipo: 'defeito', protocolo: '7K2M-9QXP' }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Relato enviado' })).toBeTruthy()
    expect(screen.getByText('Obrigado, Ana! Seu defeito é o 7K2M-9QXP.')).toBeTruthy()
  })
})

describe('SentDetails', () => {
  it('mostra o protocolo e o link deste relato como detalhe quando há outra volta', () => {
    render(
      <SentDetails trackingCode="7K2M-9QXP" trackingLink="https://x/t#a" onlyWayBack={false} />,
    )

    expect(screen.getByText('Detalhes deste relato')).toBeTruthy()
    expect(screen.getByText('Protocolo')).toBeTruthy()
    expect(screen.getByText('7K2M-9QXP')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Acompanhar este relato' }).getAttribute('href')).toBe(
      'https://x/t#a',
    )
  })

  it('sem código nem conta, diz que o link é o caminho de volta e pede para copiar agora', () => {
    render(<SentDetails trackingCode="7K2M-9QXP" trackingLink="https://x/t#a" onlyWayBack />)

    expect(screen.getByText('Para voltar a este relato')).toBeTruthy()
    expect(screen.getByText('Copie o link agora:')).toBeTruthy()
  })
})

describe('PersonalCodeCard', () => {
  it('explica para que serve o código e tranquiliza que neste navegador já ficou salvo', () => {
    render(<PersonalCodeCard code="H7QK-3M2X-P9WD" savedHere onDownload={() => {}} />)

    expect(screen.getByText('Seu código pessoal')).toBeTruthy()
    expect(screen.getByText('H7QK-3M2X-P9WD')).toBeTruthy()
    expect(screen.getByText(/em outro celular, computador ou navegador/)).toBeTruthy()
    expect(screen.getByText(/Neste navegador ele já ficou salvo/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Baixar em arquivo' })).toBeTruthy()
  })

  it('sem onde baixar, só copia; sem armazenamento, pede para guardar agora', () => {
    render(<PersonalCodeCard code="H7QK-3M2X-P9WD" savedHere={false} />)

    expect(screen.queryByRole('button', { name: 'Baixar em arquivo' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Copiar código' })).toBeTruthy()
    expect(screen.getByText(/não conseguiu guardar o código/)).toBeTruthy()
  })
})
