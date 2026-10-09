import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  MAX_SPRINT_GOAL_LENGTH,
  MAX_SPRINT_NAME_LENGTH,
  type ReportSummaryViewModel,
  type SprintCloseDestination,
  type SprintViewModel,
} from '@/contracts'
import { describeError, projectReportService, sprintService } from '@/data'
import { cardHeadline } from '@/features/reports/cardLook'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { Select } from '@/shared/components/Select'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { formatDay } from '@/shared/lib/datetime'

/**
 * As sprints que nao foram concluidas, lidas so com as sprints ligadas. A em andamento e a que o
 * quadro mostra.
 */
export function useSprints(projectPublicId: string, enabled: boolean) {
  const { data, failed, reload, revalidate } = useAsyncResource(
    useCallback(
      async () => (enabled ? await sprintService.listSprints(projectPublicId) : []),
      [projectPublicId, enabled],
    ),
  )
  const ativa = data?.find((sprint) => sprint.State === 'Active') ?? null
  return { sprints: data, ativa, failed, reload, revalidate }
}

/**
 * As sprints do filtro "Sprint" da lista: as que nao fecharam e, depois delas, as
 * concluidas, da mais recente para a mais antiga — lidas a parte (`closed`), so com
 * `enabled` (a lista na tela, com as sprints ligadas). O Backlog, o quadro e o card
 * continuam com `useSprints`, sem as concluidas: a concluida nao recebe card.
 *
 * `abertas` e a leitura de `useSprints`, que a tela ja renova a cada mudanca. Quando
 * muda o que o filtro mostra — uma sprint nova, apagada, renomeada, iniciada ou
 * concluida —, esta lista e relida por tras, sem sair da tela: a sprint que acabou de
 * ser concluida passa para o grupo das concluidas, e o filtro nela continua. Os
 * numeros (cards e pontos) nao contam: o filtro so mostra o nome.
 *
 * Nula enquanto le, e sem `enabled`. Falhando, fica com as abertas: da para filtrar
 * por elas, e a concluida escolhida antes sai do filtro, como a apagada.
 */
export function useSprintsForFilter(
  projectPublicId: string,
  enabled: boolean,
  abertas: SprintViewModel[] | null,
): SprintViewModel[] | null {
  const { data, failed, revalidate } = useAsyncResource(
    useCallback(
      async () =>
        enabled ? await sprintService.listSprints(projectPublicId, { closed: true }) : null,
      [projectPublicId, enabled],
    ),
  )

  // So com `enabled`: desligada, a leitura das abertas (vazia, ou a de antes) nao conta.
  const assinatura = enabled
    ? (abertas?.map((sprint) => `${sprint.PublicId}:${sprint.State}:${sprint.Name}`).join('|') ??
      null)
    : null
  const vista = useRef(assinatura)
  useEffect(() => {
    // Sem a lista (desligada, ou lida do zero): a proxima leitura e a primeira de novo.
    if (assinatura === null) {
      vista.current = null
      return
    }
    // A primeira leitura das abertas nao rele: esta lista acabou de ser lida junto.
    if (vista.current !== null && vista.current !== assinatura) revalidate()
    vista.current = assinatura
  }, [assinatura, revalidate])

  if (!enabled) return null
  return data ?? (failed ? abertas : null)
}

/** Os pontos como o time le: "2,5", sem o ".0". */
export function formatPoints(pontos: number): string {
  return pontos.toLocaleString('pt-BR')
}

/** "1 ponto", "2,5 pontos". */
export function pointsText(pontos: number): string {
  return `${formatPoints(pontos)} ${pontos === 1 ? 'ponto' : 'pontos'}`
}

/** "4 cards e 13 pontos" — ou so "4 cards", quando ninguem estimou. */
function cardsText(cards: number, pontos: number): string {
  const quantos = `${cards} ${cards === 1 ? 'card' : 'cards'}`
  return pontos > 0 ? `${quantos} e ${pointsText(pontos)}` : quantos
}

// ─── Os dias ─────────────────────────────────────────────────────────────────

/** Um dia (`aaaa-mm-dd`) do calendario de quem usa. */
function isoDay(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

function parseDay(dia: string): { ano: number; mes: number; dia: number } | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia)
  return partes ? { ano: Number(partes[1]), mes: Number(partes[2]), dia: Number(partes[3]) } : null
}

/**
 * O dia de hoje no relogio de quem usa (`aaaa-mm-dd`). **Nao e o de Greenwich**: a
 * noite, no Brasil, o UTC ja esta no dia seguinte, e a sprint iniciada as 22h
 * "comecava amanha". A API recebe este dia em `Today`.
 */
