import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CycleSettingsViewModel } from '@/contracts'
import { MAX_SPRINT_LENGTH_WEEKS, MIN_SPRINT_LENGTH_WEEKS } from '@/contracts'
import { projectReportService } from '@/data'
import { useCycleDraft } from '@/features/cycle/cycleParts'
import { Button } from '@/shared/components/Button'
import { MiniCard } from '@/shared/components/cardFace'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { Field, Hint, RadioGroup } from '@/shared/components/SettingsControls'
import { SettingsGroup } from '@/shared/components/SettingsGroup'
import { SettingsHeader } from '@/shared/components/SettingsHeader'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { CYCLE_DEFAULTS, changedFromDefaults, defaultsOf } from '@/shared/lib/factoryDefaults'

/**
 * O que esta tela mexe, cada campo com o nome do "Mudou". Ver `useCycleDraft`: o
 * registro e o mesmo do Ciclo e das Colunas, e o salvamento manda so estes dois mudados.
 */
const CAMPOS: ReadonlyArray<readonly [keyof CycleSettingsViewModel, string]> = [
  ['SprintsEnabled', 'Forma de trabalho'],
  ['SprintLengthWeeks', 'Duração'],
]

const CAMPOS_NA_TELA = CAMPOS.map(([campo]) => campo)

/** O nome do acordeao desta tela. Um grupo so, mas o mesmo desenho das vizinhas. */
const ACORDEAO = 'sprints'

type Forma = 'continuo' | 'sprints'

/** As duracoes que a API aceita, em blocos: quatro escolhas cabem numa linha. */
const DURACOES = Array.from(
  { length: MAX_SPRINT_LENGTH_WEEKS - MIN_SPRINT_LENGTH_WEEKS + 1 },
  (_, indice) => String(MIN_SPRINT_LENGTH_WEEKS + indice),
)

/** "1 semana", "3 semanas". */
function semanas(quantas: number) {
  return quantas === 1 ? '1 semana' : `${quantas} semanas`
}

/**
 * Ligar as sprints, e quanto cada uma dura.
 *
 * **Item proprio no menu, e nao o fim do Ciclo.** As sprints sao opcionais, entao o
 * time precisa achar onde liga-las — e ninguem procura isso numa tela que fala de
 * como o relato encerra. As regras continuam no mesmo registro do ciclo, e o
 * salvamento e o mesmo.
 *
 * **Duas formas de trabalhar, lado a lado, e nao uma caixa.** "Trabalhar em sprints"
 * marcado ou nao escondia o que o time perde e ganha em cada lado; os blocos dizem a
 * consequencia de cada um numa linha, e a previa a direita mostra a tela de Trabalho
 * com a escolha — a aba Backlog e os pontos aparecem e somem com ela.
 *
 * **Ligar diz o que vai acontecer com o quadro.** Com as sprints, o quadro mostra so
 * a sprint em andamento: o time que ja usava o quadro ligava, salvava e "perdia" os
 * cards. Ninguem perdia nada — eles iam para o Backlog —, mas parecia. A frase com a
 * conta de hoje aparece antes de salvar, e o caminho seguinte depois.
 */
