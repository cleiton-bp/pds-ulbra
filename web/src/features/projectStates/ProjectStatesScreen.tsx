import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_STATE_NAME_LENGTH,
  type ProjectInitialStateViewModel,
  type ProjectStateViewModel,
} from '@/contracts'
import { describeError, projectStateService } from '@/data'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { teamTypeLabel } from '@/shared/lib/teamReportTypes'

/**
 * A fila de trabalho do projeto.
 *
 * **Os nomes sao do cliente, e essa e a decisao que sustenta o resto.** Uma lista
 * fixa, escrita por nos, obrigaria todo time a descrever o processo dele com as
 * nossas palavras — e a traducao entre o que acontece por dentro e o que a pessoa
 * de fora acompanha viraria mapear os nossos nomes nos nossos nomes.
 *
 * **Aposentar, e nao apagar.** Nao ha botao de remover em lugar nenhum desta
 * tela: relato antigo aponta para o estado, e um estado que some leva junto o
 * sentido de tudo que passou por ele. O texto do dialogo diz isso com todas as
 * letras, porque "aposentar" sozinho soa como um jeito educado de apagar.
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

  async function create() {
    const value = name.trim()
    if (value.length === 0 || creating) return

    setCreating(true)
    setCreateError(null)

    try {
      const created = await projectStateService.addProjectState(project.PublicId, { Name: value })
      // Entra no fim porque foi onde a API o colocou. Inserir em outro lugar aqui
      // faria a tela discordar da posicao que acabou de ser gravada.
      setStates((list) => [...(list ?? []), created])
      setName('')
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
      toast.done(active ? 'Estado de volta à fila.' : 'Estado aposentado.')
    } catch (failure) {
      // A recusa mais provavel aqui e a de aposentar a entrada de um tipo, e a
      // mensagem da API ja diz o que fazer. Recarregar a lista de entradas junto
      // porque ela e o caminho da correcao, e pode ter mudado noutra aba.
      toast.error(describeError(failure))
      recarregarEntradas()
    }
  }

  return (
    <div className="max-w-160">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Estados</h1>
      <p className="mb-8 text-fg-muted text-body">
        As etapas por onde o relato passa aqui dentro, com os nomes que a sua equipe usa.
      </p>

      <section>
        <h2 className="mb-1 font-semibold text-lead">A sua fila de trabalho</h2>
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">
          Nós não escolhemos estas etapas por você: quem conhece o processo é quem trabalha nele.
          Escreva os nomes que a equipe já usa no dia a dia —{' '}
          <strong className="font-medium text-fg">
            "Análise", "Corrigindo", "Testando", "Pronto"
          </strong>{' '}
          — e coloque na ordem em que o trabalho anda.
        </p>

        {failed && (
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
              Não deu para carregar os estados deste projeto agora. A falha foi ao consultar: a sua
              fila continua exatamente como estava.
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
            A sua fila ainda está vazia. O primeiro estado costuma ser o lugar onde o relato chega
            para alguém olhar.
          </p>
        )}

        {states !== null && states.length > 1 && (
          <p className="mb-2 text-caption text-fg-muted">
            Arraste pela alça à esquerda para mudar a ordem. Pelo teclado, use as setas que aparecem
            ao focar a linha.
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
                className={`group flex items-center gap-2 rounded-lg border bg-surface-raised py-2 pr-2 pl-1.5 ${
                  arrastando === state.PublicId ? 'border-accent opacity-60' : 'border-border'
                }`}
              >
                {/* A alca fica sempre visivel: e ela que conta que a linha se
                    move. As setas aparecem no mouse por cima ou no foco do
                    teclado — elas continuam alcancaveis por Tab, porque
                    `opacity-0` nao tira do foco nem do leitor de tela, e sao o
                    unico jeito de reordenar sem mouse. */}
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

                <div className="flex flex-none flex-col opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
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
                      <span className="flex-none text-caption text-fg-muted">Aposentado</span>
                    )}

                    {/* O rotulo visivel e curto porque a linha e estreita, e o nome
                        acessivel traz o estado junto: numa lista de oito linhas,
                        oito botoes chamados "Renomear" nao localizam ninguem. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Renomear ${state.Name}`}
                      onClick={() => {
                        setRenameError(null)
                        setEditing({ publicId: state.PublicId, value: state.Name })
                      }}
                    >
                      Renomear
                    </Button>

                    {state.IsActive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Aposentar ${state.Name}`}
                        onClick={() => setRetiring(state)}
                      >
                        Aposentar
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
              </li>
            ))}
          </ul>
        )}

        {states !== null && (
          <div className="flex items-start gap-2">
            <TextField
              className="min-w-0 flex-1"
              ariaLabel="Nome do estado"
              value={name}
              onChange={(value) => {
                setName(value)
                if (createError) setCreateError(null)
              }}
              placeholder="Corrigindo"
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
              Criar estado
            </Button>
          </div>
        )}
      </section>

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
              Crie o primeiro estado acima e esta escolha aparece aqui.
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
                      // Coluna aposentada nao e destino: mandar relato novo para
                      // ela desfaria pela porta dos fundos o que aposentar decidiu.
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
        title="Aposentar estado"
        description="Ele sai da fila e deixa de receber relato novo, mas não é apagado: o nome continua no histórico dos relatos que já passaram por ele. Dá para trazer de volta quando quiser."
        confirmLabel="Aposentar"
        onConfirm={() => (retiring ? setActive(retiring, false) : undefined)}
      />
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
