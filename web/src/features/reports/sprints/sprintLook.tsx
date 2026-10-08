import { useCallback, useId, useState } from 'react'
import {
  MAX_SPRINT_GOAL_LENGTH,
  MAX_SPRINT_NAME_LENGTH,
  type SprintCloseDestination,
  type SprintViewModel,
} from '@/contracts'
import { describeError, sprintService } from '@/data'
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

/** Os pontos como o time le: "2,5", sem o ".0". */
export function formatPoints(pontos: number): string {
  return pontos.toLocaleString('pt-BR')
}

/** "1 ponto", "2,5 pontos". */
export function pointsText(pontos: number): string {
  return `${formatPoints(pontos)} ${pontos === 1 ? 'ponto' : 'pontos'}`
}

/** "5 out. – 18 out.": as datas da sprint, sem o ano quando e o mesmo. */
export function sprintDates(sprint: Pick<SprintViewModel, 'StartsOn' | 'EndsOn'>): string {
  return `${formatDay(sprint.StartsOn)} – ${formatDay(sprint.EndsOn)}`
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
          {sprint.DoneCards} de {sprint.Cards} {sprint.Cards === 1 ? 'card' : 'cards'} ·{' '}
          {formatPoints(sprint.DonePoints)} de {pointsText(sprint.Points)}
        </span>
        <Button size="sm" onClick={aoConcluir}>
          Concluir sprint
        </Button>
      </div>
    </section>
  )
}

/** Sem sprint em andamento, o quadro diz isso — e leva ao backlog, onde se inicia uma. */
export function NoActiveSprint({ aoIrAoBacklog }: { aoIrAoBacklog: () => void }) {
  return (
    <div className="max-w-170 rounded-xl border border-border border-dashed bg-surface-raised p-6">
      <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
        Nenhuma sprint em andamento. Com as sprints ligadas, o quadro mostra só a sprint em
        andamento: planeje e inicie uma no Backlog.
      </p>
      <Button onClick={aoIrAoBacklog}>Ir para o Backlog</Button>
    </div>
  )
}

/**
 * Iniciar ou editar uma sprint: o nome, o objetivo e as datas. Ao iniciar, o que se
 * escreve aqui vale para a sprint que comeca.
 */
export function SprintDialog({
  projectPublicId,
  sprint,
  mode,
  aoSalvar,
  aoCancelar,
}: {
  projectPublicId: string
  sprint: SprintViewModel
  mode: 'start' | 'edit'
  aoSalvar: (sprint: SprintViewModel) => void
  aoCancelar: () => void
}) {
  const [nome, setNome] = useState(sprint.Name)
  const [objetivo, setObjetivo] = useState(sprint.Goal ?? '')
  const [comeca, setComeca] = useState(sprint.StartsOn)
  const [termina, setTermina] = useState(sprint.EndsOn)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const idObjetivo = useId()
  const idComeca = useId()
  const idTermina = useId()

  async function salvar() {
    setSalvando(true)
    setErro(null)
    const pedido = { Name: nome, Goal: objetivo, StartsOn: comeca, EndsOn: termina }
    try {
      const salva =
        mode === 'start'
          ? await sprintService.startSprint(projectPublicId, sprint.PublicId, pedido)
          : await sprintService.updateSprint(projectPublicId, sprint.PublicId, pedido)
      toast.done(mode === 'start' ? `${salva.Name} em andamento.` : 'Sprint salva.')
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
      title={mode === 'start' ? `Iniciar ${sprint.Name}` : `Editar ${sprint.Name}`}
      description={
        mode === 'start'
          ? `${sprint.Cards} ${sprint.Cards === 1 ? 'card' : 'cards'} e ${pointsText(sprint.Points)}. A partir daqui, o quadro mostra só esta sprint.`
          : undefined
      }
      footer={
        <>
          <Button variant="quiet" disabled={salvando} onClick={aoCancelar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={salvando || nome.trim().length === 0 || !comeca || !termina}
            onClick={() => void salvar()}
          >
            {salvando ? 'Salvando…' : mode === 'start' ? 'Iniciar' : 'Salvar'}
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
        <div className="flex flex-wrap gap-3">
          <div>
            <label htmlFor={idComeca} className="mb-1.5 block text-detail text-fg-muted">
              Começa em
            </label>
            <input
              id={idComeca}
              type="date"
              value={comeca}
              onChange={(evento) => setComeca(evento.target.value)}
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
              onChange={(evento) => setTermina(evento.target.value)}
              className="h-9 rounded-lg border border-border bg-surface px-2.5 text-body text-fg"
            />
          </div>
        </div>
        {erro && <p className="text-caption text-error-fg">{erro}</p>}
      </div>
    </Modal>
  )
}

/**
 * Concluir a sprint em andamento: quantos terminaram, e para onde vai o que nao
 * terminou — o backlog, uma sprint planejada, ou uma nova.
 */
export function CloseSprintDialog({
  projectPublicId,
  sprint,
  planejadas,
  aoFechar,
  aoCancelar,
}: {
  projectPublicId: string
  sprint: SprintViewModel
  planejadas: SprintViewModel[]
  aoFechar: () => void
  aoCancelar: () => void
}) {
  const [destino, setDestino] = useState<string>('Backlog')
  const [fechando, setFechando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const faltaram = sprint.Cards - sprint.DoneCards

  async function fechar() {
    setFechando(true)
    setErro(null)
    const tipo: SprintCloseDestination =
      destino === 'Backlog' || destino === 'NewSprint' ? destino : 'Sprint'
    try {
      const resultado = await sprintService.closeSprint(projectPublicId, sprint.PublicId, {
        Destination: tipo,
        SprintPublicId: tipo === 'Sprint' ? destino : null,
      })
      toast.done(
        resultado.Moved === 0
          ? `${sprint.Name} concluída.`
          : `${sprint.Name} concluída. ${resultado.Moved} ${resultado.Moved === 1 ? 'card foi' : 'cards foram'} para ${resultado.Destination?.Name ?? 'o backlog'}.`,
      )
      aoFechar()
    } catch (falha) {
      setErro(describeError(falha))
    } finally {
      setFechando(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto && !fechando) aoCancelar()
      }}
      title={`Concluir ${sprint.Name}`}
      description={`${sprint.DoneCards} de ${sprint.Cards} ${sprint.Cards === 1 ? 'card terminou' : 'cards terminaram'} — ${formatPoints(sprint.DonePoints)} de ${pointsText(sprint.Points)}. O que terminou fica na sprint concluída.`}
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
      ) : (
        <p className="text-detail text-fg-muted">Todos os cards terminaram.</p>
      )}
      {erro && <p className="mt-3 text-caption text-error-fg">{erro}</p>}
    </Modal>
  )
}
