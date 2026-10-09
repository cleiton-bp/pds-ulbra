import {
  createContext,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'

/**
 * O que se escreve no card aberto e ainda nao foi salvo — e o Esc em camadas.
 *
 * **Esc, X e clique fora levavam o card e o texto junto**, sem pergunta: a linha que
 * se acrescentava a descricao, o comentario pela metade, o titulo em edicao. Cada
 * caixa guarda o proprio rascunho (a releitura ao vivo nao passa por ele), e por isso
 * cada uma se registra aqui: quem fecha o card pergunta antes, se alguma tiver texto.
 *
 * **O Esc tem duas camadas.** Com o foco numa edicao que sabe sair de si (o titulo, a
 * descricao, o "Vincular", a etiqueta digitada), o Esc sai so dela e o card fica; o
 * Esc seguinte fecha o card. E o "cancelar" que todo mundo usa para sair de um campo
 * — e nao para perder o card.
 */
interface Rascunho {
  /** Ha texto escrito que se perderia. */
  sujo: boolean
  /** Sair so desta edicao, no Esc com o foco nela. Ausente: o Esc segue para o card. */
  cancelar?: () => void
}

interface CardDraftsApi {
  registrar: (id: string, leitura: () => Rascunho & { area: HTMLElement | null }) => () => void
  temRascunho: () => boolean
  /** Pergunta sempre: "Descartar o que voce escreveu?" — e so segue no "Descartar". */
  perguntar: (seguir: () => void) => void
  /** Antes de sair do card (fechar, ir a outro): com rascunho, pergunta; sem, segue. */
  confirmarSaida: (seguir: () => void) => void
}

const Contexto = createContext<CardDraftsApi | null>(null)

export const CardDraftsProvider = Contexto.Provider

/**
 * Os rascunhos do card aberto, do lado de quem monta o dialogo: o `api` vai para o
 * provedor, `escNaEdicao` para o Esc, `confirmarSaida` para fechar e trocar de card, e
 * `dialogo` e a pergunta, desenhada junto do card.
 */
export function useCardDrafts() {
  const registros = useRef(new Map<string, () => Rascunho & { area: HTMLElement | null }>())
  const [pergunta, setPergunta] = useState<{ seguir: () => void; foco: Element | null } | null>(
    null,
  )

  const temRascunho = useCallback(
    () => [...registros.current.values()].some((leitura) => leitura().sujo),
    [],
  )

  const perguntar = useCallback(
    (seguir: () => void) => setPergunta({ seguir, foco: document.activeElement }),
    [],
  )

  const confirmarSaida = useCallback((seguir: () => void) => {
    const sujos = [...registros.current.values()]
      .map((leitura) => leitura())
      .filter((rascunho) => rascunho.sujo)
    if (sujos.length === 0) {
      seguir()
      return
    }
    // "Continuar escrevendo" volta para a caixa com o texto, e nao para o que pediu a
    // saida: o X, o "Proximo card" e o link levam o foco para si no clique, e o foco
    // devolvido a eles deixava quem queria continuar fora da caixa.
    const ativo = document.activeElement
    const naCaixa = ativo !== null && sujos.some((rascunho) => rascunho.area?.contains(ativo))
    const caixa = sujos[0]?.area?.querySelector<HTMLElement>('textarea, input') ?? null
    setPergunta({ seguir, foco: naCaixa ? ativo : (caixa ?? ativo) })
  }, [])

  /** O Esc com o foco numa edicao que sabe sair de si: sai so dela. Verdadeiro se saiu. */
  const escNaEdicao = useCallback(() => {
    const foco = document.activeElement
    if (!foco) return false
    for (const leitura of registros.current.values()) {
      const rascunho = leitura()
      if (rascunho.cancelar && rascunho.area?.contains(foco)) {
        rascunho.cancelar()
        return true
      }
    }
    return false
  }, [])

  const api = useMemo<CardDraftsApi>(
    () => ({
      registrar: (id, leitura) => {
        registros.current.set(id, leitura)
        return () => {
          registros.current.delete(id)
        }
      },
      temRascunho,
      perguntar,
      confirmarSaida,
    }),
    [temRascunho, perguntar, confirmarSaida],
  )

  const dialogo: ReactNode = (
    <ConfirmDialog
      open={pergunta !== null}
      onOpenChange={(aberto) => {
        if (aberto) return
        // "Continuar escrevendo" devolve o foco a caixa em que a pessoa estava.
        const foco = pergunta?.foco
        setPergunta(null)
        if (foco instanceof HTMLElement && foco.isConnected)
          requestAnimationFrame(() => foco.focus())
      }}
      title="Descartar o que você escreveu?"
      description="O texto que você começou neste card ainda não foi salvo."
      confirmLabel="Descartar"
      cancelLabel="Continuar escrevendo"
      primary="cancel"
      onConfirm={() => {
        const seguir = pergunta?.seguir
        setPergunta(null)
        seguir?.()
      }}
    />
  )

  return { api, escNaEdicao, confirmarSaida, dialogo }
}

/**
 * Uma caixa do card que guarda texto: ela diz se ha o que perder e, quando sabe, como
 * sair so dela no Esc. `area` e onde ela mora — o Esc so a cancela com o foco ali.
 * Fora do card aberto (sem provedor), nao faz nada.
 */
export function useCardDraft(rascunho: Rascunho, area: RefObject<HTMLElement | null>) {
  const api = useContext(Contexto)
  const id = useId()
  const atual = useRef(rascunho)

  useEffect(() => {
    atual.current = rascunho
  })

  useEffect(() => {
    if (!api) return
    return api.registrar(id, () => ({ ...atual.current, area: area.current }))
  }, [api, id, area])
}

/**
 * A pergunta "Descartar o que voce escreveu?" para uma caixa so — a edicao com texto
 * mudado que o Esc vai fechar. Fora do card aberto, segue direto.
 */
export function useDiscardQuestion(): (seguir: () => void) => void {
  const api = useContext(Contexto)
  return useCallback((seguir: () => void) => (api ? api.perguntar(seguir) : seguir()), [api])
}

/**
 * O clique num link para outro card (o pai, a subtarefa, o vinculado): com rascunho, a
 * pergunta vem antes de trocar de card. O clique com Ctrl, ⌘ ou Shift abre em outra
 * aba, e ai nada se perde.
 */
export function useGuardedCardLink(): (evento: MouseEvent, destino: string) => void {
  const api = useContext(Contexto)
  const navigate = useNavigate()
  return useCallback(
    (evento: MouseEvent, destino: string) => {
      if (!api?.temRascunho()) return
      if (evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey) return
      evento.preventDefault()
      api.confirmarSaida(() => navigate(destino))
    },
    [api, navigate],
  )
}
