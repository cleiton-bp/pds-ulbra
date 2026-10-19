import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MAX_PUBLIC_STAGE_LABEL_LENGTH,
  MAX_PUBLIC_STAGE_SENTENCE_LENGTH,
  MAX_PUBLIC_STAGES,
  MIN_PUBLIC_STAGES,
  type ProjectPublicStageViewModel,
  type PublicOutcome,
  type SaveProjectPublicStageRequest,
} from '@/contracts'
import { describeError, projectPublicStageService, projectStatusMappingService } from '@/data'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { LeaveGuard } from '@/shared/components/LeaveGuard'
import { LiveBadge } from '@/shared/components/LiveBadge'
import { MovedAnchors } from '@/shared/components/MovedAnchors'
import { type JourneyStage, PublicJourney } from '@/shared/components/PublicJourney'
import { RadioGroup } from '@/shared/components/SettingsControls'
import { Skeleton } from '@/shared/components/Skeleton'
import { SortableListItem } from '@/shared/components/SortableListItem'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useClosingItem } from '@/shared/hooks/useClosingItem'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { useListOrder } from '@/shared/hooks/useListOrder'
import { cn } from '@/shared/lib/cn'
import { PUBLIC_OUTCOMES, publicOutcomeLabel } from '@/shared/lib/publicOutcomes'

/** O que `editando` guarda quando o item aberto e o de criar, e nao o de uma etapa. */
const NOVA = 'nova'

/** O nome do acordeao desta tela: uma etapa aberta de cada vez. Ver `SettingsGroup`. */
const ACORDEAO = 'etapas-publicas'

/** Um dia, para as datas de exemplo da previa. */
const UM_DIA = 24 * 60 * 60 * 1000

/** Para onde leva o "Ligar em Colunas": a lista de colunas, onde a ligacao se escolhe. */
const LIGAR_EM_COLUNAS = '../states#colunas-no-andamento'

/**
 * A jornada que quem relatou acompanha.
 *
 * **Esta tela nao e a de Colunas com outro titulo.** La estao as colunas em que o
 * time trabalha, com a granularidade que o time precisa. Aqui esta o andamento que
 * a pessoa de fora le — e ele e mais curto de proposito. Varias colunas de dentro
 * cabem numa etapa daqui, e e essa perda de detalhe que e o produto.
 *
 * **Duas colunas, como Tipos de relato** (`EditorWithPreview`): a esquerda as etapas,
 * a direita a linha do tempo de verdade (`PublicJourney`), a mesma que quem relatou
 * abre pelo link, montada da lista e do rascunho da etapa aberta. Configurar a jornada
 * olhando para linhas soltas fazia escrever etapa que nao se liga na seguinte.
 *
 * **Cada etapa e um item de acordeao**, como os tipos: fechada, ela diz em palavras o
 * que e ("Termina · Foi feito · Colunas: A, B"); aberta, mostra o formulario. Nao e o
 * `SettingsGroup` porque o cabecalho leva a alca, as setas e o Apagar — botoes que nao
 * podem morar dentro do `<summary>` —, e porque fechar com rascunho pergunta antes.
 *
 * **Cada mudanca vale na hora** — o selo do titulo diz isso: a etapa e salva no Salvar
 * dela, e mover e apagar gravam no mesmo instante. Nao ha Publicar da tela.
 *
 * **O teto e o piso aparecem escritos, e nao so escondem botao.** "3 de 7" com o
 * motivo ao lado explica por que o botao sumiu; um botao que some sem explicacao
 * parece defeito.
 *
 * **Etapa terminal pede desfecho no mesmo instante em que e marcada.** Nao da para
 * salvar uma sem o outro, porque um fim sem explicacao e pior do que nenhum fim: a
 * pessoa le "encerrado" e nao sabe se foi feito ou descartado.
 *
 * **Qual coluna cai em qual etapa se escolhe em Colunas, e so la.** Aqui a tela so le
 * a ligacao (versionada) para dizer, em cada etapa, de onde ela anda — e avisa, com o
 * caminho, a etapa em que nenhuma coluna cai: ela nunca seria alcancada.
 */
