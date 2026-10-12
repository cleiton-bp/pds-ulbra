import type { ReactNode } from 'react'
import { Button } from '@/shared/components/Button'
import { describeChanges } from '@/shared/components/MoreOptions'
import { cn } from '@/shared/lib/cn'

/**
 * Um assunto de uma tela de configuracao, num `<details>` de acordeao: **fechado, ele ja
 * diz o que esta escolhido, com uma amostra em palavras, e o que mudou do padrao de
 * fabrica** — quem herdou o projeto ve o que foi mexido sem abrir um por um. Sem
 * mudanca, nada: "No padrão" em todo grupo era ruido.
 *
 * Nasceu em O botão e mora em `shared` porque as telas vizinhas (Formulário, Anexos,
 * Tipos de relato) organizam os assuntos do mesmo jeito: quem aprendeu uma tela nao
 * precisa aprender a outra.
 *
 * **Como usar.** Cada tela da um `name` proprio ao acordeao dela (`'botao'`,
 * `'formulario'`…) e poe os grupos um embaixo do outro; o navegador fecha o vizinho ao
 * abrir um. O `id` e a ancora do grupo, e os campos de dentro levam as ancoras deles:
 * a busca da configuracao chega a `tela#campo` e abre o grupo em volta.
 *
 * **E um `<details>` de verdade, com o `name` do acordeao**, e nao um estado do React:
 * `useScrollToHash` abre o `<details>` fechado em volta do campo, e o navegador fecha o
 * vizinho sozinho.
 *
 * **A ancora do grupo fica no `<summary>`, e o titulo nao e um `h2` dentro dele**: o
 * `<summary>` e um botao, e um titulo dentro de botao some para quem navega pelos
 * titulos. Quem nomeia o grupo e a `section` em volta (`aria-labelledby`). Quem chega
 * pela ancora do grupo encontra o grupo aberto e o foco no `<summary>`.
 *
 * **"Voltar ao padrão" mora na linha do titulo, fora do `<summary>`** (botao dentro de
 * botao nao funciona para o teclado), e aparece com o grupo fechado tambem. Quem decide
 * o que ele troca e a tela (`onReset`): so os campos deste grupo, no rascunho certo —
 * quem grava continua sendo o Publicar do titulo, e Descartar desfaz.
 *
 * **A previa acompanha o grupo**: `onToggle` diz que ele abriu ou fechou, e
 * `onFocusWithin`, que a pessoa entrou ou saiu dele pelo foco ou pelo mouse — a tela usa
 * os dois para realcar, na previa, a parte que se esta mudando.
 *
 * Sem ajuda e sem "Como funciona" dentro: cada controle traz a propria dica de uma
 * linha, ao lado dele — tres camadas de texto antes do primeiro controle afastavam a
 * pessoa do que ela veio mudar.
 */
export function SettingsGroup({
  name,
  id,
  title,
  value,
  changes,
  onReset,
  defaultOpen = false,
  onToggle,
  onFocusWithin,
  children,
}: {
  /** O nome do acordeao: os grupos com o mesmo nome abrem um de cada vez. Um por tela. */
  name: string
  /** A ancora do grupo: a busca e os avisos levam ate ela. */
  id: string
  title: string
  /** O que esta escolhido agora, numa amostra de uma linha. */
  value: ReactNode
  /** Os nomes do que difere do padrao de fabrica, na ordem da tela. */
  changes: readonly string[]
  /** Poe o padrao de fabrica nos campos do grupo. So aparece quando ha mudanca. */
  onReset: () => void
  defaultOpen?: boolean
  /** O grupo abriu ou fechou — pela pessoa, pela busca ou pelo vizinho que abriu. */
  onToggle?: (open: boolean) => void
  /** A pessoa entrou ou saiu do grupo, pelo foco ou pelo mouse: a previa realca o assunto. */
  onFocusWithin?: (inside: boolean) => void
  children: ReactNode
}) {
  const nome = `${id}-nome`
  const mudou = changes.length > 0

  return (
    <section
      aria-labelledby={nome}
      onFocus={() => onFocusWithin?.(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onFocusWithin?.(false)
        }
      }}
      onPointerEnter={() => onFocusWithin?.(true)}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) onFocusWithin?.(false)
      }}
      className="relative rounded-xl border border-border bg-surface-raised"
    >
      <details
        name={name}
        open={defaultOpen}
        onToggle={(event) => onToggle?.(event.currentTarget.open)}
        className="details-smooth group/grupo"
      >
        <summary
          id={id}
          className="flex scroll-mt-6 cursor-pointer list-none items-start gap-2.5 px-5 py-4 [&::-webkit-details-marker]:hidden"
        >
          <Seta className="mt-1.5 group-open/grupo:rotate-90" />
          <span className="min-w-0 flex-1">
            {/* **Uma coisa por linha, sem nada por cima.** O "Voltar ao padrão" mora fora
                do summary, preso a direita da primeira linha: ela reserva o lugar dele
                (`pr-40`) e tem a altura dele (`min-h-8`). O que esta escolhido e o que
                mudou descem para as linhas de baixo e quebram linha se precisar — na
                mesma linha do titulo, a lista longa passava por baixo do botao. */}
            <span className={cn('flex min-h-8 items-center', mudou && 'pr-40')}>
              <span id={nome} className="font-semibold text-fg text-lead">
                {title}
              </span>
            </span>
            <span className="block text-detail text-fg-muted">{value}</span>
            {mudou && (
              <span className="mt-1 block text-caption text-fg" title={describeChanges(changes)}>
                Mudou: {changes.join(', ')}
              </span>
            )}
          </span>
        </summary>

        <div className="border-border border-t px-5 pt-4 pb-5">{children}</div>
      </details>

      {mudou && (
        <Button size="sm" variant="quiet" className="absolute top-4 right-4" onClick={onReset}>
          Voltar ao padrão
        </Button>
      )}
    </section>
  )
}

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
