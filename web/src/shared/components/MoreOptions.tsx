import type { ReactNode } from 'react'
import { Button } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'

/**
 * "Mais opções": o que quase ninguem muda, recolhido no fim da tela — **com o resumo
 * do que ja mudou**, para quem nao abre saber se precisa abrir.
 *
 * **Fechado nao quer dizer escondido.** A linha de cima diz "Tudo no padrão" ou "2
 * mudanças: Tema, Sombra": quem herdou o projeto de outra pessoa ve na hora que algo
 * foi mexido, sem abrir uma por uma. E "Voltar ao padrão" troca so os campos daqui,
 * no rascunho — quem salva continua sendo o Salvar do titulo (ou o Salvar do item, nas
 * telas de lista), e Descartar desfaz.
 *
 * **E um `<details>` de verdade**, e nao um botao com estado: a busca da configuracao
 * leva a `tela#campo`, e `useScrollToHash` abre o `<details>` fechado em volta do campo
 * antes de rolar. Um estado do React ali dentro ela nao alcancaria.
 */
export function MoreOptions({
  id,
  title = 'Mais opções',
  changes,
  summary,
  onReset,
  children,
  className,
}: {
  /** A ancora da secao: a busca e os avisos levam ate ela. */
  id?: string
  title?: string
  /**
   * Os nomes do que esta diferente do padrao de fabrica, na ordem da tela. Sem a
   * lista, a secao nao tem padrao (um identificador, um arquivamento): o resumo e o
   * `summary`, e nao ha "Voltar ao padrão".
   */
  changes?: readonly string[]
  /** O resumo quando nao ha padrao a comparar. */
  summary?: string
  /** Poe o padrao de fabrica nos campos daqui. So aparece quando ha mudanca. */
  onReset?: () => void
  children: ReactNode
  className?: string
}) {
  const resumo = changes ? describeChanges(changes) : (summary ?? '')

  return (
    <details
      id={id}
      className={cn(
        'group scroll-mt-6 rounded-xl border border-border bg-surface-raised',
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 12 12"
          className="size-3 flex-none text-fg-muted transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
        </svg>
        <span className="font-semibold text-fg text-lead">{title}</span>
        {resumo && (
          <span className="min-w-0 flex-1 truncate text-right text-caption text-fg-muted">
            {resumo}
          </span>
        )}
      </summary>

      <div className="border-border border-t px-5 pt-4 pb-5">
        {changes && changes.length > 0 && onReset && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-surface-sunken px-3 py-2">
            <p className="min-w-0 flex-1 text-detail text-fg-muted">
              Diferente do padrão: {changes.join(', ')}.
            </p>
            <Button size="sm" variant="quiet" onClick={onReset}>
              Voltar ao padrão
            </Button>
          </div>
        )}
        {children}
      </div>
    </details>
  )
}

/**
 * "Tudo no padrão", "1 mudança: Tema", "4 mudanças: Tema, Sombra e mais 2". Mais de
 * tres nomes viram contagem: o resumo e uma linha, e a lista inteira esta logo embaixo.
 */
export function describeChanges(changes: readonly string[]): string {
  if (changes.length === 0) return 'Tudo no padrão'
  const nomes =
    changes.length <= 3
      ? changes.join(', ')
      : `${changes.slice(0, 2).join(', ')} e mais ${changes.length - 2}`
  return `${changes.length === 1 ? '1 mudança' : `${changes.length} mudanças`}: ${nomes}`
}
