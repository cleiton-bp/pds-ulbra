// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from '@/shared/components/Modal'
import { useToastStore } from '@/shared/components/toastStore'

/**
 * O QUE ESTES TESTES TRAVAM: o dialogo de todas as telas.
 *
 * - **O foco volta para quem abriu**, ou para a reserva quando quem abriu saiu da
 *   pagina — e fica onde a pessoa ja foi.
 * - **Com botoes no alto (o card aberto), o foco entra no X**, como nos outros.
 * - **O clique fora fecha, menos quando nao deve**: o segundo clique de um duplo
 *   clique logo ao abrir, o dialogo com texto escrito (`closeOnOutsideClick`), e o
 *   clique num aviso.
 * - **O Esc pode ser segurado** por quem monta o dialogo — o card sai primeiro da
 *   edicao em que o foco esta.
 * - **Aberto, o dialogo e o lugar dos avisos**; fechado, deixa de ser.
 */

/**
 * O clique como o navegador o entrega. O Radix desta versao so fecha no `click` que
 * segue o `pointerdown` fora da caixa, um instante depois — e so ouve o `pointerdown`
 * depois que o dialogo terminou de abrir.
 */
async function clicar(alvo: Element) {
  await act(() => new Promise((pronto) => setTimeout(pronto, 10)))
  fireEvent.pointerDown(alvo, { button: 0, pointerType: 'mouse' })
  fireEvent.mouseDown(alvo, { button: 0 })
  fireEvent.pointerUp(alvo, { button: 0, pointerType: 'mouse' })
  fireEvent.mouseUp(alvo, { button: 0 })
  fireEvent.click(alvo, { button: 0 })
  await act(() => new Promise((pronto) => setTimeout(pronto, 10)))
}

/** O relogio passa da janela do duplo clique: o clique de agora e outro gesto. */
function depoisDoDuploClique() {
  const real = performance.now.bind(performance)
  vi.spyOn(performance, 'now').mockImplementation(() => real() + 1000)
}

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

  it('o clique fora fecha; o segundo clique de um duplo clique, logo ao abrir, nao', async () => {
    const aoMudar = vi.fn()
    render(
      <Modal open onOpenChange={aoMudar} title="Um dialogo" closeButton>
        <p>dentro</p>
      </Modal>,
    )
    await screen.findByRole('dialog')

    // O duplo clique que abriu: o segundo clique cai fora da caixa, e nao a fecha.
    await clicar(document.body)
    expect(aoMudar).not.toHaveBeenCalled()

    depoisDoDuploClique()
    await clicar(document.body)
    expect(aoMudar).toHaveBeenCalledWith(false)
  })

  it('com texto escrito, o clique fora nao fecha; o Esc e o X continuam fechando', async () => {
    const aoMudar = vi.fn()
    render(
      <Modal open onOpenChange={aoMudar} title="Um dialogo" closeButton closeOnOutsideClick={false}>
        <textarea aria-label="Motivo" defaultValue="pela metade" />
      </Modal>,
    )
    await screen.findByRole('dialog')
    depoisDoDuploClique()

    await clicar(document.body)
    expect(aoMudar).not.toHaveBeenCalled()

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Motivo' }), { key: 'Escape' })
    expect(aoMudar).toHaveBeenCalledWith(false)
    aoMudar.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(aoMudar).toHaveBeenCalledWith(false)
  })

  it('o clique num aviso que mora fora da caixa nao conta como clique fora', async () => {
    const aoMudar = vi.fn()
    render(
      <>
        {/* A regiao dos avisos fora do dialogo — a de um dialogo de confirmar por cima. */}
        <div data-toasts>
          <button type="button">Fechar aviso</button>
        </div>
        <Modal open onOpenChange={aoMudar} title="Um dialogo" closeButton>
          <p>dentro</p>
        </Modal>
      </>,
    )
    await screen.findByRole('dialog')
    depoisDoDuploClique()

    await clicar(screen.getByRole('button', { name: 'Fechar aviso', hidden: true }))
    expect(aoMudar).not.toHaveBeenCalled()
  })

  it('com botoes no alto, o foco entra no X, e nao no primeiro deles', async () => {
    render(
      <Modal
        open
        onOpenChange={vi.fn()}
        title="Um card"
        closeButton
        headerActions={<button type="button">Copiar link</button>}
      >
        <input aria-label="Um campo" />
      </Modal>,
    )
    await screen.findByRole('dialog')
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' })),
    )
    // Os botoes ficam no alto, antes do X na ordem do Tab.
    const copiar = screen.getByRole('button', { name: 'Copiar link' })
    expect(
      copiar.compareDocumentPosition(screen.getByRole('button', { name: 'Fechar' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('quem monta o dialogo pode segurar o Esc; o seguinte fecha', async () => {
    const aoMudar = vi.fn()
    let segurar = true
    render(
      <Modal
        open
        onOpenChange={aoMudar}
        title="Um dialogo"
        closeButton
        onEscapeKeyDown={(evento) => {
          if (segurar) evento.preventDefault()
          segurar = false
        }}
      >
        <p>dentro</p>
      </Modal>,
    )
    const dialogo = await screen.findByRole('dialog')

    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(aoMudar).not.toHaveBeenCalled()
    fireEvent.keyDown(dialogo, { key: 'Escape' })
    expect(aoMudar).toHaveBeenCalledWith(false)
  })

  it('aberto, o dialogo e o lugar dos avisos; fechado, deixa de ser', async () => {
    render(<Tela />)
    expect(useToastStore.getState().hosts).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialogo = await screen.findByRole('dialog')
    expect(useToastStore.getState().hosts).toEqual([dialogo])

    fireEvent.keyDown(dialogo, { key: 'Escape' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useToastStore.getState().hosts).toEqual([])
  })
})
