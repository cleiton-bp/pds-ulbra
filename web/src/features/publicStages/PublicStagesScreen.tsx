import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_PUBLIC_STAGE_LABEL_LENGTH,
  MAX_PUBLIC_STAGE_SENTENCE_LENGTH,
  MAX_PUBLIC_STAGES,
  MIN_PUBLIC_STAGES,
  type ProjectPublicStageViewModel,
  type SaveProjectPublicStageRequest,
} from '@/contracts'
import { describeError, projectPublicStageService } from '@/data'
import { StatusMappingSection } from '@/features/publicStages/StatusMappingSection'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { PUBLIC_OUTCOMES, publicOutcomeLabel } from '@/shared/lib/publicOutcomes'

/**
 * A jornada que quem relatou acompanha.
 *
 * **Esta tela nao e a de Estados com outro titulo.** La estao as faixas em que o
 * time trabalha, com a granularidade que o time precisa. Aqui esta a historia que
 * a pessoa de fora le — e ela e mais curta de proposito. Varios estados de dentro
 * cabem numa etapa daqui, e e essa perda de detalhe que e o produto.
 *
 * **A tela e desenhada como uma linha do tempo numerada**, e nao como uma lista de
 * registros. E a mesma forma que a pessoa de fora vai ver: configurar uma jornada
 * olhando para linhas soltas faz escrever etapa que nao se liga na seguinte.
 *
 * **O teto e o piso aparecem escritos, e nao so escondem botao.** "3 de 7" com o
 * motivo ao lado explica por que o botao sumiu; um botao que some sem explicacao
 * parece defeito.
 *
 * **Etapa terminal pede desfecho no mesmo instante em que e marcada.** Nao da para
 * salvar uma sem o outro, porque um fim sem explicacao e pior do que nenhum fim: a
 * pessoa le "encerrado" e nao sabe se foi feito ou descartado.
 */
