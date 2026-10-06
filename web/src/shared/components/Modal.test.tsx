// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from '@/shared/components/Modal'

/** Um botao que abre o dialogo, como a tela faz: sem o gatilho do Radix. */
function Tela() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}>
        Abrir
      </button>
      <Modal open={aberto} onOpenChange={setAberto} title="Um dialogo" closeButton>
        <p>dentro</p>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('fechar devolve o foco a quem abriu, e nao ao comeco da pagina', async () => {
    render(<Tela />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    abrir.focus()
    fireEvent.click(abrir)
    await screen.findByRole('dialog')

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // O Radix devolve o foco um instante depois de fechar.
    await vi.waitFor(() => expect(document.activeElement).toBe(abrir))
  })

  it('quem abriu saiu da pagina enquanto o dialogo estava aberto: o foco vai para a reserva', async () => {
    function Trocada() {
      const [aberto, setAberto] = useState(false)
      const [versao, setVersao] = useState(0)
      return (
        <>
          {/* A chave nova troca o botao por outro: o que abriu sai da pagina. */}
          <button key={versao} type="button" onClick={() => setAberto(true)}>
            Abrir
          </button>
          <Modal
            open={aberto}
            onOpenChange={setAberto}
            title="Um dialogo"
            closeButton
            fallbackFocus={() => screen.getByRole('button', { name: 'Abrir' })}
          >
            <button type="button" onClick={() => setVersao((n) => n + 1)}>
              Trocar
            </button>
          </Modal>
        </>
      )
    }
    render(<Trocada />)
    const primeiro = screen.getByRole('button', { name: 'Abrir' })
    primeiro.focus()
    fireEvent.click(primeiro)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }))
    expect(primeiro.isConnected).toBe(false)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir' })),
    )
  })

  it('quem ja foi para outro lugar no instante em que o dialogo fecha fica la', async () => {
    function DuasPortas() {
      const [aberto, setAberto] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setAberto(true)}>
            Abrir
          </button>
          <button type="button">Proximo</button>
          <Modal open={aberto} onOpenChange={setAberto} title="Um dialogo" closeButton>
            <p>dentro</p>
          </Modal>
        </>
      )
    }
    render(<DuasPortas />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    abrir.focus()
    fireEvent.click(abrir)
    await screen.findByRole('dialog')

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // Antes de o Radix devolver o foco, a pessoa ja esta no proximo.
    const proximo = screen.getByRole('button', { name: 'Proximo' })
    proximo.focus()

    await new Promise((pronto) => setTimeout(pronto, 50))
    expect(document.activeElement).toBe(proximo)
  })

  // O segundo clique de um duplo clique (fora da caixa, logo depois de abrir) e
  // conferido no navegador: no jsdom, o Radix nao fecha por clique fora de jeito nenhum.
})
