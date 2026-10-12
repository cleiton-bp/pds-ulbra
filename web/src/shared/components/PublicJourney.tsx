import type { PublicStageViewModel } from '@/contracts'
import { cn } from '@/shared/lib/cn'
import { formatDateTime } from '@/shared/lib/datetime'

/**
 * Um passo da linha do tempo, com a chave que o identifica. A pagina de acompanhamento
 * usa o rotulo (a API nao repete rotulo na mesma jornada); a previa do painel, o
 * identificador da etapa.
 */
export type JourneyStage = Omit<PublicStageViewModel, 'IsCurrent'> & { id: string }

/**
 * Por onde o relato passou, onde ele esta, e o que vem depois.
 *
 * **Os tres passos que a pessoa quer saber, em uma leitura.** Uma palavra dizendo so
 * onde ele esta responderia um terco da pergunta e calaria o resto.
 *
 * **O que ja passou vem das datas, e nao da posicao.** Um relato pode pular etapas, e
 * pintar como percorrido tudo que esta antes contaria uma historia que nao aconteceu.
 * Passo sem data e passo por onde ele nao passou — mesmo estando antes do atual.
 *
 * **Jornada vazia e projeto sem jornada**, e a tela diz isso em vez de prometer
 * movimento que nao vai acontecer.
 *
 * Mora em `shared` porque e o mesmo desenho em dois lugares: a pagina que quem relatou
 * abre pelo link e a previa do Andamento público, no painel. Configurar a jornada
 * olhando para outra forma faria escrever etapa que so funciona na lista do painel.
 *
 * `onSelect` so existe na previa: o rotulo vira botao, e quem configura escolhe em qual
 * etapa quer ver o relato. Na pagina publica o passo atual e o da API, e nada e clicavel.
 */
export function PublicJourney({
  stages,
  currentId,
  onSelect,
  className,
}: {
  stages: readonly JourneyStage[]
  /** A chave do passo em que o relato esta agora. Nula: ainda nao entrou na jornada. */
  currentId: string | null
  /** So na previa: escolher em qual passo o relato esta. */
  onSelect?: (id: string) => void
  className?: string
}) {
  if (stages.length === 0) {
    return (
      <div className={cn('rounded-xl border border-border bg-surface-sunken px-5 py-4', className)}>
        <p className="text-detail text-fg leading-relaxed">
          Ainda não há andamento para mostrar. Quem cuida deste site já pode ver o seu relato.
        </p>
      </div>
    )
  }

  const temAtual = currentId !== null && stages.some((passo) => passo.id === currentId)

  return (
    <section className={cn('rounded-xl border border-border bg-surface-raised p-5', className)}>
      <h2 className="mb-1 font-semibold text-fg text-lead">Andamento</h2>
      {/* **A frase promete o que a pagina faz, e nada alem.** O relato e lido uma vez, na
          montagem: dizer que a pagina "se atualiza sozinha" deixaria quem esperasse
          esperando para sempre. E buscar de novo sozinho nao e a correcao — cada leitura
          grava um evento de visualizacao, e o historico encheria de leituras que ninguem
          fez. Avisar quando algo anda e trabalho da notificacao. */}
      <p className="mb-5 text-detail text-fg-muted leading-relaxed">
        {!temAtual
          ? 'O seu relato ainda não entrou nesta jornada. Ele está registrado e aguardando.'
          : 'Sempre que você abrir esta página, ela mostra onde o seu relato está. Não é preciso avisar ninguém.'}
      </p>

      <ol className="flex flex-col">
        {stages.map((passo, index) => {
          const atual = passo.id === currentId
          return (
            <li key={passo.id} className="flex gap-3">
              {/* A coluna do marcador e da linha. A linha para no penultimo, senao ela
                  desce para fora do ultimo passo e a jornada parece continuar. */}
              <div className="flex flex-none flex-col items-center">
                <Marcador passo={passo} atual={atual} />
                {index < stages.length - 1 && (
                  <div
                    className={`w-px flex-1 ${passo.ReachedAt === null ? 'bg-border' : 'bg-fg-muted'}`}
                  />
                )}
              </div>

              <div className={`min-w-0 flex-1 ${index < stages.length - 1 ? 'pb-5' : ''}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {onSelect ? (
                    <button
                      type="button"
                      aria-pressed={atual}
                      aria-label={`Ver o relato em ${passo.Label}`}
                      onClick={() => onSelect(passo.id)}
                      className={cn(
                        'rounded text-left underline-offset-4 hover:underline',
                        atual ? 'font-medium text-body text-fg' : 'text-body text-fg-muted',
                      )}
                    >
                      {passo.Label}
                    </button>
                  ) : (
                    <span
                      className={
                        atual ? 'font-medium text-body text-fg' : 'text-body text-fg-muted'
                      }
                    >
                      {passo.Label}
                    </span>
                  )}
                  {atual && (
                    <span className="rounded-full border border-border px-2 py-px text-caption text-fg-muted">
                      agora
                    </span>
                  )}
                  {passo.ReachedAt !== null && (
                    <span className="text-caption text-fg-muted tabular-nums">
                      {formatDateTime(passo.ReachedAt)}
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-detail text-fg-muted leading-relaxed">
                  {passo.Description}
                </p>

                {/* "O que vem depois" so no passo atual: nos outros ele e ruido — no que ja
                    passou, o depois ja aconteceu; no que nao chegou, a frase do proprio
                    passo ja diz o que vai acontecer. */}
                {atual && passo.NextStep !== null && (
                  <p className="mt-1.5 text-caption text-fg-muted leading-relaxed">
                    {passo.NextStep}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/**
 * O ponto de cada passo: cheio no que ja foi percorrido, anel no passo atual, vazio no
 * que ainda nao chegou.
 *
 * **A forma carrega a informacao junto com a cor**, porque cor sozinha nao e lida por
 * quem nao a distingue — e esta e a tela que qualquer pessoa abre do telefone.
 *
 * **E os tres estados tem nome**, em vez de o ponto ser decorativo: sem isso, quem usa
 * leitor de tela teria so a presenca ou ausencia da data para adivinhar o que ja
 * aconteceu.
 */
function Marcador({ passo, atual }: { passo: JourneyStage; atual: boolean }) {
  if (atual) {
    return (
      <span
        role="img"
        aria-label="Passo atual"
        className="mt-1 size-2.5 flex-none rounded-full border-2 border-fg bg-surface-raised"
      />
    )
  }

  if (passo.ReachedAt === null) {
    return (
      <span
        role="img"
        aria-label="Ainda não chegou aqui"
        className="mt-1 size-2.5 flex-none rounded-full border border-border"
      />
    )
  }

  return (
    <span
      role="img"
      aria-label="Já passou por aqui"
      className="mt-1 size-2.5 flex-none rounded-full bg-fg-muted"
    />
  )
}
