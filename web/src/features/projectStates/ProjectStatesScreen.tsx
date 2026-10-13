import { type ReactNode, useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MAX_STATE_NAME_LENGTH,
  type ProjectStateViewModel,
  type ProjectStatusMappingViewModel,
} from '@/contracts'
import {
  describeError,
  projectPublicStageService,
  projectReportService,
  projectReportTypeService,
  projectStateService,
  projectStatusMappingService,
} from '@/data'
import { BoardRules, CAMPOS_DO_QUADRO_CHAVES } from '@/features/projectStates/BoardRules'
import { type StateDraft, StateEditor } from '@/features/projectStates/StateEditor'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { LeaveGuard } from '@/shared/components/LeaveGuard'
import { LiveBadge } from '@/shared/components/LiveBadge'
import { MiniBoard, type MiniBoardColumn } from '@/shared/components/MiniBoard'
import { Skeleton } from '@/shared/components/Skeleton'
import { SortableListItem } from '@/shared/components/SortableListItem'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useClosingItem } from '@/shared/hooks/useClosingItem'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { useListOrder } from '@/shared/hooks/useListOrder'
import { useCycleSettingsDraft } from '@/shared/hooks/useSettingsDraft'
import { CYCLE_DEFAULTS } from '@/shared/lib/factoryDefaults'

/** O nome do acordeao desta tela: uma coluna aberta de cada vez. Ver `SortableListItem`. */
const ACORDEAO = 'colunas'

/**
 * As colunas do quadro. Na API e no codigo elas sao "estados"; na tela, **colunas**,
 * que e o nome que o time usa — a lista, o filtro e o quadro ja falavam assim.
 *
 * **Os nomes sao do cliente, e essa e a decisao que sustenta o resto.** O projeto
 * nasce com "A fazer", "Fazendo" e "Feito" para o quadro andar no primeiro minuto,
 * e o time renomeia, reordena e cria as que ja usa. Uma lista fixa, escrita por nos,
 * obrigaria todo time a descrever o processo dele com as nossas palavras.
 *
 * **Duas colunas, como Tipos de relato e Andamento público** (`EditorWithPreview`): a
 * lista a esquerda, e a direita o quadro que ela forma, com o que quem relatou ve
 * embaixo de cada coluna — a perda de detalhe entre as duas e de proposito, e so vendo
 * lado a lado da para conferir.
 *
 * **Cada coluna e um item de acordeao** (`SortableListItem`): fechada, diz o que quem
 * relatou ve e marca o que ela faz de diferente — a entrada de um tipo, a que encerra o
 * relato, a desativada. Antes nada disso aparecia, e a recusa de desativar a entrada so
 * chegava num aviso depois de tentar.
 *
 * **Nome e "Quem relatou ve" num Salvar so.** Eram dois jeitos de gravar na mesma linha
 * (um com Salvar, outro na hora). O mapa e versionado — cada gravacao e um retrato do
 * conjunto —, entao ele so e gravado quando a etapa mudou: renomear nao cria versao.
 *
 * **Desativar, e nao apagar.** Nao ha botao de apagar em lugar nenhum desta tela:
 * card antigo aponta para a coluna, e uma coluna que some leva junto o sentido de
 * tudo que passou por ela. O dialogo diz isso com todas as letras — e quantos cards
 * estao nela agora, que e o tamanho do efeito. A coluna que e entrada de um tipo nao
 * se desativa, e a linha diz onde trocar em vez de oferecer um botao que so recusa.
 *
 * **Reordenar, criar e desativar valem na hora** (`useListOrder`, otimista com
 * desfazer), como diz o selo do titulo. A coluna nova ja nasce ligada a etapa da
 * coluna que vinha antes dela.
 *
 * **A coluna em que cada relato entra nao mora aqui.** Ela e do tipo de relato, na tela
 * Tipos de relato; esta tela so marca e aponta para la.
 */