export function todayIso(hoje = new Date()): string {
  return isoDay(hoje)
}

/** O dia `dias` depois (ou antes) de `dia`, pelo calendario — sem fuso no meio. */
export function addDays(dia: string, dias: number): string {
  const partes = parseDay(dia)
  if (!partes) return dia
  return isoDay(new Date(partes.ano, partes.mes - 1, partes.dia + dias))
}

/** Quantos dias a sprint dura, contando o primeiro e o ultimo. */
function lengthInDays(sprint: Pick<SprintViewModel, 'StartsOn' | 'EndsOn'>): number {
  const a = parseDay(sprint.StartsOn)
  const b = parseDay(sprint.EndsOn)
  if (!a || !b) return 14
  const dias = Math.round(
    (Date.UTC(b.ano, b.mes - 1, b.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) / 86_400_000,
  )
  return Math.max(1, dias + 1)
}

const mesCurto = new Intl.DateTimeFormat('pt-BR', { month: 'short' })

/**
 * "8 – 21 de out.", "22 de out. – 4 de nov.": as datas da sprint, **sem repetir o mes
 * nem o ano**. O ano so aparece quando nao e o de agora — a linha cabe no celular.
 */
export function sprintDates(
  sprint: Pick<SprintViewModel, 'StartsOn' | 'EndsOn'>,
  hoje = new Date(),
): string {
  const a = parseDay(sprint.StartsOn)
  const b = parseDay(sprint.EndsOn)
  if (!a || !b) return `${formatDay(sprint.StartsOn)} – ${formatDay(sprint.EndsOn)}`
  const mes = (dia: { ano: number; mes: number }) =>
    mesCurto.format(new Date(dia.ano, dia.mes - 1, 1))
  const ano = (dia: { ano: number }) => (dia.ano === hoje.getFullYear() ? '' : ` de ${dia.ano}`)
  if (a.ano === b.ano && a.mes === b.mes) return `${a.dia} – ${b.dia} de ${mes(b)}${ano(b)}`
  if (a.ano === b.ano) return `${a.dia} de ${mes(a)} – ${b.dia} de ${mes(b)}${ano(b)}`
  return `${a.dia} de ${mes(a)}${ano(a)} – ${b.dia} de ${mes(b)}${ano(b)}`
}

/** Quantos dias faltam ate o ultimo dia — negativo quando ja passou. Pelo dia de quem olha. */
export function daysLeft(endsOn: string, hoje = new Date()): number {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endsOn)
  if (!partes) return 0
  const fim = Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]))
  const dia = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((fim - dia) / 86_400_000)
}

/** A frase do prazo da sprint em andamento. */
export function timeLeftText(endsOn: string): string {
  const dias = daysLeft(endsOn)
  if (dias > 1) return `faltam ${dias} dias`
  if (dias === 1) return 'falta 1 dia'
  if (dias === 0) return 'termina hoje'
  return dias === -1 ? 'passou do fim há 1 dia' : `passou do fim há ${-dias} dias`
}

// ─── No quadro ───────────────────────────────────────────────────────────────

/**
 * A sprint em andamento, em cima do quadro: o nome, as datas, quanto falta, o
 * objetivo, o que ja terminou — e "Concluir sprint".
 */
export function SprintBar({
  sprint,
  aoConcluir,
}: {
  sprint: SprintViewModel
  aoConcluir: () => void
}) {
  const passou = daysLeft(sprint.EndsOn) < 0
  return (
    <section
      aria-label={`Sprint em andamento: ${sprint.Name}`}
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-semibold text-body text-fg">{sprint.Name}</span>
          <span className="text-detail text-fg-muted">
            {sprintDates(sprint)} ·{' '}
            <span className={passou ? 'text-chip-red-fg' : undefined}>
              {timeLeftText(sprint.EndsOn)}
            </span>
          </span>
        </p>
        {sprint.Goal && <p className="mt-0.5 text-detail text-fg-muted">{sprint.Goal}</p>}
      </div>
      <div className="flex flex-none items-center gap-3">
        <span className="text-detail text-fg-muted tabular-nums">
          {sprint.DoneCards} de {sprint.Cards} {sprint.Cards === 1 ? 'card' : 'cards'}
          {sprint.Points > 0 &&
            ` · ${formatPoints(sprint.DonePoints)} de ${pointsText(sprint.Points)}`}
        </span>
        <Button size="sm" onClick={aoConcluir}>
          Concluir sprint
        </Button>
      </div>
    </section>
  )
}

