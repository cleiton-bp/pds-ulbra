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
 *
 * **E tambem a espera minima entre duas renovacoes.** O vencimento e contado no
 * relogio do servidor e comparado com o do navegador: com o relogio de quem olha
 * adiantado, todo endereco ja chega "vencido", e sem piso a galeria pediria de novo
 * no mesmo instante, para sempre.
 */
const RENOVAR_ANTES_MS = 30_000

/**
 * Endereco que falha antes disto, contado de quando a lista chegou, **nao venceu**:
 * nenhuma validade e tao curta. Renovar nao ajudaria — o armazenamento assinaria
 * de novo o mesmo arquivo, e no mesmo segundo devolveria ate o mesmo endereco.
 */
const RECEM_CHEGADO_MS = 5_000

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
 * e tambem quando um arquivo falha — que e o que acontece quando o computador
 * dormiu com a aba aberta e o relogio pulou.
 *
 * **Endereco novo que tambem falha nao e vencimento.** A trava e por arquivo, e nao
 * por lista: quem monta a galeria cria a lista de novo a cada desenho, e uma trava
 * por lista zerava sozinha — uma miniatura que o navegador nao decodifica fazia a
 * pagina reler a lista milhares de vezes em segundos. Agora o arquivo que falha de
 * novo com o endereco novo vira "nao carregou" e para de pedir; o que carrega zera
 * a trava, para o proximo vencimento de verdade.
 */
export function AttachmentGallery({
  items,
  onExpired,
}: {
  items: GalleryItem[]
  onExpired: () => void
}) {
  const [aberto, setAberto] = useState<string | null>(null)
  const [quebrados, setQuebrados] = useState<ReadonlySet<string>>(() => new Set())

  /**
   * Arquivo que ja pediu endereco novo por falha, e o endereco com que falhou.
   * Falhar de novo com o MESMO endereco e so o pedido ainda a caminho; falhar com
   * OUTRO e o endereco novo falhando — ai nao e vencimento.
   */
  const falhouCom = useRef(new Map<string, string>())

  /**
   * Quando saiu o ultimo pedido. **No maximo um a cada `RENOVAR_ANTES_MS`**, venha
   * de onde vier — varias miniaturas vencendo juntas viram um pedido so, e nenhum
   * caminho vira laco.
   */
  const pedidoEm = useRef<number | null>(null)

  /** Cada pedido rearma o relogio: se a renovacao falhar, ele tenta de novo no piso. */
  const [tentativa, setTentativa] = useState(0)

  // "Lista nova" e endereco novo, e nao array novo: quem monta a galeria cria o
  // array a cada desenho, com os mesmos enderecos. Conferido no proprio desenho,
  // e nao num efeito, porque o efeito rodaria depois de a imagem nova ja ter tido a
  // chance de falhar.
  const assinatura = items.map((item) => `${item.id}|${item.url}|${item.thumbnailUrl}`).join(',')
  const ultimaAssinatura = useRef(assinatura)
  const chegouEm = useRef(Date.now())
  if (ultimaAssinatura.current !== assinatura) {
    ultimaAssinatura.current = assinatura
    chegouEm.current = Date.now()
    pedidoEm.current = null
  }

  function renovar() {
    const agora = Date.now()
    if (pedidoEm.current !== null && agora - pedidoEm.current < RENOVAR_ANTES_MS) return
    pedidoEm.current = agora
    setTentativa((n) => n + 1)
    onExpired()
  }

  function falhou(id: string, url: string) {
    // Recem-chegado e ja falhou: o arquivo e que nao abre, e nao o endereco que venceu.
    if (Date.now() - chegouEm.current < RECEM_CHEGADO_MS) {
      setQuebrados((atual) => new Set(atual).add(id))
      return
    }

    const antes = falhouCom.current.get(id)

    if (antes === undefined) {
      falhouCom.current.set(id, url)
      renovar()
      return
    }

    // O mesmo endereco de novo: o pedido ainda nao voltou.
    if (antes === url) return

    // Endereco novo, e falhou tambem: nao e vencimento. Para de pedir.
    setQuebrados((atual) => new Set(atual).add(id))
  }

  function carregou(id: string) {
    falhouCom.current.delete(id)
  }

  // Agenda a renovacao para pouco antes do primeiro vencimento — nunca antes do piso.
  // Rearma a cada pedido: renovacao que falhou deixa a lista igual, e sem isto o
  // relogio nao voltaria a tentar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a assinatura resume os itens; renovar le so refs e a callback atual
  useEffect(() => {
    if (items.length === 0) return

    const primeiro = Math.min(...items.map((item) => Date.parse(item.expiresAt)))
    const espera = Math.max(RENOVAR_ANTES_MS, primeiro - Date.now() - RENOVAR_ANTES_MS)
    const relogio = setTimeout(renovar, espera)

    return () => clearTimeout(relogio)
  }, [assinatura, tentativa])

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
              {item.thumbnailUrl && !quebrados.has(item.id) ? (
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  onError={() => falhou(item.id, item.thumbnailUrl ?? '')}
                  onLoad={() => carregou(item.id)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-center text-caption text-fg-muted">
                  {quebrados.has(item.id)
                    ? 'não carregou'
                    : item.kind === 'Video'
                      ? 'vídeo'
                      : 'imagem'}
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
          {quebrados.has(`${selecionado.id}:arquivo`) ? (
            <p className="rounded-lg border border-border bg-surface-sunken p-3 text-caption text-fg-muted">
              Não deu para abrir este arquivo. Recarregar a página pede um endereço novo.
            </p>
          ) : selecionado.kind === 'Video' ? (
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
              onError={() => falhou(`${selecionado.id}:arquivo`, selecionado.url)}
              onLoadedMetadata={() => carregou(`${selecionado.id}:arquivo`)}
              className="max-h-96 w-full rounded-lg border border-border bg-surface-sunken"
            />
          ) : (
            // Abrir em outra aba e o jeito de ver em tamanho real. `noreferrer`
            // impede a aba nova de alcancar esta pagina pelo `window.opener`.
            <a href={selecionado.url} target="_blank" rel="noreferrer">
              <img
                src={selecionado.url}
                alt={selecionado.caption ?? 'Imagem anexada'}
                onError={() => falhou(`${selecionado.id}:arquivo`, selecionado.url)}
                onLoad={() => carregou(`${selecionado.id}:arquivo`)}
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
