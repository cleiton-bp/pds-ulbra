import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type CycleSettingsViewModel,
  MAX_DUE_SOON_DAYS,
  MAX_LAST_COLUMN_VISIBLE_DAYS,
  MAX_STATE_NAME_LENGTH,
  type ProjectInitialStateViewModel,
  type ProjectStateViewModel,
  type ProjectStatusMappingViewModel,
} from '@/contracts'
import {
  describeError,
  projectCycleSettingsService,
  projectPublicStageService,
  projectReportService,
  projectStateService,
  projectStatusMappingService,
} from '@/data'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { UnsavedChangesBar } from '@/shared/components/UnsavedChangesBar'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { teamTypeLabel } from '@/shared/lib/teamReportTypes'

/**
 * As colunas do quadro. Na API e no codigo elas sao "estados"; na tela, **colunas**,
 * que e o nome que o time usa — a lista, o filtro e o quadro ja falavam assim.
 *
 * **Os nomes sao do cliente, e essa e a decisao que sustenta o resto.** O projeto
 * nasce com "A fazer", "Fazendo" e "Feito" para o quadro andar no primeiro minuto,
 * e o time renomeia, reordena e cria as que ja usa. Uma lista fixa, escrita por nos,
 * obrigaria todo time a descrever o processo dele com as nossas palavras.
 *
 * **Desativar, e nao apagar.** Nao ha botao de apagar em lugar nenhum desta tela:
 * card antigo aponta para a coluna, e uma coluna que some leva junto o sentido de
 * tudo que passou por ela. O dialogo diz isso com todas as letras — e quantos cards
 * estao nela agora, que e o tamanho do efeito.
 *
 * **Cada coluna diz o que quem relatou ve** enquanto o relato esta nela. A ligacao
 * morava so no fim da tela de Andamento publico: o time criava uma coluna, trabalhava
 * normalmente, e quem relatou continuava lendo "Recebido" sem ninguem perceber. A
 * coluna nova ja nasce ligada a etapa da coluna que vinha antes dela.
 *
 * **Reordenar e otimista.** A seta move a linha na hora e so depois grava: uma
 * seta que espera a resposta para mexer parece quebrada, e aqui o erro tem
 * desfazer — a lista volta para a ordem anterior e o aviso explica.
 *
 * **A entrada de cada tipo tem um "padrao" de verdade na lista.** Escolher essa
 * opcao **apaga** a linha no banco em vez de gravar uma escolha vazia. E o que
 * mantem "o cliente nao configurou" como um estado possivel do projeto, e nao
 * algo que so existe enquanto ninguem abriu esta tela.
 */
