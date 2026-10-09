import { type MouseEvent, type ReactNode, useEffect, useRef } from 'react'
import { Link, useHref, useNavigate } from 'react-router-dom'
import type { ReportStateCountViewModel, ReportSummaryViewModel } from '@/contracts'
import type { ReportSort, ReportSortField } from '@/data'
import {
  BlockedMark,
  CardTypeIcon,
  cardHeadline,
  headlineText,
  MoreLabels,
  ParentLine,
  PersonAvatar,
  PriorityIcon,
  StatusLozenge,
  SubtaskProgress,
  statusTone,
} from '@/features/reports/cardLook'
import { useKeepFocus } from '@/features/reports/useKeepFocus'
import { CardChip } from '@/shared/components/CardChip'
import { DueChip } from '@/shared/components/DueChip'
import { Skeleton } from '@/shared/components/Skeleton'
import { cn } from '@/shared/lib/cn'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'
import { dueState } from '@/shared/lib/dueDate'

/**
 * Onde cada coluna de apoio entra, pela largura **da area de trabalho** (`@container`)
 * e nao da janela: a janela inclui o menu lateral, e a coluna sumia com espaco
 * sobrando. Da menos para a mais necessaria saem quando chegou, a sprint, as
 * etiquetas, o prazo e a prioridade, o responsavel e a coluna — e o que sai vai para
 * debaixo do titulo. O prazo e a prioridade nunca saem antes de "Criado".
 */
const COM_COLUNA = 'hidden @min-[34rem]:table-cell'
const COM_RESPONSAVEL = 'hidden @min-[44rem]:table-cell'
const COM_PRIORIDADE_E_PRAZO = 'hidden @min-[52rem]:table-cell'
const COM_ETIQUETAS = 'hidden @min-[60rem]:table-cell'
const COM_SPRINT = 'hidden @min-[68rem]:table-cell'
const COM_DATA = 'hidden @min-[74rem]:table-cell'

/** A direcao de cada ordem, dita por extenso para quem nao ve a seta. */
const SENTIDO: Record<ReportSortField, Record<ReportSort['dir'], string>> = {
  number: { asc: 'do menor para o maior', desc: 'do maior para o menor' },
  state: { asc: 'na ordem do quadro', desc: 'na ordem contrária à do quadro' },
  assignee: { asc: 'de A a Z', desc: 'de Z a A' },
  priority: { asc: 'da mais baixa para a mais alta', desc: 'da mais alta para a mais baixa' },
  due: { asc: 'do mais perto para o mais longe', desc: 'do mais longe para o mais perto' },
  created: { asc: 'do mais antigo para o mais novo', desc: 'do mais novo para o mais antigo' },
  updated: {
    asc: 'do que mudou há mais tempo para o mais recente',
    desc: 'do que mudou agora para o que mudou há mais tempo',
  },
}

/** A ordem de sempre, quando ninguem escolheu outra: o mais novo primeiro. */
const ORDEM_DE_SEMPRE: ReportSort = { field: 'created', dir: 'desc' }

/**
 * A lista do Trabalho como tabela: **uma linha por card, uma coluna por dado**, para
 * o olho correr de cima a baixo comparando — quem esta com que, o que vence, o que
 * importa mais. Tipo, numero, titulo, coluna, responsavel, prioridade, etiquetas,
 * prazo, a sprint (com as sprints ligadas) e quando chegou. O protocolo e a pagina de
 * onde o relato veio ficam no card aberto.
 *
 * **O titulo e o link** do card: Enter e o clique abrem, o meio do mouse abre em
 * outra aba. O resto da linha tambem abre, por conveniencia de quem usa o mouse — o
 * teclado tem o link, uma parada por linha.
 *
 * **Os cabecalhos ordenam** (`aoOrdenar`): o primeiro clique na direcao que responde
 * a pergunta de quem clica, o segundo inverte. Quem ordena e a API — a lista vem por
 * paginas, e ordenar aqui ordenaria so o que ja chegou.
 *
 * **Com `selecao`, cada linha ganha uma caixa** para as acoes em lote, e o cabecalho
 * marca ou desmarca as linhas que estao na tela. Shift com o clique (ou com o espaco)
 * marca do ultimo marcado ate ali. A linha marcada muda de fundo e ganha a faixa a
 * esquerda: conferir o que se marcou nao depende da caixinha.
 *
 * **Na area estreita, as colunas de apoio saem** e o essencial vem embaixo do titulo
 * — a coluna, quem esta com o card, a prioridade e o prazo vencido ou perto. O titulo
 * nunca fica espremido. Se ainda assim nao couber, a tabela rola para o lado dentro da
 * propria moldura, e nunca a pagina. Na area larga, o cabecalho fica preso no alto ao
 * rolar.
 */
