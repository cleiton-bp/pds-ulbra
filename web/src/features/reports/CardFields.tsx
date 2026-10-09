import { useEffect, useId, useRef, useState } from 'react'
import {
  MAX_LABEL_NAME_LENGTH,
  MAX_LABELS_PER_CARD,
  MAX_STORY_POINTS,
  type ProjectLabelViewModel,
  type ProjectPriorityViewModel,
  type ReportDetailViewModel,
  type ReportSummaryViewModel,
  type SprintViewModel,
  type TeamMemberViewModel,
} from '@/contracts'
import {
  describeError,
  projectLabelService,
  projectPriorityService,
  projectReportService,
  projectTeamService,
} from '@/data'
import { useCardDraft } from '@/features/reports/cardDrafts'
import { formatPoints } from '@/features/reports/sprints/sprintLook'
import { CardChip } from '@/shared/components/CardChip'
import { Select } from '@/shared/components/Select'
import { toast } from '@/shared/components/toastStore'
import { cn } from '@/shared/lib/cn'
import { formatDay } from '@/shared/lib/datetime'
import { dueState, dueWords } from '@/shared/lib/dueDate'

/** Uma lista de escolha: chegando, chegou, ou nao deu para ler. */
type Lista<T> = T[] | null | 'falhou'

/** Os campos que gravam: cada um diz "Salvando…" e a propria falha. */
type Campo = 'responsavel' | 'prioridade' | 'etiquetas' | 'prazo' | 'sprint' | 'pontos'

/** O campo na frase da falha: "Nao deu para mudar a prioridade." */
const NOME_DO_CAMPO: Record<Campo, string> = {
  responsavel: 'o responsável',
  prioridade: 'a prioridade',
  etiquetas: 'as etiquetas',
  prazo: 'o prazo',
  sprint: 'a sprint',
  pontos: 'a estimativa',
}

/** O prazo perto, quando o projeto nao disse outro: o mesmo de fabrica da tela de Trabalho. */
const PERTO_DE_FABRICA = 2

/**
 * Os campos que o time da ao card: quem esta com ele, o quanto importa, as
 * etiquetas e o prazo. Servem o relato e o card do time — sao os mesmos nos dois.
 *
 * **Tudo interno.** Nada disto chega a quem relatou; a tela nao precisa avisar,
 * porque nao ha caminho por onde vazar.
 *
 * **Cada mudanca e uma chamada**, e a resposta e o card inteiro: quem abriu o
 * dialogo troca o que tem pela resposta (`aoMudar`), e a lista se acerta junto.
 * **Arquivado so se le** — mudar pede desarquivar, e a API recusa do mesmo jeito.
 */
