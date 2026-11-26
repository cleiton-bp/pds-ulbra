import { create } from 'zustand'
import type { GuideStep } from '@/shared/tour/guideStore'

/**
 * A Moderação no menu: **so com a lista publica ligada** (Privacidade, nivel publico).
 * Em projeto privado nada do que ela decide vai a publico, e o item so confundia quem
 * abria o menu. A tela continua no endereco dela; o que some e o item da lateral.
 *
 * A casca le a configuracao ao abrir o projeto e guarda a ultima resposta neste
 * navegador, para o item nao piscar ao recarregar. A tela Privacidade avisa aqui quando
 * salva, e o item entra na hora, sem esperar uma nova leitura.
 *
 * Quem acabou de abrir os relatos ao publico ve o item chegar: a casca sobe o menu ate o
 * topo (ele podia estar rolado para baixo, na configuracao), o item abre a vaga dele, e
 * so entao, um instante depois, vem o guia da novidade: por que o item apareceu, para que
 * ele serve e onde fica o guia da tela.
 */

/** Quanto o guia da novidade espera depois de o item entrar: a pessoa ve o item antes. */
export const NOVELTY_DELAY_MS = 1500

const GUARDADO = 'pds.web.moderacao-no-menu.v1'

function lerGuardados(): Record<string, boolean> {
  try {
    const bruto = window.localStorage.getItem(GUARDADO)
    const lido: unknown = bruto ? JSON.parse(bruto) : {}
    return lido && typeof lido === 'object' ? (lido as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function guardar(publicos: Record<string, boolean>) {
  try {
    window.localStorage.setItem(GUARDADO, JSON.stringify(publicos))
  } catch {
    // O navegador pode negar o armazenamento: o item segue certo ate recarregar.
  }
}

interface ModerationInMenuState {
  /** Os projetos com a lista publica ligada, pelo que se sabe neste navegador. */
  publicos: Record<string, boolean>
  /**
   * O projeto que acabou de abrir ao publico e ainda espera a casca subir o menu: ate la,
   * o item fica de fora, para entrar a vista.
   */
  chegada: string | null
  /** O projeto cuja Moderação acabou de entrar no menu: o item abre a vaga dele. */
  entrouAgora: string | null
  /** O projeto que mostra o guia da novidade agora. */
  novidade: string | null
  definir: (projeto: string, publico: boolean) => void
  /**
   * A Privacidade salvou o projeto como publico, e antes era privado: a casca sobe o menu
   * e, quando ele chega ao topo, chama `itemEntrou`.
   */
  abriuAoPublico: (projeto: string) => void
  /** O menu esta no topo: o item entra agora, e o guia abre `NOVELTY_DELAY_MS` depois. */
  itemEntrou: (projeto: string) => void
  dispensar: () => void
}

let espera: ReturnType<typeof setTimeout> | null = null

export const useModerationInMenu = create<ModerationInMenuState>((set, get) => ({
  publicos: lerGuardados(),
  chegada: null,
  entrouAgora: null,
  novidade: null,
  definir: (projeto, publico) => {
    if (get().publicos[projeto] === publico) return
    const publicos = { ...get().publicos, [projeto]: publico }
    guardar(publicos)
    set({ publicos })
  },
  abriuAoPublico: (projeto) => {
    get().definir(projeto, true)
    set({ chegada: projeto })
  },
  itemEntrou: (projeto) => {
    set({ chegada: null, entrouAgora: projeto })
    if (espera) clearTimeout(espera)
    espera = setTimeout(() => {
      espera = null
      // Fechou de novo nesse meio tempo: o item saiu, e nao ha o que apresentar.
      if (get().publicos[projeto]) set({ novidade: projeto })
    }, NOVELTY_DELAY_MS)
  },
  dispensar: () => set({ novidade: null }),
}))

/**
 * O guia da novidade: o mesmo cartao do guia de tela, com outro assunto. Ele explica o
 * item que entrou no menu (por que, para que, como), e o ultimo passo leva ao guia da
 * propria tela, que conta cada parte dela.
 *
 * Sem o item a vista (o menu do celular fica recolhido), os passos ficam no meio da tela.
 */
export function noveltySteps({
  itemVisible,
  guideVisible,
}: {
  itemVisible: boolean
  guideVisible: boolean
}): GuideStep[] {
  const alvo = itemVisible ? 'menu-moderacao' : undefined
  return [
    {
      alvo,
      titulo: 'A Moderação',
      texto: 'Ela apareceu no menu porque você abriu os relatos ao público em Privacidade',
    },
    {
      alvo,
      titulo: 'Para que serve',
      texto: 'Você lê cada relato novo antes de ele aparecer na lista pública',
    },
    {
      alvo,
      titulo: 'Como usar',
      texto: 'Libere o que todos podem ler, e o resto fica sem publicar',
    },
    {
      alvo: guideVisible ? 'guia' : undefined,
      titulo: 'Guia da tela',
      texto: guideVisible
        ? 'Dentro da Moderação, o guia dela mostra cada parte da tela neste botão'
        : 'Dentro da Moderação, o guia dela mostra cada parte da tela',
    },
  ]
}
