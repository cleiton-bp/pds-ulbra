import { type ReactNode, useId } from 'react'
import { Button } from '@/shared/components/Button'

/**
 * A navegacao entre as telas do quadro: o formulario, os meus relatos e a lista publica.
 *
 * **O caminho de volta mora sempre no canto de cima a esquerda, com a seta.** E onde a
 * pessoa procura por ele em qualquer aplicativo; no canto direito ele se confundia com o
 * "Fechar" do formulario.
 *
 * **A entrada para outra tela diz o que tem la.** Um texto sublinhado colado no titulo
 * passava despercebido e nao contava para que servia; a linha com icone, nome e uma frase
 * de apoio se le de relance e tem o tamanho de um alvo de verdade.
 */

const TRACO = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function SetaVoltar() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" {...TRACO}>
      <path d="M12.5 8h-9M7.5 4 3.5 8l4 4" />
    </svg>
  )
}

function SetaAbrir({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      className={className}
      {...TRACO}
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  )
}

/** Os relatos de quem esta usando: uma lista com marcas, como uma caixa de acompanhamento. */
export function MyReportsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" {...TRACO}>
      <rect x="3.5" y="3" width="13" height="14" rx="2.5" />
      <path d="M7 7.5h6M7 10.5h6M7 13.5h3.5" />
    </svg>
  )
}

/** O que outras pessoas ja relataram: dois baloes de conversa. */
export function PublicReportsIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" {...TRACO}>
      <path d="M3.5 6.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2V10a2 2 0 0 1-2 2H8l-2.5 2v-2h0a2 2 0 0 1-2-2z" />
      <path d="M13.5 8h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2v1.5L12.5 15H11a2 2 0 0 1-1.6-.8" />
    </svg>
  )
}

/**
 * O "Voltar" das telas de dentro: a seta e o nome do lugar para onde ele leva. A margem
 * negativa poe a seta na mesma linha do texto da tela, e nao recuada pelo enchimento.
 */
export function BackButton({
  onClick,
  children,
  autoFocus,
}: {
  onClick: () => void
  children: ReactNode
  autoFocus?: boolean
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      autoFocus={autoFocus}
      // No toque o botao cresce para fora (44), sem engordar o topo preso.
      className="-ml-2.5 px-2.5 pointer-coarse:-my-1.5"
    >
      <SetaVoltar />
      {children}
    </Button>
  )
}

/**
 * A entrada para outra tela do quadro. **O nome acessivel e so o titulo**, e a frase de apoio
 * vai como descricao: quem usa leitor de tela ouve "Ver os meus relatos, botao" e, depois, para
 * que ele serve.
 */
export function EntryLink({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  const apoio = useId()

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      aria-describedby={apoio}
      className="group flex w-full items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-surface-sunken motion-reduce:transition-none"
    >
      <span className="flex size-8 flex-none items-center justify-center rounded-md border border-border bg-surface text-fg-muted transition-colors duration-150 group-hover:text-fg motion-reduce:transition-none">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-detail text-fg">{title}</span>
        <span id={apoio} className="block text-caption text-fg-muted leading-snug">
          {description}
        </span>
      </span>
      <SetaAbrir className="flex-none text-fg-muted transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </button>
  )
}
