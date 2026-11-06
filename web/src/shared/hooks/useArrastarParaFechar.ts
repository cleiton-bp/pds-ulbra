import { useEffect, useRef } from 'react'

/**
 * **Puxar para baixo fecha a folha**, no celular (o card, os filtros, o relato da Moderacao):
 * o gesto que o telefone ja ensina. `ligado` diz quando a folha existe e e de dedo.
 * Vale so tocando no alto (a alca e o cabecalho), para nao brigar com a rolagem do conteudo.
 * O card acompanha o dedo; soltando depois de 110px, ou num puxao rapido, ele fecha (com
 * texto por salvar, pergunta antes, e volta ao lugar se a pessoa ficar); antes disso, volta
 * devagar. Um toque sem arrastar continua sendo clique nos botoes do alto.
 */
export function useArrastarParaFechar(aoFechar: () => void, ligado: boolean) {
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar

  useEffect(() => {
    if (!ligado) return
    let painel: HTMLElement | null = null
    let inicio: { y: number; t: number; id: number } | null = null
    let deslocamento = 0
    let arrastando = false

    const voltar = (alvo: HTMLElement, de: number) => {
      alvo.style.transform = ''
      alvo.animate([{ transform: `translateY(${de}px)` }, { transform: 'translateY(0)' }], {
        duration: 220,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      })
    }
    const aoTocar = (evento: PointerEvent) => {
      if (evento.pointerType === 'mouse' || !painel) return
      if (evento.clientY - painel.getBoundingClientRect().top > 72) return
      inicio = { y: evento.clientY, t: evento.timeStamp, id: evento.pointerId }
      deslocamento = 0
      arrastando = false
    }
    const aoMover = (evento: PointerEvent) => {
      if (!inicio || evento.pointerId !== inicio.id || !painel) return
      deslocamento = Math.max(0, evento.clientY - inicio.y)
      if (!arrastando && deslocamento > 8) {
        arrastando = true
        painel.setPointerCapture(evento.pointerId)
      }
      if (arrastando) painel.style.transform = `translateY(${deslocamento}px)`
    }
    const aoSoltar = (evento: PointerEvent) => {
      if (!inicio || evento.pointerId !== inicio.id || !painel) return
      const rapido = deslocamento / Math.max(1, evento.timeStamp - inicio.t) > 0.5
      inicio = null
      if (!arrastando) return
      arrastando = false
      const alvo = painel
      // O toque que arrastou nao vale como clique no botao em que comecou.
      const engolir = (clique: Event) => {
        clique.stopPropagation()
        clique.preventDefault()
      }
      alvo.addEventListener('click', engolir, { capture: true, once: true })
      window.setTimeout(() => alvo.removeEventListener('click', engolir, { capture: true }), 0)
      if (deslocamento > 110 || (rapido && deslocamento > 40)) {
        const de = deslocamento
        fechar.current()
        // Com texto por salvar a pergunta aparece e o card continua aberto: volta ao lugar.
        window.setTimeout(() => {
          if (alvo.getAttribute('data-state') === 'open') voltar(alvo, de)
        }, 60)
        return
      }
      voltar(alvo, deslocamento)
    }

    // O dialogo nasce num portal, depois deste efeito: espera ele existir.
    const procurar = window.setInterval(() => {
      // O ultimo aberto: o portal novo entra no fim da pagina.
      painel = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1) ?? null
      if (!painel) return
      window.clearInterval(procurar)
      painel.addEventListener('pointerdown', aoTocar)
      painel.addEventListener('pointermove', aoMover)
      painel.addEventListener('pointerup', aoSoltar)
      painel.addEventListener('pointercancel', aoSoltar)
    }, 50)
    return () => {
      window.clearInterval(procurar)
      painel?.removeEventListener('pointerdown', aoTocar)
      painel?.removeEventListener('pointermove', aoMover)
      painel?.removeEventListener('pointerup', aoSoltar)
      painel?.removeEventListener('pointercancel', aoSoltar)
    }
  }, [ligado])
}
