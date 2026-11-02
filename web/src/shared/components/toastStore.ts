import { create } from 'zustand'

/**
 * ONDE UM ERRO APARECE — a convencao que as cinco telas ja seguem:
 *
 *   erro que pertence a um campo → fica no campo (`error` do `TextField`)
 *     Nome duplicado ou vazio: ha o que corrigir, e a correcao e ali.
 *   erro de acao sem campo → toast
 *     Arquivar, gerar chave: ou tenta de novo, ou nao.
 *   falha que inutiliza a tela → bloco no lugar do conteudo, com "Tentar de novo"
 *
 * Toast confirma o que **ja aconteceu** e some sozinho — o que some nao pode ser
 * a unica forma de contar algo importante. Dai o aviso da chave secreta ser um
 * painel fixo.
 */
export type ToastTone = 'done' | 'danger'

/**
 * Um botao no aviso: "Desfazer", "Abrir". Clicar roda e fecha o aviso. O aviso com
 * botao fica mais tempo na tela — ninguem acha e clica um botao em quatro segundos.
 */
export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: string
  tone: ToastTone
  message: string
  action?: ToastAction
}

/** O que mais o aviso pode ter: o botao, e quanto tempo fica. */
export interface ToastOptions {
  action?: ToastAction
  durationMs?: number
}

interface ToastState {
  toasts: Toast[]
  push: (tone: ToastTone, message: string, options?: ToastOptions) => string
  dismiss: (id: string) => void
  /** O ponteiro ou o foco sobre o aviso param a contagem; sair dele retoma do ponto. */
  pause: (id: string) => void
  resume: (id: string) => void
  /**
   * Os dialogos abertos, do de baixo para o de cima. **Com um dialogo aberto, o aviso
   * nasce dentro dele**: fora, o resto da pagina fica escondido do leitor de tela (o
   * erro de um campo do card nao era anunciado), e o clique no aviso contava como
   * clique fora — fechava o card e levava junto o que se escrevia.
   */
  hosts: HTMLElement[]
  addHost: (host: HTMLElement) => void
  removeHost: (host: HTMLElement) => void
}

/** Quanto o aviso fica: o simples, e o que tem botao. */
/**
 * **Tempo para ler e para agir.** O aviso comum fica 5 segundos, e o com botao
 * ("Desfazer", "Ver o relato") fica 12, os dois parando enquanto o ponteiro ou o foco
 * estao nele. **O erro nao some sozinho**: ele diz o que deu errado, e sumir em 4
 * segundos deixava quem leu devagar sem saber o que fazer. Fecha no X.
 */
const DURACAO_MS = 5000
const DURACAO_COM_BOTAO_MS = 12_000

/** A contagem de cada aviso: quanto falta e quando ela recomecou. */
const relogios = new Map<
  string,
  { timer: ReturnType<typeof setTimeout> | null; restante: number; desde: number }
>()

export const useToastStore = create<ToastState>((set) => {
  const dismiss = (id: string) => {
    const relogio = relogios.get(id)
    if (relogio?.timer) clearTimeout(relogio.timer)
    relogios.delete(id)
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
  }

  const contar = (id: string, ms: number) => {
    relogios.set(id, { timer: setTimeout(() => dismiss(id), ms), restante: ms, desde: Date.now() })
  }

  return {
    toasts: [],
    push: (tone, message, options) => {
      const id = crypto.randomUUID()
      set((state) => ({
        toasts: [...state.toasts, { id, tone, message, action: options?.action }],
      }))
      const duracao =
        options?.durationMs ??
        (tone === 'danger' ? null : options?.action ? DURACAO_COM_BOTAO_MS : DURACAO_MS)
      if (duracao !== null) contar(id, duracao)
      return id
    },
    dismiss,
    pause: (id) => {
      const relogio = relogios.get(id)
      if (!relogio?.timer) return
      clearTimeout(relogio.timer)
      relogios.set(id, {
        timer: null,
        restante: Math.max(1500, relogio.restante - (Date.now() - relogio.desde)),
        desde: Date.now(),
      })
    },
    resume: (id) => {
      const relogio = relogios.get(id)
      if (!relogio || relogio.timer) return
      contar(id, relogio.restante)
    },
    hosts: [],
    addHost: (host) =>
      set((state) => ({ hosts: [...state.hosts.filter((item) => item !== host), host] })),
    removeHost: (host) => set((state) => ({ hosts: state.hosts.filter((item) => item !== host) })),
  }
})

export const toast = {
  done: (message: string, options?: ToastOptions) =>
    useToastStore.getState().push('done', message, options),
  error: (message: string, options?: ToastOptions) =>
    useToastStore.getState().push('danger', message, options),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
}
