import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { semMovimento } from '@/shared/lib/rolagemSuave'

/**
 * Uma area que muda de altura **com transicao** quando o conteudo dela troca de vez (a
 * lista filtrada, o vazio no lugar da tabela), em vez de saltar centenas de pixels num
 * quadro.
 *
 * So anima quando `chave` muda: as mudancas pequenas do dia a dia (uma linha que chega ao
 * vivo, a pagina seguinte) seguem como sempre. Durante a transicao o conteudo e cortado
 * (`overflow: clip`, que nao vira area de rolagem e deixa o cabecalho preso da tabela
 * continuar preso).
 */
export function AlturaSuave({ chave, children }: { chave: string; children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null)
  const anterior = useRef<{ chave: string; altura: number } | null>(null)

  // Depois de cada desenho: compara com a altura do desenho anterior.
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const altura = el.offsetHeight
    const antes = anterior.current
    anterior.current = { chave, altura }
    if (!antes || antes.chave === chave || semMovimento()) return
    const diferenca = Math.abs(altura - antes.altura)
    if (diferenca < 24) return

    el.style.overflow = 'clip'
    const animacao = el.animate?.([{ height: `${antes.altura}px` }, { height: `${altura}px` }], {
      // Mais longe, um pouco mais de tempo, com teto: a lista enorme nao demora a assentar.
      duration: 220 + Math.min(diferenca, 2000) / 10,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    })
    const soltar = () => {
      el.style.overflow = ''
    }
    if (!animacao) soltar()
    else {
      animacao.onfinish = soltar
      animacao.oncancel = soltar
    }
  })

  return (
    <div ref={caixa} data-altura-suave>
      {children}
    </div>
  )
}

/**
 * A troca de recorte que vale na tela: a pedida (o filtro novo) so passa a valer quando os
 * dados dela chegam. Ate la, a lista antiga fica parada, e nao renasce com os dados de antes.
 */
export function useTrocaQuandoChegar(pedida: string, dados: unknown, esperando: boolean): string {
  // Dados novos, e nada mais a esperar: a troca pedida agora vale. Um aviso ao vivo que
  // mexe na lista antiga no meio da espera nao conta. A atualizacao no proprio desenho e o
  // jeito do React para estado derivado, e roda certo tambem no desenho dobrado do modo estrito.
  const [estado, setEstado] = useState({ naTela: pedida, dados })
  if (estado.dados !== dados && !esperando) setEstado({ naTela: pedida, dados })
  return estado.naTela
}