export function CardFields({
  projectPublicId,
  reportPublicId,
  card,
  aoMudar,
  configuracao = 0,
  sprints = null,
  soonDays = PERTO_DE_FABRICA,
}: {
  projectPublicId: string
  reportPublicId: string
  card: ReportSummaryViewModel
  aoMudar: (card: ReportDetailViewModel) => void
  /** A regra do prazo perto (Ciclo): o prazo vencido ou perto ganha o mesmo destaque da lista. */
  soonDays?: number
  /**
   * As sprints que nao fecharam, com a sprint ligada — e ai o card mostra a sprint e
   * os pontos. Nulo sem sprints: os dois campos nem aparecem.
   */
  sprints?: SprintViewModel[] | null
  /**
   * Sobe quando a configuracao do projeto mudou pelas maos de outra pessoa — ou a
   * conexao em tempo real voltou e pode ter perdido o aviso: as listas sao lidas de novo.
   */
  configuracao?: number
}) {
  const arquivado = card.ArchivedAt !== null

  // As listas de escolha: quem esta no time, as prioridades e as etiquetas do
  // projeto. Lidas uma vez por card aberto, e de novo quando a configuracao muda.
  // Falhar aqui so tira a escolha: o valor do card continua na tela, so para leitura,
  // e a tela diz por que. Falhar ao ler de novo deixa a lista que ja estava.
  const [time, setTime] = useState<Lista<TeamMemberViewModel>>(null)
  const [prioridades, setPrioridades] = useState<Lista<ProjectPriorityViewModel>>(null)
  const [etiquetas, setEtiquetas] = useState<Lista<ProjectLabelViewModel>>(null)
  // Sobe no "Tentar de novo" das listas que nao carregaram.
  const [releitura, setReleitura] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `configuracao` e `releitura` sao os gatilhos de ler de novo.
  useEffect(() => {
    if (arquivado) return
    let vivo = true

    const falhou = <T,>(antes: Lista<T>): Lista<T> => (Array.isArray(antes) ? antes : 'falhou')

    projectTeamService
      .listMembers(projectPublicId)
      .then((lista) => vivo && setTime(lista))
      .catch(() => vivo && setTime(falhou))
    projectPriorityService
      .listPriorities(projectPublicId)
      .then((lista) => vivo && setPrioridades(lista))
      .catch(() => vivo && setPrioridades(falhou))
    projectLabelService
      .listLabels(projectPublicId)
      .then((lista) => vivo && setEtiquetas(lista))
      .catch(() => vivo && setEtiquetas(falhou))

    return () => {
      vivo = false
    }
  }, [projectPublicId, arquivado, configuracao, releitura])

  // **Uma mudanca de cada vez, na ordem em que a pessoa fez.** A seguinte espera a
  // resposta da anterior e parte do card que ela devolveu: duas etiquetas escolhidas
  // em seguida entram as duas, e nenhuma resposta antiga pisa numa nova. Os campos
  // nao se desligam enquanto isso — desligar tirava o foco de quem estava no meio de
  // uma escolha, e o que ela digitasse depois se perdia.
  const fila = useRef<Promise<void>>(Promise.resolve())
  const atual = useRef(card)

  useEffect(() => {
    atual.current = card
  }, [card])

  /**
   * **O valor escolhido aparece na hora**, com "Salvando…" ao lado, enquanto a fila
   * grava. Com a rede lenta, o campo mostrava o valor antigo por segundos, sem sinal
   * nenhum — e a pessoa escolhia de novo, ou desistia. Se falhar, o campo volta ao que
   * vale, e a falha diz qual campo foi, embaixo dele e no aviso.
   */
  const [mostrando, setMostrando] = useState<Partial<Record<Campo, string>>>({})
  const [gravando, setGravando] = useState<Partial<Record<Campo, boolean>>>({})
  const [falhas, setFalhas] = useState<Partial<Record<Campo, string>>>({})
  // Quantas mudancas de cada campo estao na fila: o "Salvando…" sai com a ultima.
  const naFila = useRef<Partial<Record<Campo, number>>>({})

  /**
   * Poe a mudanca na fila. Nulo, na vez dela, e "nada a fazer": ja e verdade. `campo`
   * diz de quem e o "Salvando…" e a falha; `escolhido`, o valor que o campo mostra
   * enquanto grava.
   */
  function salvar(
    acao: (card: ReportSummaryViewModel) => Promise<ReportDetailViewModel | null>,
    campo?: Campo,
    escolhido?: string,
  ) {
    if (campo) {
      naFila.current[campo] = (naFila.current[campo] ?? 0) + 1
      setFalhas((antes) => ({ ...antes, [campo]: undefined }))
      setGravando((antes) => ({ ...antes, [campo]: true }))
      if (escolhido !== undefined) setMostrando((antes) => ({ ...antes, [campo]: escolhido }))
    }
    fila.current = fila.current.then(async () => {
      try {
        const novo = await acao(atual.current)
        if (!novo) return
        atual.current = novo
        aoMudar(novo)
      } catch (falha) {
        if (!campo) {
          toast.error(describeError(falha))
          return
        }
        setFalhas((antes) => ({
          ...antes,
          [campo]: `Não deu para mudar ${NOME_DO_CAMPO[campo]}. Tente de novo.`,
        }))
        toast.error(`Não deu para mudar ${NOME_DO_CAMPO[campo]}. ${describeError(falha)}`)
      } finally {
        // A ultima da fila deste campo terminou: o campo volta a ler o card.
        if (campo) {
          const resta = (naFila.current[campo] ?? 1) - 1
          naFila.current[campo] = resta
          if (resta === 0) {
            setGravando((antes) => ({ ...antes, [campo]: false }))
            setMostrando((antes) => ({ ...antes, [campo]: undefined }))
          }
        }
      }
    })
  }

  /** O "Salvando…" do campo, ou a falha dele — embaixo do controle. */
  const situacao = (campo: Campo) =>
    gravando[campo] ? (
      <span role="status" className="mt-1 block text-caption text-fg-muted">
        Salvando…
      </span>
    ) : falhas[campo] ? (
      <span className="mt-1 block text-caption text-error-fg">{falhas[campo]}</span>
    ) : null

  const ids = (lista: { PublicId: string }[]) => lista.map((item) => item.PublicId)

  const trocarEtiquetas = (ids: string[]) =>
    projectReportService.setLabels(projectPublicId, reportPublicId, { LabelPublicIds: ids })

  function porEtiqueta(publicId: string) {
    salvar(
      async (c) =>
        c.Labels.some((item) => item.PublicId === publicId)
          ? null
          : trocarEtiquetas([...ids(c.Labels), publicId]),
      'etiquetas',
    )
  }

  function tirarEtiqueta(publicId: string) {
    salvar(
      async (c) =>
        c.Labels.some((item) => item.PublicId === publicId)
          ? trocarEtiquetas(ids(c.Labels.filter((item) => item.PublicId !== publicId)))
          : null,
      'etiquetas',
    )
  }

  function criarEtiqueta(nome: string) {
    salvar(async (c) => {
      // Criar e de qualquer um do time. O nome que ja existe volta como a etiqueta
      // que existe — e e ela que entra no card.
      const etiqueta = await projectLabelService.addLabel(projectPublicId, { Name: nome })
      setEtiquetas((lista) =>
        lista === null ||
        lista === 'falhou' ||
        lista.some((item) => item.PublicId === etiqueta.PublicId)
          ? lista
          : [...lista, etiqueta],
      )
      return c.Labels.some((item) => item.PublicId === etiqueta.PublicId)
        ? null
        : trocarEtiquetas([...ids(c.Labels), etiqueta.PublicId])
    }, 'etiquetas')
  }

  const responsavel = card.Assignee
  const algoFalhou = time === 'falhou' || prioridades === 'falhou' || etiquetas === 'falhou'

  return (
    <section aria-label="Campos do card">
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
        <dt className="text-detail text-fg-muted">Responsável</dt>
        <dd className="min-w-0">
          {arquivado || time === 'falhou' ? (
            <span className="text-body text-fg">{rotuloDoResponsavel(card) ?? 'Ninguém'}</span>
          ) : (
            <Select
              size="sm"
              ariaLabel="Responsável"
              value={mostrando.responsavel ?? responsavel?.UserPublicId ?? ''}
              disabled={time === null}
              openOnType
              onChange={(valor) =>
                salvar(
                  async (c) =>
                    (c.Assignee?.UserPublicId ?? '') === valor
                      ? null
                      : projectReportService.setAssignee(projectPublicId, reportPublicId, {
                          UserPublicId: valor === '' ? null : valor,
                        }),
                  'responsavel',
                  valor,
                )
              }
              options={[
                { value: '', label: 'Ninguém' },
                // Quem saiu continua no card, como registro, e aparece marcado: nao se
                // escolhe de novo, e a API recusaria. E, enquanto o time nao chegou, o
                // escolhido precisa estar na lista para o campo mostrar o nome dele.
                ...(responsavel && (!responsavel.InTeam || time === null)
                  ? [
                      {
                        value: responsavel.UserPublicId,
                        label: rotuloDoResponsavel(card) ?? '',
                        disabled: !responsavel.InTeam,
                      },
                    ]
                  : []),
                ...(time ?? []).map((pessoa) => ({
                  value: pessoa.UserPublicId,
                  label: pessoa.Name ?? pessoa.Email ?? 'Sem nome',
                })),
              ]}
            />
          )}
          {situacao('responsavel')}
        </dd>

        <dt className="text-detail text-fg-muted">Prioridade</dt>
        <dd className="min-w-0">
          {arquivado || prioridades === null || prioridades === 'falhou' ? (
            card.Priority ? (
              <CardChip color={card.Priority.Color}>{rotuloDaPrioridade(card.Priority)}</CardChip>
            ) : (
              <span className="text-body text-fg-muted">Sem prioridade</span>
            )
          ) : (
            <Select
              size="sm"
              ariaLabel="Prioridade"
              value={mostrando.prioridade ?? card.Priority?.PublicId ?? ''}
              openOnType
              onChange={(valor) =>
                salvar(
                  async (c) =>
                    (c.Priority?.PublicId ?? '') === valor
                      ? null
                      : projectReportService.setPriority(projectPublicId, reportPublicId, {
                          PriorityPublicId: valor === '' ? null : valor,
                        }),
                  'prioridade',
                  valor,
                )
              }
              options={[
                { value: '', label: 'Sem prioridade' },
                ...prioridades
                  .filter((p) => p.IsActive || p.PublicId === card.Priority?.PublicId)
                  .map((p) => ({
                    value: p.PublicId,
                    label: rotuloDaPrioridade(p),
                    disabled: !p.IsActive,
                  })),
              ]}
            />
          )}
          {situacao('prioridade')}
        </dd>

        <dt className="self-start pt-1 text-detail text-fg-muted">Etiquetas</dt>
        <dd className="min-w-0">
          <Etiquetas
            card={card}
            etiquetas={etiquetas === 'falhou' ? null : etiquetas}
            podeAdicionar={!arquivado && Array.isArray(etiquetas)}
            arquivado={arquivado}
            aoPor={porEtiqueta}
            aoTirar={tirarEtiqueta}
            aoCriar={criarEtiqueta}
          />
          {situacao('etiquetas')}
        </dd>

        <dt className="text-detail text-fg-muted">Prazo</dt>
        <dd className="min-w-0">
          {arquivado ? (
            <span className={cn('text-body', card.DueDate ? 'text-fg' : 'text-fg-muted')}>
              {card.DueDate ? formatDay(card.DueDate) : 'Sem prazo'}
            </span>
          ) : (
            <Prazo
              valor={card.DueDate}
              aoMudar={(data) =>
                salvar(
                  async (c) =>
                    c.DueDate === data
                      ? null
                      : projectReportService.setDueDate(projectPublicId, reportPublicId, {
                          DueDate: data,
                        }),
                  'prazo',
                )
              }
            />
          )}
          {/* A data por extenso — o campo segue o idioma do navegador, e num navegador
              em ingles mostrava mes/dia — e o mesmo destaque da lista e do quadro:
              vencido em vermelho, perto em amarelo, sempre com as palavras. */}
          {card.DueDate && !arquivado && (
            <PrazoPorExtenso dia={card.DueDate} card={card} soonDays={soonDays} />
          )}
          {situacao('prazo')}
        </dd>

        {sprints && (
          <>
            <dt className="text-detail text-fg-muted">Sprint</dt>
            <dd className="min-w-0">
              {/* **O card que terminou numa sprint concluida fica nela**: e o registro de
                  onde foi entregue, e a escolha — que so tem as abertas — o mostrava como
                  backlog. So se le. O que voltou a andar depois sai dela pela escolha. */}
              {arquivado || card.Parent || (card.Sprint?.State === 'Closed' && card.Finished) ? (
                <span className={cn('text-body', card.Sprint ? 'text-fg' : 'text-fg-muted')}>
                  {card.Sprint ? nomeDaSprint(card.Sprint) : 'Backlog'}
                  {card.Parent && (
                    <span className="text-caption text-fg-muted"> · vai com o pai</span>
                  )}
                </span>
              ) : (
                // O estado da sprint escolhida vai embaixo, e nao no nome: "Sprint 2 (em
                // andamento)" nao cabia no campo e saia cortado.
                <Select
                  size="sm"
                  ariaLabel="Sprint"
                  value={mostrando.sprint ?? card.Sprint?.PublicId ?? ''}
                  hint={
                    card.Sprint?.State === 'Active'
                      ? 'Em andamento: está no quadro.'
                      : card.Sprint?.State === 'Planned'
                        ? 'Planejada.'
                        : undefined
                  }
                  onChange={(valor) =>
                    salvar(
                      async (c) =>
                        (c.Sprint?.PublicId ?? '') === valor
                          ? null
                          : projectReportService.setSprint(projectPublicId, reportPublicId, {
                              SprintPublicId: valor === '' ? null : valor,
                            }),
                      'sprint',
                      valor,
                    )
                  }
                  options={[
                    ...(card.Sprint?.State === 'Closed'
                      ? [{ value: card.Sprint.PublicId, label: nomeDaSprint(card.Sprint) }]
                      : []),
                    { value: '', label: 'Backlog' },
                    // Na lista, a em andamento se distingue; escolhida, o estado vai na dica.
                    ...sprints.map((sprint) => ({
                      value: sprint.PublicId,
                      label:
                        sprint.State === 'Active' && sprint.PublicId !== card.Sprint?.PublicId
                          ? `${sprint.Name} · em andamento`
                          : sprint.Name,
                    })),
                  ]}
                />
              )}
              {situacao('sprint')}
            </dd>

            {!card.Parent && (
              <>
                <dt className="text-detail text-fg-muted">Pontos</dt>
                <dd className="min-w-0">
                  {arquivado ? (
                    <span
                      className={cn(
                        'text-body',
                        card.StoryPoints !== null ? 'text-fg' : 'text-fg-muted',
                      )}
                    >
                      {card.StoryPoints !== null
                        ? formatPoints(card.StoryPoints)
                        : 'Sem estimativa'}
                    </span>
                  ) : (
                    <Pontos
                      valor={card.StoryPoints}
                      aoMudar={(pontos) =>
                        salvar(
                          async (c) =>
                            c.StoryPoints === pontos
                              ? null
                              : projectReportService.setPoints(projectPublicId, reportPublicId, {
                                  Points: pontos,
                                }),
                          'pontos',
                        )
                      }
                    />
                  )}
                  {situacao('pontos')}
                </dd>
              </>
            )}
          </>
        )}
      </dl>

      {algoFalhou && (
        <p role="status" className="mt-3 text-caption text-fg-muted">
          Não deu para carregar tudo o que se escolhe aqui — o que não carregou fica só para
          leitura.{' '}
          <button
            type="button"
            onClick={() => setReleitura((n) => n + 1)}
            className="underline underline-offset-2 hover:text-fg"
          >
            Tentar de novo
          </button>
        </p>
      )}
    </section>
  )
}

