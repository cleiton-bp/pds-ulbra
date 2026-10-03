import { Fragment, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { type MarkdownInline, parseMarkdown } from '@/shared/lib/markdown'

/**
 * A descricao de um card, desenhada.
 *
 * **Elementos React, e nunca HTML.** Cada no do `parseMarkdown` vira um elemento, e
 * o texto entra como texto — o React escapa. Nao ha `dangerouslySetInnerHTML` aqui
 * nem em lugar nenhum por baixo, e e isso que deixa o time colar qualquer coisa na
 * descricao sem ninguem precisar sanear depois.
 *
 * **O link abre fora**, sem levar a pagina junto (`noopener`) e sem dizer de onde
 * veio (`noreferrer`): o endereco do card do painel nao e assunto do site do
 * link.
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source)

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 break-words text-body text-fg leading-relaxed',
        className,
      )}
    >
      {blocks.map((block, index) => {
        // A posicao e a identidade de um bloco: o texto nao tem outra, e a lista
        // inteira e refeita a cada letra digitada na previa.
        const key = `${block.kind}-${index}`

        switch (block.kind) {
          case 'heading':
            return block.level === 1 ? (
              <h3 key={key} className="font-semibold text-fg text-lead">
                {inline(block.children)}
              </h3>
            ) : block.level === 2 ? (
              <h4 key={key} className="font-semibold text-body text-fg">
                {inline(block.children)}
              </h4>
            ) : (
              <h5 key={key} className="font-medium text-detail text-fg">
                {inline(block.children)}
              </h5>
            )

          case 'list':
            return block.ordered ? (
              <ol key={key} start={block.start} className="list-decimal pl-5">
                {block.items.map((item, itemIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: o item nao tem identidade alem da posicao
                  <li key={itemIndex}>{inline(item)}</li>
                ))}
              </ol>
            ) : (
              <ul key={key} className="list-disc pl-5">
                {block.items.map((item, itemIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: o item nao tem identidade alem da posicao
                  <li key={itemIndex}>{inline(item)}</li>
                ))}
              </ul>
            )

          case 'quote':
            return (
              <blockquote key={key} className="border-border border-l-2 pl-3 text-fg-muted">
                {inline(block.children)}
              </blockquote>
            )

          case 'code':
            return (
              // Rola de lado, e nao quebra: codigo quebrado no meio muda de sentido.
              <pre
                key={key}
                className="overflow-x-auto rounded-lg border border-border bg-surface-sunken px-3 py-2 font-mono text-detail"
              >
                <code>{block.text}</code>
              </pre>
            )

          default:
            return <p key={key}>{inline(block.children)}</p>
        }
      })}
    </div>
  )
}

function inline(nodes: MarkdownInline[]): ReactNode {
  return nodes.map((node, index) => {
    // O trecho nao tem identidade alem da posicao.
    const key = index

    switch (node.kind) {
      case 'text':
        return <Fragment key={key}>{node.text}</Fragment>
      case 'break':
        return <br key={key} />
      case 'strong':
        return (
          <strong key={key} className="font-semibold">
            {inline(node.children)}
          </strong>
        )
      case 'em':
        return <em key={key}>{inline(node.children)}</em>
      case 'code':
        return (
          <code key={key} className="rounded bg-surface-sunken px-1 py-px font-mono text-[0.9em]">
            {node.text}
          </code>
        )
      case 'link':
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg underline underline-offset-2"
          >
            {inline(node.children)}
          </a>
        )
      default:
        return null
    }
  })
}
