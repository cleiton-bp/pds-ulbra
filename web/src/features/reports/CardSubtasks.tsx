import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type CardParentViewModel,
  MAX_CARD_TITLE_LENGTH,
  type ReportDetailViewModel,
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
  type TeamMemberViewModel,
} from '@/contracts'
import { describeError, projectReportService, projectTeamService } from '@/data'
import { useCardDraft, useGuardedCardLink } from '@/features/reports/cardDrafts'
import { cardHeadline, PersonAvatar, StatusLozenge, statusTone } from '@/features/reports/cardLook'
import { Button } from '@/shared/components/Button'
import { DropdownGroup, DropdownItem, DropdownMenu } from '@/shared/components/DropdownMenu'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { cn } from '@/shared/lib/cn'

/**
 * O pai, no alto da subtarefa aberta: o numero e o titulo, com o link para abrir o pai.
 */
export function ParentLink({ parent }: { parent: CardParentViewModel }) {
  // Com texto por salvar no card, ir ao pai pergunta antes.
  const guardar = useGuardedCardLink()
  return (
    <p className="mb-2 flex min-w-0 items-center gap-1.5 text-detail text-fg-muted">
      <span className="flex-none">Subtarefa de</span>
      <Link
        to={`../${parent.PublicId}`}
        onClick={(evento) => guardar(evento, `../${parent.PublicId}`)}
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
 * **A subtarefa mora aqui dentro.** Ela nao aparece no quadro, na lista nem no backlog:
 * o pai mostra o progresso na frente, e e daqui que o time cria, marca como feita,
 * escolhe o responsavel e abre cada uma (a coluna, os comentarios, o resto). Quem
 * procura a sua acha o pai pelo "Meus cards", pelo filtro de responsavel ou pela busca.
 *
 * **Um nivel so**: a subtarefa nao tem esta secao. Ela nasce na primeira coluna e sem
 * responsavel. O progresso conta as que terminaram, pela mesma regra do prazo: relato
 * encerrado, ou card na ultima coluna.
 *
 * A lista e a de sempre, com `parent`, e e relida quando o card aberto muda (`versao`)
 * — inclusive pelo tempo real: a subtarefa que outra pessoa muda avisa o pai. As que
 * foram para o arquivo vem embaixo, apagadas: e daqui que se abre uma para desarquivar.
 *
 * **O circulo marca.** O clique leva a subtarefa para a ultima coluna, e o segundo a
 * devolve para a primeira — o atalho do movimento, sem abrir a subtarefa. Com uma
 * coluna so nao ha onde terminar (a unica e a entrada da fila), e o circulo volta a ser
 * so o sinal.
 */
export function CardSubtasks({
  projectPublicId,
  card,
  colunas,
  versao,
  aoCriar,
  aoMudarSubtarefa,
}: {
  projectPublicId: string
  card: ReportSummaryViewModel
  colunas: ReportStateCountViewModel[] | null
  /** Sobe quando o card aberto mudou: a lista e relida, sem esvaziar. */
  versao: number
  /** A subtarefa nasceu: o pai e relido, e o progresso da frente dele tambem. */
  aoCriar: (subtarefa: ReportDetailViewModel) => void
  /**
   * Uma subtarefa foi marcada como feita, reaberta ou mudou de responsavel: o pai se
   * acerta — e, com filtro de responsavel ou busca, a lista e relida.
   */
  aoMudarSubtarefa?: (subtarefa: ReportSummaryViewModel) => void
}) {
  const arquivado = card.ArchivedAt !== null
  const temSubtarefas = card.SubtaskCount > 0
  // Criada daqui: o contador do card aberto ainda e o de antes (zero) ate o pai ser
  // relido, e a releitura logo depois de criar nao pode pular a pergunta.
  const criouAqui = useRef(false)
  const { data, failed, reload, revalidate } = useAsyncResource(
    useCallback(async () => {
      // O contador da frente do card ja diz quando nao ha nenhuma fora do arquivo: nem
      // pergunta. As arquivadas nao entram no contador, e sao lidas sempre.
      const [ativas, arquivadas] = await Promise.all([
        temSubtarefas || criouAqui.current
          ? projectReportService
              .listReports(projectPublicId, 1, null, false, {
                pageSize: 100,
                parent: card.PublicId,
              })
              .then((pagina) => pagina.reports)
          : Promise.resolve([]),
        projectReportService
          .listReports(projectPublicId, 1, null, true, { pageSize: 100, parent: card.PublicId })
          .then((pagina) => pagina.reports),
      ])
      // Na ordem em que nasceram, como uma lista de passos.
      const porNumero = (a: ReportSummaryViewModel, b: ReportSummaryViewModel) =>
        a.Number - b.Number
      return { ativas: [...ativas].sort(porNumero), arquivadas: [...arquivadas].sort(porNumero) }
    }, [projectPublicId, card.PublicId, temSubtarefas]),
  )
  const subtarefas = data?.ativas ?? null
  const arquivadas = data?.arquivadas ?? []

  const lida = useRef(versao)
  useEffect(() => {
    if (lida.current === versao) return
    lida.current = versao
    revalidate()
  }, [versao, revalidate])

  const [titulo, setTitulo] = useState('')
  const [criando, setCriando] = useState(false)

  // O Esc com texto no campo limpa so o campo; o seguinte fecha o card.
  const campo = useRef<HTMLFormElement>(null)
  useCardDraft({ sujo: false, cancelar: titulo ? () => setTitulo('') : undefined }, campo)
  const guardar = useGuardedCardLink()

  // A primeira e a ultima coluna ativa: o circulo leva de uma a outra. Com uma so, nao
  // ha onde terminar.
  const ativas = (colunas ?? []).filter((coluna) => coluna.IsActive && coluna.StatePublicId)
  const primeira = ativas.length > 1 ? ativas[0] : undefined
  const ultima = ativas.length > 1 ? ativas[ativas.length - 1] : undefined
  const [marcando, setMarcando] = useState<string | null>(null)

  // Quem esta no time, para o responsavel de cada subtarefa: lido na primeira vez que
  // alguem abre a escolha, e nao a cada card aberto.
  const [time, setTime] = useState<TeamMemberViewModel[] | 'falhou' | null>(null)
  const lerTime = () => {
    if (Array.isArray(time)) return
    projectTeamService
      .listMembers(projectPublicId)
      .then(setTime)
      .catch(() => setTime('falhou'))
  }

  async function marcar(item: ReportSummaryViewModel) {
    const destino = item.Finished ? primeira : ultima
    if (!destino?.StatePublicId || marcando) return
    setMarcando(item.PublicId)
    try {
      const salvo = await projectReportService.moveReport(projectPublicId, item.PublicId, {
        StatePublicId: destino.StatePublicId,
      })
      toast.done(
        item.Finished
          ? `#${item.Number} voltou para ${destino.StateName ?? 'a primeira coluna'}.`
          : `#${item.Number} marcada como feita.`,
      )
      revalidate()
      aoMudarSubtarefa?.(salvo)
    } catch (falha) {
      toast.error(
        `Não deu para ${item.Finished ? 'reabrir' : 'marcar como feita'} a #${item.Number}. ${describeError(falha)}`,
      )
    } finally {
      setMarcando(null)
    }
  }

  async function atribuir(item: ReportSummaryViewModel, pessoa: TeamMemberViewModel | null) {
    if ((item.Assignee?.UserPublicId ?? null) === (pessoa?.UserPublicId ?? null)) return
    try {
      const salvo = await projectReportService.setAssignee(projectPublicId, item.PublicId, {
        UserPublicId: pessoa?.UserPublicId ?? null,
      })
      toast.done(
        pessoa
          ? `#${item.Number} agora está com ${pessoa.Name ?? pessoa.Email ?? 'a pessoa escolhida'}.`
          : `#${item.Number} ficou sem responsável.`,
      )
      revalidate()
      // O responsavel da subtarefa decide se o pai passa no filtro de responsavel.
      aoMudarSubtarefa?.(salvo)
    } catch (falha) {
      toast.error(`Não deu para trocar o responsável da #${item.Number}. ${describeError(falha)}`)
    }
  }

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
      // So limpa o que foi enviado: o que se digitou enquanto criava fica no campo.
      setTitulo((atual) => (atual.trim() === texto ? '' : atual))
      toast.done(`#${nova.Number} criada.`)
      criouAqui.current = true
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

  /** Uma subtarefa na lista: o circulo, o numero, o titulo, a coluna e o responsavel. */
  const linha = (item: ReportSummaryViewModel) => {
    const daParaMexer = !arquivado && item.ArchivedAt === null
    return (
      <li key={item.PublicId} className="flex min-w-0 items-center gap-2 px-2.5 py-2">
        {primeira && ultima && daParaMexer ? (
          <button
            type="button"
            onClick={() => void marcar(item)}
            disabled={marcando !== null}
            aria-label={
              item.Finished ? `Reabrir #${item.Number}` : `Marcar #${item.Number} como feita`
            }
            title={item.Finished ? 'Reabrir' : 'Marcar como feita'}
            className="flex flex-none rounded-full hover:opacity-80 disabled:opacity-50"
          >
            <Feita feita={item.Finished} marcavel />
          </button>
        ) : (
          <Feita feita={item.Finished} />
        )}
        <span className="flex-none font-mono text-caption text-fg-muted">#{item.Number}</span>
        <Link
          to={`../${item.PublicId}`}
          onClick={(evento) => guardar(evento, `../${item.PublicId}`)}
          className={cn(
            'min-w-0 flex-1 truncate text-detail underline-offset-2 hover:underline',
            item.Finished || item.ArchivedAt !== null ? 'text-fg-muted' : 'text-fg',
            item.Finished && 'line-through',
          )}
        >
          {cardHeadline(item).text}
        </Link>
        {item.ArchivedAt !== null ? (
          <span className="flex-none text-caption text-fg-muted">Arquivada</span>
        ) : (
          item.StateName && (
            <StatusLozenge
              name={item.StateName}
              tone={statusTone(item.StatePublicId, colunas)}
              className="max-w-28 flex-none"
            />
          )
        )}
        {daParaMexer ? (
          <EscolherResponsavel
            item={item}
            time={time}
            aoAbrir={lerTime}
            aoEscolher={(pessoa) => void atribuir(item, pessoa)}
          />
        ) : (
          item.Assignee && <PersonAvatar pessoa={item.Assignee} />
        )}
      </li>
    )
  }

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
          {subtarefas.map(linha)}
        </ul>
      )}

      {arquivadas.length > 0 && (
        <div className="mb-3">
          <h4 className="mb-1.5 text-caption text-fg-muted">
            {arquivadas.length === 1 ? '1 arquivada' : `${arquivadas.length} arquivadas`}
          </h4>
          <ul className="divide-y divide-border rounded-lg border border-border border-dashed">
            {arquivadas.map(linha)}
          </ul>
        </div>
      )}

      {arquivado ? (
        total === 0 &&
        arquivadas.length === 0 && <p className="text-detail text-fg-muted">Sem subtarefas.</p>
      ) : (
        <form ref={campo} onSubmit={(evento) => void criar(evento)} className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Criar subtarefa</span>
            <input
              type="text"
              value={titulo}
              onChange={(evento) => setTitulo(evento.target.value)}
              placeholder="Criar subtarefa: o que precisa ser feito?"
              maxLength={MAX_CARD_TITLE_LENGTH}
              // Nao trava enquanto cria: o campo travado perdia o foco, e o que a pessoa
              // digitava em seguida se perdia. O segundo Enter e ignorado em `criar`.
              aria-busy={criando}
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

/**
 * O responsavel da subtarefa, ali na linha: o avatar (ou o lugar vazio) abre a escolha
 * — "Ninguem" e quem esta no time, como no campo do card. Quem saiu do time continua na
 * subtarefa como registro, e nao se escolhe de novo.
 */
function EscolherResponsavel({
  item,
  time,
  aoAbrir,
  aoEscolher,
}: {
  item: ReportSummaryViewModel
  time: TeamMemberViewModel[] | 'falhou' | null
  aoAbrir: () => void
  aoEscolher: (pessoa: TeamMemberViewModel | null) => void
}) {
  const atual = item.Assignee
  return (
    <DropdownMenu
      width="w-56"
      onOpenChange={(aberto) => aberto && aoAbrir()}
      trigger={
        <button
          type="button"
          aria-label={
            atual
              ? `Responsável pela #${item.Number}: ${atual.Name || 'Sem nome'}. Trocar`
              : `Escolher o responsável pela #${item.Number}`
          }
          className="flex flex-none rounded-full hover:opacity-80"
        >
          {atual ? (
            <PersonAvatar pessoa={atual} />
          ) : (
            <span
              title="Sem responsável"
              className="flex size-6 items-center justify-center rounded-full border border-border border-dashed text-fg-muted"
            >
              <svg
                viewBox="0 0 12 12"
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                aria-hidden
              >
                <circle cx="6" cy="4.2" r="2" />
                <path d="M2.5 10.5a3.5 3.5 0 0 1 7 0" />
              </svg>
            </span>
          )}
        </button>
      }
    >
      <DropdownGroup>
        <DropdownItem onSelect={() => aoEscolher(null)}>Ninguém</DropdownItem>
        {time === null && <p className="px-2.5 py-2 text-detail text-fg-muted">Carregando…</p>}
        {time === 'falhou' && (
          <p className="px-2.5 py-2 text-detail text-fg-muted">Não deu para carregar o time.</p>
        )}
        {Array.isArray(time) &&
          time.map((pessoa) => (
            <DropdownItem key={pessoa.UserPublicId} onSelect={() => aoEscolher(pessoa)}>
              <span className="min-w-0 truncate">
                {pessoa.Name ?? pessoa.Email ?? 'Sem nome'}
                {pessoa.UserPublicId === atual?.UserPublicId && (
                  <span className="text-fg-muted"> · com a subtarefa</span>
                )}
              </span>
            </DropdownItem>
          ))}
      </DropdownGroup>
    </DropdownMenu>
  )
}

/**
 * Se a subtarefa terminou: o visto, com a palavra para quem nao ve. Dentro do botao
 * (`marcavel`), a palavra fica no nome do botao, e a borda passa a de controle.
 */
function Feita({ feita, marcavel = false }: { feita: boolean; marcavel?: boolean }) {
  return (
    <span
      className={cn(
        'flex size-4 flex-none items-center justify-center rounded-full border',
        feita
          ? 'border-chip-green-border bg-chip-green-surface text-chip-green-fg'
          : marcavel
            ? 'border-fg-muted'
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
      {!marcavel && <span className="sr-only">{feita ? 'Feita' : 'Por fazer'}</span>}
    </span>
  )
}
