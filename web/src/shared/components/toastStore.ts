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

export interface Toast {
  id: string
  tone: ToastTone
  message: string
}

interface ToastState {
  toasts: Toast[]
  push: (tone: ToastTone, message: string) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => {
  const dismiss = (id: string) =>
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))

  return {
    toasts: [],
    push: (tone, message) => {
      const id = crypto.randomUUID()
      set((state) => ({ toasts: [...state.toasts, { id, tone, message }] }))
      setTimeout(() => dismiss(id), 4000)
    },
    dismiss,
  }
})

export const toast = {
  done: (message: string) => useToastStore.getState().push('done', message),
  error: (message: string) => useToastStore.getState().push('danger', message),
}
