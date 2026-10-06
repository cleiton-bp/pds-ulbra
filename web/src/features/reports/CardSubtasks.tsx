import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type CardParentViewModel,
  MAX_CARD_TITLE_LENGTH,
  type ReportDetailViewModel,
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { cardHeadline, PersonAvatar, StatusLozenge, statusTone } from '@/features/reports/cardLook'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { cn } from '@/shared/lib/cn'

/**
 * O pai, no alto da subtarefa aberta: o numero e o titulo, com o link para abrir o pai.
 */
export function ParentLink({ parent }: { parent: CardParentViewModel }) {
  return (
    <p className="mb-2 flex min-w-0 items-center gap-1.5 text-detail text-fg-muted">
      <span className="flex-none">Subtarefa de</span>
      <Link
        to={`../${parent.PublicId}`}
        className="flex min-w-0 items-center gap-1 text-fg underline-offset-2 hover:underline"
      >
        <span className="flex-none font-mono">#{parent.Number}</span>{' '}
        <span className="min-w-0 truncate">{parent.Headline}</span>
      </Link>
    </p>
  )
}

/**
 * As subtarefas do card aberto — o relato ou o card do time —, e o "Criar subtarefa".
 *
 * **Um nivel so**, como no Jira: a subtarefa nao tem esta secao. A subtarefa nasce na
 * primeira coluna e sem responsavel; daqui ela anda pelo quadro como qualquer card. O
 * progresso conta as que terminaram, pela mesma regra do prazo: relato encerrado, ou
 * card na ultima coluna.
 *
 * A lista e a de sempre, com `parent`, e e relida quando o card aberto muda (`versao`)
 * — inclusive pelo tempo real: a subtarefa que outra pessoa move avisa o pai.
 */