export function PublicStagesScreen() {
  const project = useCurrentProject()
  const base = useId()
  const idResumo = (chave: string) => `${base}-resumo-${chave}`
  const idNova = `${base}-nova`
  const idNomeDaNova = `${base}-nome-nova`

  // So para mostrar: as colunas que caem em cada etapa. Falhar aqui nao impede nada.
  const { data: mapa } = useAsyncResource(
    useCallback(
      () => projectStatusMappingService.getStatusMapping(project.PublicId),
      [project.PublicId],
    ),
  )
  const colunasDe = (stagePublicId: string) =>
    mapa?.Entries.filter((entrada) => entrada.StagePublicId === stagePublicId).map(
      (entrada) => entrada.StateName,
    ) ?? []

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

  /** `null` = nenhuma aberta; `NOVA` = o item de criar; senao, o identificador. */
  const [editando, setEditando] = useState<string | null>(null)
  /**
   * O rascunho da etapa aberta. **Mora na tela, e nao no formulario**: a previa mostra
   * a etapa como esta escrita agora, e trocar de etapa com mudanca pergunta antes.
   */
  const [rascunho, setRascunho] = useState<SaveProjectPublicStageRequest | null>(null)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // O item que acabou de fechar continua desenhado ate o fim do movimento.
  const { closing: fechando, markClosing } = useClosingItem<SaveProjectPublicStageRequest>()

  /** A troca que espera a confirmacao: abrir outra etapa (`destino`), ou fechar (`null`). */
  const [troca, setTroca] = useState<{ destino: string | null } | null>(null)

  /** A etapa em que a previa mostra o relato. Nula: a primeira. */
  const [agora, setAgora] = useState<string | null>(null)

  // Mover grava na hora, otimista: a lista volta se o servidor recusar.
  const ordem = useListOrder({
    items: etapas,
    setItems: setEtapas,
    idOf: (etapa) => etapa.PublicId,
    save: (Order) => projectPublicStageService.reorderPublicStages(project.PublicId, { Order }),
    busy: salvando,
    focusFallback: idResumo,
  })
  const movendo = ordem.moving
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

  // Sem etapa que termina, quem relatou nunca le como o relato acabou: a linha do tempo
  // para no meio. Conta o que esta gravado, que e o que ja sai para quem acompanha.
  const semFinal = etapas !== null && total > 0 && !etapas.some((etapa) => etapa.IsTerminal)

  const etapaAberta =
    editando !== null && editando !== NOVA
      ? etapas?.find((etapa) => etapa.PublicId === editando)
      : undefined
  const sujo = editando !== null && rascunho !== null && rascunhoMudou(rascunho, etapaAberta)
  const podeSalvar = rascunho !== null && !etapaIncompleta(rascunho)

  // As datas de exemplo da previa contam a partir de quando a tela abriu: fixas, para a
  // linha do tempo nao mudar sozinha enquanto a pessoa olha.
  const [hoje] = useState(() => Date.now())

  /**
   * A previa: a jornada desta lista, com a etapa aberta como esta escrita agora — e a
   * nova no fim, onde a API vai coloca-la. O relato fica parado em `agora`; as etapas
   * antes dele ganham datas de exemplo, como as que quem relatou ve.
   */
  const naPrevia = useMemo(() => {
    const lista: Omit<JourneyStage, 'ReachedAt'>[] = (etapas ?? []).map((etapa) => {
      const escrita = editando === etapa.PublicId && rascunho ? rascunho : etapa
      return {
        id: etapa.PublicId,
        Label: escrita.Label.trim() || etapa.Label,
        Description: escrita.Description,
        NextStep: escrita.NextStep?.trim() || null,
      }
    })
    if (editando === NOVA && rascunho) {
      lista.push({
        id: NOVA,
        Label: rascunho.Label.trim() || 'Nova etapa',
        Description: rascunho.Description,
        NextStep: rascunho.NextStep?.trim() || null,
      })
    }

    const atual = lista.some((passo) => passo.id === agora) ? agora : (lista[0]?.id ?? null)
    const indiceAtual = lista.findIndex((passo) => passo.id === atual)
    const stages: JourneyStage[] = lista.map((passo, index) => ({
      ...passo,
      ReachedAt:
        index <= indiceAtual ? new Date(hoje - (indiceAtual - index) * UM_DIA).toISOString() : null,
    }))
    return { stages, atual }
  }, [etapas, editando, rascunho, agora, hoje])

  /** O foco vai para `id` depois do proximo desenho: o alvo so existe depois dele. */
  function devolverFoco(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  /** O aberto continua desenhado ate o fim do movimento de fechar. */
  function marcarFechando() {
    if (editando === null || editando === NOVA || !rascunho) return
    markClosing(editando, rascunho)
  }

  /** Abre `chave` sem perguntar — quem pergunta e `pedirTroca` — e a previa vai ate ela. */
  function abrirFormulario(chave: string) {
    marcarFechando()
    setEditando(chave)
    setRascunho(
      rascunhoDe(chave === NOVA ? undefined : etapas?.find((etapa) => etapa.PublicId === chave)),
    )
    setErroForm(null)
    setAgora(chave)
  }

  function fecharFormulario() {
    marcarFechando()
    setEditando(null)
    setRascunho(null)
    setErroForm(null)
  }

  /**
   * Abrir outra etapa, ou fechar a aberta. **Com mudanca por salvar, pergunta antes**: o
   * rascunho de uma etapa so vive enquanto ela esta aberta.
   */
  function pedirTroca(destino: string | null) {
    if (destino === editando) return
    if (sujo) setTroca({ destino })
    else if (destino === null) fecharFormulario()
    else abrirFormulario(destino)
  }

  function confirmarTroca() {
    if (!troca) return
    const { destino } = troca
    const anterior = editando
    if (destino === null) fecharFormulario()
    else abrirFormulario(destino)
    // A pergunta fechou: o foco vai para onde a pessoa ia.
    if (destino === NOVA) devolverFoco(idNomeDaNova)
    else if (destino !== null) devolverFoco(idResumo(destino))
    else if (anterior === NOVA) devolverFoco(idNova)
    else if (anterior !== null) devolverFoco(idResumo(anterior))
  }

  /** Cancelar e desistir de proposito: fecha sem perguntar, e o foco volta a quem abriu. */
  function cancelar() {
    const alvo = editando
    fecharFormulario()
    if (alvo === NOVA) devolverFoco(idNova)
    else if (alvo) devolverFoco(idResumo(alvo))
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
      setAgora(criada.PublicId)
      devolverFoco(idResumo(criada.PublicId))
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
      devolverFoco(idResumo(salva.PublicId))
    } catch (falha) {
      setErroForm(describeError(falha))
    } finally {
      setSalvando(false)
    }
  }

  /** O Salvar do aberto, pelo aviso de saida: o mesmo caminho do botao. */
  function salvarAberto() {
    if (editando === null || !rascunho || etapaIncompleta(rascunho) || salvando) return
    const pedido = pedidoDe(rascunho)
    if (editando === NOVA) void criar(pedido)
    else void salvar(editando, pedido)
  }

  async function remover(etapa: ProjectPublicStageViewModel) {
    try {
      await projectPublicStageService.removePublicStage(project.PublicId, etapa.PublicId)
      const indice = etapas?.findIndex((item) => item.PublicId === etapa.PublicId) ?? -1
      const restantes = (etapas ?? []).filter((item) => item.PublicId !== etapa.PublicId)
      setEtapas((lista) => (lista ?? []).filter((item) => item.PublicId !== etapa.PublicId))
      if (editando === etapa.PublicId) {
        setEditando(null)
        setRascunho(null)
        setErroForm(null)
      }
      toast.done('Etapa apagada do andamento.')
      // O botao apagado sumiu com a etapa: o foco vai para a vizinha que ficou no lugar.
      const vizinha = restantes[Math.min(Math.max(indice, 0), restantes.length - 1)]
      if (vizinha) devolverFoco(idResumo(vizinha.PublicId))
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

  /** O formulario do item aberto: o mesmo para a etapa salva e para a nova. */
  function formulario(chave: string) {
    if (editando === chave && rascunho) {
      return (
        <FormularioEtapa
          rascunho={rascunho}
          onMudar={(mudanca) => setRascunho((atual) => (atual ? { ...atual, ...mudanca } : atual))}
          nomeId={chave === NOVA ? idNomeDaNova : undefined}
          salvando={salvando}
          erro={erroForm}
          onSalvar={(pedido) => void (chave === NOVA ? criar(pedido) : salvar(chave, pedido))}
          onCancelar={cancelar}
        />
      )
    }
    if (fechando?.id === chave) {
      // So o desenho, para o movimento de fechar: nada aqui responde.
      return (
        <div inert>
          <FormularioEtapa
            rascunho={fechando.value}
            onMudar={() => {}}
            salvando={false}
            erro={null}
            onSalvar={() => {}}
            onCancelar={() => {}}
          />
        </div>
      )
    }
    return null
  }

  const nomeDoAberto = etapaAberta?.Label ?? (rascunho?.Label.trim() || 'Nova etapa')

  return (
    <div className="max-w-6xl">
      <MovedAnchors moved={{ 'colunas-no-andamento': 'states' }} />

      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-semibold text-screen tracking-tight">Andamento público</h1>
        {/* O selo diz como esta tela grava: sem Publicar, cada Salvar, seta e Apagar ja
            chega a quem acompanha. */}
        <LiveBadge />
      </div>
      <p className="mb-2 text-body text-fg-muted">
        As etapas que quem relatou acompanha, com as palavras dele. Qual coluna cai em cada uma se
        escolhe em{' '}
        <Link to={LIGAR_EM_COLUNAS} className="text-fg underline underline-offset-4">
          Colunas
        </Link>
        .
      </p>

      <HowItWorks className="" bodyClassName="max-w-170">
        <p>
          Várias colunas do quadro podem cair na mesma etapa: quem relatou precisa saber que o
          problema está sendo resolvido, e não que existe revisão de código.
        </p>
        <p>
          Clique numa etapa para abrir — uma de cada vez. O que você muda nela vale no Salvar dela;
          mudar a ordem (pela alça ou pelas setas) e apagar valem na hora.
        </p>
        <p>
          De {MIN_PUBLIC_STAGES} a {MAX_PUBLIC_STAGES} etapas: com menos, a jornada não conta uma
          história; com mais, ela vira a lista de colunas com outras palavras.
        </p>
        <p>
          À direita, a linha do tempo como quem relatou vê. Clique numa etapa dela para ver o relato
          parado ali.
        </p>
      </HowItWorks>

      <EditorWithPreview
        className="mt-6"
        preview={
          etapas !== null ? (
            <section
              id="previa"
              className="scroll-mt-6 rounded-xl border border-border bg-surface-raised p-5"
            >
              <header className="mb-1 flex items-baseline justify-between gap-3">
                <h2 className="font-semibold text-fg text-lead">Prévia</h2>
                <span className="flex-none text-caption text-fg-muted">
                  {sujo ? 'ainda não salvo' : 'igual ao que quem relatou vê'}
                </span>
              </header>
              <p className="mb-4 text-detail text-fg-muted leading-relaxed">
                O andamento na página de acompanhamento, com a etapa aberta como está escrita agora.
                Clique numa etapa para ver o relato nela; as datas são de exemplo.
              </p>
              <div className="rounded-lg border border-border bg-surface p-4">
                <PublicJourney
                  stages={naPrevia.stages}
                  currentId={naPrevia.atual}
                  onSelect={setAgora}
                />
              </div>
            </section>
          ) : loading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : null
        }
      >
        <section id="etapas" className="scroll-mt-6">
          <h2 className="mb-1 font-semibold text-lead">
            A jornada de quem está de fora{' '}
            {etapas !== null && etapas.length > 0 && (
              <span className="font-normal text-fg-muted tabular-nums">
                ({total} de {MAX_PUBLIC_STAGES})
              </span>
            )}
          </h2>

          {failed && (
            <div className="rounded-xl border border-border bg-surface-raised p-5">
              <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
                Não deu para carregar a jornada deste projeto agora. A falha foi ao consultar: as
                suas etapas continuam exatamente como estavam.
              </p>
              <Button onClick={reload}>Tentar de novo</Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col gap-2">
              {['w-36', 'w-44', 'w-32'].map((width) => (
                <div
                  key={width}
                  className="flex h-16 items-center rounded-xl border border-border bg-surface-raised px-3.5"
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
                  ? ' · é o máximo. Acima disso o andamento volta a ser a lista de colunas, só que com palavras mais bonitas.'
                  : noPiso
                    ? ` · ${MIN_PUBLIC_STAGES} é o mínimo. Com menos, a jornada não conta uma história: vira "chegou" e "acabou".`
                    : ' · arraste pela alça à esquerda para mudar a ordem, ou use as setas.'}
              </p>

              {abaixoDoPiso && (
                <p className="mb-2 rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-detail text-warn-fg leading-relaxed">
                  Esta jornada já está sendo mostrada a quem relata, com{' '}
                  {total === 1 ? 'um passo' : `${total} passos`}. Ela só conta uma história a partir
                  de {MIN_PUBLIC_STAGES} — até lá, quem acompanha vê o relato chegar e terminar, sem
                  o meio.
                </p>
              )}

              {semFinal && (
                <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-detail text-fg-muted leading-relaxed">
                  <Etiqueta tom="aviso">Sem etapa final</Etiqueta>
                  <span>
                    Quem relatou nunca lê como terminou. Abra a última etapa e marque “O relato
                    termina nesta etapa”.
                  </span>
                </p>
              )}

              <ol aria-label="Etapas do andamento" className="mb-4 flex flex-col gap-2">
                {etapas.map((etapa, index) => {
                  const aberta = editando === etapa.PublicId
                  const escrita = aberta && rascunho ? rascunho : etapa
                  const colunas = mapa ? colunasDe(etapa.PublicId) : null
                  const resumo = descreverEtapa(escrita, colunas)
                  return (
                    <SortableListItem
                      key={etapa.PublicId}
                      accordion={ACORDEAO}
                      summaryId={idResumo(etapa.PublicId)}
                      open={aberta}
                      onRequestToggle={() => pedirTroca(aberta ? null : etapa.PublicId)}
                      icon={<NumeroDaEtapa numero={index + 1} />}
                      name={escrita.Label.trim() || etapa.Label}
                      summary={resumo}
                      summaryTitle={resumo}
                      unsaved={aberta && sujo}
                      order={ordem.itemProps(index, etapa.Label)}
                      actionsSpace="narrow"
                      bodyClassName="p-3.5"
                      tags={
                        colunas !== null && colunas.length === 0 ? (
                          // A etapa em que nenhuma coluna cai nunca e alcancada: o aviso
                          // leva direto a ligacao, que mora em Colunas.
                          <Etiqueta tom="aviso">
                            Nenhuma coluna cai aqui <span aria-hidden>→</span>{' '}
                            <Link
                              to={LIGAR_EM_COLUNAS}
                              className="font-medium underline underline-offset-2"
                            >
                              Ligar em Colunas
                            </Link>
                          </Etiqueta>
                        ) : null
                      }
                      actions={
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Apagar ${etapa.Label}`}
                          disabled={movendo || salvando || noPiso}
                          onClick={() => setRemovendo(etapa)}
                        >
                          Apagar
                        </Button>
                      }
                    >
                      {formulario(etapa.PublicId)}
                    </SortableListItem>
                  )
                })}

                {editando === NOVA && rascunho && (
                  <SortableListItem
                    accordion={ACORDEAO}
                    summaryId={idResumo(NOVA)}
                    open
                    onRequestToggle={() => pedirTroca(null)}
                    icon={<NumeroDaEtapa numero={total + 1} />}
                    name={rascunho.Label.trim() || 'Nova etapa'}
                    summary={descreverEtapa(rascunho, null)}
                    summaryTitle={descreverEtapa(rascunho, null)}
                    unsaved={sujo}
                    isNew
                    bodyClassName="p-3.5"
                  >
                    {formulario(NOVA)}
                  </SortableListItem>
                )}
              </ol>
            </>
          )}

          {etapas !== null && etapas.length > 0 && !cheia && editando !== NOVA && (
            <Button
              id={idNova}
              variant="secondary"
              disabled={movendo || salvando}
              onClick={() => pedirTroca(NOVA)}
            >
              Nova etapa
            </Button>
          )}
        </section>
      </EditorWithPreview>

      <ConfirmDialog
        open={removendo !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setRemovendo(null)
        }}
        title="Apagar etapa"
        description="Ela sai do andamento e deixa de aparecer para quem acompanha. Os relatos que já passaram por ela continuam legíveis: o histórico guarda o rótulo que valia na época."
        confirmLabel="Apagar"
        onConfirm={() => (removendo ? remover(removendo) : undefined)}
      />

      <ConfirmDialog
        open={troca !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setTroca(null)
        }}
        title={`Descartar o que mudou em “${nomeDoAberto}”?`}
        description="As mudanças desta etapa ainda não foram salvas e vão se perder. Para guardar, volte e clique em Salvar."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        primary="cancel"
        onConfirm={confirmarTroca}
      />

      <LeaveGuard when={sujo} onSave={podeSalvar ? salvarAberto : undefined} />
    </div>
  )
}

/**
 * O numero da etapa no cabecalho do item: e o que faz a lista parecer a linha do tempo
 * que ela configura, e nao um cadastro.
 */
function NumeroDaEtapa({ numero }: { numero: number }) {
  return (
    <span className="flex size-5 flex-none items-center justify-center rounded-full bg-surface-sunken text-caption text-fg-muted tabular-nums">
      {numero}
    </span>
  )
}

/**
 * O formulario de uma etapa, dentro do item aberto.
 *
 * **E o mesmo componente para criar e para editar**, porque sao os mesmos campos:
 * nao ha nada que so se escolha uma vez. Dois formularios parecidos acabariam
 * divergindo no dia em que um campo novo entrasse so num deles.
 *
 * **O rascunho vem da tela**, que o mostra na previa e pergunta antes de trocar de
 * etapa com mudanca. Daqui sai so a mudanca de cada campo, e o pedido pronto no Salvar.
 */
function FormularioEtapa({
  rascunho,
  onMudar,
  nomeId,
  salvando,
  erro,
  onSalvar,
  onCancelar,
}: {
  rascunho: SaveProjectPublicStageRequest
  onMudar: (mudanca: Partial<SaveProjectPublicStageRequest>) => void
  /** O id do campo do nome, so na etapa nova: o foco cai nele ao abrir. */
  nomeId?: string
  salvando: boolean
  erro: string | null
  onSalvar: (pedido: SaveProjectPublicStageRequest) => void
  onCancelar: () => void
}) {
  function mudar(mudanca: Partial<SaveProjectPublicStageRequest>) {
    onMudar(mudanca)
  }

  // Sem rotulo, sem frase, e sem desfecho na etapa que termina, nao ha o que
  // gravar. O botao desabilitado diz isso antes de a API ter de dizer — e a API
  // continua dizendo, porque quem chama a rota direto nao passa por aqui.
  const incompleto = etapaIncompleta(rascunho)

  function enviar() {
    if (incompleto || salvando) return
    onSalvar(pedidoDe(rascunho))
  }

  return (
    <div className="flex flex-col gap-3">
      <TextField
        id={nomeId}
        label="Como esta etapa se chama"
        value={rascunho.Label}
        onChange={(Label) => mudar({ Label })}
        placeholder="Em análise"
        maxLength={MAX_PUBLIC_STAGE_LABEL_LENGTH}
        disabled={salvando}
        autoFocus={nomeId !== undefined}
        onSubmit={enviar}
      />

      <TextField
        label="O que dizer a quem está esperando"
        value={rascunho.Description}
        onChange={(Description) => mudar({ Description })}
        placeholder="Alguém da equipe está lendo o seu relato para entender o que aconteceu."
        hint="Uma frase, escrita para a pessoa de fora. É o que separa esta tela da de Colunas."
        maxLength={MAX_PUBLIC_STAGE_SENTENCE_LENGTH}
        disabled={salvando}
        onSubmit={enviar}
      />

      <TextField
        label="O que vem depois (opcional)"
        value={rascunho.NextStep ?? ''}
        onChange={(NextStep) => mudar({ NextStep })}
        placeholder="Depois de entender, a equipe decide o que vai ser feito."
        hint="Aparece só enquanto o relato está nesta etapa."
        maxLength={MAX_PUBLIC_STAGE_SENTENCE_LENGTH}
        disabled={salvando}
        onSubmit={enviar}
      />

      <div className="flex flex-col gap-2.5">
        <Check
          label="O relato termina nesta etapa"
          hint="É o fim da linha do tempo: quem relatou lê o desfecho que você escolher."
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
          hint="Sem isto a linha do tempo só anda para a frente, mesmo que o card volte de coluna."
          checked={rascunho.AllowsReturn}
          disabled={salvando}
          onChange={(AllowsReturn) => mudar({ AllowsReturn })}
        />
        <Check
          label="Esta etapa espera uma resposta de quem relatou"
          hint="Marca que a vez é de quem relatou, e não do time. Por enquanto só fica registrado."
          checked={rascunho.AwaitsReporter}
          disabled={salvando}
          onChange={(AwaitsReporter) => mudar({ AwaitsReporter })}
        />
      </div>

      {rascunho.IsTerminal && (
        <div>
          <div className="mb-1.5 text-detail text-fg-muted">Como o relato termina aqui</div>
          {/* Em pecas com desenho, e nao numa lista que abre: sao quatro, e ver as quatro
              de uma vez e o que faz escolher a certa. */}
          <RadioGroup<PublicOutcome>
            label="Como o relato termina aqui"
            value={rascunho.Outcome}
            onChange={(Outcome) => mudar({ Outcome })}
            options={PUBLIC_OUTCOMES.map((outcome) => ({
              value: outcome,
              label: publicOutcomeLabel(outcome),
              drawing: <DesenhoDoDesfecho outcome={outcome} />,
              disabled: salvando,
            }))}
          />
          <p className="mt-1.5 text-caption text-fg-muted leading-relaxed">
            A lista é igual em todos os projetos: é a última coisa que quem relatou lê.
          </p>
        </div>
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

/** O desenho de cada desfecho, na peca de escolher. */
function DesenhoDoDesfecho({ outcome }: { outcome: PublicOutcome }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 text-fg-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {outcome === 'Done' && <path d="m3.5 8.5 3 3 6-7" />}
      {outcome === 'WontDo' && (
        <>
          <circle cx="8" cy="8" r="5" />
          <path d="m4.5 11.5 7-7" />
        </>
      )}
      {outcome === 'NoAnswer' && (
        <>
          <path d="M3 4.5h10v6H7l-3 2.5v-2.5H3z" />
          <path d="M6 7.5h.01M8 7.5h.01M10 7.5h.01" />
        </>
      )}
      {outcome === 'Duplicate' && (
        <>
          <rect x="5.5" y="5.5" width="7" height="7" rx="1" />
          <path d="M3.5 10.5v-6a1 1 0 0 1 1-1h6" />
        </>
      )}
    </svg>
  )
}

/** Uma marca da etapa, dita por extenso. "Terminal" sozinho e palavra nossa. */
function Etiqueta({
  tom = 'neutro',
  children,
}: {
  /** `aviso` para o que precisa de atencao: o que falta para a jornada funcionar. */
  tom?: 'neutro' | 'aviso'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'rounded border px-1.5 py-0.5 text-caption',
        tom === 'aviso'
          ? 'border-warn-border bg-warn-surface text-warn-fg'
          : 'border-border text-fg-muted',
      )}
    >
      {children}
    </span>
  )
}

/**
 * Uma caixa de marcar com a dica de uma linha embaixo. A dica e a descricao da caixa
 * (`aria-describedby`), e nao parte do nome: quem ouve escuta o nome curto e, depois,
 * o que ele faz.
 */
function Check({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  const dicaId = useId()
  return (
    <div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? dicaId : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="size-3.5 flex-none accent-accent"
        />
        <span className="text-body text-fg">{label}</span>
      </label>
      {hint && (
        <p id={dicaId} className="mt-0.5 pl-5.5 text-caption text-fg-muted leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  )
}

/** O rascunho de uma etapa: a gravada, ou tudo em branco para a nova. */
function rascunhoDe(inicial?: ProjectPublicStageViewModel): SaveProjectPublicStageRequest {
  return {
    Label: inicial?.Label ?? '',
    Description: inicial?.Description ?? '',
    NextStep: inicial?.NextStep ?? '',
    IsTerminal: inicial?.IsTerminal ?? false,
    AllowsReturn: inicial?.AllowsReturn ?? false,
    AwaitsReporter: inicial?.AwaitsReporter ?? false,
    Outcome: inicial?.Outcome ?? null,
  }
}

/** O rascunho difere do que esta gravado (ou do branco, na nova). */
function rascunhoMudou(
  rascunho: SaveProjectPublicStageRequest,
  inicial?: ProjectPublicStageViewModel,
): boolean {
  const antes = rascunhoDe(inicial)
  return (
    rascunho.Label !== antes.Label ||
    rascunho.Description !== antes.Description ||
    (rascunho.NextStep ?? '') !== (antes.NextStep ?? '') ||
    rascunho.IsTerminal !== antes.IsTerminal ||
    rascunho.AllowsReturn !== antes.AllowsReturn ||
    rascunho.AwaitsReporter !== antes.AwaitsReporter ||
    rascunho.Outcome !== antes.Outcome
  )
}

/** Sem rotulo, sem frase, ou terminal sem desfecho: nao ha o que gravar. */
function etapaIncompleta(rascunho: SaveProjectPublicStageRequest): boolean {
  return (
    rascunho.Label.trim().length === 0 ||
    rascunho.Description.trim().length === 0 ||
    (rascunho.IsTerminal && rascunho.Outcome === null)
  )
}

/** O pedido que vai a API, a partir do rascunho. */
function pedidoDe(rascunho: SaveProjectPublicStageRequest): SaveProjectPublicStageRequest {
  return {
    ...rascunho,
    // Em branco vira nulo: sao a mesma coisa para quem le a tela, e duas formas
    // de dizer "nao tem" fariam a consulta ter de perguntar as duas.
    NextStep: rascunho.NextStep?.trim() ? rascunho.NextStep.trim() : null,
  }
}

/**
 * O que a etapa e, em palavras, para o cabecalho fechado: "Termina · Foi feito ·
 * Colunas: A, B". Sem marca nenhuma e sem coluna conhecida, a frase dela — o cabecalho
 * nunca fica so com o nome.
 */
function descreverEtapa(
  marcas: Pick<
    SaveProjectPublicStageRequest,
    'IsTerminal' | 'Outcome' | 'AllowsReturn' | 'AwaitsReporter' | 'Description'
  >,
  colunas: string[] | null,
): string {
  const partes: string[] = []
  if (marcas.IsTerminal) {
    partes.push('Termina')
    if (marcas.Outcome) partes.push(publicOutcomeLabel(marcas.Outcome))
  }
  if (marcas.AwaitsReporter) partes.push('Espera quem relatou')
  if (marcas.AllowsReturn) partes.push('Pode voltar')
  if (colunas && colunas.length > 0) partes.push(`Colunas: ${colunas.join(', ')}`)
  if (partes.length > 0) return partes.join(' · ')
  return marcas.Description.trim() || 'Sem frase ainda'
}