export function ReportsTable({
  reports,
  colunas,
  soonDays,
  destacados,
  selecao,
  ordem = null,
  aoOrdenar,
  comSprint = false,
  buscando = false,
}: {
  reports: ReportSummaryViewModel[]
  /** As colunas do projeto, para o tom da coluna de cada card. */
  colunas: ReportStateCountViewModel[] | null
  soonDays: number
  /** Os cards que outra pessoa acabou de mudar: a linha se acende por um instante. */
  destacados?: ReadonlySet<string>
  /** As caixas das acoes em lote: quem esta marcado, e como marcar. */
  selecao?: Selecao
  /** A ordem escolhida; nula e a de sempre, do mais novo para o mais antigo. */
  ordem?: ReportSort | null
  /** Sem ele, os cabecalhos sao so texto. */
  aoOrdenar?: (campo: ReportSortField) => void
  /** Com as sprints ligadas: a coluna da sprint de cada card. */
  comSprint?: boolean
  /**
   * Relendo com outro filtro ou outra ordem: a tabela de antes esmaece, e diz que esta
   * ocupada — sem isso, a lista velha parecia o resultado.
   */
  buscando?: boolean
}) {
  const area = useRef<HTMLDivElement>(null)
  useKeepFocus(area)
  const marcadas = selecao
    ? reports.filter((report) => selecao.marcados.has(report.PublicId)).length
    : 0
  /** O ultimo marcado ou desmarcado: de onde o Shift marca o intervalo. */
  const ultimo = useRef<string | null>(null)

  const marcarLinha = (id: string, marcar: boolean, intervalo: boolean) => {
    if (!selecao) return
    const de = ultimo.current
      ? reports.findIndex((report) => report.PublicId === ultimo.current)
      : -1
    const ate = reports.findIndex((report) => report.PublicId === id)
    ultimo.current = id
    if (intervalo && de >= 0 && ate >= 0) {
      const [inicio, fim] = de < ate ? [de, ate] : [ate, de]
      selecao.definir(
        reports.slice(inicio, fim + 1).map((report) => report.PublicId),
        marcar,
      )
      return
    }
    selecao.definir([id], marcar)
  }

  const vigente = ordem ?? ORDEM_DE_SEMPRE

  return (
    // A linha com o foco que sai da lista por outra pessoa deixa o foco na vizinha, e
    // nao no comeco da pagina (ver `useKeepFocus`).
    //
    // A moldura corta (`overflow-clip`) sem virar area de rolagem: e o que deixa o
    // cabecalho preso no alto da pagina. So a area estreita rola para o lado.
    <div
      ref={area}
      data-focus-group
      aria-busy={buscando || undefined}
      className={cn(
        '@container overflow-clip rounded-lg border border-border transition-opacity',
        buscando && 'opacity-50',
      )}
    >
      <div className="overflow-x-auto @min-[64rem]:overflow-x-visible">
        <table className="w-full border-collapse text-left text-detail">
          <Cabecalho
            ordem={vigente}
            aoOrdenar={aoOrdenar}
            comSprint={comSprint}
            selecao={
              selecao
                ? {
                    todas: marcadas === reports.length,
                    algumas: marcadas > 0 && marcadas < reports.length,
                    aoMarcar: (marcar) =>
                      selecao.definir(
                        reports.map((report) => report.PublicId),
                        marcar,
                      ),
                  }
                : undefined
            }
          />
          <tbody>
            {reports.map((report) => (
              <Linha
                key={report.PublicId}
                report={report}
                colunas={colunas}
                soonDays={soonDays}
                destacada={destacados?.has(report.PublicId) ?? false}
                marcada={selecao?.marcados.has(report.PublicId)}
                aoMarcar={selecao ? marcarLinha : undefined}
                comSprint={comSprint}
                data={vigente.field === 'updated' ? 'updated' : 'created'}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Quem esta marcado na lista, e como marcar — uma linha, ou varias de uma vez. */
export interface Selecao {
  marcados: ReadonlySet<string>
  definir: (ids: string[], marcar: boolean) => void
}

function Linha({
  report,
  colunas,
  soonDays,
  destacada,
  marcada,
  aoMarcar,
  comSprint,
  data,
}: {
  report: ReportSummaryViewModel
  colunas: ReportStateCountViewModel[] | null
  soonDays: number
  destacada: boolean
  /** Nulo sem caixas: a lista dos arquivados. */
  marcada: boolean | undefined
  aoMarcar?: (id: string, marcar: boolean, intervalo: boolean) => void
  comSprint: boolean
  /** Que data a ultima coluna mostra: quando chegou, ou a ultima mudanca. */
  data: 'created' | 'updated'
}) {
  const navigate = useNavigate()
  const endereco = useHref(report.PublicId)
  const titulo = cardHeadline(report)
  const tom = statusTone(report.StatePublicId, colunas)
  // O arquivado e o que terminou nao cobram prazo: nem cor, nem "vence hoje".
  const terminou = report.Finished || report.ArchivedAt !== null
  const prazoUrgente =
    report.DueDate !== null && !terminou && dueState(report.DueDate, soonDays) !== 'later'
  /** O Shift do clique, ou do espaco, que marca o intervalo. */
  const comShift = useRef(false)

  // O clique em qualquer ponto da linha abre o card — menos no proprio link e nos
  // botoes, que ja fazem o que e deles. **Nao abre quem esta selecionando texto**: o
  // numero e como o time fala do card, e copia-lo nao pode abrir o card (e abrir
  // registra leitura). O segundo clique de um duplo clique tambem nao: o primeiro ja
  // abriu.
  const abrir = (evento: MouseEvent) => {
    if ((evento.target as Element).closest('a, button, input, label')) return
    if (evento.detail > 1 || window.getSelection()?.toString()) return
    // Com a tecla de outra aba, a linha faz o que o link faria.
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey) {
      window.open(endereco, '_blank', 'noopener')
      return
    }
    navigate(report.PublicId)
  }

  // O botao do meio, fora do link: outra aba, como no link.
  const meio = (evento: MouseEvent) => {
    if (evento.button !== 1 || (evento.target as Element).closest('a, button, input, label')) return
    window.open(endereco, '_blank', 'noopener')
  }

  const quando = data === 'updated' ? report.UpdatedAt : report.CreatedAt

  return (
    <tr
      onClick={abrir}
      onAuxClick={meio}
      data-highlighted={destacada || undefined}
      data-selected={marcada || undefined}
      className={cn(
        'cursor-pointer border-border border-b transition-colors last:border-b-0 hover:bg-surface-raised',
        marcada && 'bg-accent/8',
        destacada && 'bg-chip-blue-surface',
      )}
    >
      {aoMarcar && (
        // A celula inteira marca: a caixa sozinha e pequena, e o clique ao lado dela abria
        // o card. A linha ignora o clique no `label`. A faixa da linha marcada mora aqui.
        <td
          className={cn(
            'w-8 p-0 transition-shadow',
            marcada && 'shadow-[inset_3px_0_0_var(--color-accent)]',
          )}
        >
          <label className="flex cursor-pointer items-center py-2.5 pr-1 pl-3">
            <input
              type="checkbox"
              aria-label={`Selecionar #${report.Number}: ${titulo.text}`}
              checked={marcada ?? false}
              // O clique que o espaco gera pode vir sem o Shift: o da tecla fica valendo.
              onClick={(evento) => {
                comShift.current = comShift.current || evento.shiftKey
              }}
              onKeyDown={(evento) => {
                if (evento.key === ' ') comShift.current = evento.shiftKey
              }}
              onChange={(evento) => {
                aoMarcar(report.PublicId, evento.target.checked, comShift.current)
                comShift.current = false
              }}
              className="size-4 cursor-pointer accent-accent"
            />
          </label>
        </td>
      )}
      {/* A faixa do destaque e uma sombra por dentro da celula, e nao um elemento
          posicionado: posicionado, ele passaria por cima do cabecalho preso. Some
          devagar; o resto da linha responde na hora. Cor nunca vai sozinha. */}
      <td
        className={cn(
          'w-9 py-2 pr-1 pl-3 transition-shadow duration-700',
          destacada && 'shadow-[inset_4px_0_0_var(--color-chip-blue-glyph)]',
        )}
      >
        <CardTypeIcon card={report} />
      </td>
      <td className="whitespace-nowrap px-2 py-2 font-medium font-mono text-fg-muted">
        #{report.Number}
      </td>
      <td className="w-full min-w-40 max-w-0 px-2 py-2 @min-[34rem]:min-w-48 @min-[74rem]:min-w-56">
        {/* Link, e nao botao: e o que faz o card ter endereco proprio, abrir em outra
            aba e sobreviver a um recarregamento da pagina. No celular, duas linhas. */}
        <Link
          to={report.PublicId}
          className={cn(
            'line-clamp-2 break-words text-body text-fg underline-offset-2 hover:underline',
            '@min-[34rem]:line-clamp-1',
            report.Closed && 'text-fg-muted',
          )}
        >
          {headlineText(titulo)}
        </Link>
        {/* O que perdeu a coluna propria na area estreita vem embaixo do titulo: a
            coluna do card, quem esta com ele, a prioridade e o prazo vencido ou perto. */}
        <span className="flex flex-wrap items-center gap-x-1.5">
          {report.Parent && <ParentLine parent={report.Parent} className="mt-0.5 max-w-full" />}
          {report.DuplicateOf && (
            <ParentLine
              parent={report.DuplicateOf}
              kind="duplicate"
              className="mt-0.5 max-w-full"
            />
          )}
          <BlockedMark card={report} className="mt-1" />
          {report.SubtaskCount > 0 && (
            <span className="mt-0.5 text-caption">
              <SubtaskProgress card={report} />
            </span>
          )}
          {report.StateName && (
            <span className="mt-1 flex @min-[34rem]:hidden">
              <StatusLozenge name={report.StateName} tone={tom} />
            </span>
          )}
          {report.Closed && (
            <span className="mt-1 flex @min-[34rem]:hidden">
              <Encerrado />
            </span>
          )}
          {report.Assignee && (
            <span className="mt-1 flex @min-[44rem]:hidden">
              <PersonAvatar pessoa={report.Assignee} />
            </span>
          )}
          {report.Priority && (
            <span className="mt-1 flex text-caption text-fg @min-[52rem]:hidden">
              <PriorityIcon priority={report.Priority} />
            </span>
          )}
          {prazoUrgente && report.DueDate && (
            <span className="mt-1 text-caption text-fg-muted @min-[52rem]:hidden">
              <DueChip day={report.DueDate} soonDays={soonDays} compact finished={terminou} />
            </span>
          )}
        </span>
      </td>
      <td className={cn('whitespace-nowrap px-2 py-2', COM_COLUNA)}>
        <span className="flex items-center gap-1.5">
          {report.StateName ? (
            <StatusLozenge name={report.StateName} tone={tom} className="max-w-32" />
          ) : (
            <span className="text-fg-muted">Sem coluna</span>
          )}
          {report.Closed && <Encerrado />}
        </span>
      </td>
      <td className={cn('whitespace-nowrap px-2 py-2', COM_RESPONSAVEL)}>
        {report.Assignee ? (
          <span className="flex items-center gap-2">
            <PersonAvatar pessoa={report.Assignee} />
            <span className="max-w-28 truncate text-fg" aria-hidden>
              {report.Assignee.Name || 'Sem nome'}
            </span>
          </span>
        ) : (
          <span className="text-fg-muted">Sem responsável</span>
        )}
      </td>
      <td className={cn('whitespace-nowrap px-2 py-2 text-fg', COM_PRIORIDADE_E_PRAZO)}>
        {report.Priority ? <PriorityIcon priority={report.Priority} /> : null}
      </td>
      <td className={cn('whitespace-nowrap px-2 py-2', COM_ETIQUETAS)}>
        <Etiquetas report={report} />
      </td>
      <td className={cn('whitespace-nowrap px-2 py-2 text-fg-muted', COM_PRIORIDADE_E_PRAZO)}>
        {report.DueDate ? (
          <DueChip day={report.DueDate} soonDays={soonDays} compact bare finished={terminou} />
        ) : null}
      </td>
      {comSprint && (
        <td className={cn('whitespace-nowrap px-2 py-2', COM_SPRINT)}>
          {report.Sprint ? (
            <span className="block max-w-28 truncate text-fg" title={sprintLabel(report)}>
              {sprintLabel(report)}
            </span>
          ) : (
            <span className="text-fg-muted">Backlog</span>
          )}
        </td>
      )}
      <td className={cn('whitespace-nowrap py-2 pr-3 pl-2 text-fg-muted', COM_DATA)}>
        {/* O relativo responde "isto e recente?"; a data exata fica no `title`, para
            quem precisa dela. */}
        <time dateTime={quando} title={formatDateTime(quando)}>
          {formatRelative(quando)}
        </time>
      </td>
    </tr>
  )
}

/** A sprint como a linha a escreve: a concluida vem marcada. */
function sprintLabel(report: ReportSummaryViewModel): string {
  if (!report.Sprint) return 'Backlog'
  return report.Sprint.State === 'Closed' ? `${report.Sprint.Name} (concluída)` : report.Sprint.Name
}

/**
 * O relato encerrado, ao lado da coluna: sem isto, o encerrado pelo botao parecia
 * aberto, e alguem pegava para trabalhar o que ja foi resolvido. O selo leva a
 * palavra — cor nunca sozinha.
 */
function Encerrado() {
  return (
    <span className="inline-flex flex-none items-center gap-1 rounded-sm border border-border bg-surface-sunken px-1.5 py-px text-caption text-fg-muted">
      <svg
        viewBox="0 0 12 12"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M2.5 6.3 4.8 8.6 9.5 3.9" />
      </svg>
      Encerrado
    </span>
  )
}

/** Os nomes das colunas, os que ordenam como botao. O do tipo fica so para leitor de tela. */
function Cabecalho({
  selecao,
  ordem,
  aoOrdenar,
  comSprint,
}: {
  selecao?: { todas: boolean; algumas: boolean; aoMarcar: (marcar: boolean) => void }
  ordem: ReportSort
  aoOrdenar?: (campo: ReportSortField) => void
  comSprint: boolean
}) {
  const th = 'px-2 py-2 font-medium'
  // O "algumas" nao tem atributo no HTML: e uma propriedade da caixa.
  const caixa = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (caixa.current) caixa.current.indeterminate = selecao?.algumas ?? false
  }, [selecao?.algumas])

  const ordenavel = (campo: ReportSortField, rotulo: string, className?: string) => (
    <Ordenavel
      campo={campo}
      rotulo={rotulo}
      ordem={ordem}
      aoOrdenar={aoOrdenar}
      className={className}
    />
  )

  return (
    // Preso no alto ao rolar, na area larga: "Prazo" e "Prioridade" vazios, e a caixa de
    // marcar todos, perdiam a referencia depois de dez linhas.
    <thead className="@min-[64rem]:sticky @min-[64rem]:top-0 bg-surface-raised text-caption text-fg-muted">
      <tr className="border-border border-b">
        {selecao && (
          <th scope="col" className="w-8 py-2 pl-3 font-medium">
            <input
              ref={caixa}
              type="checkbox"
              aria-label="Selecionar os cards desta página"
              checked={selecao.todas}
              onChange={(evento) => selecao.aoMarcar(evento.target.checked)}
              className="size-4 cursor-pointer accent-accent"
            />
          </th>
        )}
        <th scope="col" className="w-9 py-2 pr-1 pl-3 font-medium">
          <span className="sr-only">Tipo</span>
        </th>
        {ordenavel('number', 'Nº', th)}
        <th scope="col" className={th}>
          Título
        </th>
        {ordenavel('state', 'Coluna', cn(th, COM_COLUNA))}
        {ordenavel('assignee', 'Responsável', cn(th, COM_RESPONSAVEL))}
        {ordenavel('priority', 'Prioridade', cn(th, COM_PRIORIDADE_E_PRAZO))}
        <th scope="col" className={cn(th, COM_ETIQUETAS)}>
          Etiquetas
        </th>
        {ordenavel('due', 'Prazo', cn(th, COM_PRIORIDADE_E_PRAZO))}
        {comSprint && (
          <th scope="col" className={cn(th, COM_SPRINT)}>
            Sprint
          </th>
        )}
        {ordem.field === 'updated'
          ? ordenavel('updated', 'Atualizado', cn('py-2 pr-3 pl-2 font-medium', COM_DATA))
          : ordenavel('created', 'Criado', cn('py-2 pr-3 pl-2 font-medium', COM_DATA))}
      </tr>
    </thead>
  )
}

/**
 * Um cabecalho que ordena: o nome e a seta da direcao, com `aria-sort` na celula. Sem
 * `aoOrdenar`, so o nome.
 */
function Ordenavel({
  campo,
  rotulo,
  ordem,
  aoOrdenar,
  className,
}: {
  campo: ReportSortField
  rotulo: string
  ordem: ReportSort
  aoOrdenar?: (campo: ReportSortField) => void
  className?: string
}) {
  const ativa = ordem.field === campo
  const nome = rotulo === 'Nº' ? 'número' : rotulo.toLowerCase()
  let conteudo: ReactNode = rotulo
  if (aoOrdenar)
    conteudo = (
      <button
        type="button"
        onClick={() => aoOrdenar(campo)}
        title={ativa ? `Ordenado ${SENTIDO[campo][ordem.dir]}` : `Ordenar por ${nome}`}
        className={cn(
          '-mx-1 inline-flex items-center gap-1 rounded px-1 transition-colors hover:text-fg',
          ativa && 'text-fg',
        )}
      >
        {rotulo}
        <svg
          viewBox="0 0 12 12"
          className={cn('size-3 flex-none', !ativa && 'opacity-40')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {!ativa ? (
            <path d="m4 4.5 2-2 2 2M4 7.5l2 2 2-2" />
          ) : ordem.dir === 'asc' ? (
            <path d="M6 9.5v-7M3.5 5 6 2.5 8.5 5" />
          ) : (
            <path d="M6 2.5v7M3.5 7 6 9.5 8.5 7" />
          )}
        </svg>
        <span className="sr-only">
          {ativa ? `, ordenado ${SENTIDO[campo][ordem.dir]}` : `, ordenar por ${nome}`}
        </span>
      </button>
    )

  return (
    <th
      scope="col"
      aria-sort={ativa ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={className}
    >
      {conteudo}
    </th>
  )
}

/** Uma etiqueta e um "+2": a linha e para passar os olhos, e o card aberto mostra todas. */
function Etiquetas({ report }: { report: ReportSummaryViewModel }) {
  const [primeira, ...resto] = report.Labels
  if (!primeira) return null

  return (
    <span className="flex items-center gap-1">
      <CardChip color={primeira.Color}>{primeira.Name}</CardChip>
      {resto.length > 0 && <MoreLabels labels={resto} />}
    </span>
  )
}

/** A tabela carregando: a mesma moldura, com linhas de espera. */
export function ReportsTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="h-8 border-border border-b bg-surface-raised" />
      {['w-3/5', 'w-2/5', 'w-1/2', 'w-2/3'].map((largura) => (
        <div
          key={largura}
          className="flex items-center gap-3 border-border border-b px-3 py-2.5 last:border-b-0"
        >
          <Skeleton className="size-4" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className={`h-3 ${largura}`} />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      ))}
    </div>
  )
}
