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

  // O segundo clique de um duplo clique (fora da caixa, logo depois de abrir) e
  // conferido no navegador: no jsdom, o Radix nao fecha por clique fora de jeito nenhum.
})
