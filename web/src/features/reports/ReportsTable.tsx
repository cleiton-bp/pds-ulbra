import { type MouseEvent, useRef } from 'react'
import { Link, useHref, useNavigate } from 'react-router-dom'
import type { ReportStateCountViewModel, ReportSummaryViewModel } from '@/contracts'
import {
  BlockedMark,
  CardTypeIcon,
  cardHeadline,
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
 * A lista do Trabalho como tabela: **uma linha por card, uma coluna por dado**, para
 * o olho correr de cima a baixo comparando — quem esta com que, o que vence, o que
 * importa mais. Tipo, numero, titulo, coluna, responsavel, prioridade, etiquetas,
 * prazo e quando chegou. O protocolo e a pagina de onde o relato veio ficam no card
 * aberto.
 *
 * **O titulo e o link** do card: Enter e o clique abrem, o meio do mouse abre em
 * outra aba. O resto da linha tambem abre, por conveniencia de quem usa o mouse — o
 * teclado tem o link, uma parada por linha.
 *
 * **Na tela estreita, as colunas de apoio saem**, da menos para a mais necessaria:
 * quando chegou, as etiquetas, o prazo e a prioridade, o responsavel — e, no celular,
 * a coluna vai para debaixo do titulo. O prazo vencido ou perto nunca some: sem a
 * coluna dele, vem embaixo do titulo tambem. O titulo nunca fica espremido. Se ainda
 * assim nao couber, a tabela rola para o lado dentro da propria moldura, e nunca a
 * pagina.
 */
export function ReportsTable({
  reports,
  colunas,
  soonDays,
  destacados,
}: {
  reports: ReportSummaryViewModel[]
  /** As colunas do projeto, para o tom da coluna de cada card. */
  colunas: ReportStateCountViewModel[] | null
  soonDays: number
  /** Os cards que outra pessoa acabou de mudar: a linha se acende por um instante. */
  destacados?: ReadonlySet<string>
}) {
  const area = useRef<HTMLDivElement>(null)
  useKeepFocus(area)

  return (
    // A linha com o foco que sai da lista por outra pessoa deixa o foco na vizinha, e
    // nao no comeco da pagina (ver `useKeepFocus`).
    <div ref={area} data-focus-group className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-detail">
        <Cabecalho />
        <tbody>
          {reports.map((report) => (
            <Linha
              key={report.PublicId}
              report={report}
              colunas={colunas}
              soonDays={soonDays}
              destacada={destacados?.has(report.PublicId) ?? false}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Linha({
  report,
  colunas,
  soonDays,
  destacada,
}: {
  report: ReportSummaryViewModel
  colunas: ReportStateCountViewModel[] | null
  soonDays: number
  destacada: boolean
}) {
  const navigate = useNavigate()
  const endereco = useHref(report.PublicId)
  const titulo = cardHeadline(report)
  const tom = statusTone(report.StatePublicId, colunas)
  const prazoUrgente =
    report.DueDate !== null && !report.Finished && dueState(report.DueDate, soonDays) !== 'later'

  // O clique em qualquer ponto da linha abre o card — menos no proprio link e nos
  // botoes, que ja fazem o que e deles. **Nao abre quem esta selecionando texto**: o
  // numero e como o time fala do card, e copia-lo nao pode abrir o card (e abrir
  // registra leitura). O segundo clique de um duplo clique tambem nao: o primeiro ja
  // abriu.
  const abrir = (evento: MouseEvent) => {
    if ((evento.target as Element).closest('a, button')) return
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
    if (evento.button !== 1 || (evento.target as Element).closest('a, button')) return
    window.open(endereco, '_blank', 'noopener')
  }

  return (
    <tr
      onClick={abrir}
      onAuxClick={meio}
      data-highlighted={destacada || undefined}
      className={cn(
        'cursor-pointer border-border border-b transition-colors last:border-b-0 hover:bg-surface-raised',
        destacada && 'bg-chip-blue-surface',
      )}
    >
      {/* A faixa do destaque mora na primeira celula: o fundo sozinho quase nao se ve,
          e cor nunca vai sozinha. Some devagar; o resto da linha responde na hora. */}
      <td
        className={cn(
          'relative w-9 py-2 pr-1 pl-3',
          'before:pointer-events-none before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r-full before:bg-chip-blue-glyph before:opacity-0 before:transition-opacity before:duration-700',
          destacada && 'before:opacity-100',
        )}
      >
        <CardTypeIcon card={report} />
      </td>
      <td className="whitespace-nowrap px-2 py-2 font-medium font-mono text-fg-muted">
        #{report.Number}
      </td>
      <td className="w-full min-w-40 max-w-0 px-2 py-2 sm:min-w-64">
        {/* Link, e nao botao: e o que faz o card ter endereco proprio, abrir em outra
            aba e sobreviver a um recarregamento da pagina. */}
        <Link
          to={report.PublicId}
          className={cn(
            'block truncate text-body underline-offset-2 hover:underline',
            titulo.titled ? 'text-fg' : 'text-fg-muted',
          )}
        >
          {titulo.text}
        </Link>
        {/* O que perdeu a coluna propria na tela estreita vem embaixo do titulo: a
            coluna do card no celular, e o prazo vencido ou perto ate a tela larga. */}
        <span className="flex flex-wrap items-center gap-x-1.5">
          {report.Parent && <ParentLine parent={report.Parent} className="mt-0.5 max-w-full" />}
          {report.DuplicateOf && (
            <ParentLine
              parent={report.DuplicateOf}
              prefix="Duplicado de"
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
            <span className="mt-1 flex sm:hidden">
              <StatusLozenge name={report.StateName} tone={tom} />
            </span>
          )}
          {prazoUrgente && report.DueDate && (
            <span className="mt-1 text-caption text-fg-muted xl:hidden">
              <DueChip
                day={report.DueDate}
                soonDays={soonDays}
                compact
                finished={report.Finished}
              />
            </span>
          )}
        </span>
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 sm:table-cell">
        {report.StateName ? (
          <StatusLozenge name={report.StateName} tone={tom} className="max-w-40" />
        ) : (
          <span className="text-fg-muted">Sem coluna</span>
        )}
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 md:table-cell">
        {report.Assignee ? (
          <span className="flex items-center gap-2">
            <PersonAvatar pessoa={report.Assignee} />
            <span className="max-w-32 truncate text-fg" aria-hidden>
              {report.Assignee.Name || 'Sem nome'}
            </span>
          </span>
        ) : (
          <span className="text-fg-muted">Sem responsável</span>
        )}
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 text-fg xl:table-cell">
        {report.Priority ? <PriorityIcon priority={report.Priority} /> : null}
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 min-[1400px]:table-cell">
        <Etiquetas report={report} />
      </td>
      <td className="hidden whitespace-nowrap px-2 py-2 text-fg-muted xl:table-cell">
        {report.DueDate ? (
          <DueChip
            day={report.DueDate}
            soonDays={soonDays}
            compact
            bare
            finished={report.Finished}
          />
        ) : null}
      </td>
      <td className="hidden whitespace-nowrap py-2 pr-3 pl-2 text-fg-muted 2xl:table-cell">
        {/* O relativo responde "isto e recente?"; a data exata fica no `title`, para
            quem precisa dela. */}
        <time dateTime={report.CreatedAt} title={formatDateTime(report.CreatedAt)}>
          {formatRelative(report.CreatedAt)}
        </time>
      </td>
    </tr>
  )
}

/** Os nomes das colunas. O do tipo fica so para leitor de tela: o desenho ja diz. */
function Cabecalho() {
  const th = 'px-2 py-2 font-medium'
  return (
    <thead className="bg-surface-raised text-caption text-fg-muted">
      <tr className="border-border border-b">
        <th scope="col" className="w-9 py-2 pr-1 pl-3 font-medium">
          <span className="sr-only">Tipo</span>
        </th>
        <th scope="col" className={th}>
          Nº
        </th>
        <th scope="col" className={th}>
          Título
        </th>
        <th scope="col" className={cn(th, 'hidden sm:table-cell')}>
          Coluna
        </th>
        <th scope="col" className={cn(th, 'hidden md:table-cell')}>
          Responsável
        </th>
        <th scope="col" className={cn(th, 'hidden xl:table-cell')}>
          Prioridade
        </th>
        <th scope="col" className={cn(th, 'hidden min-[1400px]:table-cell')}>
          Etiquetas
        </th>
        <th scope="col" className={cn(th, 'hidden xl:table-cell')}>
          Prazo
        </th>
        <th scope="col" className={cn('py-2 pr-3 pl-2 font-medium', 'hidden 2xl:table-cell')}>
          Criado
        </th>
      </tr>
    </thead>
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
