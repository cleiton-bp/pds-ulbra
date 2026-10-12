import { create } from 'zustand'

/** A secao dos sons do perfil: o sino abre o perfil nela, e `/profile#sons` tambem. */
export const PROFILE_SOUNDS_SECTION = 'sons'

export interface OpenProfileOptions {
  /** O `id` da secao a mostrar ao abrir. Sem ele, o perfil abre no topo. */
  section?: string | null
  /**
   * Para onde o foco volta ao fechar. Quem abre e um item de menu, que some junto com o
   * menu: sem isto o foco caia no comeco da pagina, e nao no botao de onde se veio.
   */
  returnFocusTo?: HTMLElement | null
}

interface ProfileDialogState {
  open: boolean
  section: string | null
  returnFocusTo: HTMLElement | null
  openProfile: (options?: OpenProfileOptions) => void
  closeProfile: () => void
}

/**
 * O perfil e um dialogo sobre a tela em que a pessoa esta, e nao uma pagina: abrir nao
 * troca o endereco, e fechar deixa a pessoa onde estava. Mora em `shared/` porque quem
 * abre esta em todo lugar — o menu da conta, o sino, a rota antiga `/profile` — e uma
 * feature nao importa outra.
 */
export const useProfileDialogStore = create<ProfileDialogState>((set) => ({
  open: false,
  section: null,
  returnFocusTo: null,
  openProfile: (options) =>
    set({
      open: true,
      section: options?.section ?? null,
      returnFocusTo: options?.returnFocusTo ?? null,
    }),
  // Fechar mantem o `returnFocusTo`: o foco volta um instante depois de o dialogo sumir.
  closeProfile: () => set({ open: false }),
}))

export function openProfile(options?: OpenProfileOptions): void {
  useProfileDialogStore.getState().openProfile(options)
}
