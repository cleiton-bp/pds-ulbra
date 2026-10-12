import {
  type Dispatch,
  type LiHTMLAttributes,
  type SetStateAction,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { describeError } from '@/data'
import { toast } from '@/shared/components/toastStore'

/** Tira o item de uma posicao e o devolve em outra, sem alterar a lista original. */
export function reorder<T>(lista: T[], de: number, para: number): T[] {
  const nova = [...lista]
  const [item] = nova.splice(de, 1)
  if (item === undefined) return lista
  nova.splice(para, 0, item)
  return nova
}

/** Duas listas com os mesmos itens na mesma ordem. Evita gravar o que nao mudou. */
export function sameOrder<T>(a: T[], b: T[], idOf: (item: T) => string): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const outro = b[index]
      return outro !== undefined && idOf(item) === idOf(outro)
    })
  )
}

/** O que a seta de mover recebe: o `id` e para o foco seguir o item depois de mover. */
export interface MoveButtonProps {
  id?: string
  direction: 'up' | 'down'
  label: string
  disabled: boolean
  onClick: () => void
}

/** Tudo o que um item da lista precisa para se mover: arrastar, alca e as duas setas. */
export interface ListOrderItem {
  /** O item que esta sendo arrastado agora: a borda e a transparencia dizem qual e. */
  dragging: boolean
  li: Pick<
    LiHTMLAttributes<HTMLLIElement>,
    'draggable' | 'onDragStart' | 'onDragEnter' | 'onDragOver' | 'onDrop' | 'onDragEnd'
  >
  handle: {
    disabled: boolean
    onMouseDown: () => void
    onTouchStart: () => void
    onMouseUp: () => void
    onTouchEnd: () => void
  }
  up: MoveButtonProps
  down: MoveButtonProps
}

/**
 * A ordem de uma lista da configuracao: as setas, o arrastar e a gravacao — o mesmo nos
 * tipos de relato, no andamento publico e nas listas que vierem.
 *
 * **Otimista, com desfazer**: a seta e o arrastar movem na hora, e a lista volta se o
 * servidor recusar — deixar no lugar novo mostraria uma ordem que o banco nao tem. As
 * duas formas so decidem qual e a ordem; gravar mora num lugar so.
 *
 * **O arrasto grava uma vez, ao soltar**, e o desistido (Esc, soltar fora da lista) volta
 * a ordem de antes sem gravar: sem isso, a lista que se reorganizou no caminho era salva.
 *
 * **O foco segue o item**: a seta que foi usada, a outra quando ele chegou na ponta, ou
 * o resumo dele. As setas se desabilitam enquanto a ordem grava, e o foco nelas caia no
 * corpo da pagina. A alca nao entra no teclado: as setas sao o caminho sem mouse.
 */
