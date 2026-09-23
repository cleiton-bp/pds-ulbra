import { useEffect, useRef, useState } from 'react'
import type { MediaKind } from '@/contracts'
import { cn } from '@/shared/lib/cn'

/** Um arquivo, do jeito que a galeria precisa — sem saber de que lado ele veio. */
export interface GalleryItem {
  id: string
  kind: MediaKind
  url: string
  thumbnailUrl: string | null
  expiresAt: string
  /** O que aparece embaixo, quando aberto. O painel mostra nome e tamanho; o lado de fora, nada. */
  caption?: string
  /** Uma marca curta na miniatura, como "resposta". */
  badge?: string
}

/**
 * Antecedencia com que se pede endereco novo, antes de o atual vencer. Pedir no
 * ultimo segundo faria a imagem aberta quebrar no meio de alguem olhar.
 */
const RENOVAR_ANTES_MS = 30_000

/**
 * Os arquivos de um relato: miniaturas numa grade, e o arquivo inteiro so quando
 * alguem abre.
 *
 * **O arquivo inteiro so carrega quando e aberto.** A grade usa a miniatura, que o
 * navegador de quem relatou gerou antes de enviar — e e isso que deixa uma lista
 * com varios prints nao baixar megabytes para desenhar 56 pixels.
 *
 * **Link vencido e tratado, e nao deixado quebrar.** Os enderecos vencem em
 * minutos, de proposito. A galeria pede enderecos novos pouco antes do vencimento,
 * e tambem quando uma imagem falha — que e o que acontece quando o computador
 * dormiu com a aba aberta e o relogio pulou.
 *
 * **Pede de novo uma vez por lista, e nao em laco.** Se o endereco novo tambem
 * falhar, o problema nao e o vencimento, e insistir so martelaria a API.
 */
export function AttachmentGallery({
  items,
  onExpired,
}: {
  items: GalleryItem[]
  onExpired: () => void
}) {
  const [aberto, setAberto] = useState<string | null>(null)

  // Uma renovacao por lista. A lista nova chega como outro array, e zera isto —
  // conferido no proprio desenho, e nao num efeito, porque o efeito rodaria depois
  // de a imagem nova ja ter tido a chance de falhar.
  const renovou = useRef(false)
  const ultimaLista = useRef(items)
  if (ultimaLista.current !== items) {
    ultimaLista.current = items
    renovou.current = false
  }

  function renovar() {
    if (renovou.current) return
    renovou.current = true
    onExpired()
  }

  // Agenda a renovacao para pouco antes do primeiro vencimento.
  // biome-ignore lint/correctness/useExhaustiveDependencies: renovar le so refs e a callback atual
  useEffect(() => {
    if (items.length === 0) return

    const primeiro = Math.min(...items.map((item) => Date.parse(item.expiresAt)))
    const espera = Math.max(0, primeiro - Date.now() - RENOVAR_ANTES_MS)
    const relogio = setTimeout(renovar, espera)

    return () => clearTimeout(relogio)
  }, [items])

  if (items.length === 0) return null

  const selecionado = items.find((item) => item.id === aberto) ?? null

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setAberto(aberto === item.id ? null : item.id)}
              aria-pressed={aberto === item.id}
              aria-label={`${item.kind === 'Video' ? 'Vídeo' : 'Imagem'}${item.caption ? `: ${item.caption}` : ''}`}
              className={cn(
                'relative block h-16 w-16 overflow-hidden rounded-lg border bg-surface-sunken',
                aberto === item.id ? 'border-fg' : 'border-border',
              )}
            >
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  onError={renovar}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-caption text-fg-muted">
                  {item.kind === 'Video' ? 'vídeo' : 'imagem'}
                </span>
              )}

              {item.kind === 'Video' && (
                <span className="absolute right-1 bottom-1 rounded bg-surface/90 px-1 text-caption text-fg">
                  ▶
                </span>
              )}

              {item.badge && (
                <span className="absolute top-1 left-1 rounded bg-surface/90 px-1 text-caption text-fg">
                  {item.badge}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {selecionado && (
        <figure className="flex flex-col gap-1.5">
          {selecionado.kind === 'Video' ? (
            // `preload="metadata"`: so o cabecalho ate alguem apertar play. O
            // video inteiro e o que custa, e ele so desce quando pedido.
            //
            // Sem `<track>` de legenda, e e de proposito: e gravacao da tela de
            // quem relatou, e nao ha fala para legendar. Uma trilha vazia so para
            // satisfazer a regra anunciaria ao leitor de tela uma legenda que nao
            // existe.
            // biome-ignore lint/a11y/useMediaCaption: gravacao de tela, sem fala para legendar
            <video
              key={selecionado.url}
              src={selecionado.url}
              poster={selecionado.thumbnailUrl ?? undefined}
              controls
              preload="metadata"
              onError={renovar}
              className="max-h-96 w-full rounded-lg border border-border bg-surface-sunken"
            />
          ) : (
            // Abrir em outra aba e o jeito de ver em tamanho real. `noreferrer`
            // impede a aba nova de alcancar esta pagina pelo `window.opener`.
            <a href={selecionado.url} target="_blank" rel="noreferrer">
              <img
                src={selecionado.url}
                alt={selecionado.caption ?? 'Imagem anexada'}
                onError={renovar}
                className="max-h-96 w-full rounded-lg border border-border bg-surface-sunken object-contain"
              />
            </a>
          )}
          {selecionado.caption && (
            <figcaption className="text-caption text-fg-muted">{selecionado.caption}</figcaption>
          )}
        </figure>
      )}
    </div>
  )
}
