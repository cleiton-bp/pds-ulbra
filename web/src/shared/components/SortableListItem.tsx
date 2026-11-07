import type { ReactNode } from 'react'
import type { ListOrderItem, MoveButtonProps } from '@/shared/hooks/useListOrder'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
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
  tagsFechado,
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
  /**
   * Os avisos curtos, no fim da linha fechada no celular ("Sem coluna"); o aviso inteiro,
   * com o caminho, fica para o item aberto. Sem isto, no celular vale `tags`, embaixo.
   */
  tagsFechado?: ReactNode
  bodyClassName?: string
  children: ReactNode
}) {
  /**
   * **No celular a linha fechada so diz o que o item e**: a seta, o icone, o nome e o
   * resumo. A alca, as setas e as acoes tomavam uns 100px a esquerda e uma linha propria
   * embaixo (o Apagar sozinho, em cada item), e o nome virava reticencias. Mover e as
   * acoes descem para o pe do item aberto, e arrastar fica so com ponteiro fino.
   */
  const celular = useMediaQuery('(max-width: 39.99rem)')
  const tagsDaLinha = celular && tagsFechado !== undefined ? tagsFechado : null

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
            order && !celular ? 'pl-16' : 'pl-4',
            actions && !celular ? cn('pr-4', ESPACO_DAS_ACOES[actionsSpace]) : 'pr-4',
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
              {unsaved && <span className="text-warn-fg">, não salvo</span>}
            </span>
          </span>
          {!open && tagsDaLinha && <span className="flex flex-none gap-1">{tagsDaLinha}</span>}
        </summary>

        {children && (
          <div className={cn('border-border border-t', bodyClassName)}>
            {open && tags && <div className="mb-3 flex flex-wrap gap-1.5">{tags}</div>}
            {children}
            {/* No celular, o pe do item aberto: mover para cima e para baixo, e as acoes. */}
            {celular && open && (order || actions) && (
              <div className="mt-4 flex items-center justify-between gap-2 border-border border-t pt-3">
                {order ? (
                  <div className="flex items-center gap-1">
                    <span className="mr-1 text-detail text-fg-muted">Mover</span>
                    <MoveButton {...order.up} />
                    <MoveButton {...order.down} />
                  </div>
                ) : (
                  <span />
                )}
                {actions && <div className="flex items-center gap-1">{actions}</div>}
              </div>
            )}
          </div>
        )}
      </details>

      {!open && tags && !tagsDaLinha && (
        <div
          className={cn(
            '-mt-1 flex flex-wrap gap-1.5 pr-4 pb-3',
            celular ? 'pl-[3.25rem]' : 'pl-16',
          )}
        >
          {tags}
        </div>
      )}

      {order && !celular && (
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
      {/* No celular as acoes descem para uma linha propria, embaixo: presas a direita
          da linha do nome, elas e as setas comiam quase tudo, e o nome virava "M...". */}
      {actions && !celular && (
        <div className="-mt-1 flex items-center justify-end gap-1 pr-3 pb-2 pl-16 sm:absolute sm:top-0 sm:right-3 sm:mt-0 sm:h-16 sm:p-0">
          {actions}
        </div>
      )}
    </li>
  )
}

/** O respiro do `<summary>` para as acoes, presas por cima dele a direita (do `sm` para cima). */
const ESPACO_DAS_ACOES = { narrow: 'sm:pr-24', wide: 'sm:pr-32', double: 'sm:pr-44' } as const

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
      className="flex size-6 flex-none cursor-grab items-center justify-center rounded text-fg-muted active:cursor-grabbing disabled:cursor-default disabled:opacity-30 pointer-coarse:h-12 pointer-coarse:w-5"
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
      className="flex size-5 items-center justify-center rounded text-fg-muted enabled:hover:bg-surface-sunken enabled:hover:text-fg disabled:opacity-30 pointer-coarse:size-8"
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
