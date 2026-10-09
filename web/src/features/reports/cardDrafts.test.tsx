// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useRef, useState } from 'react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CardDraftsProvider,
  useCardDraft,
  useCardDrafts,
  useDiscardQuestion,
  useGuardedCardLink,
} from '@/features/reports/cardDrafts'

/**
 * O QUE ESTES TESTES TRAVAM: o que se escreve no card aberto nao se perde por engano.
 *
 * - **Sair do card com texto por salvar pergunta antes** ("Descartar o que voce
 *   escreveu?"); sem texto, sai direto. "Descartar" sai; "Continuar escrevendo" fica, e
 *   **o foco volta para a caixa com o texto** — mesmo quando ele estava no botao que
 *   pediu a saida (o X, o "Proximo card").
 * - **O Esc tem camadas**: com o foco numa edicao que sabe sair de si, sai so dela; com
 *   o foco fora, segue para o card.
 * - **O link para outro card pergunta antes**, com rascunho; o clique com Ctrl, ⌘ ou
 *   Shift abre em outra aba, e ai nada se perde nem se pergunta.
 * - **Fora do card aberto (sem provedor), nada se registra** e a pergunta segue direto.
 */

/** Uma caixa do card: o texto, e se ela sabe sair de si no Esc. */
function Caixa({ nome, saiNoEsc = false }: { nome: string; saiNoEsc?: boolean }) {
  const [texto, setTexto] = useState('')
  const [saiu, setSaiu] = useState(false)
  const area = useRef<HTMLDivElement>(null)
  useCardDraft(
    {
      sujo: texto.trim().length > 0,
      cancelar: saiNoEsc ? () => setSaiu(true) : undefined,
    },
    area,
  )
  return (
    <div ref={area}>
      <textarea aria-label={nome} value={texto} onChange={(e) => setTexto(e.target.value)} />
      {saiu && <p>{nome}: saiu da edição</p>}
    </div>
  )
}

/** Onde se esta, para ver se o link trocou de card. */
function Endereco() {
  return <output aria-label="Endereço">{useLocation().pathname}</output>
}

/** O link para outro card, como o do pai, da subtarefa e do vinculado. */
function LinkDoCard() {
  const guardar = useGuardedCardLink()
  return (
    <Link to="/cards/b" onClick={(evento) => guardar(evento, '/cards/b')}>
      #14 Testar no Safari
    </Link>
  )
}

/**
 * O card aberto, com as caixas, o Esc e o X — como o `ReportDialog` monta: o Esc que
 * nao sai de uma edicao e o de fechar o card.
 */
function Card({ aoFechar }: { aoFechar: () => void }) {
  const rascunhos = useCardDrafts()
  return (
    <CardDraftsProvider value={rascunhos.api}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: o Esc do card, como o do dialogo */}
      <div
        onKeyDown={(evento) => {
          if (evento.key !== 'Escape') return
          if (!rascunhos.escNaEdicao()) rascunhos.confirmarSaida(aoFechar)
        }}
      >
        <Caixa nome="Comentário" />
        <Caixa nome="Resposta" />
        <Caixa nome="Título" saiNoEsc />
        <LinkDoCard />
        <button type="button" onClick={() => rascunhos.confirmarSaida(aoFechar)}>
          Fechar
        </button>
      </div>
      {rascunhos.dialogo}
    </CardDraftsProvider>
  )
}

