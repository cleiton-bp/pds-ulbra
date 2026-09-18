import { useCallback, useEffect, useState } from 'react'
import type { ProjectPublicStageViewModel, ProjectStatusMappingViewModel } from '@/contracts'
import { describeError, projectStatusMappingService } from '@/data'
import { Button } from '@/shared/components/Button'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'

/**
 * De onde cada estado da fila entra na jornada publica.
 *
 * **É a única tela do painel que tem botão de salvar**, e isso é de propósito. No
 * resto, cada ação grava sozinha; aqui cada gravação cria uma **versão** do mapa, e
 * gravar a cada clique num select produziria uma versão por segundo. A linha do
 * tempo de um relato é contada pela versão que valia quando ele passou — versões
 * descartáveis a tornariam ilegível.
 *
 * **N estados para 1 etapa é o caminho normal**, e não uma permissão. O time precisa
 * de granularidade que quem está de fora não precisa, e a tela diz isso em vez de
 * deixar a pessoa achar que deveria haver uma etapa por estado.
 *
 * **Não há digitação.** Os dois lados já existem: a fila veio da tela de Estados, a
 * jornada veio de cima. Escolher é tudo que há para fazer.
 */
export function StatusMappingSection({ etapas }: { etapas: ProjectPublicStageViewModel[] }) {
  const { PublicId: publicId } = useCurrentProject()

  const {
    data: carregado,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(() => projectStatusMappingService.getStatusMapping(publicId), [publicId]),
  )

  const [mapa, setMapa] = useState<ProjectStatusMappingViewModel | null>(null)
  useEffect(() => setMapa(carregado), [carregado])

  /** O que a pessoa escolheu e ainda não gravou: estado → etapa, ou `null` para sem mapeamento. */
  const [rascunho, setRascunho] = useState<Record<string, string | null>>({})
  useEffect(() => {
    if (!carregado) return
    setRascunho(
      Object.fromEntries(carregado.Entries.map((item) => [item.StatePublicId, item.StagePublicId])),
    )
  }, [carregado])

  const [salvando, setSalvando] = useState(false)

  const alterado =
    mapa?.Entries.some((item) => (rascunho[item.StatePublicId] ?? null) !== item.StagePublicId) ??
    false

  const semMapeamento =
    mapa === null
      ? 0
      : mapa.Entries.filter((item) => (rascunho[item.StatePublicId] ?? null) === null).length

  async function salvar() {
    if (!mapa || salvando) return

    setSalvando(true)

    try {
      // Só entra quem tem destino. Estado sem etapa **não vira uma linha apontando
      // para nada**: a ausência é a resposta, e duas formas de dizer a mesma coisa
      // acabariam discordando.
      const salvo = await projectStatusMappingService.saveStatusMapping(publicId, {
        Entries: mapa.Entries.flatMap((item) => {
          const destino = rascunho[item.StatePublicId] ?? null
          return destino === null
            ? []
            : [{ StatePublicId: item.StatePublicId, StagePublicId: destino }]
        }),
      })

      setMapa(salvo)
      toast.done(
        salvo.Version === mapa.Version
          ? 'Nada mudou no mapeamento.'
          : `Mapeamento salvo — versão ${salvo.Version}.`,
      )
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="mt-10">
      <h2 className="mb-1 font-semibold text-lead">De onde cada estado entra na jornada</h2>
      <p className="mb-4 text-detail text-fg-muted leading-relaxed">
        Ligue cada estado da sua fila a um passo da jornada acima.{' '}
        <strong className="font-medium text-fg">Vários estados podem cair no mesmo passo</strong> —
        é o caminho normal, e não um jeito de economizar: "Corrigindo", "Em revisão" e "Aguardando
        publicação" são três coisas para a equipe e uma só para quem está esperando.
      </p>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar o mapeamento agora. A falha foi ao consultar: o que estava ligado
            continua ligado.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {['w-28', 'w-36'].map((width) => (
            <div
              key={width}
              className="flex h-12 items-center rounded-lg border border-border bg-surface-raised px-3.5"
            >
              <Skeleton className={`h-3 ${width}`} />
            </div>
          ))}
        </div>
      )}

      {mapa !== null && mapa.Entries.length === 0 && (
        <p className="rounded-lg border border-border border-dashed px-3.5 py-5 text-center text-detail text-fg-muted leading-relaxed">
          Este projeto ainda não tem estados na fila de trabalho. Crie a fila na tela de Estados e
          volte aqui para ligar cada um a um passo da jornada.
        </p>
      )}

      {mapa !== null && mapa.Entries.length > 0 && (
        <>
          {semMapeamento > 0 && (
            <p className="mb-3 rounded-lg border border-border bg-surface-sunken px-3.5 py-2.5 text-detail text-fg-muted leading-relaxed">
              <strong className="font-medium text-fg">
                {semMapeamento === 1
                  ? 'Um estado ainda não entra na jornada.'
                  : `${semMapeamento} estados ainda não entram na jornada.`}
              </strong>{' '}
              O relato que estiver neles fica parado do lado de fora — não retrocede e não some, mas
              quem acompanha deixa de ver movimento.
            </p>
          )}

          <ul className="mb-4 flex flex-col gap-2">
            {mapa.Entries.map((item) => (
              <li
                key={item.StatePublicId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-raised px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-body text-fg">{item.StateName}</span>
                  {!item.StateIsActive && (
                    // O aposentado só chega aqui se ainda tiver mapeamento, e
                    // continua configurável: os relatos que passaram por ele ainda
                    // precisam ser traduzidos.
                    <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-caption text-fg-muted">
                      aposentado
                    </span>
                  )}
                </div>

                <Seta />

                <Select
                  className="min-w-0 max-w-56 flex-1"
                  size="sm"
                  ariaLabel={`Onde o estado ${item.StateName} entra na jornada`}
                  value={rascunho[item.StatePublicId] ?? ''}
                  disabled={salvando}
                  onChange={(valor) =>
                    setRascunho((atual) => ({ ...atual, [item.StatePublicId]: valor || null }))
                  }
                  options={[
                    // "Não entra" é uma escolha de verdade, e não a ausência de uma:
                    // sem ela, quem ligou uma vez não teria como desligar.
                    { value: '', label: 'Não entra na jornada' },
                    ...etapas.map((etapa) => ({ value: etapa.PublicId, label: etapa.Label })),
                  ]}
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void salvar()} disabled={!alterado || salvando}>
              {salvando ? 'Salvando…' : 'Salvar mapeamento'}
            </Button>
            <p className="text-caption text-fg-muted leading-relaxed">
              {mapa.Version === 0 ? 'Nada foi ligado ainda.' : `Versão ${mapa.Version} em uso.`}{' '}
              Cada gravação cria uma versão nova, e{' '}
              <strong className="font-medium text-fg">as antigas não são reescritas</strong> — o que
              já foi percorrido continua sendo contado pelo mapa que valia na época.
            </p>
          </div>
        </>
      )}
    </section>
  )
}

/** A seta entre os dois lados. Ela é o que conta que a direção importa: de dentro para fora. */
function Seta() {
  return (
    <svg
      viewBox="0 0 16 12"
      className="size-3 flex-none text-fg-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1.5 6h13M10.5 2 14.5 6l-4 4" />
    </svg>
  )
}
