import { Link, useLocation } from 'react-router-dom'

/**
 * O caminho de volta de quem chegou por um atalho, no alto da tela: o card aberto leva a
 * Colunas para ligar a coluna a uma etapa, e daqui volta para ele. Sem isso, no celular a
 * pessoa saia do card sem jeito de voltar.
 *
 * Quem leva manda o destino no estado da navegacao (`voltarPara` e `rotuloDaVolta`); quem
 * chegou pelo menu nao ve nada.
 */
export interface EstadoDaVolta {
  voltarPara: string
  rotuloDaVolta: string
}

export function VoltarDeOndeVeio() {
  const estado = useLocation().state as Partial<EstadoDaVolta> | null
  if (!estado?.voltarPara || !estado.rotuloDaVolta) return null

  return (
    // Preso no alto ao rolar: o atalho do card leva direto a uma parte da tela (a lista de
    // colunas), e a volta ficaria la em cima, fora da vista. Os `-top` descontam o respiro
    // de cima da area que rola (28 no celular, 40 no computador).
    <div
      data-volta
      className="-mx-5 -top-7 sticky z-sticky mb-2 bg-surface px-5 py-1 lg:-mx-10 lg:-top-10 lg:px-10"
    >
      <Link
        to={estado.voltarPara}
        className="alvo-de-toque relative inline-flex items-center gap-1 py-1 text-detail text-fg-muted transition-colors hover:text-fg"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 3.5 5.5 8l4.5 4.5" />
        </svg>
        {estado.rotuloDaVolta}
      </Link>
    </div>
  )
}
