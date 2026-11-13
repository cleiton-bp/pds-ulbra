import { type ReactNode, useEffect, useId, useState } from 'react'
import type { ReportSummaryViewModel } from '@/contracts'
import { CardTypeIcon } from '@/features/reports/cardLook'
import { reportTypeName } from '@/shared/components/ReportTypeGlyph'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'
import { formatDay } from '@/shared/lib/datetime'
import { dueWords } from '@/shared/lib/dueDate'
import { isTestOrigin } from '@/shared/lib/installSignals'
import { guideTarget } from '@/shared/tour/guideStore'

/**
 * A largura e a altura do card aberto: largo no computador, a tela inteira no celular.
 *
 * **No computador a altura e fixa**, e nao a do conteudo: com a altura do conteudo, o
 * card curto aparecia mais baixo, e o X, o status e os campos mudavam de lugar a cada
 * card aberto — ir do pai para a subtarefa era procurar tudo de novo.
 *
 * **No celular o card e uma folha que sobe de baixo** (ver `CARD_DIALOG_CLASS`), com o
 * respiro menor dos lados: a margem do dialogo e o respiro de
 * 24 px dos dois lados tiravam um quarto da largura de um telefone de 320 px. Embaixo
 * nao ha respiro: a area que rola vai ate a borda (ver `CardDetailLayout`).
 */
export const CARD_DIALOG_WIDTH = 'w-[min(66rem,calc(100vw-2rem))] max-sm:w-screen'
export const CARD_DIALOG_CLASS = cn(
  'flex max-h-[calc(100dvh-2rem)] flex-col pb-0 md:h-[min(54rem,calc(100dvh-4rem))] md:max-h-none',
  // No celular o card sobe como uma folha, da borda de baixo ate perto do alto: a faixa de
  // cima mostra a lista escurecida atras (tocar nela fecha, perguntando antes se ha texto
  // por salvar) e a alca diz que e uma camada por cima, e nao uma pagina nova. Na tela
  // inteira, sem moldura, ele parecia ter levado a pessoa para outro lugar.
  'max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:h-[calc(100dvh-2.75rem)] max-sm:max-h-none max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:px-4 max-sm:pt-5',
  'max-sm:data-[state=open]:animate-sheet-in max-sm:data-[state=closed]:animate-sheet-out',
  // O alto da folha e de quem arrasta para fechar (ver `useArrastarParaFechar`): sem gesto
  // do navegador ali. O corpo, que rola, continua com o gesto dele.
  'max-sm:touch-none',
  'max-sm:before:absolute max-sm:before:top-2 max-sm:before:left-1/2 max-sm:before:h-1 max-sm:before:w-9 max-sm:before:-translate-x-1/2 max-sm:before:rounded-full max-sm:before:bg-border',
  // Deitado a partir do tablet (844x390), a mesma margem dos outros dialogos, e nao 32.
  'md:[@media(max-height:30rem)]:h-[calc(100dvh-2rem)]',
  // O corpo do dialogo (o ultimo filho: o card nao tem rodape) vai de borda a borda, com
  // o respiro por dentro: so assim as colunas chegam a borda sem o corpo rolar de lado.
  '[&>:last-child]:-mx-6 [&>:last-child]:px-6 max-sm:[&>:last-child]:-mx-4 max-sm:[&>:last-child]:px-4',
  // Quem rola no card sao as colunas, e nao o corpo: sem isto, o lugar reservado da barra do
  // corpo (ver o `Modal`) virava uma faixa vazia na borda direita.
  '[&>:last-child]:[scrollbar-gutter:auto]',
)

/** A partir de onde o card aberto tem duas colunas — o `md` do Tailwind. */
const DUAS_COLUNAS = '(min-width: 48rem)'

