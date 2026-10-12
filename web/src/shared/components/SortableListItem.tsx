import type { ReactNode } from 'react'
import type { ListOrderItem, MoveButtonProps } from '@/shared/hooks/useListOrder'
import { cn } from '@/shared/lib/cn'

/**
 * Um item de lista da configuracao, num `<details>` de acordeao — o mesmo desenho do
 * `SettingsGroup`, com o movimento suave (`details-smooth`). E o dos tipos de relato e
 * das etapas do andamento, e o das listas que vierem.
 *
 * **O `open` e da tela**, e nao do navegador: o clique no `<summary>` so pede a troca
 * (`onRequestToggle`), e a tela decide — com rascunho, ela pergunta antes. Se algo abrir
 * ou fechar o `<details>` por fora, ele volta ao que a tela diz.
 *
 * **A alca, as setas e as acoes moram fora do `<summary>`**, presas por cima da linha
 * dele: o `<summary>` e um botao, e botao (ou link) dentro de botao nao funciona para o
 * teclado. O `<summary>` reserva o lugar deles dos dois lados. As etiquetas descem para
 * baixo da linha com o item fechado, e sobem para o topo do conteudo com ele aberto.
 *
 * Mover e de `useListOrder`: sem `order`, o item nao se move (o de criar, por exemplo).
 */
export function SortableListItem({
  accordion,
  summaryId,
  open,
  onRequestToggle,
  icon,
  name,
  summary,
  summaryTitle,
  inactive = false,
  unsaved = false,
  isNew = false,
  order,
  actions,
  actionsSpace = 'wide',
  tags,
  bodyClassName = 'p-3',
  children,
}: {
  /** O nome do acordeao da tela: um item aberto de cada vez. */
  accordion: string
  summaryId: string
  open: boolean
  onRequestToggle: () => void
  /** O que vem antes do nome: o desenho do tipo, o numero da etapa. */
  icon?: ReactNode
  name: ReactNode
  /** O que o item e, em palavras, para o cabecalho fechado. */
  summary: string
  /** O resumo inteiro no `title`, quando ele costuma nao caber. */
  summaryTitle?: string
  /** Desativado: o nome riscado e apagado. */
  inactive?: boolean
  unsaved?: boolean
  isNew?: boolean
  order?: ListOrderItem
  actions?: ReactNode
  /**
   * Quanto as acoes ocupam a direita: um botao curto (`narrow`), um texto (`wide`) ou dois
   * botoes (`double`, o Editar e o Desativar das Prioridades).
   */
  actionsSpace?: 'narrow' | 'wide' | 'double'
  /** Os avisos do item, com o caminho para resolver. */
  tags?: ReactNode
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <li
      {...order?.li}
      className={cn(
        'relative rounded-xl border bg-surface-raised',
        isNew && 'border-dashed',
        order?.dragging ? 'border-accent opacity-60' : 'border-border',
      )}
    >
      <details
        name={accordion}
        open={open}
        onToggle={(event) => {
          if (event.currentTarget.open !== open) event.currentTarget.open = open
        }}
        className="details-smooth group/item"
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: o summary ja e o botao do details para o teclado e o leitor de tela; o clique so troca quem decide abrir */}
        <summary
          id={summaryId}
          onClick={(event) => {
            event.preventDefault()
            onRequestToggle()
          }}
          className={cn(
            'flex min-h-16 scroll-mt-6 cursor-pointer list-none items-center gap-2.5 py-3 [&::-webkit-details-marker]:hidden',
            order ? 'pl-16' : 'pl-4',
            actions ? ESPACO_DAS_ACOES[actionsSpace] : 'pr-4',
          )}
        >
          <Seta className="group-open/item:rotate-90" />
          {icon}
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'block truncate font-medium text-body',
                inactive ? 'text-fg-muted line-through' : 'text-fg',
              )}
            >
              {name}
            </span>
            <span className="block truncate text-caption text-fg-muted" title={summaryTitle}>
              {summary}
              {unsaved && <span className="text-warn-fg"> · não salvo</span>}
            </span>
          </span>
        </summary>

        {children && (
          <div className={cn('border-border border-t', bodyClassName)}>
            {open && tags && <div className="mb-3 flex flex-wrap gap-1.5">{tags}</div>}
            {children}
          </div>
        )}
      </details>

      {!open && tags && <div className="-mt-1 flex flex-wrap gap-1.5 pr-4 pb-3 pl-16">{tags}</div>}

      {order && (
        // A alca e as setas ficam sempre visiveis, como em todas as listas da configuracao:
        // a alca conta que o item se move, e as setas sao o jeito de reordenar sem mouse.
        <div className="absolute top-0 left-1.5 flex h-16 items-center gap-0.5">
          <DragHandle {...order.handle} />
          <div className="flex flex-none flex-col">
            <MoveButton {...order.up} />
            <MoveButton {...order.down} />
          </div>
        </div>
      )}
      {actions && <div className="absolute top-0 right-3 flex h-16 items-center">{actions}</div>}
    </li>
  )
}

/** O respiro do `<summary>` para as acoes, presas por cima dele a direita. */
const ESPACO_DAS_ACOES = { narrow: 'pr-24', wide: 'pr-32', double: 'pr-44' } as const

/**
 * A alca de arrastar. Fora do teclado e do leitor de tela de proposito: para eles, as
 * setas fazem o mesmo, e uma alca que so anuncia "botao" nao localiza ninguem.
 */
export function DragHandle(props: ListOrderItem['handle']) {
  return (
    <button
      type="button"
      aria-hidden
      tabIndex={-1}
      {...props}
      className="flex size-6 flex-none cursor-grab items-center justify-center rounded text-fg-muted active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
    >
      <svg viewBox="0 0 12 12" className="size-3" fill="currentColor" aria-hidden>
        <circle cx="4.5" cy="2.5" r="1" />
        <circle cx="7.5" cy="2.5" r="1" />
        <circle cx="4.5" cy="6" r="1" />
        <circle cx="7.5" cy="6" r="1" />
        <circle cx="4.5" cy="9.5" r="1" />
        <circle cx="7.5" cy="9.5" r="1" />
      </svg>
    </button>
  )
}

/**
 * A seta de mover, com nome proprio para leitor de tela — "Mover Defeito para cima" —
 * porque o glifo sozinho se anuncia como "botao", e numa lista de linhas iguais isso nao
 * localiza ninguem.
 */
export function MoveButton({ id, direction, label, disabled, onClick }: MoveButtonProps) {
  return (
    <button
      id={id}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-5 items-center justify-center rounded text-fg-muted enabled:hover:bg-surface-sunken enabled:hover:text-fg disabled:opacity-30"
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={direction === 'up' ? 'M3 7.2 6 4.2l3 3' : 'M3 4.8 6 7.8l3-3'} />
      </svg>
    </button>
  )
}

/** A seta do item, que gira ao abrir — a mesma do `SettingsGroup`. */
function Seta({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn(
        'size-3 flex-none text-fg-muted transition-transform duration-300 ease-out motion-reduce:transition-none',
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
    </svg>
  )
}