/**
 * Sem sprint em andamento, o quadro diz isso e por que esta vazio — os cards estao no
 * backlog, nada se perdeu — e oferece o proximo passo: iniciar a planejada que vem, ou
 * ir ao backlog, onde se cria a primeira.
 */
export function NoActiveSprint({
  proxima,
  aoIniciar,
  aoIrAoBacklog,
}: {
  /** A primeira planejada, quando ha; nula sem nenhuma. */
  proxima: SprintViewModel | null
  aoIniciar: (sprint: SprintViewModel) => void
  aoIrAoBacklog: () => void
}) {
  return (
    <div className="max-w-170 rounded-xl border border-border border-dashed bg-surface-raised p-6">
      <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
        {proxima
          ? 'Nenhuma sprint em andamento. O quadro mostra só a sprint em andamento: os cards em trabalho estão no Backlog e nas sprints planejadas.'
          : 'Nenhuma sprint em andamento. O quadro mostra só a sprint em andamento: os cards em trabalho estão no Backlog. Lá, crie a primeira sprint, leve para ela os cards desta semana e inicie.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {proxima && (
          <Button variant="primary" onClick={() => aoIniciar(proxima)}>
            Iniciar a {proxima.Name}
          </Button>
        )}
        <Button onClick={aoIrAoBacklog}>Ir para o Backlog</Button>
      </div>
    </div>
  )
}

/** A lista das sprints nao veio: o Backlog e o quadro dizem, em vez de carregar para sempre. */
export function SprintsFailed({ aoTentar }: { aoTentar: () => void }) {
  return (
    <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
      <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
        Não deu para carregar as sprints agora. Nada se perdeu: a falha foi ao consultar.
      </p>
      <Button onClick={aoTentar}>Tentar de novo</Button>
    </div>
  )
}

// ─── Iniciar e editar ────────────────────────────────────────────────────────

/**
 * Iniciar ou editar uma sprint: o nome, o objetivo e as datas. Ao iniciar, o que se
 * escreve aqui vale para a sprint que comeca.
 *
 * **Iniciar comeca hoje**, com a duracao do projeto: as datas planejadas eram previsao,
 * e quem inicia antes ou depois da hora quase nunca as confere — a barra do quadro
 * contava "faltam 28 dias" numa sprint de duas semanas. Elas ficam como referencia, com
 * "Usar as datas planejadas". Mudar o primeiro dia leva o ultimo junto, ate a pessoa
 * mexer no ultimo.
 */
