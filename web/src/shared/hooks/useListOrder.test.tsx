// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import type { DragEvent } from 'react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from '@/shared/components/toastStore'
import { reorder, sameOrder, useListOrder } from '@/shared/hooks/useListOrder'

/**
 * O QUE ESTES TESTES TRAVAM: a ordem das listas da configuracao.
 *
 * - **Otimista**: a seta move na hora e grava a ordem nova, uma vez.
 * - **Com desfazer**: o servidor recusou, a lista volta e o aviso diz por que.
 * - **O arrasto grava ao soltar**, e o desistido volta sem gravar.
 * - As setas param nas pontas e enquanto outra coisa grava.
 */

interface Item {
  id: string
  nome: string
}

const LISTA: Item[] = [
  { id: 'a', nome: 'A' },
  { id: 'b', nome: 'B' },
  { id: 'c', nome: 'C' },
]

const ids = (lista: Item[] | null) => lista?.map((item) => item.id).join('')

function useLista(save: (order: string[]) => Promise<Item[]>, busy = false) {
  const [items, setItems] = useState<Item[] | null>(LISTA)
  const ordem = useListOrder({ items, setItems, idOf: (item) => item.id, save, busy })
  return { items, ordem }
}

/** A lista que o servidor devolve: a mesma, na ordem pedida. */
function servidor(order: string[]) {
  return Promise.resolve(order.map((id) => LISTA.find((item) => item.id === id) as Item))
}

const evento = (extra: object = {}) =>
  ({ preventDefault: () => {}, ...extra }) as DragEvent<HTMLLIElement>

describe('a ordem de uma lista', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('reorder e sameOrder nao mexem na lista original', () => {
    expect(reorder(LISTA, 0, 2).map((item) => item.id)).toEqual(['b', 'c', 'a'])
    expect(ids(LISTA)).toBe('abc')
    expect(sameOrder(LISTA, [...LISTA], (item) => item.id)).toBe(true)
    expect(sameOrder(LISTA, reorder(LISTA, 0, 1), (item) => item.id)).toBe(false)
  })

  it('a seta move na hora e grava a ordem nova', async () => {
    let terminar: (lista: Item[]) => void = () => {}
    const save = vi.fn((_order: string[]) => new Promise<Item[]>((resolve) => (terminar = resolve)))
    const { result } = renderHook(() => useLista(save))

    let movendo: Promise<void> = Promise.resolve()
    act(() => {
      movendo = result.current.ordem.move(0, 1)
    })
    expect(ids(result.current.items)).toBe('bac')
    expect(result.current.ordem.moving).toBe(true)
    expect(save).toHaveBeenCalledWith(['b', 'a', 'c'])

    await act(async () => {
      terminar(reorder(LISTA, 0, 1))
      await movendo
    })
    expect(result.current.ordem.moving).toBe(false)
    expect(ids(result.current.items)).toBe('bac')
  })

  it('o servidor recusou: a lista volta e o aviso diz por que', async () => {
    const erro = vi.spyOn(toast, 'error')
    const save = vi.fn(() => Promise.reject(new Error('falhou')))
    const { result } = renderHook(() => useLista(save))

    await act(() => result.current.ordem.move(2, -1))

    expect(ids(result.current.items)).toBe('abc')
    expect(erro).toHaveBeenCalledOnce()
  })

  it('o arrasto reorganiza no caminho e grava uma vez, ao soltar', async () => {
    const save = vi.fn(servidor)
    const { result } = renderHook(() => useLista(save))

    act(() => result.current.ordem.itemProps(0, 'A').handle.onMouseDown())
    expect(result.current.ordem.itemProps(0, 'A').dragging).toBe(true)
    act(() => result.current.ordem.itemProps(2, 'C').li.onDragEnter?.(evento()))
    expect(ids(result.current.items)).toBe('bca')
    expect(save).not.toHaveBeenCalled()

    await act(async () => result.current.ordem.itemProps(2, 'A').li.onDrop?.(evento()))
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(['b', 'c', 'a'])
    expect(result.current.ordem.dragging).toBeNull()
  })

  it('o arrasto desistido volta a ordem de antes, sem gravar', () => {
    const save = vi.fn(servidor)
    const { result } = renderHook(() => useLista(save))

    act(() => result.current.ordem.itemProps(0, 'A').handle.onMouseDown())
    act(() => result.current.ordem.itemProps(1, 'B').li.onDragEnter?.(evento()))
    expect(ids(result.current.items)).toBe('bac')

    act(() =>
      result.current.ordem
        .itemProps(1, 'A')
        .li.onDragEnd?.(evento({ dataTransfer: { dropEffect: 'none' } })),
    )
    expect(ids(result.current.items)).toBe('abc')
    expect(save).not.toHaveBeenCalled()
  })

  it('as setas param nas pontas e enquanto outra coisa grava', () => {
    const { result, rerender } = renderHook(({ busy }) => useLista(servidor, busy), {
      initialProps: { busy: false },
    })

    const primeiro = result.current.ordem.itemProps(0, 'A')
    expect(primeiro.up.disabled).toBe(true)
    expect(primeiro.down.disabled).toBe(false)
    expect(primeiro.up.label).toBe('Mover A para cima')
    expect(result.current.ordem.itemProps(2, 'C').down.disabled).toBe(true)

    rerender({ busy: true })
    const ocupado = result.current.ordem.itemProps(1, 'B')
    expect(ocupado.up.disabled).toBe(true)
    expect(ocupado.down.disabled).toBe(true)
    expect(ocupado.handle.disabled).toBe(true)
  })
})