/**
 * O card aberto em duas colunas: **o que o card e** a esquerda — titulo, texto,
 * anexos, reaberturas e encerramento — e, embaixo, a atividade (a conversa e a
 * historia); **onde ele esta** a direita — a coluna, as acoes e os detalhes (quem esta
 * com ele, prioridade, etiquetas, prazo, de onde veio).
 *
 * **Cada coluna rola por conta propria.** A conversa longa nao leva embora a coluna e
 * os campos, e a direita mais alta que a tela continua alcancavel ate o fim — pelo
 * mouse e pelo Tab.
 *
 * **No celular e uma coluna so**, que rola inteira, na ordem em que se le: o card,
 * depois onde ele esta, depois as subtarefas e os vinculos, depois a atividade. No
 * celular o uso tipico e "ver em que pe esta e mudar a coluna ou o responsavel": por
 * isso onde ele esta vem antes das subtarefas — com quatro delas, a coluna e o
 * responsavel ficavam abaixo da primeira tela. A ordem do documento e essa mesma — o
 * leitor de tela e o Tab seguem o que se ve. Por isso a troca entre os dois desenhos
 * e feita aqui, e nao so com CSS: com CSS, uma das duas larguras teria a ordem do
 * documento diferente da vista. Cruzar a largura com a janela aberta remonta o
 * conteudo, e um comentario pela metade se perde — o preco de a ordem estar certa.
 *
 * As colunas vao ate a borda do dialogo: o corpo dele vai de borda a borda (ver
 * `CARD_DIALOG_CLASS`) e o dialogo nao tem respiro embaixo. Antes as colunas passavam
 * da area que rola em volta, e o corpo rolava 20 px para o lado e 24 px para baixo: o
 * card balancava no dedo e no trackpad.
 */