export function SprintDialog({
  projectPublicId,
  sprint,
  mode,
  semanas,
  aoSalvar,
  aoCancelar,
}: {
  projectPublicId: string
  sprint: SprintViewModel
  mode: 'start' | 'edit'
  /** A duracao com que as sprints do projeto nascem. Sem ela, a duracao planejada desta. */
  semanas?: number
  aoSalvar: (sprint: SprintViewModel) => void
  aoCancelar: () => void
}) {
  const iniciando = mode === 'start'
  const duracao = semanas ? semanas * 7 : lengthInDays(sprint)
  const [hoje] = useState(() => todayIso())
  const [nome, setNome] = useState(sprint.Name)
  const [objetivo, setObjetivo] = useState(sprint.Goal ?? '')
  const [comeca, setComeca] = useState(iniciando ? hoje : sprint.StartsOn)
  const [termina, setTermina] = useState(iniciando ? addDays(hoje, duracao - 1) : sprint.EndsOn)
  const [terminaEscolhida, setTerminaEscolhida] = useState(!iniciando)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const idObjetivo = useId()
  const idComeca = useId()
  const idTermina = useId()
  const idDatas = useId()

  const foraDeOrdem = Boolean(comeca && termina && termina < comeca)
  const planejadas = comeca === sprint.StartsOn && termina === sprint.EndsOn

  function mudarComeco(dia: string) {
    setComeca(dia)
    if (!terminaEscolhida && dia) setTermina(addDays(dia, duracao - 1))
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    const pedido = {
      Name: nome,
      Goal: objetivo,
      StartsOn: comeca,
      EndsOn: termina,
      Today: todayIso(),
    }
    try {
      const salva = iniciando
        ? await sprintService.startSprint(projectPublicId, sprint.PublicId, pedido)
        : await sprintService.updateSprint(projectPublicId, sprint.PublicId, pedido)
      toast.done(iniciando ? `${salva.Name} em andamento.` : 'Sprint salva.')
      aoSalvar(salva)
    } catch (falha) {
      setErro(describeError(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) aoCancelar()
      }}
      title={iniciando ? `Iniciar ${sprint.Name}` : `Editar ${sprint.Name}`}
      description={
        iniciando
          ? `${cardsText(sprint.Cards, sprint.Points)}. A partir daqui, o quadro mostra só esta sprint.`
          : undefined
      }
      footer={
        <>
          <Button variant="quiet" disabled={salvando} onClick={aoCancelar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={salvando || nome.trim().length === 0 || !comeca || !termina || foraDeOrdem}
            onClick={() => void salvar()}
          >
            {salvando ? 'Salvando…' : iniciando ? 'Iniciar' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Nome"
          value={nome}
          onChange={setNome}
          maxLength={MAX_SPRINT_NAME_LENGTH}
        />
        <div>
          <label htmlFor={idObjetivo} className="mb-1.5 block text-detail text-fg-muted">
            Objetivo (opcional)
          </label>
          <textarea
            id={idObjetivo}
            value={objetivo}
            onChange={(evento) => setObjetivo(evento.target.value)}
            maxLength={MAX_SPRINT_GOAL_LENGTH}
            rows={2}
            placeholder="O que o time quer entregar nesta sprint."
            className="block w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-body text-fg placeholder:text-fg-placeholder"
          />
        </div>
        <div>
          <div className="flex flex-wrap gap-3">
            <div>
              <label htmlFor={idComeca} className="mb-1.5 block text-detail text-fg-muted">
                Começa em
              </label>
              <input
                id={idComeca}
                type="date"
                value={comeca}
                onChange={(evento) => mudarComeco(evento.target.value)}
                aria-describedby={idDatas}
                className="h-9 rounded-lg border border-border bg-surface px-2.5 text-body text-fg"
              />
            </div>
            <div>
              <label htmlFor={idTermina} className="mb-1.5 block text-detail text-fg-muted">
                Termina em
              </label>
              <input
                id={idTermina}
                type="date"
                value={termina}
                min={comeca}
                onChange={(evento) => {
                  setTermina(evento.target.value)
                  setTerminaEscolhida(true)
                }}
                aria-describedby={idDatas}
                aria-invalid={foraDeOrdem || undefined}
                className="h-9 rounded-lg border border-border bg-surface px-2.5 text-body text-fg"
              />
            </div>
          </div>
          <div id={idDatas} className="mt-1.5 text-caption text-fg-muted">
            {foraDeOrdem ? (
              <p className="text-error-fg">O último dia não pode vir antes do primeiro.</p>
            ) : (
              iniciando &&
              (planejadas ? (
                <p>Com as datas planejadas.</p>
              ) : (
                <p className="flex flex-wrap items-center gap-x-2">
                  <span>
                    {/* As datas ja terminam no ponto do mes ("4 de nov."): um ponto so. */}
                    {comeca === hoje ? 'Começa hoje. ' : ''}Planejada para{' '}
                    {sprintDates(sprint).replace(/\.?$/, '.')}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setComeca(sprint.StartsOn)
                      setTermina(sprint.EndsOn)
                      setTerminaEscolhida(true)
                    }}
                    className="font-medium text-fg underline-offset-2 hover:underline"
                  >
                    Usar as datas planejadas
                  </button>
                </p>
              ))
            )}
          </div>
        </div>
        {erro && <p className="text-caption text-error-fg">{erro}</p>}
      </div>
    </Modal>
  )
}

// ─── Concluir ────────────────────────────────────────────────────────────────

/**
 * Concluir a sprint em andamento: quantos terminaram, e para onde vai o que nao
 * terminou — o backlog, uma sprint planejada, ou uma nova.
 *
 * **O padrao e a proxima planejada**, quando ha: e o que quase todo time escolhe. "Ver
 * os 7" mostra quais sao. Concluida, o aviso oferece iniciar a proxima — a que recebeu
 * os cards, ou a primeira planejada.
 */
export function CloseSprintDialog({
  projectPublicId,
  sprint,
  planejadas,
  aoFechar,
  aoCancelar,
  aoIniciar,
}: {
  projectPublicId: string
  sprint: SprintViewModel
  planejadas: SprintViewModel[]
  aoFechar: () => void
  aoCancelar: () => void
  /** Abre o dialogo de iniciar a proxima — o botao do aviso de concluida. */
  aoIniciar?: (sprint: SprintViewModel) => void
}) {
  const [destino, setDestino] = useState<string>(planejadas[0]?.PublicId ?? 'Backlog')
  const [fechando, setFechando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [vendo, setVendo] = useState<ReportSummaryViewModel[] | 'lendo' | 'falhou' | null>(null)
  const idLista = useId()
  const faltaram = sprint.Cards - sprint.DoneCards

  async function verQuais() {
    if (vendo !== null && vendo !== 'falhou') {
      setVendo(null)
      return
    }
    setVendo('lendo')
    try {
      const pagina = await projectReportService.listReports(projectPublicId, 1, null, false, {
        order: 'backlog',
        pageSize: 100,
        sprint: sprint.PublicId,
      })
      setVendo(pagina.reports.filter((card) => !card.Finished))
    } catch {
      setVendo('falhou')
    }
  }

  async function fechar() {
    setFechando(true)
    setErro(null)
    const tipo: SprintCloseDestination =
      destino === 'Backlog' || destino === 'NewSprint' ? destino : 'Sprint'
    try {
      const resultado = await sprintService.closeSprint(projectPublicId, sprint.PublicId, {
        Destination: tipo,
        SprintPublicId: tipo === 'Sprint' ? destino : null,
        Today: todayIso(),
      })
      const proxima = resultado.Destination ?? planejadas[0] ?? null
      const frase =
        resultado.Moved === 0
          ? `${sprint.Name} concluída.`
          : `${sprint.Name} concluída. ${resultado.Moved} ${resultado.Moved === 1 ? 'card foi' : 'cards foram'} para ${resultado.Destination ? `a ${resultado.Destination.Name}` : 'o backlog'}.`
      toast.done(
        frase,
        proxima && aoIniciar
          ? { action: { label: `Iniciar a ${proxima.Name}`, run: () => aoIniciar(proxima) } }
          : undefined,
      )
      aoFechar()
    } catch (falha) {
      setErro(describeError(falha))
    } finally {
      setFechando(false)
    }
  }

  // Sem estimativa, sem a conta dos pontos; sem nada terminado, sem dizer onde fica.
  const pontos =
    sprint.Points > 0 ? ` — ${formatPoints(sprint.DonePoints)} de ${pointsText(sprint.Points)}` : ''
  const fica = sprint.DoneCards > 0 ? ' O que terminou fica na sprint concluída.' : ''

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto && !fechando) aoCancelar()
      }}
      title={`Concluir ${sprint.Name}`}
      description={`${sprint.DoneCards} de ${sprint.Cards} ${sprint.Cards === 1 ? 'card terminou' : 'cards terminaram'}${pontos}.${fica}`}
      footer={
        <>
          <Button variant="quiet" disabled={fechando} onClick={aoCancelar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={fechando} onClick={() => void fechar()}>
            {fechando ? 'Concluindo…' : 'Concluir sprint'}
          </Button>
        </>
      }
    >
      {faltaram > 0 ? (
        <div className="flex flex-col gap-3">
          <Select
            label={
              faltaram === 1
                ? 'O que não terminou vai para'
                : `Os ${faltaram} que não terminaram vão para`
            }
            value={destino}
            onChange={setDestino}
            options={[
              { value: 'Backlog', label: 'O backlog' },
              ...planejadas.map((planejada) => ({
                value: planejada.PublicId,
                label: planejada.Name,
              })),
              { value: 'NewSprint', label: 'Uma sprint nova' },
            ]}
          />
          <div>
            <button
              type="button"
              aria-expanded={Array.isArray(vendo)}
              aria-controls={idLista}
              onClick={() => void verQuais()}
              className="font-medium text-detail text-fg underline-offset-2 hover:underline"
            >
              {Array.isArray(vendo)
                ? 'Esconder a lista'
                : faltaram === 1
                  ? 'Ver qual é'
                  : `Ver os ${faltaram}`}
            </button>
            <div id={idLista}>
              {vendo === 'lendo' && <p className="mt-2 text-caption text-fg-muted">Carregando…</p>}
              {vendo === 'falhou' && (
                <p className="mt-2 text-caption text-fg-muted">
                  Não deu para carregar a lista agora. Clique de novo para tentar.
                </p>
              )}
              {Array.isArray(vendo) && (
                <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border">
                  {vendo.map((card) => (
                    <li
                      key={card.PublicId}
                      className="flex items-baseline gap-2 border-border border-b px-2.5 py-1.5 text-detail last:border-b-0"
                    >
                      <span className="flex-none font-mono text-caption text-fg-muted">
                        #{card.Number}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-fg">
                        {cardHeadline(card).text}
                      </span>
                      {card.StateName && (
                        <span className="flex-none text-caption text-fg-muted">
                          {card.StateName}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-detail text-fg-muted">Todos os cards terminaram.</p>
      )}
      {erro && <p className="mt-3 text-caption text-error-fg">{erro}</p>}
    </Modal>
  )
}