export function CardSubtasks({
  projectPublicId,
  card,
  colunas,
  versao,
  aoCriar,
}: {
  projectPublicId: string
  card: ReportSummaryViewModel
  colunas: ReportStateCountViewModel[] | null
  /** Sobe quando o card aberto mudou: a lista e relida, sem esvaziar. */
  versao: number
  /** A subtarefa nasceu: quem abriu o dialogo poe ela na tela e acerta o pai. */
  aoCriar: (subtarefa: ReportDetailViewModel) => void
}) {
  const arquivado = card.ArchivedAt !== null
  const temSubtarefas = card.SubtaskCount > 0
  const {
    data: subtarefas,
    failed,
    reload,
    revalidate,
  } = useAsyncResource(
    useCallback(async () => {
      // O contador da frente do card ja diz quando nao ha nenhuma: nem pergunta. Quando
      // ele passa de zero — a criada aqui, ou a de outra pessoa pelo tempo real —, a
      // leitura muda e a lista vem.
      if (!temSubtarefas) return []
      const pagina = await projectReportService.listReports(projectPublicId, 1, null, false, {
        pageSize: 100,
        parent: card.PublicId,
      })
      // Na ordem em que nasceram, como uma lista de passos.
      return [...pagina.reports].sort((a, b) => a.Number - b.Number)
    }, [projectPublicId, card.PublicId, temSubtarefas]),
  )

  const lida = useRef(versao)
  useEffect(() => {
    if (lida.current === versao) return
    lida.current = versao
    revalidate()
  }, [versao, revalidate])

  const [titulo, setTitulo] = useState('')
  const [criando, setCriando] = useState(false)

  async function criar(evento: FormEvent) {
    evento.preventDefault()
    const texto = titulo.trim()
    if (!texto || criando) return
    setCriando(true)
    try {
      const nova = await projectReportService.createTeamCard(projectPublicId, {
        Title: texto,
        Description: null,
        StatePublicId: null,
        ParentPublicId: card.PublicId,
      })
      setTitulo('')
      toast.done(`#${nova.Number} criada.`)
      revalidate()
      aoCriar(nova)
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setCriando(false)
    }
  }

  const total = subtarefas?.length ?? card.SubtaskCount
  const feitas = subtarefas ? subtarefas.filter((item) => item.Finished).length : card.SubtasksDone

  return (
    <section aria-labelledby={`subtarefas-${card.PublicId}`} className="mt-1">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 id={`subtarefas-${card.PublicId}`} className="font-semibold text-detail text-fg">
          Subtarefas
        </h3>
        {total > 0 && (
          <span className="text-caption text-fg-muted tabular-nums">
            {feitas} de {total} {total === 1 ? 'feita' : 'feitas'}
          </span>
        )}
      </div>

      {total > 0 && (
        <div
          className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-label="Subtarefas feitas"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={feitas}
        >
          <div
            className="h-full rounded-full bg-chip-green-glyph transition-[width]"
            style={{ width: `${(feitas / total) * 100}%` }}
          />
        </div>
      )}

      {failed && (
        <p className="mb-2 text-detail text-fg-muted">
          Não deu para carregar as subtarefas.{' '}
          <button type="button" onClick={reload} className="underline underline-offset-2">
            Tentar de novo
          </button>
        </p>
      )}

      {subtarefas === null && !failed && card.SubtaskCount > 0 && (
        <Skeleton className="mb-2 h-8 w-full" />
      )}

      {subtarefas && subtarefas.length > 0 && (
        <ul className="mb-3 divide-y divide-border rounded-lg border border-border">
          {subtarefas.map((item) => (
            <li key={item.PublicId} className="flex min-w-0 items-center gap-2 px-2.5 py-2">
              <Feita feita={item.Finished} />
              <span className="flex-none font-mono text-caption text-fg-muted">#{item.Number}</span>
              <Link
                to={`../${item.PublicId}`}
                className={cn(
                  'min-w-0 flex-1 truncate text-detail underline-offset-2 hover:underline',
                  item.Finished ? 'text-fg-muted line-through' : 'text-fg',
                )}
              >
                {cardHeadline(item).text}
              </Link>
              {item.StateName && (
                <StatusLozenge
                  name={item.StateName}
                  tone={statusTone(item.StatePublicId, colunas)}
                  className="max-w-28 flex-none"
                />
              )}
              {item.Assignee && <PersonAvatar pessoa={item.Assignee} />}
            </li>
          ))}
        </ul>
      )}

      {arquivado ? (
        total === 0 && <p className="text-detail text-fg-muted">Sem subtarefas.</p>
      ) : (
        <form onSubmit={(evento) => void criar(evento)} className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Criar subtarefa</span>
            <input
              type="text"
              value={titulo}
              onChange={(evento) => setTitulo(evento.target.value)}
              placeholder="Criar subtarefa: o que precisa ser feito?"
              maxLength={MAX_CARD_TITLE_LENGTH}
              disabled={criando}
              className="h-8 w-full rounded-lg border border-border bg-surface-raised px-2.5 text-detail text-fg placeholder:text-fg-placeholder"
            />
          </label>
          <Button size="sm" type="submit" disabled={!titulo.trim() || criando}>
            {criando ? 'Criando…' : 'Criar'}
          </Button>
        </form>
      )}
    </section>
  )
}

/** Se a subtarefa terminou: o visto, com a palavra para quem nao ve. */
function Feita({ feita }: { feita: boolean }) {
  return (
    <span
      className={cn(
        'flex size-4 flex-none items-center justify-center rounded-full border',
        feita
          ? 'border-chip-green-border bg-chip-green-surface text-chip-green-fg'
          : 'border-border',
      )}
    >
      {feita && (
        <svg
          viewBox="0 0 12 12"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path d="M2.5 6.3 4.8 8.6 9.5 3.9" />
        </svg>
      )}
      <span className="sr-only">{feita ? 'Feita' : 'Por fazer'}</span>
    </span>
  )
}