export function ProjectStatesScreen() {
  const project = useCurrentProject()

  const {
    data: loaded,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(() => projectStateService.listProjectStates(project.PublicId), [project.PublicId]),
  )

  // Copia local para criar, renomear e mover sem o esqueleto voltar:
  // `useAsyncResource` zera os dados a cada nova busca, e a lista inteira piscando
  // a cada seta faria a tela parecer que recarregou sozinha.
  const [states, setStates] = useState<ProjectStateViewModel[] | null>(null)
  useEffect(() => setStates(loaded), [loaded])

  const [name, setName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [editing, setEditing] = useState<{ publicId: string; value: string } | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)

  const [moving, setMoving] = useState(false)
  const [retiring, setRetiring] = useState<ProjectStateViewModel | null>(null)
  /** Quantos cards estao na coluna que vai ser desativada. Nulo enquanto conta. */
  const [cardsNaColuna, setCardsNaColuna] = useState<number | null>(null)

  /**
   * Abre a pergunta de desativar ja contando os cards da coluna: e o tamanho do
   * efeito, e sem ele quem administra decidia no escuro. A contagem falhando, a
   * pergunta continua — so sem o numero.
   */
  function perguntarDesativar(state: ProjectStateViewModel) {
    setRetiring(state)
    setCardsNaColuna(null)
    projectReportService
      .listReportCounts(project.PublicId)
      .then((contagens) =>
        setCardsNaColuna(
          contagens.find((coluna) => coluna.StatePublicId === state.PublicId)?.Total ?? 0,
        ),
      )
      .catch(() => setCardsNaColuna(null))
  }

  const { data: carregadas, reload: recarregarEntradas } = useAsyncResource(
    useCallback(() => projectStateService.listInitialStates(project.PublicId), [project.PublicId]),
  )
  const [entradas, setEntradas] = useState<ProjectInitialStateViewModel[] | null>(null)
  useEffect(() => setEntradas(carregadas), [carregadas])
  const [salvandoEntrada, setSalvandoEntrada] = useState<string | null>(null)

  /**
   * O destino de quem nao escolheu: a primeira coluna **ativa**, que e a mesma
   * conta que a API faz ao receber o relato.
   *
   * O rotulo mostra o nome dela em vez de descrever a regra. "Primeira coluna da
   * fila" vira mentira no dia em que alguem aposenta a primeira — o relato passa a
   * cair na seguinte, e a tela continuaria dizendo a mesma frase.
   */
  const padrao = states?.find((state) => state.IsActive) ?? null

  // O que quem relatou ve em cada coluna: o mapa da tela de Andamento publico e as
  // etapas dele. **Falhar aqui nao impede mexer nas colunas** — a linha so fica sem a
  // escolha, e a tela de Andamento publico continua sendo o caminho.
  const { data: etapas } = useAsyncResource(
    useCallback(
      () => projectPublicStageService.listPublicStages(project.PublicId),
      [project.PublicId],
    ),
  )
  const { data: mapaLido } = useAsyncResource(
    useCallback(
      () => projectStatusMappingService.getStatusMapping(project.PublicId),
      [project.PublicId],
    ),
  )
  const [mapa, setMapa] = useState<ProjectStatusMappingViewModel | null>(null)
  useEffect(() => setMapa(mapaLido), [mapaLido])
  const [ligando, setLigando] = useState<string | null>(null)

  const etapaDe = (statePublicId: string) =>
    mapa?.Entries.find((entry) => entry.StatePublicId === statePublicId)?.StagePublicId ?? null

  /**
   * Grava o mapa com uma coluna ligada a outra etapa (ou a nenhuma).
   *
   * **Manda o mapa inteiro**, como a tela de Andamento publico: cada gravacao e uma
   * versao, e uma versao e o retrato do conjunto. Aqui cada escolha e uma decisao de
   * verdade — uma versao por escolha, e nao por segundo.
   */
  async function ligar(statePublicId: string, stagePublicId: string | null): Promise<boolean> {
    if (!mapa) return false
    setLigando(statePublicId)

    const outras = mapa.Entries.flatMap((entry) =>
      entry.StatePublicId !== statePublicId && entry.StagePublicId !== null
        ? [{ StatePublicId: entry.StatePublicId, StagePublicId: entry.StagePublicId }]
        : [],
    )

    try {
      setMapa(
        await projectStatusMappingService.saveStatusMapping(project.PublicId, {
          Entries: stagePublicId
            ? [...outras, { StatePublicId: statePublicId, StagePublicId: stagePublicId }]
            : outras,
        }),
      )
      return true
    } catch (failure) {
      toast.error(describeError(failure))
      return false
    } finally {
      setLigando(null)
    }
  }

  async function create() {
    const value = name.trim()
    if (value.length === 0 || creating) return

    setCreating(true)
    setCreateError(null)

    // A coluna nova entra no fim, e o que quem relatou ve nela comeca igual ao da
    // ultima coluna ativa de antes: e a vizinha, e o mais perto do certo. A linha
    // mostra a escolha, e trocar e ali mesmo.
    const vizinha = [...(states ?? [])].reverse().find((state) => state.IsActive)
    const etapaVizinha = vizinha ? etapaDe(vizinha.PublicId) : null

    try {
      const created = await projectStateService.addProjectState(project.PublicId, { Name: value })
      // Entra no fim porque foi onde a API o colocou. Inserir em outro lugar aqui
      // faria a tela discordar da posicao que acabou de ser gravada.
      setStates((list) => [...(list ?? []), created])
      setName('')

      if (etapaVizinha && (await ligar(created.PublicId, etapaVizinha))) {
        const rotulo = etapas?.find((etapa) => etapa.PublicId === etapaVizinha)?.Label
        if (rotulo) toast.done(`Coluna criada. Nela, quem relatou vê “${rotulo}”.`)
      }
    } catch (failure) {
      // Nome em branco, comprido demais ou repetido pertence ao campo: ha o que
      // corrigir, e a correcao e ali.
      setCreateError(describeError(failure))
    } finally {
      setCreating(false)
    }
  }

  async function saveRename() {
    if (!editing || renaming) return

    const value = editing.value.trim()
    if (value.length === 0) return

    setRenaming(true)
    setRenameError(null)

    try {
      const saved = await projectStateService.renameProjectState(
        project.PublicId,
        editing.publicId,
        {
          Name: value,
        },
      )
      setStates((list) =>
        (list ?? []).map((item) => (item.PublicId === saved.PublicId ? saved : item)),
      )
      setEditing(null)
    } catch (failure) {
      setRenameError(describeError(failure))
    } finally {
      setRenaming(false)
    }
  }

  /**
   * Grava a ordem nova, e devolve a anterior se o servidor recusar.
   *
   * E o mesmo caminho para a seta e para o arrastar: os dois so decidem **qual** e
   * a ordem nova, e a gravacao, o otimismo e o desfazer moram aqui, uma vez so.
   */
  async function gravarOrdem(nova: ProjectStateViewModel[], anterior: ProjectStateViewModel[]) {
    if (mesmaOrdem(nova, anterior)) return

    setStates(nova)
    setMoving(true)

    try {
      const saved = await projectStateService.reorderProjectStates(project.PublicId, {
        Order: nova.map((state) => state.PublicId),
      })
      setStates(saved)
    } catch (failure) {
      // Volta para a ordem de antes. Deixar a lista no lugar novo mostraria uma
      // ordem que o banco nao tem.
      setStates(anterior)
      toast.error(describeError(failure))
    } finally {
      setMoving(false)
    }
  }

  async function move(index: number, delta: number) {
    if (!states || moving) return

    const target = index + delta
    if (target < 0 || target >= states.length) return

    await gravarOrdem(reordenar(states, index, target), states)
  }

  /**
   * O arrastar.
   *
   * **A lista se reorganiza enquanto o dedo esta em cima**, e nao so ao soltar: e
   * o que faz a acao parecer direta em vez de um formulario disfarcado. A gravacao
   * acontece uma vez, ao soltar, com a ordem que ficou na tela.
   *
   * `ordemAntes` guarda como estava quando o arrasto comecou — e ela que volta se
   * o servidor recusar, e nao a ordem de uma linha atras.
   */
  const ordemAntes = useRef<ProjectStateViewModel[] | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)

  function comecarArrasto(publicId: string) {
    if (!states) return
    setArrastando(publicId)
    ordemAntes.current = states
  }

  /**
   * Clique na alca sem arrastar.
   *
   * Durante um arrasto o navegador nao dispara `mouseup` — dispara `dragend` —,
   * entao chegar aqui significa que a pessoa so clicou. Sem isto a linha ficaria
   * presa no estado de arrasto, arrastavel e apagada, ate alguem clicar de novo.
   */
  function cancelarArrasto() {
    setArrastando(null)
    ordemAntes.current = null
  }

  function arrastarSobre(indexAlvo: number) {
    if (!states || arrastando === null) return

    const atual = states.findIndex((state) => state.PublicId === arrastando)
    if (atual === -1 || atual === indexAlvo) return

    setStates(reordenar(states, atual, indexAlvo))
  }

  async function soltar() {
    const anterior = ordemAntes.current
    setArrastando(null)
    ordemAntes.current = null

    if (!states || anterior === null) return

    await gravarOrdem(states, anterior)
  }

  async function escolherEntrada(
    reportType: ProjectInitialStateViewModel['ReportType'],
    statePublicId: string | null,
  ) {
    setSalvandoEntrada(reportType)

    try {
      const salva = await projectStateService.setInitialState(project.PublicId, {
        ReportType: reportType,
        StatePublicId: statePublicId,
      })
      setEntradas((lista) =>
        (lista ?? []).map((item) => (item.ReportType === salva.ReportType ? salva : item)),
      )
    } catch (failure) {
      toast.error(describeError(failure))
    } finally {
      setSalvandoEntrada(null)
    }
  }

  async function setActive(state: ProjectStateViewModel, active: boolean) {
    try {
      const saved = active
        ? await projectStateService.activateProjectState(project.PublicId, state.PublicId)
        : await projectStateService.deactivateProjectState(project.PublicId, state.PublicId)

      setStates((list) =>
        (list ?? []).map((item) => (item.PublicId === saved.PublicId ? saved : item)),
      )
      toast.done(active ? 'Coluna de volta ao quadro.' : 'Coluna desativada.')
    } catch (failure) {
      // A recusa mais provavel aqui e a de desativar a entrada de um tipo, e a
      // mensagem da API ja diz o que fazer. Recarregar a lista de entradas junto
      // porque ela e o caminho da correcao, e pode ter mudado noutra aba.
      toast.error(describeError(failure))
      recarregarEntradas()
    }
  }

  return (
    <div className="max-w-160">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Colunas do quadro</h1>
      <p className="mb-8 text-fg-muted text-body">
        As colunas do quadro, na ordem em que o trabalho anda. Valem para relatos e cards do time.
      </p>

      <section>
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">
          Projeto novo começa com{' '}
          <strong className="font-medium text-fg">A fazer, Fazendo e Feito</strong>: renomeie,
          reordene ou crie as que o time já usa. De fábrica, a última coluna ativa encerra o relato;
          em Ciclo, dá para encerrar por um botão.
        </p>

        {failed && (
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
              Não deu para carregar as colunas deste projeto agora. A falha foi ao consultar: o
              quadro continua exatamente como estava.
            </p>
            <Button onClick={reload}>Tentar de novo</Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-2">
            {['w-32', 'w-40', 'w-28'].map((width) => (
              <div
                key={width}
                className="flex h-12 items-center rounded-lg border border-border bg-surface-raised px-3.5"
              >
                <Skeleton className={`h-3 ${width}`} />
              </div>
            ))}
          </div>
        )}

        {states !== null && states.length === 0 && (
          <p className="mb-4 rounded-lg border border-border border-dashed px-3.5 py-5 text-center text-detail text-fg-muted leading-relaxed">
            O quadro ainda não tem colunas. A primeira costuma ser onde o card chega para alguém
            olhar.
          </p>
        )}

        {states !== null && states.length > 1 && (
          <p className="mb-2 text-caption text-fg-muted">
            Arraste pela alça à esquerda para mudar a ordem, ou use as setas.
          </p>
        )}

        {states !== null && states.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {states.map((state, index) => (
              <li
                key={state.PublicId}
                // `draggable` so liga quando a pessoa pega pela alca. Com a linha
                // inteira arrastavel, selecionar o nome com o mouse viraria um
                // arrasto e renomear ficaria desconfortavel.
                draggable={arrastando === state.PublicId}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  // O Firefox ignora o arrasto sem dado nenhum no evento.
                  event.dataTransfer.setData('text/plain', state.PublicId)
                }}
                onDragEnter={() => arrastarSobre(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  void soltar()
                }}
                onDragEnd={() => void soltar()}
                className={`group flex flex-wrap items-center gap-2 rounded-lg border bg-surface-raised py-2 pr-2 pl-1.5 ${
                  arrastando === state.PublicId ? 'border-accent opacity-60' : 'border-border'
                }`}
              >
                {/* A alca e as setas ficam sempre visiveis, como em todas as listas
                    da configuracao: a alca conta que a linha se move, e as setas sao
                    o jeito de reordenar sem mouse. Escondidas ate o foco, ninguem
                    descobria que existiam. */}
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onMouseDown={() => comecarArrasto(state.PublicId)}
                  onTouchStart={() => comecarArrasto(state.PublicId)}
                  onMouseUp={cancelarArrasto}
                  onTouchEnd={cancelarArrasto}
                  disabled={editing !== null || moving}
                  className="flex size-6 flex-none cursor-grab items-center justify-center rounded text-fg-muted active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
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

                <div className="flex flex-none flex-col">
                  <MoveButton
                    direction="up"
                    label={`Mover ${state.Name} para cima`}
                    disabled={index === 0 || moving || editing !== null}
                    onClick={() => move(index, -1)}
                  />
                  <MoveButton
                    direction="down"
                    label={`Mover ${state.Name} para baixo`}
                    disabled={index === states.length - 1 || moving || editing !== null}
                    onClick={() => move(index, 1)}
                  />
                </div>

                {editing?.publicId === state.PublicId ? (
                  <>
                    <TextField
                      className="min-w-0 flex-1"
                      ariaLabel={`Novo nome para ${state.Name}`}
                      value={editing.value}
                      onChange={(value) => {
                        setEditing({ publicId: state.PublicId, value })
                        if (renameError) setRenameError(null)
                      }}
                      error={renameError}
                      maxLength={MAX_STATE_NAME_LENGTH}
                      disabled={renaming}
                      autoFocus
                      onSubmit={saveRename}
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={editing.value.trim().length === 0 || renaming}
                      onClick={saveRename}
                    >
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <span
                      className={`min-w-0 flex-1 truncate text-body ${
                        state.IsActive ? 'text-fg' : 'text-fg-muted line-through'
                      }`}
                    >
                      {state.Name}
                    </span>

                    {!state.IsActive && (
                      <span className="flex-none text-caption text-fg-muted">Desativada</span>
                    )}

                    {/* O rotulo visivel e curto porque a linha e estreita, e o nome
                        acessivel traz a coluna junto: numa lista de oito linhas,
                        oito botoes chamados "Editar" nao localizam ninguem. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Editar ${state.Name}`}
                      onClick={() => {
                        setRenameError(null)
                        setEditing({ publicId: state.PublicId, value: state.Name })
                      }}
                    >
                      Editar
                    </Button>

                    {state.IsActive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Desativar ${state.Name}`}
                        onClick={() => perguntarDesativar(state)}
                      >
                        Desativar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Reativar ${state.Name}`}
                        onClick={() => setActive(state, true)}
                      >
                        Reativar
                      </Button>
                    )}
                  </>
                )}

                {/* O que quem relatou ve enquanto o relato esta nesta coluna. A
                    coluna desativada sem ligacao nao tem o que escolher: nenhum
                    relato novo entra nela. */}
                {mapa !== null &&
                  etapas !== null &&
                  (state.IsActive || etapaDe(state.PublicId)) && (
                    <div className="flex basis-full items-center gap-2 pl-13 text-caption text-fg-muted">
                      <span className="flex-none">Quem relatou vê:</span>
                      <Select
                        className="min-w-0 max-w-56 flex-1"
                        size="sm"
                        ariaLabel={`O que quem relatou vê com o relato em ${state.Name}`}
                        value={etapaDe(state.PublicId) ?? ''}
                        disabled={ligando !== null}
                        onChange={(valor) => void ligar(state.PublicId, valor || null)}
                        options={[
                          { value: '', label: 'Nada muda para quem relatou' },
                          ...etapas.map((etapa) => ({ value: etapa.PublicId, label: etapa.Label })),
                        ]}
                      />
                    </div>
                  )}
              </li>
            ))}
          </ul>
        )}

        {mapa !== null && (
          <p className="mb-4 text-caption text-fg-muted leading-relaxed">
            As etapas que quem relatou acompanha, e o texto de cada uma, ficam em{' '}
            <Link to="../public-stages" className="text-fg underline underline-offset-4">
              Andamento público
            </Link>
            .
          </p>
        )}

        {states !== null && (
          <div className="flex items-end gap-2">
            <TextField
              className="min-w-0 flex-1"
              label="Nova coluna"
              value={name}
              onChange={(value) => {
                setName(value)
                if (createError) setCreateError(null)
              }}
              placeholder="Ex.: Em revisão"
              error={createError}
              maxLength={MAX_STATE_NAME_LENGTH}
              disabled={creating}
              onSubmit={create}
            />
            <Button
              variant="primary"
              disabled={name.trim().length === 0 || creating}
              onClick={create}
            >
              Criar coluna
            </Button>
          </div>
        )}
      </section>

      <BoardRules projectPublicId={project.PublicId} />

      {states !== null && entradas !== null && (
        <section className="mt-10">
          <h2 className="mb-1 font-semibold text-lead">Onde cada relato entra</h2>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            Um defeito e uma dúvida não precisam começar no mesmo lugar. Escolha uma coluna fixa por
            tipo, ou deixe seguindo a fila — aí o relato cai sempre na primeira coluna ativa, mesmo
            que você reordene depois.{' '}
            <strong className="font-medium text-fg">
              Trocar aqui não mexe nos relatos que já entraram
            </strong>
            : vale para o próximo que chegar.
          </p>

          {states.length === 0 ? (
            <p className="rounded-lg border border-border border-dashed px-3.5 py-5 text-center text-detail text-fg-muted leading-relaxed">
              Crie a primeira coluna acima e esta escolha aparece aqui.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entradas.map((entrada) => (
                <li
                  key={entrada.ReportType}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3.5 py-2"
                >
                  <span className="flex-1 text-body text-fg">
                    {teamTypeLabel(entrada.ReportType)}
                  </span>

                  <Select
                    className="min-w-0 max-w-56 flex-1"
                    size="sm"
                    ariaLabel={`Onde entra um relato do tipo ${teamTypeLabel(entrada.ReportType)}`}
                    value={entrada.StatePublicId ?? ''}
                    disabled={salvandoEntrada === entrada.ReportType}
                    onChange={(valor) => escolherEntrada(entrada.ReportType, valor || null)}
                    options={[
                      // O padrao e uma opcao de verdade, e nao a ausencia de
                      // escolha: escolhe-la apaga a linha no banco. Sem ela, quem
                      // configurou uma vez nao teria como voltar atras.
                      {
                        value: '',
                        // Diz o que a opcao **faz**, e nao so onde ela cai hoje.
                        // "Padrão — Backlog" ao lado de "Backlog" parecia a mesma
                        // coisa escrita duas vezes; a diferenca e que uma acompanha
                        // a fila e a outra fixa aquela coluna.
                        label: padrao
                          ? `Seguir a fila (hoje: ${padrao.Name})`
                          : 'Seguir a fila (nenhuma coluna ativa)',
                      },
                      // Coluna desativada nao e destino: mandar relato novo para
                      // ela desfaria pela porta dos fundos o que desativar decidiu.
                      // A ja escolhida fica, para a tela nao mostrar em branco.
                      ...states
                        .filter(
                          (state) => state.IsActive || state.PublicId === entrada.StatePublicId,
                        )
                        .map((state) => ({ value: state.PublicId, label: state.Name })),
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ConfirmDialog
        open={retiring !== null}
        onOpenChange={(open) => {
          if (!open) setRetiring(null)
        }}
        title={retiring ? `Desativar “${retiring.Name}”` : 'Desativar coluna'}
        description={
          retiring && cardsNaColuna !== null && cardsNaColuna > 0
            ? `“${retiring.Name}” tem ${cardsNaColuna === 1 ? '1 card' : `${cardsNaColuna} cards`}. ${cardsNaColuna === 1 ? 'Ele continua' : 'Eles continuam'} nela, numa coluna marcada como desativada, até alguém arrastá-${cardsNaColuna === 1 ? 'lo' : 'los'}. Cards novos não entram mais nela, e nada é apagado: dá para trazer a coluna de volta quando quiser.`
            : 'Ela sai do quadro e deixa de receber card novo, mas não é apagada: o nome continua no histórico dos cards que já passaram por ela. Dá para trazer de volta quando quiser.'
        }
        confirmLabel="Desativar"
        onConfirm={() => (retiring ? setActive(retiring, false) : undefined)}
      />
    </div>
  )
}

/**
 * Como o quadro mostra o fim e os prazos.
 *
 * **Mora aqui, perto das colunas**, e nao no Ciclo: as duas regras falam do quadro —
 * quantos dias a ultima coluna mostra, e quando o prazo fica em destaque. Sao
 * campos do mesmo registro das regras do ciclo, e o salvamento manda de volta o que
 * veio, com so estes dois mudados: mandar so os visiveis apagaria os outros.
 */
function BoardRules({ projectPublicId }: { projectPublicId: string }) {
  const { data: lidas } = useAsyncResource(
    useCallback(
      () => projectCycleSettingsService.getCycleSettings(projectPublicId),
      [projectPublicId],
    ),
  )

  const [salvas, setSalvas] = useState<CycleSettingsViewModel | null>(null)
  const [dias, setDias] = useState(0)
  const [destaque, setDestaque] = useState(0)
  const [salvando, setSalvando] = useState(false)

  const voltar = useCallback((regras: CycleSettingsViewModel | null) => {
    setSalvas(regras)
    if (!regras) return
    setDias(regras.LastColumnVisibleDays)
    setDestaque(regras.DueSoonDays)
  }, [])

  useEffect(() => voltar(lidas), [lidas, voltar])

  // Sem as regras, a secao nao aparece: e um ajuste fino, e a falha nao pode tomar
  // o lugar da lista de colunas.
  if (!salvas) return null

  const mudou = dias !== salvas.LastColumnVisibleDays || destaque !== salvas.DueSoonDays

  async function salvar() {
    if (!salvas || salvando) return
    setSalvando(true)

    try {
      voltar(
        await projectCycleSettingsService.saveCycleSettings(projectPublicId, {
          ...salvas,
          LastColumnVisibleDays: dias,
          DueSoonDays: destaque,
        }),
      )
      toast.done('Regras do quadro salvas.')
    } catch (failure) {
      toast.error(describeError(failure))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="mt-10">
      <h2 className="mb-1 font-semibold text-lead">Como o quadro mostra o fim e os prazos</h2>
      <p className="mb-4 text-detail text-fg-muted leading-relaxed">
        A última coluna só cresce — é onde o trabalho termina. Ela mostra só o que entrou nela há
        pouco tempo; <strong className="font-medium text-fg">o resto continua na lista</strong> da
        tela de Trabalho, e nada sai do projeto. Com uma coluna só, a regra não vale: ali ainda é a
        entrada da fila.
      </p>

      <NumeroDeDias
        id="ultima-coluna"
        rotulo="A última coluna mostra o que entrou nela nos últimos"
        maximo={MAX_LAST_COLUMN_VISIBLE_DAYS}
        valor={dias}
        aoTrocar={setDias}
        explicacao={
          dias === 0
            ? 'Zero: mostra todos, por mais antigos que sejam.'
            : 'O card que entrou nela antes disso sai do quadro e continua na lista.'
        }
      />

      <NumeroDeDias
        id="prazo-perto"
        rotulo="O prazo fica em destaque faltando"
        maximo={MAX_DUE_SOON_DAYS}
        valor={destaque}
        aoTrocar={setDestaque}
        explicacao={
          destaque === 0
            ? 'Zero: só no próprio dia, em amarelo. O vencido aparece sempre, em vermelho.'
            : 'Em amarelo, no quadro e na lista. O vencido aparece sempre, em vermelho.'
        }
      />

      <UnsavedChangesBar
        dirty={mudou}
        saving={salvando}
        onSave={() => void salvar()}
        onDiscard={() => voltar(salvas)}
      />
    </section>
  )
}

/**
 * Um numero de dias, de zero ao teto. Um `number` de verdade: teclado numerico no
 * telefone e letra recusada pelo navegador. Campo vazio vira zero, e nao `NaN`, que
 * quebraria a conta de "ha mudanca".
 */
function NumeroDeDias({
  id,
  rotulo,
  valor,
  maximo,
  explicacao,
  aoTrocar,
}: {
  id: string
  rotulo: string
  valor: number
  maximo: number
  explicacao: string
  aoTrocar: (valor: number) => void
}) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1.5 block text-detail text-fg-muted">
        {rotulo}
      </label>
      <div className="mb-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={0}
          max={maximo}
          value={valor}
          onChange={(evento) =>
            aoTrocar(Math.max(0, Number.parseInt(evento.target.value, 10) || 0))
          }
          className="h-9 w-28 rounded-lg border border-border bg-surface-raised px-3 text-body text-fg"
        />
        <span className="text-detail text-fg-muted">dias</span>
      </div>
      <p className="text-caption text-fg-muted leading-relaxed">{explicacao}</p>
    </div>
  )
}

/** Tira o item de uma posicao e o devolve em outra, sem alterar a lista original. */
function reordenar(
  lista: ProjectStateViewModel[],
  de: number,
  para: number,
): ProjectStateViewModel[] {
  const nova = [...lista]
  const [item] = nova.splice(de, 1)
  if (!item) return lista
  nova.splice(para, 0, item)
  return nova
}

/** Duas listas com os mesmos estados na mesma ordem. Evita gravar o que nao mudou. */
function mesmaOrdem(a: ProjectStateViewModel[], b: ProjectStateViewModel[]): boolean {
  return a.length === b.length && a.every((state, index) => state.PublicId === b[index]?.PublicId)
}

/**
 * A seta de mover. E um botao com nome proprio para leitor de tela — "Mover
 * Análise para cima" — porque o glifo sozinho se anuncia como "botao", e numa
 * lista de oito linhas iguais isso nao localiza ninguem.
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
