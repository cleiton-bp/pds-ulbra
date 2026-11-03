import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * O guia de cada tela: um passeio que acende uma parte de cada vez e diz para que ela
 * serve. A tela escreve o roteiro e o registra aqui (`useScreenGuide`); o botao "Guia da
 * tela", na barra de cima, so aparece quando a tela da vez tem roteiro.
 *
 * Regras do roteiro, as mesmas do tour do editor de modelagem:
 * - titulo de ate tres palavras; texto de ate 14 palavras, numa frase so, sem travessao
 *   nem ponto no meio, falando com quem le ("voce");
 * - o texto diz para que a parte serve, e nao descreve o botao;
 * - so os passos que a tela da vez mostra: o "Passo 3 de 7" precisa sair certo.
 */
export interface GuideStep {
  /** A parte que acende (`guideTarget`). Sem alvo, o cartao fica no meio da tela. */
  alvo?: string
  titulo: string
  texto: string
}

interface TelaDoGuia {
  id: string
  passos: GuideStep[]
  /** Guia de um dialogo (o card aberto): o botao dele mora no proprio dialogo. */
  noDialogo: boolean
}

interface GuideState {
  /**
   * As telas com guia, a de cima por ultimo. **Uma pilha, e nao uma tela so**: o card
   * abre por cima do Trabalho e registra o guia dele; ao fechar, o do Trabalho volta.
   */
  pilha: TelaDoGuia[]
  tela: TelaDoGuia | null
  aberto: boolean
  registrar: (id: string, passos: GuideStep[], noDialogo?: boolean) => void
  esquecer: (id: string) => void
  abrir: () => void
  fechar: () => void
}

const topo = (pilha: TelaDoGuia[]) => pilha[pilha.length - 1] ?? null

export const useGuideStore = create<GuideState>((set) => ({
  pilha: [],
  tela: null,
  aberto: false,
  registrar: (id, passos, noDialogo = false) =>
    set((atual) => {
      const onde = atual.pilha.findIndex((tela) => tela.id === id)
      const nova = { id, passos, noDialogo }
      const pilha =
        onde >= 0
          ? atual.pilha.map((tela, i) => (i === onde ? nova : tela))
          : [...atual.pilha, nova]
      return { pilha, tela: topo(pilha) }
    }),
  // Sai so a tela que pediu: a nova pode ter registrado a dela antes de a velha sair.
  esquecer: (id) =>
    set((atual) => {
      if (!atual.pilha.some((tela) => tela.id === id)) return atual
      const pilha = atual.pilha.filter((tela) => tela.id !== id)
      return { pilha, tela: topo(pilha), aberto: atual.tela?.id === id ? false : atual.aberto }
    }),
  abrir: () => set((atual) => (atual.tela ? { aberto: true } : atual)),
  fechar: () => set({ aberto: false }),
}))

/**
 * A tela diz o roteiro dela. Passa `null` enquanto ainda nao sabe o que mostra (a lista
 * carregando): o guia de uma tela pela metade apontaria para o que nao esta la.
 */
export function useScreenGuide(
  id: string,
  passos: GuideStep[] | null,
  { noDialogo = false }: { noDialogo?: boolean } = {},
): void {
  const registrar = useGuideStore((estado) => estado.registrar)
  const esquecer = useGuideStore((estado) => estado.esquecer)
  // O roteiro nasce de novo a cada desenho; a chave so muda quando ele muda de verdade.
  const chave = passos
    ? passos.map((passo) => `${passo.alvo ?? ''}:${passo.titulo}:${passo.texto}`).join('|')
    : ''

  // biome-ignore lint/correctness/useExhaustiveDependencies: a chave resume os passos.
  useEffect(() => {
    if (!passos) return
    registrar(id, passos, noDialogo)
  }, [id, chave, noDialogo, registrar])

  useEffect(() => () => esquecer(id), [id, esquecer])
}

/** A marca que o guia procura na tela: `{...guideTarget('busca')}` no proprio elemento. */
export function guideTarget(nome: string): { 'data-guia': string } {
  return { 'data-guia': nome }
}

/**
 * Se o painel ja apresentou o guia neste navegador. **Uma vez so, e nao uma por tela**:
 * o balao em cada tela nova interrompia quem so queria trabalhar. Ele aparece na
 * primeira tela da primeira visita, diz que o guia existe em todas, e nao volta. Sem
 * o armazenamento (aba anonima, bloqueado), ele aparece de novo, e o guia continua no
 * botao.
 */
const APRESENTADO = 'pds.web.guia-apresentado.v1'

export function jaApresentouOGuia(): boolean {
  try {
    return localStorage.getItem(APRESENTADO) === '1'
  } catch {
    return false
  }
}

export function marcarGuiaApresentado(): void {
  try {
    localStorage.setItem(APRESENTADO, '1')
  } catch {
    // Sem armazenamento, o balao so volta na proxima visita: nada se perde.
  }
}