export function CardDetailLayout({
  cabeca,
  depois,
  lado,
  atividade,
}: {
  cabeca: ReactNode
  /** As subtarefas e os vinculos: embaixo do card no computador, depois de onde ele esta no celular. */
  depois?: ReactNode
  lado: ReactNode
  atividade: ReactNode
}) {
  const largo = useMediaQuery(DUAS_COLUNAS)
  // No celular o pe do card ganha o atalho para comentar (ver `ComentarNoPe`).
  const celular = useMediaQuery('(max-width: 39.99rem)')

  if (largo)
    return (
      <div className="-mx-6 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_21rem] grid-rows-[minmax(0,1fr)] border-border border-t">
        {/* Cada coluna reserva o lugar da barra (8 px) e recua o resto: a barra encosta na
            divisoria ou na borda, e nada pula para o lado quando ela aparece. */}
        <div className="flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto py-5 pr-6 pl-6 [scrollbar-gutter:stable]">
          <div className="flex min-w-0 flex-col gap-5" {...guideTarget('card-cabeca')}>
            {cabeca}
          </div>
          {depois && (
            <div className="flex min-w-0 flex-col gap-5" {...guideTarget('card-depois')}>
              {depois}
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-5" {...guideTarget('card-atividade')}>
            {atividade}
          </div>
        </div>
        <div
          className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto border-border border-l py-5 pr-4 pl-6 [scrollbar-gutter:stable]"
          {...guideTarget('card-lado')}
        >
          {lado}
        </div>
      </div>
    )

  return (
    <>
      <div className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain border-border border-t px-4 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6 sm:pr-4 sm:[scrollbar-gutter:stable]">
        <div className="flex flex-col gap-6">
          <div className="flex min-w-0 flex-col gap-5" {...guideTarget('card-cabeca')}>
            {cabeca}
          </div>
          <div className="flex min-w-0 flex-col gap-4" {...guideTarget('card-lado')}>
            {lado}
          </div>
          {depois && (
            <div className="flex min-w-0 flex-col gap-5" {...guideTarget('card-depois')}>
              {depois}
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-5" {...guideTarget('card-atividade')}>
            {atividade}
          </div>
        </div>
      </div>
      {celular && <ComentarNoPe />}
    </>
  )
}

/**
 * O titulo do dialogo: o tipo (desenho e nome) e o numero do card — o mesmo par da
 * linha da lista e do pe do card no quadro.
 *
 * **Menor que o titulo do card**, logo abaixo: e a etiqueta de onde se esta, e o
 * titulo e o assunto. O relato diz que **e de fora** — ha uma pessoa esperando do
 * outro lado, e isso antes so se deduzia pelo protocolo e pela caixa amarela, la
 * embaixo.
 */
export function CardDialogTitle({ card }: { card: ReportSummaryViewModel | null }) {
  if (card === null) return <span className="text-detail text-fg-muted">Card</span>

  // A subtarefa e card do time, mas e assim que o time a chama.
  const tipo = card.Parent
    ? 'Subtarefa'
    : card.Kind === 'Team'
      ? 'Card do time'
      : card.Type
        ? reportTypeName(card.Type)
        : 'Relato'

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-detail text-fg-muted">
      {/* O nome do tipo ja vem escrito ao lado: o desenho fica so para os olhos. O desenho
          e o nome andam juntos: separados, no celular o desenho ficava sozinho numa linha, e
          o topo do relato de fora ia a tres linhas. */}
      <span className="flex items-center gap-2">
        <span aria-hidden className="flex">
          <CardTypeIcon card={card} />
        </span>
        <span className="text-fg">{tipo}</span>
      </span>
      <span className="tabular-nums">#{card.Number}</span>
      {/* O relato de teste sai da pagina de teste, e nao de quem usa o sistema: chamar de
          "Relato de fora" fazia o teste se passar por um relato de verdade. */}
      {card.Kind !== 'Team' &&
        (isTestOrigin(card.Origin) ? (
          <span className="rounded-full border border-border bg-surface-sunken px-2 py-px font-normal text-caption text-fg-muted">
            Relato de teste
          </span>
        ) : (
          <span className="rounded-full border border-warn-border bg-warn-surface px-2 py-px font-normal text-caption text-warn-fg">
            Relato de fora
          </span>
        ))}
    </span>
  )
}

/** A caixa "Detalhes" da coluna da direita: os campos do card e de onde ele veio. */
export function DetailsBox({ children, resumo }: { children: ReactNode; resumo?: string }) {
  const celular = useMediaQuery('(max-width: 39.99rem)')
  const [aberto, setAberto] = useState(lerDetalhesAbertos)
  const corpoId = useId()

  // No celular os detalhes recolhem: o formulario inteiro ocupava a primeira tela do card,
  // e o que a pessoa mais faz ao abrir um card e ler, mudar a coluna e comentar. Fechado,
  // um resumo diz o principal; um toque abre o formulario, e a escolha fica lembrada.
  if (celular && resumo !== undefined) {
    const alternar = () => {
      const novo = !aberto
      setAberto(novo)
      try {
        window.localStorage.setItem(CHAVE_DOS_DETALHES, novo ? 'aberto' : 'fechado')
      } catch {
        // Sem onde guardar, a escolha vale ate fechar o card.
      }
    }
    return (
      <section className="rounded-lg border border-border">
        <h3>
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={corpoId}
            onClick={alternar}
            className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left"
          >
            <svg
              viewBox="0 0 12 12"
              aria-hidden
              className={cn(
                'mt-1 size-3 flex-none text-fg-muted transition-transform duration-320 ease-in-out motion-reduce:transition-none',
                aberto && 'rotate-90',
              )}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-detail text-fg">Detalhes</span>
              {/* O resumo esmaece ao abrir: o formulario logo abaixo ja diz o mesmo. */}
              <span
                className={cn(
                  'mt-0.5 line-clamp-2 text-caption text-fg-muted transition-opacity duration-200',
                  aberto && 'sr-only',
                )}
              >
                {resumo}
              </span>
            </span>
          </button>
        </h3>
        {/* Abre e fecha devagar, como as listas do Backlog: a linha do grid vai de zero a
            altura do formulario. Fechado, o formulario fica fora do teclado (`inert`). */}
        <div
          id={corpoId}
          inert={!aberto || undefined}
          className={cn(
            'grid transition-[grid-template-rows] duration-320 ease-in-out motion-reduce:transition-none',
            aberto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col gap-3 border-border border-t px-3.5 py-3">{children}</div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-border">
      <h3 className="border-border border-b px-3.5 py-2.5 font-medium text-detail text-fg">
        Detalhes
      </h3>
      <div className="flex flex-col gap-3 px-3.5 py-3">{children}</div>
    </section>
  )
}

/** A escolha de abrir os detalhes no celular, lembrada neste aparelho. */
const CHAVE_DOS_DETALHES = 'pds.web.card.detalhes'

function lerDetalhesAbertos(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DOS_DETALHES) === 'aberto'
  } catch {
    return false
  }
}

/**
 * O resumo dos detalhes recolhidos: quem esta com o card, a prioridade, o prazo e as
 * etiquetas, numa frase so, separada por virgulas.
 */
export function resumoDosDetalhes(card: ReportSummaryViewModel, soonDays: number): string {
  const partes = [
    card.Assignee ? (card.Assignee.Name ?? 'Responsável sem nome') : 'Sem responsável',
    card.Priority ? `prioridade ${card.Priority.Name.toLowerCase()}` : 'sem prioridade',
  ]
  if (card.DueDate)
    partes.push(dueWords(card.DueDate, soonDays) ?? `prazo ${formatDay(card.DueDate)}`)
  if (card.Labels.length === 1) partes.push(card.Labels[0]?.Name ?? '')
  else if (card.Labels.length > 1) partes.push(`${card.Labels.length} etiquetas`)
  return partes.filter(Boolean).join(', ')
}

/**
 * O atalho para comentar, preso no pe do card no celular: o campo de comentario mora no fim,
 * depois dos detalhes, das subtarefas e dos vinculos, e chegar ate ele era rolar o card
 * inteiro. Um toque leva ao campo e abre o teclado. Some enquanto o proprio campo esta a
 * vista, e quando o card nao tem campo de comentario.
 */
function ComentarNoPe() {
  const [campoAVista, setCampoAVista] = useState(true)

  useEffect(() => {
    let observador: IntersectionObserver | null = null
    // O campo chega depois (o card carrega): espera ele aparecer para observar.
    const procurar = window.setInterval(() => {
      const campo = acharCampoDeComentario()
      if (!campo) return
      window.clearInterval(procurar)
      if (typeof IntersectionObserver === 'undefined') return
      observador = new IntersectionObserver(([entrada]) =>
        setCampoAVista(entrada?.isIntersecting ?? false),
      )
      observador.observe(campo)
    }, 250)
    return () => {
      window.clearInterval(procurar)
      observador?.disconnect()
    }
  }, [])

  return (
    <div
      className={cn(
        '-mx-4 flex-none border-border border-t bg-surface-raised px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none dark:bg-surface-strong',
        campoAVista ? 'pointer-events-none translate-y-2 opacity-0' : 'opacity-100',
      )}
      aria-hidden={campoAVista || undefined}
    >
      <button
        type="button"
        tabIndex={campoAVista ? -1 : undefined}
        onClick={() => {
          const campo = acharCampoDeComentario()
          if (!campo) return
          campo.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
          campo.focus({ preventScroll: true })
        }}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 text-left text-detail text-fg-placeholder"
      >
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className="size-3.5 flex-none text-fg-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 2.5h8v5.5H5.5L3 10V8H2z" />
        </svg>
        {/* Nome proprio: "Comentar entre o time" ja e o botao de enviar do campo. */}
        Escrever um comentário
      </button>
    </div>
  )
}

function acharCampoDeComentario(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(
    '[role="dialog"] textarea[aria-label="Entre o time"]',
  )
}

/**
 * Uma linha dos detalhes. Sai da tela quando nao ha valor: "Sistema: —" ocupa a mesma
 * altura de um dado para nao dizer nada.
 */
export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim().length === 0) return null

  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 text-detail">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{value}</dd>
    </div>
  )
}
