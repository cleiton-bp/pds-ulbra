// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * O QUE ESTE TESTE TRAVA.
 *
 * **Cancelar a leitura nao e falhar.** O painel roda em modo estrito no desenvolvimento,
 * que monta cada tela, desmonta e monta de novo. Desmontar destroi a leitura do PDF em
 * curso, e o pdf.js responde rejeitando a promessa dela: tratada como falha, todo PDF do
 * card aparecia como "nao abre aqui", medido no navegador.
 */
const pdf = vi.hoisted(() => ({ getDocument: vi.fn() }))

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: pdf.getDocument }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/worker.mjs' }))

/** Uma leitura que so termina quando alguem a destroi, como a do pdf.js. */
function leituraQueRejeitaAoDestruir() {
  let rejeitar: (erro: Error) => void = () => {}
  const promise = new Promise((_, falhar) => {
    rejeitar = falhar
  })
  return {
    promise,
    destroy: vi.fn(async () => rejeitar(new Error('Worker was destroyed'))),
  }
}

afterEach(() => {
  cleanup()
  pdf.getDocument.mockReset()
})

describe('o PDF no visualizador', () => {
  it('desmontar no meio da leitura nao vira "nao abre aqui"', async () => {
    pdf.getDocument.mockImplementation(leituraQueRejeitaAoDestruir)
    const { default: PdfPages } = await import('@/shared/components/PdfPages')
    const onFalha = vi.fn()

    const { unmount } = render(
      <StrictMode>
        <PdfPages bytes={new Uint8Array([37, 80, 68, 70])} onFalha={onFalha} />
      </StrictMode>,
    )
    unmount()
    await new Promise((pronto) => setTimeout(pronto, 0))

    // O modo estrito leu duas vezes, e as duas leituras foram destruidas sem falha.
    expect(pdf.getDocument).toHaveBeenCalledTimes(2)
    expect(onFalha).not.toHaveBeenCalled()
  })

  it('o PDF que nao abre de verdade avisa', async () => {
    pdf.getDocument.mockImplementation(() => ({
      promise: Promise.reject(new Error('Invalid PDF structure')),
      destroy: vi.fn(async () => {}),
    }))
    const { default: PdfPages } = await import('@/shared/components/PdfPages')
    const onFalha = vi.fn()

    render(<PdfPages bytes={new Uint8Array([1, 2, 3])} onFalha={onFalha} />)
    await new Promise((pronto) => setTimeout(pronto, 0))

    expect(onFalha).toHaveBeenCalledOnce()
  })
})