/**
 * Como o responsavel aparece: o nome (ou o e-mail de quem nao tem nome, que a API ja
 * manda no lugar) e, se ele saiu do time, a marca.
 */
function rotuloDoResponsavel(card: ReportSummaryViewModel): string | null {
  if (!card.Assignee) return null
  const nome = card.Assignee.Name || 'Sem nome'
  return card.Assignee.InTeam ? nome : `${nome} (saiu do time)`
}

/** A aposentada continua no card que a tem, e aparece marcada onde estiver. */
function rotuloDaPrioridade(prioridade: { Name: string; IsActive: boolean }): string {
  return prioridade.IsActive ? prioridade.Name : `${prioridade.Name} (desativada)`
}

/**
 * O mesmo nome para a API: sem as bordas, os espacos de dentro juntados, e sem
 * diferenciar maiuscula. **O acento conta** — a mesma palavra com e sem acento sao duas etiquetas.
 */
function mesmoNome(a: string, b: string): boolean {
  const limpo = (texto: string) => texto.trim().replace(/\s+/g, ' ').toLowerCase()
  return limpo(a) === limpo(b)
}

/** Para procurar: sem maiuscula e sem acento, "pag" acha "Pagamento" e tambem a escrita com acento. */
function paraProcurar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * As etiquetas do card e o campo de etiquetar.
 *
 * **Etiquetar e escrever, e escolher na lista.** O campo procura entre as etiquetas do
 * projeto (sem acento, pelo comeco ou por qualquer parte do nome), e as achadas vem
 * numa lista que as setas percorrem, com a **primeira ja destacada**: **Enter poe a
 * destacada**. "Criar “…”" fica por ultimo, e so e escolhido pelas setas, pelo clique
 * — ou pelo Enter quando nao ha nenhuma parecida.
 *
 * Antes o Enter criava sempre a etiqueta com o nome escrito: "pag" e Enter viravam a
 * etiqueta "pag" no projeto inteiro, e nao "pagamentos". Quem vem das ferramentas
 * conhecidas digita o comeco e da Enter esperando a sugestao.
 *
 * O Esc com texto no campo limpa so o campo; o seguinte fecha o card.
 */