export function SprintSettingsScreen() {
  const project = useCurrentProject()

  const {
    draft,
    setDraft,
    published,
    loading,
    failed,
    reload,
    saving,
    dirty,
    changeCount,
    salvar,
    descartar,
  } = useCycleDraft(project.PublicId, CAMPOS_NA_TELA, 'Sprints salvas.')

  const ligando = draft?.SprintsEnabled === true && published?.SprintsEnabled === false

  // Quantos cards estao em trabalho hoje: as colunas que nao encerram. So quando a
  // pessoa escolhe as sprints — e uma conta para a frase do aviso, e nao para a tela.
  const { data: contagens } = useAsyncResource(
    useCallback(
      async () => (ligando ? await projectReportService.listReportCounts(project.PublicId) : null),
      [ligando, project.PublicId],
    ),
  )
  const emTrabalho =
    contagens
      ?.filter((coluna) => coluna.StatePublicId !== null && !coluna.ClosesReport)
      .reduce((soma, coluna) => soma + coluna.Total, 0) ?? 0

  /** Acabou de ligar: a tela mostra o proximo passo no lugar do aviso. */
  const [ligou, setLigou] = useState(false)

  async function gravar() {
    const antes = published?.SprintsEnabled === true
    const gravado = await salvar()
    if (gravado) setLigou(!antes && gravado.SprintsEnabled)
  }

  /** Toda mudanca passa por aqui: o "Sprints ligadas" de antes ja nao vale para ela. */
  function mudar(patch: Partial<CycleSettingsViewModel>) {
    if (!draft) return
    setLigou(false)
    setDraft({ ...draft, ...patch })
  }

  // A duracao so conta como mudanca com as sprints ligadas: desligadas, ela nao aparece,
  // e um "Mudou: Duração" sobre um campo escondido nao teria onde ser conferido.
  const mudancas = draft
    ? changedFromDefaults(
        draft,
        CYCLE_DEFAULTS,
        draft.SprintsEnabled ? CAMPOS : CAMPOS.filter(([campo]) => campo === 'SprintsEnabled'),
      )
    : []

  return (
    <div className="max-w-6xl">
      <SettingsHeader
        title="Sprints"
        description="Ligar o trabalho em ciclos curtos, com começo e fim, e a duração de cada um."
        ready={draft !== null}
        dirty={dirty}
        changeCount={changeCount}
        saving={saving}
        onSave={() => void gravar()}
        onDiscard={descartar}
      />

      {failed && (
        <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar as regras agora. Nada mudou: a falha foi ao consultar, e o projeto
            continua se comportando como estava.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      )}

      {draft && (
        <EditorWithPreview preview={<ComoFicaOTrabalho draft={draft} dirty={dirty} />}>
          <SettingsGroup
            name={ACORDEAO}
            id="forma-de-trabalho"
            title="Como o time trabalha"
            value={
              draft.SprintsEnabled
                ? `Em sprints de ${semanas(draft.SprintLengthWeeks)}`
                : 'Quadro contínuo'
            }
            changes={mudancas}
            onReset={() => mudar(defaultsOf(CYCLE_DEFAULTS, CAMPOS))}
            defaultOpen
          >
            {/* A ancora da busca ("Trabalhar em sprints") fica no grupo de escolha: o
                foco cai na forma marcada. */}
            <div id="sprints-ligadas" className="scroll-mt-6">
              <RadioGroup<Forma>
                label="Como o time trabalha"
                value={draft.SprintsEnabled ? 'sprints' : 'continuo'}
                onChange={(forma) => mudar({ SprintsEnabled: forma === 'sprints' })}
                options={[
                  {
                    value: 'continuo',
                    label: 'Quadro contínuo',
                    note: 'O quadro mostra todo o trabalho, sem começo nem fim.',
                    className: 'flex-1 basis-44 px-3 py-3',
                  },
                  {
                    value: 'sprints',
                    label: 'Em sprints',
                    note: 'O quadro mostra só a sprint em andamento; o resto fica na aba Backlog, e o card ganha pontos.',
                    className: 'flex-1 basis-44 px-3 py-3',
                  },
                ]}
              />
              <Hint>
                Uma sprint em andamento por vez, e quantas planejadas o time quiser. Planejar,
                iniciar e concluir é de qualquer pessoa do time. Desligar não apaga nada.
              </Hint>
            </div>

            {/* O aviso vem antes de salvar, que e quando ainda da para desistir. Sem
                card em trabalho, nao ha o que avisar: o quadro ja esta vazio. */}
            {ligando && emTrabalho > 0 && (
              <p
                role="status"
                className="mt-3 rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-detail text-warn-fg leading-relaxed"
              >
                {emTrabalho === 1
                  ? 'Hoje há 1 card em trabalho no quadro. Com as sprints ligadas, ele vai para o Backlog, e o quadro fica vazio até a primeira sprint começar.'
                  : `Hoje há ${emTrabalho} cards em trabalho no quadro. Com as sprints ligadas, eles vão para o Backlog, e o quadro fica vazio até a primeira sprint começar.`}
              </p>
            )}

            {ligou && (
              <div
                role="status"
                className="mt-3 rounded-lg border border-border bg-surface px-3.5 py-3 text-detail text-fg-muted leading-relaxed"
              >
                <p className="mb-1.5">
                  <strong className="font-medium text-fg">Sprints ligadas.</strong> O Backlog já
                  está na tela de Trabalho: crie a primeira sprint, leve para ela os cards desta
                  semana e clique em Iniciar sprint.
                </p>
                <Link to="../reports" className="font-medium text-fg underline underline-offset-4">
                  Ir para o Trabalho
                </Link>
              </div>
            )}

            {draft.SprintsEnabled && (
              <Field id="sprint-duracao" label="Cada sprint nasce com" className="mt-5">
                <RadioGroup<string>
                  label="Cada sprint nasce com"
                  value={String(draft.SprintLengthWeeks)}
                  onChange={(valor) => mudar({ SprintLengthWeeks: Number(valor) })}
                  options={DURACOES.map((valor) => ({
                    value: valor,
                    label: semanas(Number(valor)),
                    className: 'flex-1 basis-20 px-3 py-2.5',
                  }))}
                />
                <Hint>Ao iniciar, a sprint começa no dia em que for iniciada.</Hint>
              </Field>
            )}
          </SettingsGroup>
        </EditorWithPreview>
      )}
    </div>
  )
}

