import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { MAX_SPRINT_LENGTH_WEEKS, MIN_SPRINT_LENGTH_WEEKS } from '@/contracts'
import { projectReportService } from '@/data'
import { Marcar, useCycleDraft } from '@/features/cycle/cycleParts'
import { Button } from '@/shared/components/Button'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { UnsavedChangesBar } from '@/shared/components/UnsavedChangesBar'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'

/** O que esta tela mexe. Ver `useCycleDraft`. */
const CAMPOS_NA_TELA = ['SprintsEnabled', 'SprintLengthWeeks'] as const

/**
 * Ligar as sprints, e quanto cada uma dura.
 *
 * **Item proprio no menu, e nao o fim do Ciclo.** As sprints sao opcionais, entao o
 * time precisa achar onde liga-las — e ninguem procura isso numa tela que fala de
 * como o relato encerra. As regras continuam no mesmo registro do ciclo, e o
 * salvamento e o mesmo.
 *
 * **Ligar diz o que vai acontecer com o quadro.** Com as sprints, o quadro mostra so
 * a sprint em andamento: o time que ja usava o quadro ligava, salvava e "perdia" os
 * cards. Ninguem perdia nada — eles iam para o Backlog —, mas parecia. A frase com a
 * conta de hoje aparece antes de salvar, e o caminho seguinte depois.
 */
export function SprintSettingsScreen() {
  const project = useCurrentProject()

  const { draft, setDraft, published, loading, failed, reload, saving, dirty, salvar, descartar } =
    useCycleDraft(project.PublicId, CAMPOS_NA_TELA, 'Sprints salvas.')

  const ligando = draft?.SprintsEnabled === true && published?.SprintsEnabled === false

  // Quantos cards estao em trabalho hoje: as colunas que nao encerram. So quando a
  // pessoa marca a caixa — e uma conta para a frase do aviso, e nao para a tela.
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

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Sprints</h1>
      <p className="mb-6 text-body text-fg-muted leading-relaxed">
        Para o time que trabalha em ciclos curtos.
      </p>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar as regras agora. Nada mudou: a falha foi ao consultar, e o projeto
            continua se comportando como estava.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {draft && (
        <section>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            Com as sprints ligadas, a tela de Trabalho ganha o{' '}
            <strong className="font-medium text-fg">Backlog</strong>, onde o time planeja as
            sprints; o quadro mostra só a sprint em andamento; e o card ganha a estimativa em
            pontos. Desligar não apaga nada.
          </p>

          <Marcar
            marcado={draft.SprintsEnabled}
            titulo="Trabalhar em sprints"
            explicacao="Uma sprint em andamento por vez, e quantas planejadas o time quiser. Planejar, iniciar e concluir é de qualquer pessoa do time."
            aoTrocar={(valor) => {
              setLigou(false)
              setDraft({ ...draft, SprintsEnabled: valor })
            }}
          />

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
              className="mt-3 rounded-lg border border-border bg-surface-raised px-3.5 py-3 text-detail text-fg-muted leading-relaxed"
            >
              <p className="mb-1.5">
                <strong className="font-medium text-fg">Sprints ligadas.</strong> O Backlog já está
                na tela de Trabalho: crie a primeira sprint, leve para ela os cards desta semana e
                clique em Iniciar sprint.
              </p>
              <Link to="../reports" className="font-medium text-fg underline underline-offset-4">
                Ir para o Trabalho
              </Link>
            </div>
          )}

          {draft.SprintsEnabled && (
            <div className="mt-4 ml-6">
              <Select
                label="Cada sprint nasce com"
                value={String(draft.SprintLengthWeeks)}
                onChange={(valor) => setDraft({ ...draft, SprintLengthWeeks: Number(valor) })}
                options={Array.from(
                  { length: MAX_SPRINT_LENGTH_WEEKS - MIN_SPRINT_LENGTH_WEEKS + 1 },
                  (_, indice) => {
                    const semanas = MIN_SPRINT_LENGTH_WEEKS + indice
                    return {
                      value: String(semanas),
                      label: semanas === 1 ? '1 semana' : `${semanas} semanas`,
                    }
                  },
                )}
                hint="Cada sprint nasce com esta duração. Ao iniciar, ela começa no dia em que for iniciada."
                className="max-w-60"
              />
            </div>
          )}

          <UnsavedChangesBar
            dirty={dirty}
            saving={saving}
            onSave={() => void gravar()}
            onDiscard={descartar}
          />
        </section>
      )}
    </div>
  )
}