export function ProjectStatesScreen() {
  const project = useCurrentProject()
  const base = useId()
  const idResumo = (publicId: string) => `${base}-resumo-${publicId}`
  const idAtivo = (publicId: string) => `${base}-ativo-${publicId}`
  const idEntrada = (publicId: string) => `${base}-entrada-${publicId}`

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

  /** A coluna aberta e o rascunho dela. */
  const [aberto, setAberto] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<StateDraft | null>(null)
  const [erroNome, setErroNome] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  /** A troca que espera a confirmacao: abrir outra coluna (`destino`), ou fechar (`null`). */
  const [troca, setTroca] = useState<{ destino: string | null } | null>(null)
  // A coluna que acabou de fechar continua desenhada ate o fim do movimento.
  const { closing: fechando, markClosing } = useClosingItem<StateDraft>()

  const [retiring, setRetiring] = useState<ProjectStateViewModel | null>(null)
  /** Quantos cards estao na coluna que vai ser desativada. Nulo enquanto conta. */
  const [cardsNaColuna, setCardsNaColuna] = useState<number | null>(null)

  // Reordenar e otimista: a seta e o arrastar movem na hora, e a lista volta se o
  // servidor recusar. Enquanto o Salvar de uma coluna grava, a ordem espera.
  const ordem = useListOrder({
    items: states,
    setItems: setStates,
    idOf: (state) => state.PublicId,
    save: (Order) => projectStateService.reorderProjectStates(project.PublicId, { Order }),
    busy: salvando,
    focusFallback: idResumo,
  })

  // O que quem relatou ve em cada coluna: o mapa e as etapas do andamento. **Falhar aqui
  // nao impede mexer nas colunas** — a coluna so fica sem a escolha, e o nome continua.
  const { data: etapas, failed: etapasFalharam } = useAsyncResource(
    useCallback(
      () => projectPublicStageService.listPublicStages(project.PublicId),
      [project.PublicId],
    ),
  )
  const { data: mapaLido, failed: mapaFalhou } = useAsyncResource(
    useCallback(
      () => projectStatusMappingService.getStatusMapping(project.PublicId),
      [project.PublicId],
    ),
  )
  const [mapa, setMapa] = useState<ProjectStatusMappingViewModel | null>(null)
  useEffect(() => setMapa(mapaLido), [mapaLido])

  // Os tipos, para marcar a entrada de cada um. Falhando, as colunas so ficam sem a
  // marca, e a recusa da API continua sendo o aviso.
  const { data: tipos } = useAsyncResource(
    useCallback(
      () => projectReportTypeService.listReportTypes(project.PublicId),
      [project.PublicId],
    ),
  )

  // As regras do quadro (o grupo "Fim e prazos") e, do mesmo registro, quando o relato
  // encerra — para marcar a coluna que encerra.
  const regras = useCycleSettingsDraft(
    project.PublicId,
    CAMPOS_DO_QUADRO_CHAVES,
    'Regras do quadro salvas.',
  )

  const etapaDe = (statePublicId: string) =>
    mapa?.Entries.find((entry) => entry.StatePublicId === statePublicId)?.StagePublicId ?? null

  const primeiraAtiva = states?.find((state) => state.IsActive) ?? null
  const ultimaAtiva = states
    ? ([...states].reverse().find((state) => state.IsActive) ?? null)
    : null
  const encerraNaUltima = regras.published?.ClosureTrigger === 'LastColumn'

  /** Os tipos ativos cujo relato entra nesta coluna: a escolhida, ou a primeira ativa. */
  const tiposQueEntram = (state: ProjectStateViewModel) =>
    (tipos ?? [])
      .filter(
        (tipo) =>
          tipo.IsActive &&
          (tipo.InitialStatePublicId === state.PublicId ||
            (tipo.InitialStatePublicId === null && primeiraAtiva?.PublicId === state.PublicId)),
      )
      .map((tipo) => tipo.Name)

  /**
   * Os tipos que impedem desativar: os que escolheram esta coluna, **os desativados
   * tambem**, como na API — reativar um deles faria o relato cair numa coluna desativada.
   * A primeira ativa nao entra aqui: sem ela, a entrada so passa para a seguinte.
   */
  const tiposQuePrendem = (state: ProjectStateViewModel) =>
    (tipos ?? [])
      .filter((tipo) => tipo.InitialStatePublicId === state.PublicId)
      .map((tipo) => tipo.Name)

  const encerra = (state: ProjectStateViewModel) =>
    encerraNaUltima && ultimaAtiva?.PublicId === state.PublicId

  const colunaAberta =
    aberto !== null ? states?.find((state) => state.PublicId === aberto) : undefined

  /** A etapa que a coluna mostra agora: a do rascunho, na aberta; senao, a do mapa. */
  function etapaNaTela(state: ProjectStateViewModel): string | null {
    if (aberto === state.PublicId && rascunho?.etapa !== undefined) return rascunho.etapa || null
    return etapaDe(state.PublicId)
  }

  const mudouNome = (state: ProjectStateViewModel, draft: StateDraft) =>
    draft.nome.trim() !== state.Name
  const mudouEtapa = (state: ProjectStateViewModel, draft: StateDraft) =>
    mapa !== null && draft.etapa !== undefined && draft.etapa !== (etapaDe(state.PublicId) ?? '')

  const sujo =
    colunaAberta !== undefined &&
    rascunho !== null &&
    (mudouNome(colunaAberta, rascunho) || mudouEtapa(colunaAberta, rascunho))
  const podeSalvar = rascunho !== null && rascunho.nome.trim().length > 0

  /** O foco vai para `id` depois do proximo desenho: o alvo so existe depois dele. */
  function devolverFoco(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  /** Abre `destino` (ou fecha tudo, com `null`) sem perguntar: quem pergunta e `pedirTroca`. */
  function irPara(destino: string | null) {
    if (aberto !== null && rascunho) markClosing(aberto, rascunho)
    setErro(null)
    setErroNome(null)
    setAberto(destino)
    const alvo = destino === null ? undefined : states?.find((s) => s.PublicId === destino)
    setRascunho(alvo ? { nome: alvo.Name } : null)
  }

  /**
   * Abrir outra coluna, ou fechar a aberta. **Com mudanca por salvar, pergunta antes**: o
   * rascunho de uma coluna so vive enquanto ela esta aberta.
   */
  function pedirTroca(destino: string | null) {
    if (destino === aberto) return
    if (sujo) setTroca({ destino })
    else irPara(destino)
  }

  function confirmarTroca() {
    if (!troca) return
    const { destino } = troca
    const anterior = aberto
    irPara(destino)
    if (destino !== null) devolverFoco(idResumo(destino))
    else if (anterior !== null) devolverFoco(idResumo(anterior))
  }

  /** Cancelar e desistir de proposito: fecha sem perguntar, e o foco volta ao resumo. */
  function cancelar() {
    const alvo = aberto
    irPara(null)
    if (alvo) devolverFoco(idResumo(alvo))
  }

  const trocarColuna = (salva: ProjectStateViewModel) =>
    setStates((lista) =>
      (lista ?? []).map((item) => (item.PublicId === salva.PublicId ? salva : item)),
    )

  /**
   * O mapa com uma coluna ligada a outra etapa (ou a nenhuma).
   *
   * **Manda o mapa inteiro**, como a tela de Andamento publico: cada gravacao e uma
   * versao, e uma versao e o retrato do conjunto.
   */
  function gravarMapa(statePublicId: string, stagePublicId: string | null) {
    const outras = (mapa?.Entries ?? []).flatMap((entry) =>
      entry.StatePublicId !== statePublicId && entry.StagePublicId !== null
        ? [{ StatePublicId: entry.StatePublicId, StagePublicId: entry.StagePublicId }]
        : [],
    )
    return projectStatusMappingService.saveStatusMapping(project.PublicId, {
      Entries: stagePublicId
        ? [...outras, { StatePublicId: statePublicId, StagePublicId: stagePublicId }]
        : outras,
    })
  }

  /**
   * O Salvar da coluna aberta: renomeia se o nome mudou e grava o mapa se a etapa mudou —
   * **so o que mudou**, porque cada gravacao do mapa e uma versao.
   *
   * O nome vai primeiro, e e o erro mais provavel (repetido, em branco): fica no campo.
   * Se o nome gravou e o mapa nao, a mensagem diz o que ficou salvo, e o rascunho guarda
   * a etapa — o proximo Salvar tenta so ela.
   */
  async function salvar() {
    if (!colunaAberta || !rascunho || salvando || !podeSalvar) return

    const coluna = colunaAberta
    const draft = rascunho
    const renomear = mudouNome(coluna, draft)
    const religar = mudouEtapa(coluna, draft)

    if (!renomear && !religar) {
      irPara(null)
      devolverFoco(idResumo(coluna.PublicId))
      return
    }

    setSalvando(true)
    setErro(null)
    setErroNome(null)

    let renomeou = false
    try {
      if (renomear) {
        try {
          const salva = await projectStateService.renameProjectState(
            project.PublicId,
            coluna.PublicId,
            { Name: draft.nome.trim() },
          )
          trocarColuna(salva)
          // O nome que fica e o que a API devolveu (ela junta os espacos repetidos).
          setRascunho((atual) => (atual ? { ...atual, nome: salva.Name } : atual))
          renomeou = true
        } catch (failure) {
          setErroNome(describeError(failure))
          return
        }
      }

      if (religar) {
        try {
          setMapa(await gravarMapa(coluna.PublicId, draft.etapa || null))
        } catch (failure) {
          setErro(
            renomeou
              ? `O nome foi salvo, mas o que quem relatou vê não foi. ${describeError(failure)} Salve de novo para tentar só essa parte.`
              : describeError(failure),
          )
          return
        }
      }

      toast.done('Coluna salva.')
      irPara(null)
      devolverFoco(idResumo(coluna.PublicId))
    } finally {
      setSalvando(false)
    }
  }

  async function create() {
    const value = name.trim()
    if (value.length === 0 || creating) return

    setCreating(true)
    setCreateError(null)

    // A coluna nova entra no fim, e o que quem relatou ve nela comeca igual ao da
    // ultima coluna ativa de antes: e a vizinha, e o mais perto do certo. O resumo
    // mostra a escolha, e trocar e abrindo a coluna.
    const etapaVizinha = ultimaAtiva ? etapaDe(ultimaAtiva.PublicId) : null

    try {
      const created = await projectStateService.addProjectState(project.PublicId, { Name: value })
      // Entra no fim porque foi onde a API o colocou. Inserir em outro lugar aqui
      // faria a tela discordar da posicao que acabou de ser gravada.
      setStates((list) => [...(list ?? []), created])
      setName('')

      if (etapaVizinha && mapa) {
        try {
          setMapa(await gravarMapa(created.PublicId, etapaVizinha))
          const rotulo = etapas?.find((etapa) => etapa.PublicId === etapaVizinha)?.Label
          if (rotulo) toast.done(`Coluna criada. Nela, quem relatou vê “${rotulo}”.`)
        } catch (failure) {
          toast.error(describeError(failure))
        }
      }
    } catch (failure) {
      // Nome em branco, comprido demais ou repetido pertence ao campo: ha o que
      // corrigir, e a correcao e ali.
      setCreateError(describeError(failure))
    } finally {
      setCreating(false)
    }
  }

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

  async function setActive(state: ProjectStateViewModel, active: boolean) {
    try {
      const saved = active
        ? await projectStateService.activateProjectState(project.PublicId, state.PublicId)
        : await projectStateService.deactivateProjectState(project.PublicId, state.PublicId)

      trocarColuna(saved)
      toast.done(active ? 'Coluna de volta ao quadro.' : 'Coluna desativada.')
      // "Desativar" e "Reativar" sao o mesmo lugar do cabecalho: o foco fica nele.
      devolverFoco(idAtivo(state.PublicId))
    } catch (failure) {
      // O botao ja vem desabilitado na entrada de um tipo; a recusa aqui e a corrida
      // (alguem escolheu a coluna num tipo enquanto esta tela estava aberta), e a
      // mensagem da API diz o que fazer.
      toast.error(describeError(failure))
    }
  }

  const etapasProntas = mapa !== null && etapas !== null ? etapas : null

  /** O resumo do cabecalho: o que quem relatou ve, em palavras. */
  function resumo(state: ProjectStateViewModel): string {
    if (etapasProntas === null) return ''
    const etapaId = etapaNaTela(state)
    const rotulo = etapasProntas.find((etapa) => etapa.PublicId === etapaId)?.Label
    return rotulo ? `Quem relatou vê: ${rotulo}` : 'Nada muda para quem relatou'
  }

  /** As marcas da coluna, e o caminho quando ela nao pode ser desativada. */
  function marcas(state: ProjectStateViewModel): ReactNode {
    const entram = tiposQueEntram(state)
    const prendem = state.IsActive ? tiposQuePrendem(state) : []
    const itens: ReactNode[] = []

    if (entram.length > 0) {
      itens.push(<Marca key="entrada">Entrada: {juntar(entram)}</Marca>)
    }
    if (encerra(state)) itens.push(<Marca key="encerra">Encerra o relato</Marca>)
    if (!state.IsActive) itens.push(<Marca key="desativada">Desativada</Marca>)
    if (prendem.length > 0) {
      itens.push(
        <p
          key="porque"
          id={idEntrada(state.PublicId)}
          className="basis-full text-caption text-fg-muted leading-relaxed"
        >
          É a entrada de {juntar(prendem)} — troque em{' '}
          <Link to="../report-types" className="text-fg underline underline-offset-4">
            Tipos de relato
          </Link>
          .
        </p>,
      )
    }

    return itens.length > 0 ? itens : null
  }

  /** O editor da coluna aberta, ou o desenho dela fechando. */
  function editor(state: ProjectStateViewModel) {
    const comum = {
      state,
      currentStage: etapaDe(state.PublicId) ?? '',
      stages: etapasProntas,
      stagesFailed: etapasFalharam || mapaFalhou,
    }
    if (aberto === state.PublicId && rascunho) {
      return (
        <StateEditor
          {...comum}
          draft={rascunho}
          onChange={(draft) => {
            setRascunho(draft)
            if (erroNome) setErroNome(null)
          }}
          saving={salvando}
          nameError={erroNome}
          error={erro}
          autoFocus
          onSave={() => void salvar()}
          onCancel={cancelar}
        />
      )
    }
    if (fechando?.id === state.PublicId) {
      // So o desenho, para o movimento de fechar: nada aqui responde.
      return (
        <div inert>
          <StateEditor
            {...comum}
            draft={fechando.value}
            onChange={() => {}}
            saving={false}
            nameError={null}
            error={null}
            onSave={() => {}}
            onCancel={() => {}}
          />
        </div>
      )
    }
    return null
  }

  // A previa: as colunas ativas na ordem, com a aberta como esta escrita agora.
  const naPrevia: MiniBoardColumn[] = (states ?? [])
    .filter((state) => state.IsActive)
    .map((state) => {
      const entram = tiposQueEntram(state)
      const etapaId = etapaNaTela(state)
      return {
        id: state.PublicId,
        name:
          aberto === state.PublicId && rascunho ? rascunho.nome.trim() || state.Name : state.Name,
        tags: [
          ...(entram.length > 0 ? [`Entrada: ${juntar(entram)}`] : []),
          ...(encerra(state) ? ['Encerra'] : []),
        ],
        publicStage:
          etapasProntas === null
            ? undefined
            : (etapasProntas.find((etapa) => etapa.PublicId === etapaId)?.Label ?? null),
      }
    })

  return (
    <div className="max-w-6xl">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-semibold text-screen tracking-tight">Colunas</h1>
        {/* O selo diz como a lista grava: a ordem, criar e desativar valem na hora. */}
        <LiveBadge />
      </div>
      <p className="mb-2 text-body text-fg-muted">
        As colunas do quadro, na ordem em que o trabalho anda, e o que quem relatou vê em cada uma.
      </p>

      <HowItWorks className="" bodyClassName="max-w-170">
        <p>
          Clique numa coluna para abrir — uma de cada vez. O nome e o que quem relatou vê valem no
          Salvar dela; mudar a ordem (pela alça à esquerda ou pelas setas), criar e desativar valem
          na hora.
        </p>
        <p>
          “Quem relatou vê” é a etapa do andamento enquanto o relato está na coluna, e a coluna nova
          já nasce com a etapa da que vinha antes dela. As etapas, e o texto de cada uma, ficam em{' '}
          <Link to="../public-stages" className="text-fg underline underline-offset-4">
            Andamento público
          </Link>
          .
        </p>
        <p>
          A coluna em que cada relato entra se escolhe no tipo dele, em{' '}
          <Link to="../report-types" className="text-fg underline underline-offset-4">
            Tipos de relato
          </Link>
          . Sem escolha, ele entra na primeira coluna ativa. A entrada de um tipo não se desativa:
          troque a entrada lá antes.
        </p>
        <p>
          De fábrica, a última coluna ativa encerra o relato; em{' '}
          <Link to="../cycle#encerramento" className="text-fg underline underline-offset-4">
            Ciclo
          </Link>
          , dá para encerrar por um botão.
        </p>
        <p>
          Desativar não apaga: os cards continuam na coluna, e o nome fica no histórico. Dá para
          trazer de volta quando quiser.
        </p>
      </HowItWorks>

      <EditorWithPreview
        className="mt-6"
        preview={
          states !== null ? (
            <section
              id="previa"
              className="scroll-mt-6 rounded-xl border border-border bg-surface-raised p-5"
            >
              <header className="mb-1 flex items-baseline justify-between gap-3">
                <h2 className="font-semibold text-fg text-lead">Prévia</h2>
                <span className="flex-none text-caption text-fg-muted">
                  {sujo ? 'ainda não salvo' : 'igual ao quadro'}
                </span>
              </header>
              <p className="mb-4 text-detail text-fg-muted leading-relaxed">
                O quadro com as colunas ativas, na ordem, e embaixo de cada uma o que quem relatou
                vê — com a coluna aberta como está escrita agora. O card é de exemplo.
              </p>
              {naPrevia.length > 0 ? (
                <MiniBoard
                  columns={naPrevia}
                  card={{
                    title: 'Erro ao finalizar a compra',
                    due: {
                      day: daquiA(2),
                      soonDays: regras.draft?.DueSoonDays ?? CYCLE_DEFAULTS.DueSoonDays,
                    },
                  }}
                />
              ) : (
                <p className="rounded-lg border border-border border-dashed px-3.5 py-5 text-center text-detail text-fg-muted">
                  Sem colunas ativas, o quadro fica vazio.
                </p>
              )}
            </section>
          ) : loading ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : null
        }
      >
        <section aria-labelledby={`${base}-titulo`}>
          <h2 id={`${base}-titulo`} className="mb-2 font-semibold text-lead">
            Na ordem do quadro
          </h2>

          {failed && (
            <div className="rounded-xl border border-border bg-surface-raised p-5">
              <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
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
                  className="flex h-16 items-center rounded-xl border border-border bg-surface-raised px-4"
                >
                  <Skeleton className={`h-3 ${width}`} />
                </div>
              ))}
            </div>
          )}

          {states !== null && states.length === 0 && (
            <p className="mb-4 rounded-xl border border-border border-dashed px-4 py-5 text-center text-detail text-fg-muted leading-relaxed">
              O quadro ainda não tem colunas. A primeira costuma ser onde o card chega para alguém
              olhar.
            </p>
          )}

          {states !== null && states.length > 0 && (
            // A ancora mora na lista, e nao num item: o Andamento público leva ate aqui, e um
            // item controlado pela tela nao abre pelo endereco.
            <ul id="colunas-no-andamento" className="mb-4 flex scroll-mt-6 flex-col gap-2">
              {states.map((state, index) => {
                const estaAberta = aberto === state.PublicId
                const prendem = state.IsActive ? tiposQuePrendem(state) : []
                return (
                  <SortableListItem
                    key={state.PublicId}
                    accordion={ACORDEAO}
                    summaryId={idResumo(state.PublicId)}
                    open={estaAberta}
                    onRequestToggle={() => pedirTroca(estaAberta ? null : state.PublicId)}
                    name={
                      <>
                        {/* O resumo e o botao de abrir: quem ouve escuta "Editar A fazer",
                            como no botao que existia antes. */}
                        <span className="sr-only">Editar </span>
                        <span>
                          {estaAberta && rascunho ? rascunho.nome.trim() || state.Name : state.Name}
                        </span>
                      </>
                    }
                    summary={resumo(state)}
                    inactive={!state.IsActive}
                    unsaved={estaAberta && sujo}
                    order={ordem.itemProps(index, state.Name)}
                    tags={marcas(state)}
                    bodyClassName="p-3.5"
                    actions={
                      state.IsActive ? (
                        <Button
                          id={idAtivo(state.PublicId)}
                          size="sm"
                          variant="ghost"
                          aria-label={`Desativar ${state.Name}`}
                          // A entrada de um tipo: o caminho esta escrito embaixo do nome,
                          // em vez de um botao que so recusa.
                          disabled={prendem.length > 0}
                          aria-describedby={
                            prendem.length > 0 ? idEntrada(state.PublicId) : undefined
                          }
                          onClick={() => perguntarDesativar(state)}
                        >
                          Desativar
                        </Button>
                      ) : (
                        <Button
                          id={idAtivo(state.PublicId)}
                          size="sm"
                          variant="ghost"
                          aria-label={`Reativar ${state.Name}`}
                          onClick={() => void setActive(state, true)}
                        >
                          Reativar
                        </Button>
                      )
                    }
                  >
                    {editor(state)}
                  </SortableListItem>
                )
              })}
            </ul>
          )}

          {states !== null && (
            <div className="flex items-end gap-2">
              <TextField
                id="nova-coluna"
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

        <BoardRules regras={regras} />
      </EditorWithPreview>

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

      <ConfirmDialog
        open={troca !== null}
        onOpenChange={(open) => {
          if (!open) setTroca(null)
        }}
        title={`Descartar o que mudou em “${colunaAberta?.Name ?? 'coluna'}”?`}
        description="As mudanças desta coluna ainda não foram salvas e vão se perder. Para guardar, volte e clique em Salvar."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        primary="cancel"
        onConfirm={confirmarTroca}
      />

      {/* Uma pergunta so ao sair, para a coluna aberta e para as regras: o roteador
          aceita um bloqueio de cada vez. */}
      <LeaveGuard
        when={sujo || regras.dirty}
        onSave={
          !sujo || podeSalvar
            ? () => {
                if (sujo) void salvar()
                if (regras.dirty) void regras.save()
              }
            : undefined
        }
      />
    </div>
  )
}

/** Uma marca da coluna, por extenso: "Entrada: Defeito", "Encerra o relato". */
function Marca({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-border px-1.5 py-0.5 text-caption text-fg-muted">
      {children}
    </span>
  )
}

/** "Defeito", "Defeito e Melhoria", "Defeito, Melhoria e Dúvida". */
function juntar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('')
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

/** O dia daqui a `dias`, como o prazo do card o guarda (`2026-10-12`), no fuso de quem ve. */
function daquiA(dias: number): string {
  const dia = new Date()
  dia.setDate(dia.getDate() + dias)
  const mes = String(dia.getMonth() + 1).padStart(2, '0')
  return `${dia.getFullYear()}-${mes}-${String(dia.getDate()).padStart(2, '0')}`
}
