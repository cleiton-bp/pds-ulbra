import { type ReactNode, useCallback, useState } from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * O TOPO PRESO dos quadros: o formulario, os meus relatos e a lista publica.
 *
 * **Preso ao rolar**: no celular, com o teclado aberto, a folha e baixa e a caixa rola, e o
 * caminho de saida ("Fechar", "Voltar") sumia la em cima. As margens negativas mantem o topo
 * onde sempre esteve, e o fundo cobre o que passa por baixo. O `-top-5` e porque o preso conta
 * a partir do recuo da caixa que rola, e nao da borda.
 *
 * **O fio de baixo so aparece depois que o conteudo passa por tras**, como no cabecalho da
 * entrada: parado no topo, ele seria um risco solto sob o titulo; rolando sem ele, a linha
 * cortada ao meio logo abaixo do titulo parecia defeito. O fio ja ocupa o seu pixel
 * (`pb-[7px]`, e nao `pb-2`): aparecer nao empurra nada.
 *
 * Mora como primeiro filho da caixa que rola, e a caixa leva `STICKY_TOP_SCROLL_PADDING`.
 */
export function StickyTop({ className, children }: { className?: string; children: ReactNode }) {
  const [rolou, setRolou] = useState(false)

  // Pela rolagem da caixa, e nao por um observador no proprio topo: parado ou preso, ele
  // ocupa o mesmo lugar na caixa, e nao ha troca para observar. O estado so muda ao sair do
  // topo e ao voltar; nas outras rolagens o React nem desenha de novo.
  const observar = useCallback((topo: HTMLDivElement | null) => {
    const caixa = topo?.parentElement
    if (!topo || !caixa) return
    const conferir = () => setRolou(caixa.scrollTop > 0)
    conferir()
    caixa.addEventListener('scroll', conferir, { passive: true })
    return () => caixa.removeEventListener('scroll', conferir)
  }, [])

  return (
    <div
      ref={observar}
      className={cn(
        'sticky -top-5 z-sticky -mx-5 -mt-5 -mb-2 border-b bg-surface px-5 pt-5 pb-[7px] transition-colors',
        rolou ? 'border-border' : 'border-transparent',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * A folga de cima da caixa que rola embaixo do topo preso: o foco que chega pelo teclado, e o
 * campo que o teclado do celular faz subir, param abaixo do topo, e nao escondidos atras dele.
 * Os 80 cobrem o topo com o titulo em duas linhas.
 */
export const STICKY_TOP_SCROLL_PADDING = 'scroll-pt-20'
