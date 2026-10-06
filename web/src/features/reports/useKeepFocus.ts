import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react'
import { focusAnyway } from '@/shared/lib/focus'

/** O link de um card, no quadro ou na lista. */
const CARD = 'a[href*="/reports/"]'

/**
 * O foco nao cai no comeco da pagina quando o card que o tinha sai da tela por causa
 * de outra pessoa — movido, arquivado, fora do recorte.
 *
 * - **O card que so mudou de lugar leva o foco junto**: e o mesmo card, numa coluna
 *   nova. E tambem o que acontece no arraste pelo teclado, quando o card troca de
 *   coluna no meio do caminho.
 * - **O que saiu da tela** deixa o foco no vizinho que ficou na mesma posicao do grupo
 *   (a coluna, a tabela) — ou no proprio grupo, quando ele ficou vazio. **Se ele volta
 *   logo** — a coluna de onde saiu foi relida antes da coluna para onde foi —, o foco vai
 *   atras dele, desde que ainda esteja onde foi deixado.
 *
 * So age quando o foco se perdeu de fato (foi para o `body`): quem clicou em outro
 * lugar, ou esta num dialogo, nao e puxado de volta. O grupo e o elemento com
 * `data-focus-group`; sem grupo, vai para a area de Trabalho (`data-work-area`). Nenhum
 * dos dois e focavel o tempo todo — ver `focusAnyway`.
 */
/** Quanto tempo o foco deixado no vizinho espera o card reaparecer noutro lugar. */
const ESPERA_O_CARD_MS = 3_000

export function useKeepFocus(area: RefObject<HTMLElement | null>) {
  /** O card que saiu e onde o foco ficou no lugar dele, ate quando. */
  const sumido = useRef<{ href: string; reserva: HTMLElement; ate: number } | null>(null)
  const ultimo = useRef<{
    el: HTMLElement
    href: string
    grupo: HTMLElement | null
    indice: number
  } | null>(null)

  useEffect(() => {
    const raiz = area.current
    if (!raiz) return
    const aoFocar = (evento: FocusEvent) => {
      const alvo = (evento.target as Element | null)?.closest<HTMLElement>(CARD)
      if (!alvo) {
        ultimo.current = null
        return
      }
      const grupo = alvo.closest<HTMLElement>('[data-focus-group]')
      const irmaos = [...(grupo ?? raiz).querySelectorAll<HTMLElement>(CARD)]
      ultimo.current = {
        el: alvo,
        href: alvo.getAttribute('href') ?? '',
        grupo,
        indice: irmaos.indexOf(alvo),
      }
    }
    raiz.addEventListener('focusin', aoFocar)
    return () => raiz.removeEventListener('focusin', aoFocar)
  }, [area])

  // A cada renderizacao, antes de pintar: o card sai da tela numa delas.
  useLayoutEffect(() => {
    const raiz = area.current
    if (!raiz) return
    const achar = (href: string) =>
      [...raiz.querySelectorAll<HTMLElement>(CARD)].find(
        (link) => link.getAttribute('href') === href,
      )

    // O card que tinha sumido apareceu noutro lugar, e o foco continua onde foi deixado.
    const espera = sumido.current
    if (espera) {
      const voltou = performance.now() < espera.ate ? achar(espera.href) : undefined
      if (voltou && document.activeElement === espera.reserva) {
        sumido.current = null
        voltou.focus()
        return
      }
      if (!voltou && performance.now() >= espera.ate) sumido.current = null
    }

    const visto = ultimo.current
    if (!visto || visto.el.isConnected) return
    const ativo = document.activeElement
    if (ativo && ativo !== document.body) return

    const mesmo = achar(visto.href)
    const grupo = visto.grupo?.isConnected ? visto.grupo : null
    const irmaos = [...(grupo ?? raiz).querySelectorAll<HTMLElement>(CARD)]
    const alvo =
      mesmo ??
      irmaos[Math.min(visto.indice, irmaos.length - 1)] ??
      grupo ??
      raiz.closest<HTMLElement>('[data-work-area]') ??
      raiz
    focusAnyway(alvo)
    if (!mesmo)
      sumido.current = {
        href: visto.href,
        reserva: alvo,
        ate: performance.now() + ESPERA_O_CARD_MS,
      }
  })
}