function Etiquetas({
  card,
  etiquetas,
  podeAdicionar,
  arquivado,
  aoPor,
  aoTirar,
  aoCriar,
}: {
  card: ReportSummaryViewModel
  etiquetas: ProjectLabelViewModel[] | null
  podeAdicionar: boolean
  arquivado: boolean
  aoPor: (publicId: string) => void
  aoTirar: (publicId: string) => void
  aoCriar: (nome: string) => void
}) {
  const dicaId = useId()
  const listaId = useId()
  const [texto, setTexto] = useState('')
  const [ativo, setAtivo] = useState(0)
  const noCard = new Set(card.Labels.map((etiqueta) => etiqueta.PublicId))
  const busca = texto.trim()
  const chave = paraProcurar(busca)

  // A de nome igual primeiro, depois as que comecam pelo que se escreveu, depois as que
  // o tem no meio — e a primeira e a que o Enter poe.
  const ordem = (nome: string) =>
    mesmoNome(nome, busca) ? 0 : paraProcurar(nome).startsWith(chave) ? 1 : 2
  const sugestoes = (etiquetas ?? [])
    .filter((etiqueta) => !noCard.has(etiqueta.PublicId))
    .filter((etiqueta) => chave.length === 0 || paraProcurar(etiqueta.Name).includes(chave))
    .sort((a, b) => ordem(a.Name) - ordem(b.Name) || a.Name.localeCompare(b.Name, 'pt-BR'))
    .slice(0, 6)

  // A de nome igual, pela regra da API. Criar so quando ela nao existe.
  const igual = (etiquetas ?? []).find((etiqueta) => mesmoNome(etiqueta.Name, busca))
  const podeCriar = busca.length > 0 && !igual
  const cheio = card.Labels.length >= MAX_LABELS_PER_CARD

  // As escolhas da lista, na ordem das setas: as achadas, e o "Criar" por ultimo.
  const opcoes: Array<{ chave: string; etiqueta?: ProjectLabelViewModel }> =
    busca.length === 0
      ? []
      : [
          ...sugestoes.map((etiqueta) => ({ chave: etiqueta.PublicId, etiqueta })),
          ...(podeCriar ? [{ chave: 'criar' }] : []),
        ]
  const destacada = Math.min(ativo, Math.max(0, opcoes.length - 1))

  const area = useRef<HTMLDivElement>(null)
  useCardDraft(
    {
      sujo: false,
      cancelar: texto.length > 0 ? () => setTexto('') : undefined,
    },
    area,
  )

  function escolher(publicId: string) {
    aoPor(publicId)
    setTexto('')
    setAtivo(0)
  }

  function criar() {
    aoCriar(busca)
    setTexto('')
    setAtivo(0)
  }

  function escolherOpcao(opcao: { etiqueta?: ProjectLabelViewModel } | undefined) {
    if (!opcao) return
    if (opcao.etiqueta) escolher(opcao.etiqueta.PublicId)
    else criar()
  }

  return (
    <div ref={area} className="flex flex-col gap-2">
      {card.Labels.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {card.Labels.map((etiqueta) => (
            <li key={etiqueta.PublicId} className="flex items-center">
              <CardChip color={etiqueta.Color}>{etiqueta.Name}</CardChip>
              {!arquivado && (
                <button
                  type="button"
                  aria-label={`Tirar a etiqueta ${etiqueta.Name}`}
                  onClick={() => aoTirar(etiqueta.PublicId)}
                  className="ml-0.5 rounded-full px-1 text-caption text-fg-muted hover:text-fg"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-body text-fg-muted">Sem etiquetas</span>
      )}

      {podeAdicionar && !cheio && (
        <div>
          <input
            type="text"
            role="combobox"
            value={texto}
            maxLength={MAX_LABEL_NAME_LENGTH}
            aria-label="Adicionar etiqueta"
            aria-describedby={dicaId}
            aria-autocomplete="list"
            aria-expanded={opcoes.length > 0}
            aria-controls={opcoes.length > 0 ? listaId : undefined}
            aria-activedescendant={
              opcoes.length > 0 ? `${listaId}-${opcoes[destacada]?.chave}` : undefined
            }
            placeholder="Adicionar etiqueta"
            onChange={(evento) => {
              setTexto(evento.target.value)
              setAtivo(0)
            }}
            onKeyDown={(evento) => {
              if (evento.key === 'ArrowDown' && opcoes.length > 0) {
                evento.preventDefault()
                setAtivo((destacada + 1) % opcoes.length)
              } else if (evento.key === 'ArrowUp' && opcoes.length > 0) {
                evento.preventDefault()
                setAtivo((destacada - 1 + opcoes.length) % opcoes.length)
              } else if (evento.key === 'Enter' && busca.length > 0) {
                evento.preventDefault()
                escolherOpcao(opcoes[destacada])
              }
            }}
            className="h-8 w-full rounded-lg border border-border bg-surface-raised px-2.5 text-detail text-fg placeholder:text-fg-placeholder"
          />
          {busca.length > 0 && (
            <p id={dicaId} className="mt-1 text-caption text-fg-muted">
              Enter põe a etiqueta destacada. Para uma nova, escolha Criar.
            </p>
          )}

          {opcoes.length > 0 && (
            <div
              id={listaId}
              role="listbox"
              aria-label="Etiquetas para escolher"
              className="mt-1.5 flex flex-wrap gap-1.5"
            >
              {opcoes.map((opcao, indice) => (
                // O mouse escolhe sem tirar o foco do campo — o teclado escolhe pelo campo.
                // biome-ignore lint/a11y/useKeyWithClickEvents: as teclas moram no campo (aria-activedescendant)
                <div
                  key={opcao.chave}
                  id={`${listaId}-${opcao.chave}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={indice === destacada}
                  onMouseDown={(evento) => evento.preventDefault()}
                  onClick={() => escolherOpcao(opcao)}
                  className={cn(
                    'cursor-pointer rounded-full',
                    indice === destacada && 'outline-2 outline-fg outline-offset-1',
                  )}
                >
                  {opcao.etiqueta ? (
                    <CardChip color={opcao.etiqueta.Color}>{opcao.etiqueta.Name}</CardChip>
                  ) : (
                    <span className="block rounded-full border border-border border-dashed px-2 py-px text-caption text-fg hover:bg-surface-sunken">
                      Criar “{busca}”
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!arquivado && cheio && (
        <p className="text-caption text-fg-muted">
          Um card leva até {MAX_LABELS_PER_CARD} etiquetas.
        </p>
      )}
    </div>
  )
}

/**
 * O prazo por extenso, embaixo do campo, com o destaque da lista: "venceu ha 2 dias"
 * em vermelho, "vence hoje" em amarelo. O card que ja terminou nao tem prazo a cumprir
 * — fica so a data.
 */
function PrazoPorExtenso({
  dia,
  card,
  soonDays,
}: {
  dia: string
  card: ReportSummaryViewModel
  soonDays: number
}) {
  const estado = card.Finished ? 'later' : dueState(dia, soonDays)
  const palavras = card.Finished ? null : dueWords(dia, soonDays)

  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-fg-muted">
      <span className="tabular-nums">{formatDay(dia)}</span>
      {palavras && (
        <span
          className={cn(
            'rounded-md border px-1.5 py-px',
            estado === 'overdue' && 'border-chip-red-border bg-chip-red-surface text-chip-red-fg',
            estado === 'soon' &&
              'border-chip-yellow-border bg-chip-yellow-surface text-chip-yellow-fg',
          )}
        >
          {palavras}
        </span>
      )}
    </span>
  )
}

/** O intervalo que a API aceita: fora dele e engano de digitacao, e nao prazo. */
function prazoValido(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const ano = Number(data.slice(0, 4))
  return ano >= 2000 && ano <= 2100
}

/**
 * O prazo: so a data. O campo de data do navegador ja fala o idioma de quem usa, e
 * o valor que ele devolve e o `aaaa-mm-dd` que a API guarda — sem fuso no meio.
 *
 * **Digitar e rascunho; sair do campo ou Enter grava.** Digitando, o navegador
 * devolve uma data inteira a cada tecla — o ano 2026 passa por 0002, 0020 e 0202 —, e
 * gravar a cada uma gravaria datas que ninguem escolheu. Escolher no calendario, sem
 * tecla nenhuma, grava na hora. A data pela metade, ou fora de 2000 a 2100, nao vira
 * pedido: o campo volta ao prazo que vale.
 */
function Prazo({
  valor,
  aoMudar,
}: {
  valor: string | null
  aoMudar: (data: string | null) => void
}) {
  const [rascunho, setRascunho] = useState(valor ?? '')
  const digitando = useRef(false)
  // O que o campo mostrava quando a digitacao comecou. Tecla que so anda entre dia,
  // mes e ano nao muda nada — e sair do campo assim nao pode gravar por cima do prazo
  // que outra pessoa pos enquanto isso.
  const antesDeDigitar = useRef<string | null>(null)

  // O prazo que chega de fora — a resposta, ou outra pessoa pelo tempo real — vale
  // sobre o rascunho, **menos no meio da digitacao**: ai quem sai do campo decide, e o
  // que escreveu nao some debaixo do dedo.
  useEffect(() => {
    if (!digitando.current) setRascunho(valor ?? '')
  }, [valor])

  function confirmar(campo: HTMLInputElement) {
    const comecou = digitando.current ? antesDeDigitar.current : null
    digitando.current = false
    antesDeDigitar.current = null
    const data = campo.value

    if (data === (valor ?? '')) return

    if (comecou !== null && data === comecou) {
      // Nada mudou no campo: fica o prazo que vale agora.
      setRascunho(valor ?? '')
      return
    }

    if (!prazoValido(data)) {
      if (data !== '') toast.error('Escolha um prazo entre os anos 2000 e 2100.')
      // Volta ao que vale. O campo e reposto a mao tambem: o navegador que nao avisa a
      // data pela metade nem mudou o rascunho, e o React nao teria o que repor.
      setRascunho(valor ?? '')
      campo.value = valor ?? ''
      return
    }

    aoMudar(data)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <input
        type="date"
        aria-label="Prazo"
        value={rascunho}
        min="2000-01-01"
        max="2100-12-31"
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') {
            evento.preventDefault()
            confirmar(evento.currentTarget)
          } else if (evento.key !== 'Tab' && !digitando.current) {
            digitando.current = true
            antesDeDigitar.current = evento.currentTarget.value
          }
        }}
        onChange={(evento) => {
          setRascunho(evento.target.value)
          if (!digitando.current) confirmar(evento.currentTarget)
        }}
        onBlur={(evento) => confirmar(evento.currentTarget)}
        className="h-8 rounded-lg border border-border bg-surface-raised px-2.5 text-detail text-fg"
      />
      {valor && (
        <button
          type="button"
          onClick={() => aoMudar(null)}
          className="whitespace-nowrap text-caption text-fg-muted underline-offset-2 hover:text-fg hover:underline"
        >
          Tirar prazo
        </button>
      )}
    </div>
  )
}

/**
 * A estimativa: um numero de 0 a 999, de meio em meio ponto. Grava ao sair do campo
 * ou com Enter; vazio tira a estimativa. O que nao for um numero valido volta ao que
 * estava, com o aviso.
 */
function Pontos({
  valor,
  aoMudar,
}: {
  valor: number | null
  aoMudar: (pontos: number | null) => void
}) {
  const [texto, setTexto] = useState(valor === null ? '' : String(valor).replace('.', ','))
  const [lido, setLido] = useState(valor)
  if (lido !== valor) {
    setLido(valor)
    setTexto(valor === null ? '' : String(valor).replace('.', ','))
  }

  function gravar() {
    const limpo = texto.trim().replace(',', '.')
    if (limpo === '') {
      if (valor !== null) aoMudar(null)
      return
    }
    const numero = Number(limpo)
    if (
      !Number.isFinite(numero) ||
      numero < 0 ||
      numero > MAX_STORY_POINTS ||
      numero * 2 !== Math.trunc(numero * 2)
    ) {
      toast.error(`A estimativa vai de 0 a ${MAX_STORY_POINTS}, de meio em meio ponto.`)
      setTexto(valor === null ? '' : String(valor).replace('.', ','))
      return
    }
    if (numero !== valor) aoMudar(numero)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={valor === null ? 'Pontos (sem estimativa)' : 'Pontos'}
      value={texto}
      placeholder="—"
      onChange={(evento) => setTexto(evento.target.value)}
      onBlur={gravar}
      onKeyDown={(evento) => {
        if (evento.key === 'Enter') {
          evento.preventDefault()
          gravar()
        }
      }}
      className="h-8 w-28 rounded-lg border border-border bg-surface px-2.5 text-body text-fg tabular-nums placeholder:text-fg-placeholder"
    />
  )
}

/** O nome da sprint do card, com "(concluída)" quando ela ja fechou. */
function nomeDaSprint(sprint: { Name: string; State: string }): string {
  return sprint.State === 'Closed' ? `${sprint.Name} (concluída)` : sprint.Name
}
