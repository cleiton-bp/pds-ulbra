import { useEffect, useRef, useState } from 'react'
import type { AttachmentDisplaySize, MediaKind } from '@/contracts'
import { cn } from '@/shared/lib/cn'
import { DISPLAY_GRID_CLASS, DISPLAY_IMAGE_CLASS, displaySizeClass } from '@/shared/lib/displaySize'

/** Um arquivo, do jeito que a galeria precisa — sem saber de que lado ele veio. */
export interface GalleryItem {
  id: string
  kind: MediaKind
  url: string
  thumbnailUrl: string | null
  expiresAt: string
  /**
   * Em que tamanho a imagem aparece — a escolha de quem relatou. Sem ele, a linha
   * inteira. O video nao tem: ver o comentario da galeria.
   */
  displaySize?: AttachmentDisplaySize
  /** O que aparece embaixo da imagem, ou do video aberto. O painel mostra nome e tamanho; o lado de fora, nada. */
  caption?: string
  /** Uma marca curta na miniatura do video, como "resposta". */
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
 * Os arquivos de um relato, logo abaixo do texto que os trouxe.
 *
 * **A imagem aparece inteira, no tamanho que quem relatou escolheu** — um terco da
 * linha, meia, tres quartos ou a linha inteira —, na ordem em que ela montou. O
 * relato mostra o que a pessoa montou, do jeito que montou: o print e parte do que
 * ela disse, e nao um anexo para abrir. Um clique abre a imagem em tamanho real, em
 * outra aba.
 *
 * **O arquivo, e nao a miniatura.** A miniatura tem 320 pixels de largura: na linha
 * inteira, o texto de um print ficaria borrado. O print capturado sai em poucas
 * centenas de kilobytes, e a imagem so baixa quando chega perto da tela
 * (`loading="lazy"`).
 *
 * **O video antigo continua como era**: a miniatura numa grade, e o player so quando
 * alguem abre. Video nao entra mais, e os que ficaram nunca tiveram tamanho
 * escolhido — baixar cada um para desenha-lo na linha custaria o que fez o video sair
 * do produto.
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
 *
 * **Renovar nao fecha nada.** Quem monta a galeria renova sem apagar a lista, e o
 * video aberto continua no endereco em que comecou: trocar o `src` no meio o
 * mandaria de volta ao inicio. Ele so troca se o endereco dele falhar.
 */
export function AttachmentGallery({
  items,
  onExpired,
  label = 'Imagens anexadas',
}: {
  items: GalleryItem[]
  onExpired: () => void
  /**
   * O nome da lista de imagens para o leitor de tela. **Nao aparece na tela**: a imagem
   * fica logo abaixo do texto que a trouxe, e um titulo no meio separaria os dois.
   */
  label?: string
}) {
  /** O video aberto, e o endereco em que ele comecou. Ver "Renovar nao fecha nada". */
  const [aberto, setAberto] = useState<{ id: string; videoUrl: string } | null>(null)
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

  const imagens = items.filter((item) => item.kind !== 'Video')
  const videos = items.filter((item) => item.kind === 'Video')
  const selecionado = videos.find((item) => item.id === aberto?.id) ?? null

  function abrir(item: GalleryItem) {
    setAberto(aberto?.id === item.id ? null : { id: item.id, videoUrl: item.url })
  }

  return (
    <div className="flex flex-col gap-3">
      {imagens.length > 0 && (
        <ul aria-label={label} className={DISPLAY_GRID_CLASS}>
          {imagens.map((item, i) => (
            <li key={item.id} className={displaySizeClass(item.displaySize)}>
              <ImagemAnexada
                item={item}
                // Nomes diferentes para o leitor de tela: tres links "Imagem anexada"
                // seguidos nao dizem qual e qual. Sem o nome do arquivo do lado de fora.
                nome={
                  imagens.length > 1 ? `Imagem ${i + 1} de ${imagens.length}` : 'Imagem anexada'
                }
                quebrada={quebrados.has(item.id)}
                onFalha={(url) => falhou(item.id, url)}
                onCarga={() => carregou(item.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {videos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {videos.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => abrir(item)}
                aria-pressed={aberto?.id === item.id}
                aria-label={`Vídeo${item.caption ? `: ${item.caption}` : ''}`}
                className={cn(
                  'relative block h-16 w-16 overflow-hidden rounded-lg border bg-surface-sunken',
                  aberto?.id === item.id ? 'border-fg' : 'border-border',
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
                    {quebrados.has(item.id) ? 'não carregou' : 'vídeo'}
                  </span>
                )}

                <span className="absolute right-1 bottom-1 rounded bg-surface/90 px-1 text-caption text-fg">
                  ▶
                </span>

                {item.badge && (
                  <span className="absolute top-1 left-1 rounded bg-surface/90 px-1 text-caption text-fg">
                    {item.badge}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selecionado && (
        <figure className="flex flex-col gap-1.5">
          {quebrados.has(`${selecionado.id}:arquivo`) ? (
            <p className="rounded-lg border border-border bg-surface-sunken p-3 text-caption text-fg-muted">
              Não deu para abrir este arquivo. Recarregar a página pede um endereço novo.
            </p>
          ) : (
            // `preload="metadata"`: so o cabecalho ate alguem apertar play. O
            // video inteiro e o que custa, e ele so desce quando pedido.
            //
            // O `src` e o do momento em que abriu, e nao o da lista: a renovacao
            // traz endereco novo a cada poucos minutos, e trocar no meio mandaria o
            // video de volta ao inicio. So troca se o dele falhar.
            //
            // Sem `<track>` de legenda, e e de proposito: e gravacao da tela de
            // quem relatou, e nao ha fala para legendar. Uma trilha vazia so para
            // satisfazer a regra anunciaria ao leitor de tela uma legenda que nao
            // existe.
            // biome-ignore lint/a11y/useMediaCaption: gravacao de tela, sem fala para legendar
            <video
              key={aberto?.videoUrl ?? selecionado.url}
              src={aberto?.videoUrl ?? selecionado.url}
              poster={selecionado.thumbnailUrl ?? undefined}
              controls
              preload="metadata"
              onError={() => {
                const usado = aberto?.videoUrl ?? selecionado.url
                if (usado !== selecionado.url) {
                  // O da lista ja e mais novo: passa para ele, sem pedir nada.
                  setAberto({ id: selecionado.id, videoUrl: selecionado.url })
                  return
                }
                falhou(`${selecionado.id}:arquivo`, usado)
              }}
              onLoadedMetadata={() => carregou(`${selecionado.id}:arquivo`)}
              className="max-h-96 w-full rounded-lg border border-border bg-surface-sunken"
            />
          )}
          {selecionado.caption && (
            <figcaption className="text-caption text-fg-muted">{selecionado.caption}</figcaption>
          )}
        </figure>
      )}
    </div>
  )
}

/**
 * Uma imagem na linha do relato.
 *
 * **A que ja carregou fica no endereco em que carregou.** A lista renova os enderecos a
 * cada poucos minutos; trocar o `src` de uma imagem ja na tela a baixaria de novo,
 * inteira, a cada renovacao, sem mudar nada do que a pessoa ve. So troca se o endereco
 * dela falhar — a imagem montada de novo, com o endereco velho fora do cache. O link
 * de "abrir" usa sempre o da lista, que e o que ainda vale.
 *
 * A que ainda nao carregou — longe da tela, esperando o `lazy` — usa o da lista.
 */
function ImagemAnexada({
  item,
  nome,
  quebrada,
  onFalha,
  onCarga,
}: {
  item: GalleryItem
  /** Como o leitor de tela chama a imagem, antes da legenda. */
  nome: string
  quebrada: boolean
  onFalha: (url: string) => void
  onCarga: () => void
}) {
  const [fixa, setFixa] = useState<string | null>(null)
  const src = fixa ?? item.url

  return (
    <figure className="flex flex-col gap-1">
      {quebrada ? (
        <p className="rounded-lg border border-border bg-surface-sunken p-3 text-caption text-fg-muted leading-normal">
          Esta imagem não carregou. Recarregar a página pede um endereço novo.
        </p>
      ) : (
        // Abrir em outra aba e o jeito de ver em tamanho real. `noreferrer` impede a
        // aba nova de alcancar esta pagina pelo `window.opener`.
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          title="Abrir em tamanho real"
          className="block overflow-hidden rounded-lg border border-border bg-surface-sunken"
        >
          <img
            src={src}
            alt={item.caption ? `${nome}: ${item.caption}` : nome}
            loading="lazy"
            decoding="async"
            onError={() => {
              // O endereco guardado falhou: dali em diante, vale o da lista. Se ela ja
              // tem um mais novo, e so passar para ele, sem pedir nada.
              if (fixa !== null) {
                setFixa(null)
                if (fixa !== item.url) return
              }
              onFalha(src)
            }}
            onLoad={() => {
              if (fixa !== src) setFixa(src)
              onCarga()
            }}
            className={DISPLAY_IMAGE_CLASS}
          />
        </a>
      )}
      {/* Cortada na imagem pequena; inteira ao passar o mouse. */}
      {item.caption && (
        <figcaption title={item.caption} className="truncate text-caption text-fg-muted">
          {item.caption}
        </figcaption>
      )}
    </figure>
  )
}