/**
 * A tela de Trabalho de mentira, com a escolha do rascunho: as abas, uma coluna com um
 * card e a duracao. **Pura** — nada aqui pede a API —: e o que muda para o time, e nao
 * o quadro dele.
 */
function ComoFicaOTrabalho({ draft, dirty }: { draft: CycleSettingsViewModel; dirty: boolean }) {
  const ligadas = draft.SprintsEnabled
  const abas = ligadas ? ['Quadro', 'Backlog'] : ['Quadro']

  return (
    <section
      id="como-fica-o-trabalho"
      aria-labelledby="como-fica-o-trabalho-titulo"
      className="scroll-mt-6 rounded-xl border border-border bg-surface-raised p-5"
    >
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id="como-fica-o-trabalho-titulo" className="font-semibold text-fg text-lead">
          Como fica o Trabalho
        </h2>
        <span className="flex-none text-caption text-fg-muted">
          {dirty ? 'ainda não salvo' : 'igual ao salvo'}
        </span>
      </header>
      <p className="mb-4 text-detail text-fg-muted leading-relaxed">
        A tela de Trabalho com esta escolha. É um exemplo: nada aqui mexe no quadro do time.
      </p>

      <div className="rounded-lg border border-border bg-surface-sunken p-3">
        <ul
          aria-label="Abas da tela de Trabalho"
          className="mb-3 flex gap-4 border-border border-b"
        >
          {abas.map((aba, indice) => (
            <li
              key={aba}
              className={cn(
                '-mb-px border-b-2 pb-1.5 text-detail',
                indice === 0
                  ? 'border-accent font-medium text-fg'
                  : 'border-transparent text-fg-muted',
              )}
            >
              {aba}
            </li>
          ))}
        </ul>

        <p className="mb-2 text-caption text-fg-muted">
          {ligadas ? 'Sprint 3 · em andamento' : 'Todo o trabalho do time'}
        </p>

        <div className="max-w-64 rounded-lg bg-surface-raised p-2">
          <p className="mb-2 px-1 font-medium text-caption text-fg-muted">Fazendo</p>
          <MiniCard
            title="Corrigir o login pelo celular"
            points={ligadas ? 3 : null}
            assignee="Ana Lima"
          />
        </div>
      </div>

      <p className="mt-3 text-detail text-fg-muted leading-relaxed">
        {ligadas
          ? `A sprint dura ${semanas(draft.SprintLengthWeeks)}.`
          : 'Sem sprints, o quadro não tem começo nem fim.'}
      </p>
    </section>
  )
}