function montar() {
  const aoFechar = vi.fn()
  render(
    <MemoryRouter initialEntries={['/cards/a']}>
      <Routes>
        <Route
          path="/cards/:id"
          element={
            <>
              <Card aoFechar={aoFechar} />
              <Endereco />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  return { aoFechar }
}

const caixa = (nome: string) => screen.getByRole('textbox', { name: nome }) as HTMLTextAreaElement
const pergunta = () => screen.findByRole('alertdialog', { name: 'Descartar o que você escreveu?' })

afterEach(cleanup)

describe('sair do card com texto por salvar', () => {
  it('sem texto, sai direto; com texto, pergunta — "Descartar" sai', async () => {
    const { aoFechar } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()

    fireEvent.change(caixa('Comentário'), { target: { value: 'Acho que e o gateway' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    const dialogo = await pergunta()
    expect(
      within(dialogo).getByText('O texto que você começou neste card ainda não foi salvo.'),
    ).toBeTruthy()
    expect(aoFechar).toHaveBeenCalledTimes(1)

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(2))
  })

  it('so espaco nao e texto: sai sem perguntar', () => {
    const { aoFechar } = montar()
    fireEvent.change(caixa('Comentário'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('"Continuar escrevendo" fica, e o foco volta para a caixa com o texto — e nao para o X', async () => {
    const { aoFechar } = montar()
    fireEvent.change(caixa('Título'), { target: { value: 'Pagamento recusado' } })

    const fechar = screen.getByRole('button', { name: 'Fechar' })
    fechar.focus()
    fireEvent.click(fechar)
    const dialogo = await pergunta()
    // O destaque e o de continuar: o descarte e o que nao se desfaz.
    expect(
      within(dialogo).getByRole('button', { name: 'Continuar escrevendo' }).className,
    ).toContain('bg-accent')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar escrevendo' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(caixa('Título')))
    expect(caixa('Título').value).toBe('Pagamento recusado')
    expect(aoFechar).not.toHaveBeenCalled()
  })

  it('o Esc com o foco numa caixa com texto: o foco volta para ela, e nao para a primeira', async () => {
    const { aoFechar } = montar()
    const comentario = caixa('Comentário')
    const resposta = caixa('Resposta')
    fireEvent.change(comentario, { target: { value: 'pela metade' } })
    fireEvent.change(resposta, { target: { value: 'Ja corrigimos' } })

    resposta.focus()
    fireEvent.keyDown(resposta, { key: 'Escape' })
    fireEvent.click(within(await pergunta()).getByRole('button', { name: 'Continuar escrevendo' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(resposta))
    expect(aoFechar).not.toHaveBeenCalled()
  })
})

describe('o Esc em camadas', () => {
  it('com o foco na edicao que sabe sair de si, sai so dela; fora dela, e o do card', () => {
    const { aoFechar } = montar()
    const titulo = caixa('Título')
    titulo.focus()
    fireEvent.keyDown(titulo, { key: 'Escape' })
    expect(screen.getByText('Título: saiu da edição')).toBeTruthy()
    expect(aoFechar).not.toHaveBeenCalled()

    // A caixa do comentario nao tem edicao para sair: o Esc e o do card, que fecha.
    const comentario = caixa('Comentário')
    comentario.focus()
    fireEvent.keyDown(comentario, { key: 'Escape' })
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })
})

describe('o link para outro card', () => {
  it('sem rascunho, vai direto', () => {
    montar()
    fireEvent.click(screen.getByRole('link', { name: '#14 Testar no Safari' }))
    expect(screen.getByRole('status', { name: 'Endereço' }).textContent).toBe('/cards/b')
  })

  it('com rascunho, pergunta antes: "Continuar escrevendo" fica no card; "Descartar" vai', async () => {
    montar()
    fireEvent.change(caixa('Comentário'), { target: { value: 'pela metade' } })

    fireEvent.click(screen.getByRole('link', { name: '#14 Testar no Safari' }))
    fireEvent.click(within(await pergunta()).getByRole('button', { name: 'Continuar escrevendo' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByRole('status', { name: 'Endereço' }).textContent).toBe('/cards/a')

    fireEvent.click(screen.getByRole('link', { name: '#14 Testar no Safari' }))
    fireEvent.click(within(await pergunta()).getByRole('button', { name: 'Descartar' }))
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Endereço' }).textContent).toBe('/cards/b'),
    )
  })

  it('o clique com Ctrl, ⌘ ou Shift abre em outra aba: nada se pergunta', () => {
    montar()
    fireEvent.change(caixa('Comentário'), { target: { value: 'pela metade' } })
    const link = screen.getByRole('link', { name: '#14 Testar no Safari' })
    for (const tecla of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      fireEvent.click(link, { button: 0, ...tecla })
      expect(screen.queryByRole('alertdialog')).toBeNull()
    }
    expect(screen.getByRole('status', { name: 'Endereço' }).textContent).toBe('/cards/a')
  })
})

describe('fora do card aberto', () => {
  it('sem provedor, a caixa nao se registra e a pergunta segue direto', () => {
    const seguir = vi.fn()
    function Solta() {
      const perguntar = useDiscardQuestion()
      return (
        <>
          <Caixa nome="Solta" />
          <button type="button" onClick={() => perguntar(seguir)}>
            Sair
          </button>
        </>
      )
    }
    render(<Solta />)
    fireEvent.change(caixa('Solta'), { target: { value: 'texto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(seguir).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
