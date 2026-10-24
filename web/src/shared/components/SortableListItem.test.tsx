// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SortableListItem } from '@/shared/components/SortableListItem'
import { useListOrder } from '@/shared/hooks/useListOrder'

/**
 * O QUE ESTES TESTES TRAVAM: o item de lista da configuracao.
 *
 * - **O `open` e da tela**: o clique no cabecalho so pede a troca — quem abre e a tela.
 * - O resumo, o "não salvo" e as etiquetas, embaixo da linha com o item fechado.
 * - **As setas fora do cabecalho**, com o nome do item, e o foco seguindo o item.
 */

interface Item {
  id: string
  nome: string
}

const LISTA: Item[] = [
  { id: 'a', nome: 'Defeito' },
  { id: 'b', nome: 'Melhoria' },
]

function Lista({ save }: { save: (order: string[]) => Promise<Item[]> }) {
  const [items, setItems] = useState<Item[] | null>(LISTA)
  const ordem = useListOrder({ items, setItems, idOf: (item) => item.id, save })
  return (
    <ul>
      {items?.map((item, index) => (
        <SortableListItem
          key={item.id}
          accordion="teste"
          summaryId={`resumo-${item.id}`}
          open={false}
          onRequestToggle={() => {}}
          name={item.nome}
          summary="Sem perguntas"
          order={ordem.itemProps(index, item.nome)}
        >
          {null}
        </SortableListItem>
      ))}
    </ul>
  )
}

describe('o item de lista da configuracao', () => {
  afterEach(cleanup)

  it('o clique no cabecalho so pede a troca: quem abre e a tela', () => {
    const pedir = vi.fn()
    render(
      <ul>
        <SortableListItem
          accordion="teste"
          summaryId="resumo"
          open={false}
          onRequestToggle={pedir}
          name="Defeito"
          summary="2 perguntas · entra em Entrada"
          unsaved
          tags={<span>Sem coluna</span>}
        >
          <p>O editor</p>
        </SortableListItem>
      </ul>,
    )

    const cabecalho = screen.getByText('Defeito').closest('summary') as HTMLElement
    fireEvent.click(cabecalho)
    expect(pedir).toHaveBeenCalledOnce()
    expect((cabecalho.parentElement as HTMLDetailsElement).open).toBe(false)

    expect(screen.getByText(/2 perguntas · entra em Entrada/)).toBeTruthy()
    expect(screen.getByText('· não salvo')).toBeTruthy()
    // Fechado, as etiquetas ficam fora do `<details>`, embaixo da linha.
    expect(screen.getByText('Sem coluna').closest('details')).toBeNull()
  })

  it('aberto, as etiquetas sobem para o topo do conteudo', () => {
    render(
      <ul>
        <SortableListItem
          accordion="teste"
          summaryId="resumo"
          open
          onRequestToggle={() => {}}
          name="Em análise"
          summary="Pode voltar"
          tags={<span>Sem coluna</span>}
        >
          <p>O formulário</p>
        </SortableListItem>
      </ul>,
    )

    expect(screen.getByText('Sem coluna').closest('details')).not.toBeNull()
  })

  it('as setas levam o nome do item, e o foco segue o item depois de mover', async () => {
    const save = vi.fn((order: string[]) =>
      Promise.resolve(order.map((id) => LISTA.find((item) => item.id === id) as Item)),
    )
    render(<Lista save={save} />)

    expect(
      (screen.getByRole('button', { name: 'Mover Defeito para cima' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mover Melhoria para cima' }))
    })

    expect(save).toHaveBeenCalledWith(['b', 'a'])
    // Melhoria chegou no topo: a seta de subir desabilitou, e o foco foi para a de descer.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Mover Melhoria para baixo' }),
      ),
    )
  })
})