export function useListOrder<T>({
  items,
  setItems,
  idOf,
  save,
  busy = false,
  focusFallback,
}: {
  items: T[] | null
  setItems: Dispatch<SetStateAction<T[] | null>>
  idOf: (item: T) => string
  /** Grava a ordem (os ids, ja na ordem nova) e devolve a lista como o servidor a guardou. */
  save: (order: string[]) => Promise<T[]>
  /** Outra coisa grava agora (o Salvar de um item): a alca e as setas esperam. */
  busy?: boolean
  /** O id do que recebe o foco quando nenhuma seta do item pode: o resumo dele. */
  focusFallback?: (id: string) => string
}) {
  const base = useId()
  const moveId = (id: string, direcao: 'up' | 'down') => `${base}-mover-${direcao}-${id}`

  const [moving, setMoving] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  // A ordem de antes do arrasto: e o que volta se o servidor recusar ou a pessoa desistir.
  const ordemAntes = useRef<T[] | null>(null)

  // O foco vai para o primeiro destes que existir e estiver habilitado, depois do desenho.
  const [foco, setFoco] = useState<string[] | null>(null)
  useEffect(() => {
    if (!foco) return
    for (const id of foco) {
      const alvo = document.getElementById(id)
      if (alvo && !(alvo as HTMLButtonElement).disabled) {
        alvo.focus()
        break
      }
    }
    setFoco(null)
  }, [foco])

  async function gravar(nova: T[], anterior: T[]) {
    if (sameOrder(nova, anterior, idOf)) return

    setItems(nova)
    setMoving(true)

    try {
      setItems(await save(nova.map(idOf)))
    } catch (failure) {
      setItems(anterior)
      toast.error(describeError(failure))
    } finally {
      setMoving(false)
    }
  }

  async function move(index: number, delta: number) {
    if (!items || moving || busy) return

    const alvo = index + delta
    if (alvo < 0 || alvo >= items.length) return

    const item = items[index]
    await gravar(reorder(items, index, alvo), items)
    if (item === undefined) return

    const id = idOf(item)
    const direcao = delta < 0 ? 'up' : 'down'
    const outra = delta < 0 ? 'down' : 'up'
    setFoco([moveId(id, direcao), moveId(id, outra), ...(focusFallback ? [focusFallback(id)] : [])])
  }

  function comecarArrasto(id: string) {
    if (!items) return
    setDragging(id)
    ordemAntes.current = items
  }

  // Clique na alca sem arrastar: durante um arrasto o navegador dispara `dragend`, e nao
  // `mouseup`; sem isto o item ficaria preso no estado de arrasto.
  function cancelarArrasto() {
    setDragging(null)
    ordemAntes.current = null
  }

  function arrastarSobre(indexAlvo: number) {
    if (!items || dragging === null) return

    const atual = items.findIndex((item) => idOf(item) === dragging)
    if (atual === -1 || atual === indexAlvo) return

    setItems(reorder(items, atual, indexAlvo))
  }

  async function soltar() {
    const anterior = ordemAntes.current
    setDragging(null)
    ordemAntes.current = null

    if (!items || anterior === null) return

    await gravar(items, anterior)
  }

  function desistirDoArrasto() {
    const anterior = ordemAntes.current
    setDragging(null)
    ordemAntes.current = null
    if (anterior) setItems(anterior)
  }

  /** As pecas de mover do item em `index`; `name` vai no nome das setas para leitor de tela. */
  function itemProps(index: number, name: string): ListOrderItem {
    const item = items?.[index]
    const id = item === undefined ? '' : idOf(item)
    const total = items?.length ?? 0
    const parado = moving || busy

    return {
      dragging: dragging === id,
      li: {
        // So arrasta quando a pessoa pega pela alca: com o item inteiro arrastavel,
        // selecionar texto no editor viraria um arrasto.
        draggable: dragging === id,
        onDragStart: (event) => {
          event.dataTransfer.effectAllowed = 'move'
          // O Firefox ignora o arrasto sem dado nenhum no evento.
          event.dataTransfer.setData('text/plain', id)
        },
        onDragEnter: () => arrastarSobre(index),
        onDragOver: (event) => event.preventDefault(),
        onDrop: (event) => {
          event.preventDefault()
          void soltar()
        },
        onDragEnd: (event) => {
          // Soltar na lista ja gravou no `onDrop`; `none` e o arrasto desistido.
          if (event.dataTransfer?.dropEffect === 'none') desistirDoArrasto()
          else void soltar()
        },
      },
      handle: {
        disabled: parado,
        onMouseDown: () => comecarArrasto(id),
        onTouchStart: () => comecarArrasto(id),
        onMouseUp: cancelarArrasto,
        onTouchEnd: cancelarArrasto,
      },
      up: {
        id: moveId(id, 'up'),
        direction: 'up',
        label: `Mover ${name} para cima`,
        disabled: index === 0 || parado,
        onClick: () => void move(index, -1),
      },
      down: {
        id: moveId(id, 'down'),
        direction: 'down',
        label: `Mover ${name} para baixo`,
        disabled: index === total - 1 || parado,
        onClick: () => void move(index, 1),
      },
    }
  }

  return { moving, dragging, move, itemProps }
}