export function PublicStagesScreen() {
  const project = useCurrentProject()

  const {
    data: carregadas,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(
      () => projectPublicStageService.listPublicStages(project.PublicId),
      [project.PublicId],
    ),
  )

  // Copia local para criar, editar e mover sem o esqueleto voltar, como na tela de
  // Estados: `useAsyncResource` zera os dados a cada nova busca, e a jornada
  // inteira piscando a cada seta faria a tela parecer que recarregou sozinha.
  const [etapas, setEtapas] = useState<ProjectPublicStageViewModel[] | null>(null)
  useEffect(() => setEtapas(carregadas), [carregadas])

  /** `null` = ninguem editando; `'nova'` = o formulario de criar; senao, o identificador. */
  const [editando, setEditando] = useState<string | null>(null)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [movendo, setMovendo] = useState(false)
  const [removendo, setRemovendo] = useState<ProjectPublicStageViewModel | null>(null)
  const [aplicandoPadrao, setAplicandoPadrao] = useState(false)

  const total = etapas?.length ?? 0
  const cheia = total >= MAX_PUBLIC_STAGES
  const noPiso = total <= MIN_PUBLIC_STAGES

  /**
   * **Abaixo do mínimo não é o mesmo que no mínimo**, e a tela dizia a mesma frase
   * para os dois.
   *
   * O piso só é conferido na remoção, e com razão: a jornada precisa poder sair do
   * zero uma etapa por vez. O efeito colateral é que dá para criar uma etapa, parar
   * ali, e essa jornada de um passo **já sai para quem relatou** — a rota pública
   * devolve o que existe, sem exigir três.
   *
   * Com a mesma frase nos dois casos, quem estava em 1 lia um conselho ("3 é o
   * mínimo") e não um aviso de que a coisa já está no ar incompleta.
   */
  const abaixoDoPiso = etapas !== null && total > 0 && total < MIN_PUBLIC_STAGES

  function abrirFormulario(chave: string) {
    setEditando(chave)
    setErroForm(null)
  }

  function fecharFormulario() {
    setEditando(null)
    setErroForm(null)
  }

  async function criar(pedido: SaveProjectPublicStageRequest) {
    setSalvando(true)
    setErroForm(null)

    try {
      const criada = await projectPublicStageService.addPublicStage(project.PublicId, pedido)
      // Entra no fim porque foi onde a API a colocou. Inserir em outro lugar aqui
      // faria a tela discordar da posicao que acabou de ser gravada.
      setEtapas((lista) => [...(lista ?? []), criada])
      fecharFormulario()
    } catch (falha) {
      // O erro fica **no formulario**, e nao num aviso que passa: rotulo repetido,
      // texto comprido e desfecho faltando tem o que corrigir, e a correcao e ali.
      setErroForm(describeError(falha))
    } finally {
      setSalvando(false)
    }
  }

  async function salvar(stagePublicId: string, pedido: SaveProjectPublicStageRequest) {
    setSalvando(true)
    setErroForm(null)

    try {
      const salva = await projectPublicStageService.updatePublicStage(
        project.PublicId,
        stagePublicId,
        pedido,
      )
      setEtapas((lista) =>
        (lista ?? []).map((item) => (item.PublicId === salva.PublicId ? salva : item)),
      )
      fecharFormulario()
    } catch (falha) {
      setErroForm(describeError(falha))
    } finally {
      setSalvando(false)
    }
  }

  async function remover(etapa: ProjectPublicStageViewModel) {
    try {
      await projectPublicStageService.removePublicStage(project.PublicId, etapa.PublicId)
      setEtapas((lista) => (lista ?? []).filter((item) => item.PublicId !== etapa.PublicId))
      toast.done('Etapa removida da jornada.')
    } catch (falha) {
      // A recusa mais provavel e a do piso, e a mensagem da API ja diz o motivo.
      toast.error(describeError(falha))
    }
  }

  async function usarPadrao() {
    setAplicandoPadrao(true)

    try {
      const padrao = await projectPublicStageService.applyFactoryPublicStages(project.PublicId)
      setEtapas(padrao)
      toast.done('Jornada preenchida. Tudo aqui pode ser reescrito.')
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setAplicandoPadrao(false)
    }
  }

  /**
   * Grava a ordem nova, e devolve a anterior se o servidor recusar.
   *
   * O mesmo caminho para a seta e para o arrastar: os dois so decidem **qual** e a
   * ordem nova, e a gravacao, o otimismo e o desfazer moram aqui, uma vez so.
   */
  async function gravarOrdem(
    nova: ProjectPublicStageViewModel[],
    anterior: ProjectPublicStageViewModel[],
  ) {
    if (mesmaOrdem(nova, anterior)) return

    setEtapas(nova)
    setMovendo(true)

    try {
      const salvas = await projectPublicStageService.reorderPublicStages(project.PublicId, {
        Order: nova.map((etapa) => etapa.PublicId),
      })
      setEtapas(salvas)
    } catch (falha) {
      // Volta para a ordem de antes. Deixar a lista no lugar novo mostraria uma
      // jornada que o banco nao tem.
      setEtapas(anterior)
      toast.error(describeError(falha))
    } finally {
      setMovendo(false)
    }
  }

  async function mover(index: number, delta: number) {
    if (!etapas || movendo) return

    const alvo = index + delta
    if (alvo < 0 || alvo >= etapas.length) return

    await gravarOrdem(reordenar(etapas, index, alvo), etapas)
  }

  const ordemAntes = useRef<ProjectPublicStageViewModel[] | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)

  function comecarArrasto(publicId: string) {
    if (!etapas) return
    setArrastando(publicId)
    ordemAntes.current = etapas
  }

  /**
   * Clique na alca sem arrastar. Durante um arrasto o navegador dispara `dragend`
   * e nao `mouseup`, entao chegar aqui significa que a pessoa so clicou — sem isto
   * a linha ficaria presa no estado de arrasto ate alguem clicar de novo.
   */
  function cancelarArrasto() {
    setArrastando(null)
    ordemAntes.current = null
  }

  function arrastarSobre(indexAlvo: number) {
    if (!etapas || arrastando === null) return

    const atual = etapas.findIndex((etapa) => etapa.PublicId === arrastando)
    if (atual === -1 || atual === indexAlvo) return

    setEtapas(reordenar(etapas, atual, indexAlvo))
  }

  async function soltar() {
    const anterior = ordemAntes.current
    setArrastando(null)
    ordemAntes.current = null

    if (!etapas || anterior === null) return

    await gravarOrdem(etapas, anterior)
  }

  return (
    <div className="max-w-160">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Etapas públicas</h1>
      <p className="mb-8 text-body text-fg-muted">
        O que quem relatou vê do andamento — e só isso.
      </p>

      <section>
        <h2 className="mb-1 font-semibold text-lead">A jornada de quem está de fora</h2>
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">
          Não é a sua fila de trabalho com outro nome.{' '}
          <strong className="font-medium text-fg">
            Vários estados de dentro cabem numa etapa daqui
          </strong>{' '}
          — quem abriu o relato não precisa saber que existe revisão de código, precisa saber que o
          problema dele está sendo resolvido. Escreva cada passo com as palavras que essa pessoa
          usaria.
        </p>

        {failed && (
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
              Não deu para carregar a jornada deste projeto agora. A falha foi ao consultar: as suas
              etapas continuam exatamente como estavam.
            </p>
            <Button onClick={reload}>Tentar de novo</Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-2">
            {['w-36', 'w-44', 'w-32'].map((width) => (
              <div
                key={width}
                className="flex h-16 items-center rounded-lg border border-border bg-surface-raised px-3.5"
              >
                <Skeleton className={`h-3 ${width}`} />
              </div>
            ))}
          </div>
        )}

        {etapas !== null && etapas.length === 0 && (
          <div className="rounded-xl border border-border border-dashed p-5 text-center">
            <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
              Este projeto ainda não tem jornada pública. Dá para escrever a sua do zero, mas o
              caminho mais rápido é começar pelo conjunto padrão e reescrever o que não combinar —
              todas as etapas dele podem ser editadas, removidas e reordenadas.
            </p>
            <Button onClick={() => void usarPadrao()} disabled={aplicandoPadrao}>
              {aplicandoPadrao ? 'Preenchendo…' : 'Usar o conjunto padrão'}
            </Button>
          </div>
        )}

        {etapas !== null && etapas.length > 0 && (
          <>
            <p className="mb-2 text-caption text-fg-muted">
              {total} de {MAX_PUBLIC_STAGES} etapas
              {cheia
                ? ' · é o máximo. Acima disso a jornada volta a ser a sua lista de estados, só que com palavras mais bonitas.'
                : noPiso
                  ? ` · ${MIN_PUBLIC_STAGES} é o mínimo. Com menos, a jornada não conta uma história: vira "chegou" e "acabou".`
                  : ' · arraste pela alça à esquerda para mudar a ordem. Pelo teclado, use as setas que aparecem ao focar a etapa.'}
            </p>

            {abaixoDoPiso && (
              <p className="mb-2 rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-detail text-warn-fg leading-relaxed">
                Esta jornada já está sendo mostrada a quem relata, com{' '}
                {total === 1 ? 'um passo' : `${total} passos`}. Ela só conta uma história a partir
                de {MIN_PUBLIC_STAGES} — até lá, quem acompanha vê o relato chegar e terminar, sem o
                meio.
              </p>
            )}

            <ol className="mb-4 flex flex-col gap-2">
              {etapas.map((etapa, index) => (
                <li
                  key={etapa.PublicId}
                  // `draggable` so liga quando a pessoa pega pela alca: com a linha
                  // inteira arrastavel, selecionar o texto com o mouse viraria um
                  // arrasto.
                  draggable={arrastando === etapa.PublicId}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    // O Firefox ignora o arrasto sem dado nenhum no evento.
                    event.dataTransfer.setData('text/plain', etapa.PublicId)
                  }}
                  onDragEnter={() => arrastarSobre(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    void soltar()
                  }}
                  onDragEnd={() => void soltar()}
                  className={`rounded-lg border bg-surface-raised ${
                    arrastando === etapa.PublicId ? 'border-accent opacity-60' : 'border-border'
                  }`}
                >
                  {editando === etapa.PublicId ? (
                    <FormularioEtapa
                      inicial={etapa}
                      salvando={salvando}
                      erro={erroForm}
                      onSalvar={(pedido) => void salvar(etapa.PublicId, pedido)}
                      onCancelar={fecharFormulario}
                    />
                  ) : (
                    <div className="flex items-start gap-2 py-2.5 pr-2.5 pl-1.5">
                      {/* A alca fica sempre visivel: e ela que conta que a etapa se
                          move. As setas aparecem no mouse por cima ou no foco do
                          teclado — `opacity-0` nao tira do foco nem do leitor de
                          tela, e elas sao o unico jeito de reordenar sem mouse. */}
                      <button
                        type="button"
                        aria-hidden
                        tabIndex={-1}
                        onMouseDown={() => comecarArrasto(etapa.PublicId)}
                        onTouchStart={() => comecarArrasto(etapa.PublicId)}
                        onMouseUp={cancelarArrasto}
                        onTouchEnd={cancelarArrasto}
                        disabled={editando !== null || movendo}
                        className="mt-0.5 flex size-6 flex-none cursor-grab items-center justify-center rounded text-fg-muted active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
                      >
                        <svg viewBox="0 0 12 12" className="size-3" fill="currentColor" aria-hidden>
                          <circle cx="4.5" cy="2.5" r="1" />
                          <circle cx="7.5" cy="2.5" r="1" />
                          <circle cx="4.5" cy="6" r="1" />
                          <circle cx="7.5" cy="6" r="1" />
                          <circle cx="4.5" cy="9.5" r="1" />
                          <circle cx="7.5" cy="9.5" r="1" />
                        </svg>
                      </button>

                      <div className="mt-0.5 flex flex-none flex-col opacity-0 transition-opacity group-focus-within:opacity-100 hover:opacity-100 focus-within:opacity-100">
                        <MoveButton
                          direction="up"
                          label={`Mover ${etapa.Label} para cima`}
                          disabled={index === 0 || movendo || editando !== null}
                          onClick={() => void mover(index, -1)}
                        />
                        <MoveButton
                          direction="down"
                          label={`Mover ${etapa.Label} para baixo`}
                          disabled={index === etapas.length - 1 || movendo || editando !== null}
                          onClick={() => void mover(index, 1)}
                        />
                      </div>

                      {/* O numero e o que faz a lista parecer a linha do tempo que
                          ela configura, e nao um cadastro. */}
                      <span className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full bg-surface-sunken text-caption text-fg-muted tabular-nums">
                        {index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-medium text-body text-fg">{etapa.Label}</span>
                          {etapa.IsTerminal && (
                            <Etiqueta>
                              Termina aqui
                              {etapa.Outcome ? ` · ${publicOutcomeLabel(etapa.Outcome)}` : ''}
                            </Etiqueta>
                          )}
                          {etapa.AllowsReturn && <Etiqueta>Pode voltar para cá</Etiqueta>}
                          {etapa.AwaitsReporter && <Etiqueta>Espera quem relatou</Etiqueta>}
                        </div>

                        <p className="mt-0.5 text-detail text-fg-muted leading-relaxed">
                          {etapa.Description}
                        </p>

                        {etapa.NextStep && (
                          <p className="mt-1 text-caption text-fg-muted leading-relaxed">
                            Depois: {etapa.NextStep}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-none gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={editando !== null || movendo}
                          onClick={() => abrirFormulario(etapa.PublicId)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={editando !== null || movendo || noPiso}
                          onClick={() => setRemovendo(etapa)}
                        >
                          Remover
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}

        {etapas !== null &&
          etapas.length > 0 &&
          !cheia &&
          (editando === 'nova' ? (
            <div className="rounded-lg border border-border bg-surface-raised">
              <FormularioEtapa
                salvando={salvando}
                erro={erroForm}
                onSalvar={(pedido) => void criar(pedido)}
                onCancelar={fecharFormulario}
              />
            </div>
          ) : (
            <Button
              variant="secondary"
              disabled={editando !== null || movendo}
              onClick={() => abrirFormulario('nova')}
            >
              Nova etapa
            </Button>
          ))}
      </section>

      {/* O mapeamento so aparece depois da jornada, e nao ao lado dela: sem etapa
          publica nao ha para onde apontar, e uma tela com os dois vazios ao mesmo
          tempo nao diz por onde comecar. */}
      {etapas !== null && etapas.length > 0 && <StatusMappingSection etapas={etapas} />}

      <ConfirmDialog
        open={removendo !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setRemovendo(null)
        }}
        title="Remover etapa"
        description="Ela sai da jornada e deixa de aparecer para quem acompanha. Os relatos que já passaram por ela continuam legíveis: o histórico guarda o rótulo que valia na época."
        confirmLabel="Remover"
        onConfirm={() => (removendo ? remover(removendo) : undefined)}
      />
    </div>
  )
}

/**
 * O formulario de uma etapa, no lugar da linha.
 *
 * **E o mesmo componente para criar e para editar**, porque sao os mesmos campos:
 * nao ha nada que so se escolha uma vez. Dois formularios parecidos acabariam
 * divergindo no dia em que um campo novo entrasse so num deles.
 *
 * **O rascunho mora aqui dentro.** A tela de cima so recebe o pedido pronto — e o
 * que permite cancelar sem ter de desfazer nada.
 */
function FormularioEtapa({
  inicial,
  salvando,
  erro,
  onSalvar,
  onCancelar,
}: {
  inicial?: ProjectPublicStageViewModel
  salvando: boolean
  erro: string | null
  onSalvar: (pedido: SaveProjectPublicStageRequest) => void
  onCancelar: () => void
}) {
  const [rascunho, setRascunho] = useState<SaveProjectPublicStageRequest>({
    Label: inicial?.Label ?? '',
    Description: inicial?.Description ?? '',
    NextStep: inicial?.NextStep ?? '',
    IsTerminal: inicial?.IsTerminal ?? false,
    AllowsReturn: inicial?.AllowsReturn ?? false,
    AwaitsReporter: inicial?.AwaitsReporter ?? false,
    Outcome: inicial?.Outcome ?? null,
  })

  function mudar(mudanca: Partial<SaveProjectPublicStageRequest>) {
    setRascunho((atual) => ({ ...atual, ...mudanca }))
  }

  // Sem rotulo, sem frase, e sem desfecho na etapa que termina, nao ha o que
  // gravar. O botao desabilitado diz isso antes de a API ter de dizer — e a API
  // continua dizendo, porque quem chama a rota direto nao passa por aqui.
  const incompleto =
    rascunho.Label.trim().length === 0 ||
    rascunho.Description.trim().length === 0 ||
    (rascunho.IsTerminal && rascunho.Outcome === null)

  function enviar() {
    if (incompleto || salvando) return

    onSalvar({
      ...rascunho,
      // Em branco vira nulo: sao a mesma coisa para quem le a tela, e duas formas
      // de dizer "nao tem" fariam a consulta ter de perguntar as duas.
      NextStep: rascunho.NextStep?.trim() ? rascunho.NextStep.trim() : null,
    })
  }

  return (
    <div className="flex flex-col gap-3 p-3.5">
      <TextField
        label="Como esta etapa se chama"
        value={rascunho.Label}
        onChange={(Label) => mudar({ Label })}
        placeholder="Em análise"
        maxLength={MAX_PUBLIC_STAGE_LABEL_LENGTH}
        disabled={salvando}
        autoFocus
        onSubmit={enviar}
      />

      <TextField
        label="O que dizer a quem está esperando"
        value={rascunho.Description}
        onChange={(Description) => mudar({ Description })}
        placeholder="Alguém da equipe está lendo o seu relato para entender o que aconteceu."
        hint="Uma frase, escrita para a pessoa de fora. É o que separa esta tela da de Estados."
        maxLength={MAX_PUBLIC_STAGE_SENTENCE_LENGTH}
        disabled={salvando}
        onSubmit={enviar}
      />

      <TextField
        label="O que vem depois (opcional)"
        value={rascunho.NextStep ?? ''}
        onChange={(NextStep) => mudar({ NextStep })}
        placeholder="Depois de entender, a equipe decide o que vai ser feito."
        maxLength={MAX_PUBLIC_STAGE_SENTENCE_LENGTH}
        disabled={salvando}
        onSubmit={enviar}
      />

      <div className="flex flex-col gap-2">
        <Check
          label="O relato termina nesta etapa"
          checked={rascunho.IsTerminal}
          disabled={salvando}
          onChange={(IsTerminal) =>
            // Desmarcar leva o desfecho junto: desfecho no meio da jornada e um
            // final que a linha do tempo nao teria como desenhar, e a API recusa.
            mudar({ IsTerminal, Outcome: IsTerminal ? rascunho.Outcome : null })
          }
        />
        <Check
          label="A jornada pode voltar para esta etapa"
          checked={rascunho.AllowsReturn}
          disabled={salvando}
          onChange={(AllowsReturn) => mudar({ AllowsReturn })}
        />
        <Check
          label="Esta etapa espera uma resposta de quem relatou"
          checked={rascunho.AwaitsReporter}
          disabled={salvando}
          onChange={(AwaitsReporter) => mudar({ AwaitsReporter })}
        />
      </div>

      {rascunho.IsTerminal && (
        <Select
          label="Como o relato termina aqui"
          ariaLabel="Como o relato termina aqui"
          value={rascunho.Outcome ?? ''}
          disabled={salvando}
          hint="Esta lista é curta e igual em todos os projetos: é a última coisa que a pessoa lê, e cada equipe com o próprio vocabulário de encerramento traria o jargão de volta."
          onChange={(valor) =>
            mudar({ Outcome: (valor as SaveProjectPublicStageRequest['Outcome']) || null })
          }
          options={[
            { value: '', label: 'Escolha o desfecho' },
            ...PUBLIC_OUTCOMES.map((outcome) => ({
              value: outcome,
              label: publicOutcomeLabel(outcome),
            })),
          ]}
        />
      )}

      {erro && <p className="text-detail text-error-fg leading-relaxed">{erro}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={enviar} disabled={incompleto || salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

/** Uma marca da etapa, dita por extenso. "Terminal" sozinho e palavra nossa. */
function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-border px-1.5 py-0.5 text-caption text-fg-muted">
      {children}
    </span>
  )
}

function Check({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 flex-none accent-accent"
      />
      <span className="text-body text-fg">{label}</span>
    </label>
  )
}

/** Tira o item de uma posicao e o devolve em outra, sem alterar a lista original. */
function reordenar(
  lista: ProjectPublicStageViewModel[],
  de: number,
  para: number,
): ProjectPublicStageViewModel[] {
  const nova = [...lista]
  const [item] = nova.splice(de, 1)
  if (!item) return lista
  nova.splice(para, 0, item)
  return nova
}

/** Duas listas com as mesmas etapas na mesma ordem. Evita gravar o que nao mudou. */
function mesmaOrdem(a: ProjectPublicStageViewModel[], b: ProjectPublicStageViewModel[]): boolean {
  return a.length === b.length && a.every((etapa, index) => etapa.PublicId === b[index]?.PublicId)
}

/**
 * A seta de mover. E um botao com nome proprio para leitor de tela — "Mover Em
 * análise para cima" — porque o glifo sozinho se anuncia como "botao", e numa
 * jornada de sete passos iguais isso nao localiza ninguem.
 */
function MoveButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: 'up' | 'down'
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-5 items-center justify-center rounded text-fg-muted enabled:hover:bg-surface-sunken enabled:hover:text-fg disabled:opacity-30"
    >
      <svg
        viewBox="0 0 12 12"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={direction === 'up' ? 'M3 7.2 6 4.2l3 3' : 'M3 4.8 6 7.8l3-3'} />
      </svg>
    </button>
  )
}
