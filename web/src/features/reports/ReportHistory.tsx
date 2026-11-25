import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReportHistoryEntryViewModel, ReportHistoryPageViewModel } from '@/contracts'
import { projectReportService } from '@/data'
import { rotuloDoDia } from '@/features/reports/CommentThread'
import { Skeleton } from '@/shared/components/Skeleton'
import { cn } from '@/shared/lib/cn'
import { formatDateTime, formatDay } from '@/shared/lib/datetime'
import { areaQueRola, rolarAte, topoDentro } from '@/shared/lib/rolagemSuave'

/**
 * A linha do tempo do relato.
 *
 * **Montada a partir dos eventos**, e nao de uma coluna de historico. Uma coluna
 * seria uma segunda versao do mesmo fato, e as duas divergiriam no primeiro erro
 * de gravacao sem ninguem notar.
 *
 * **O nome das colunas vem do evento**, e nao da fila de hoje. Foi gravado quando
 * a mudanca aconteceu: por isso uma coluna renomeada (ou aposentada) continua
 * aparecendo aqui com o nome que tinha na epoca, em vez de o passado ser
 * reescrito a cada renomeacao.
 *
 * **O texto dos comentarios nao aparece aqui**, e nao e esquecimento: o evento
 * registra que houve comentario, nao o que foi dito. O texto mora na tabela dele,
 * que se consegue apagar; a de eventos, nao.
 *
 * **Fechado ate alguem abrir, e aos pedacos.** O card abre sem ler o historico; ao abrir,
 * vem os mais recentes, e cada "Mostrar mais" traz os de antes. Ler tudo a cada card
 * aberto (e de novo a cada comentario) era trazer o que quase ninguem olhava.
 *
 * **So o que e acao, e o mais novo primeiro.** Do time, so a primeira abertura (e o tempo
 * que levou para olhar); de quem relatou, a primeira vez que abriu o acompanhamento, e as
 * voltas a pedido; o "nao andou" vai na linha do movimento.
 */
export function ReportHistory({
  projectPublicId,
  reportPublicId,
  versao,
}: {
  projectPublicId: string
  reportPublicId: string
  /** Muda quando algo novo aconteceu, para a linha do tempo, se aberta, buscar o que chegou. */
  versao: number
}) {
  const [aberto, setAberto] = useState(false)
  const [comVoltas, setComVoltas] = useState(false)
  const [lido, setLido] = useState<Lido | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const idDoConteudo = useId()

  // Cada leitura leva um numero: a resposta de uma leitura velha (outro card, as voltas
  // trocadas no meio) nao escreve por cima da nova.
  const leitura = useRef(0)
  // O que aconteceu com o historico fechado fica para quando ele abrir.
  const desatualizado = useRef(false)

  const ler = useCallback(
    async (modo: 'inicio' | 'atualizar', voltas: boolean) => {
      const numero = ++leitura.current
      if (modo === 'inicio') setCarregando(true)
      setFalhou(false)
      try {
        const pedaco = await projectReportService.listReportHistoryPage(
          projectPublicId,
          reportPublicId,
          { limit: PEDACO, returns: voltas },
        )
        if (numero !== leitura.current) return
        desatualizado.current = false
        setLido((antes) =>
          modo === 'atualizar' && antes ? juntarNovos(antes, pedaco) : deUmPedaco(pedaco),
        )
      } catch {
        if (numero === leitura.current) setFalhou(true)
      } finally {
        if (numero === leitura.current) setCarregando(false)
      }
    },
    [projectPublicId, reportPublicId],
  )

  // Outro card no mesmo dialogo: o que foi lido era do anterior.
  // biome-ignore lint/correctness/useExhaustiveDependencies: o gatilho e trocar de card.
  useEffect(() => {
    leitura.current += 1
    setLido(null)
    setFalhou(false)
    setCarregando(false)
    setCarregandoMais(false)
    desatualizado.current = false
  }, [projectPublicId, reportPublicId])

  // Aberto e ainda sem nada lido (a primeira vez, ou outro card): le os mais recentes.
  useEffect(() => {
    if (aberto && lido === null && !carregando && !falhou) void ler('inicio', comVoltas)
  }, [aberto, lido, carregando, falhou, ler, comVoltas])

  // Algo novo aconteceu (uma acao aqui, ou outra pessoa pelo tempo real): aberto, busca o
  // que chegou **sem sumir da tela**; fechado, fica para quando abrir.
  const vista = useRef(versao)
  useEffect(() => {
    if (vista.current === versao) return
    vista.current = versao
    if (aberto && lido !== null) void ler('atualizar', comVoltas)
    else desatualizado.current = true
  }, [versao, aberto, lido, ler, comVoltas])

  // **Abrir desce a tela ate o historico, e fechar volta para onde estava**, os dois devagar:
  // aberto la no fim do card, o conteudo surgia fora da vista, e a pessoa nao via o que abriu.
  const secao = useRef<HTMLElement>(null)
  const rolagemAntes = useRef<number | null>(null)
  const pararRolagem = useRef<() => void>(() => {})
  const descendoAte = useRef(0)

  /** A tela leva o titulo do historico ao alto, e vai junto enquanto ele cresce. */
  function descer() {
    const area = areaQueRola(secao.current)
    const alvo = secao.current
    if (!area || !alvo) return
    pararRolagem.current()
    descendoAte.current = performance.now() + DESCIDA_MS
    pararRolagem.current = rolarAte(area, () => topoDentro(alvo, area) - 8, { duracao: DESCIDA_MS })
  }

  function alternar() {
    const abrir = !aberto
    const area = areaQueRola(secao.current)
    if (abrir) {
      rolagemAntes.current = area?.scrollTop ?? null
      descer()
    } else {
      // Fechar encolhe e volta para onde a pessoa estava antes de abrir, devagar.
      pararRolagem.current()
      const volta = rolagemAntes.current
      if (area && volta !== null)
        pararRolagem.current = rolarAte(area, () => volta, { duracao: DESCIDA_MS })
      rolagemAntes.current = null
    }
    setAberto(abrir)
    if (abrir && lido !== null && desatualizado.current) void ler('atualizar', comVoltas)
  }

  // O conteudo chegou depois de a descida terminar (a rede demorou): desce de novo, agora
  // com ele. Chegando no meio dela, a propria descida ja o acompanha.
  const chegou = lido !== null
  // biome-ignore lint/correctness/useExhaustiveDependencies: so quando o primeiro pedaco chega.
  useEffect(() => {
    if (!chegou || !aberto || rolagemAntes.current === null) return
    if (performance.now() > descendoAte.current) descer()
  }, [chegou])

  useEffect(() => () => pararRolagem.current(), [])

  async function mostrarMais() {
    const atual = lido
    const maisAntigo = atual?.itens.at(-1)
    if (!atual || !maisAntigo || carregandoMais) return
    const numero = leitura.current
    setCarregandoMais(true)
    try {
      const pedaco = await projectReportService.listReportHistoryPage(
        projectPublicId,
        reportPublicId,
        { before: maisAntigo.PublicId, limit: PEDACO, returns: comVoltas },
      )
      if (numero !== leitura.current) return
      setLido((antes) => (antes ? juntarAntigos(antes, pedaco) : antes))
    } catch {
      if (numero === leitura.current) setFalhou(true)
    } finally {
      if (numero === leitura.current) setCarregandoMais(false)
    }
  }

  function alternarVoltas() {
    const voltas = !comVoltas
    setComVoltas(voltas)
    leitura.current += 1
    setLido(null)
    void ler('inicio', voltas)
  }

  const dias = useMemo(
    () => (lido ? porDia(arrumar(lido.itens, lido.primeiraVisita)) : null),
    [lido],
  )
  const restantes = lido ? Math.max(lido.total - lido.itens.length, 0) : 0

  return (
    <section ref={secao} className="scroll-mt-2 border-border border-t pt-4">
      <h3>
        {/* **A linha inteira abre e fecha**, com o que ela faz escrito a direita: so a seta
            e o titulo passavam despercebidos no fim do card. */}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberto}
          aria-controls={idDoConteudo}
          aria-labelledby={`${idDoConteudo}-titulo`}
          aria-describedby={`${idDoConteudo}-dica`}
          className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-out hover:bg-surface-sunken"
        >
          <span
            aria-hidden="true"
            className="flex size-7 flex-none items-center justify-center rounded-full bg-surface-sunken text-fg-muted"
          >
            <IconeDoFato tipo="relogio" />
          </span>
          <span className="min-w-0 flex-1">
            <span id={`${idDoConteudo}-titulo`} className="block font-medium text-detail text-fg">
              Histórico
            </span>
            <span id={`${idDoConteudo}-dica`} className="block text-caption text-fg-muted">
              Tudo o que aconteceu, do mais recente ao mais antigo
            </span>
          </span>
          <span className="flex flex-none items-center gap-1 text-caption text-fg-muted">
            {aberto ? 'Esconder' : 'Mostrar'}
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn('transition-transform duration-200 ease-out', aberto && 'rotate-180')}
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </span>
        </button>
      </h3>

      {/* Abre e fecha devagar, como os detalhes: a linha do grid vai de zero a altura do
          conteudo. Fechado, o que ja foi lido fica (fechar so encolhe) e sai do teclado. */}
      <div
        id={idDoConteudo}
        inert={!aberto || undefined}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-500 ease-[var(--ease-drawer)] motion-reduce:transition-none',
          aberto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-2 pb-1">
            {carregando && lido === null && (
              <div role="status" className="flex flex-col gap-2 py-0.5">
                <span className="sr-only">Carregando o histórico</span>
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            )}

            {falhou && (
              <p className="mb-2 text-caption text-fg-muted leading-normal">
                O histórico não carregou, e o relato acima está completo.{' '}
                <button
                  type="button"
                  onClick={() =>
                    lido === null ? void ler('inicio', comVoltas) : void mostrarMais()
                  }
                  className="cursor-pointer underline underline-offset-2 hover:text-fg"
                >
                  Tentar de novo
                </button>
              </p>
            )}

            {dias && dias.length > 0 && (
              <div className="flex flex-col gap-3">
                {dias.map((dia) => (
                  <div key={dia.chave}>
                    <h4 className="mb-1.5 font-medium text-caption text-fg-muted">{dia.rotulo}</h4>
                    <ol className="flex flex-col gap-2.5">
                      {dia.linhas.map(({ entrada, ator, acao, tipo }) => (
                        <li key={entrada.PublicId} className="flex items-start gap-2.5">
                          <span
                            aria-hidden="true"
                            className="flex size-6 flex-none items-center justify-center rounded-full bg-surface-sunken text-fg-muted"
                          >
                            <IconeDoFato tipo={tipo} />
                          </span>
                          <p className="min-w-0 flex-1 pt-0.5 text-detail text-fg leading-snug">
                            {ator ? (
                              <>
                                <span className="font-medium">{ator}</span> {acao}
                              </>
                            ) : (
                              acao
                            )}
                          </p>
                          <time
                            dateTime={entrada.OccurredAt}
                            title={formatDateTime(entrada.OccurredAt)}
                            className="flex-none pt-0.5 text-caption text-fg-muted tabular-nums"
                          >
                            {HORA.format(new Date(entrada.OccurredAt))}
                          </time>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}

            {lido && (lido.temMais || lido.voltas > 0 || comVoltas) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 pointer-coarse:gap-x-6 pointer-coarse:gap-y-6">
                {lido.temMais && (
                  <button
                    type="button"
                    onClick={() => void mostrarMais()}
                    disabled={carregandoMais}
                    className="flex cursor-pointer items-center gap-1.5 text-caption text-fg-muted underline underline-offset-2 hover:text-fg disabled:cursor-default disabled:no-underline pointer-coarse:-my-3 pointer-coarse:py-3"
                  >
                    {carregandoMais ? (
                      <>
                        <Girando />
                        Carregando…
                      </>
                    ) : (
                      `Mostrar mais (${restantes})`
                    )}
                  </button>
                )}
                {(lido.voltas > 0 || comVoltas) && (
                  <button
                    type="button"
                    onClick={alternarVoltas}
                    className="cursor-pointer text-caption text-fg-muted underline underline-offset-2 hover:text-fg pointer-coarse:-my-3 pointer-coarse:py-3"
                  >
                    {comVoltas
                      ? 'Esconder as voltas de quem relatou'
                      : `Mostrar as voltas de quem relatou (${lido.voltas})`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Quantos eventos cada leitura traz: os mais recentes ao abrir, e de tantos em tantos depois. */
const PEDACO = 10

/** O que a tela ja leu do historico, do mais novo para o mais antigo. */
interface Lido {
  itens: ReportHistoryEntryViewModel[]
  temMais: boolean
  total: number
  voltas: number
  primeiraVisita: string | null
}

function deUmPedaco(pedaco: ReportHistoryPageViewModel): Lido {
  return {
    itens: pedaco.Items,
    temMais: pedaco.HasOlder,
    total: pedaco.Total,
    voltas: pedaco.ReporterReturns,
    primeiraVisita: pedaco.FirstReporterVisit,
  }
}

/** Os de antes, embaixo, sem repetir o que ja estava na tela. */
function juntarAntigos(antes: Lido, pedaco: ReportHistoryPageViewModel): Lido {
  const ja = new Set(antes.itens.map((item) => item.PublicId))
  return {
    ...deUmPedaco(pedaco),
    itens: [...antes.itens, ...pedaco.Items.filter((item) => !ja.has(item.PublicId))],
  }
}

/**
 * O que chegou depois, em cima. Se o pedaco novo nao encosta no que a tela tem (chegou mais
 * coisa do que cabe nele), a tela recomeca dele: juntar deixaria um buraco no meio.
 */
function juntarNovos(antes: Lido, pedaco: ReportHistoryPageViewModel): Lido {
  const ja = new Set(antes.itens.map((item) => item.PublicId))
  const novos = pedaco.Items.filter((item) => !ja.has(item.PublicId))
  if (novos.length === pedaco.Items.length && pedaco.HasOlder) return deUmPedaco(pedaco)
  return { ...deUmPedaco(pedaco), itens: [...novos, ...antes.itens], temMais: antes.temMais }
}

/** O girinho de quem esta buscando, no botao de mostrar mais. */
function Girando() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="animate-spin"
    >
      <path d="M8 2a6 6 0 1 0 6 6" />
    </svg>
  )
}

/** O "nao andou" de um movimento chega junto dele; mais longe que isto, e outro fato. */
const MESMO_MOVIMENTO_MS = 10_000

/**
 * Uma linha do historico. **Quem fez vem na frente**, como se conta: "Ana moveu de A fazer
 * para Fazendo". Sem ninguem a quem atribuir (quem relatou, o proprio sistema), `ator` e
 * nulo e `acao` e a frase inteira.
 */
interface Linha {
  entrada: ReportHistoryEntryViewModel
  ator: string | null
  acao: string
  tipo: TipoDoFato
}

/** As linhas de um mesmo dia, com o nome dele ("Hoje", "Ontem", "22 de novembro"). */
interface Dia {
  chave: string
  rotulo: string
  linhas: Linha[]
}

/** Agrupa as linhas (ja da mais nova para a mais antiga) pelo dia, no fuso de quem le. */
function porDia(linhas: Linha[]): Dia[] {
  const dias: Dia[] = []
  for (const linha of linhas) {
    const data = new Date(linha.entrada.OccurredAt)
    const chave = `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`
    const ultimo = dias.at(-1)
    if (ultimo?.chave === chave) ultimo.linhas.push(linha)
    else dias.push({ chave, rotulo: rotuloDoDia(linha.entrada.OccurredAt), linhas: [linha] })
  }
  return dias
}

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** A leitura de quem relatou, pela pagina de acompanhamento: o mesmo tipo da do time. */
const deQuemRelatou = (entrada: ReportHistoryEntryViewModel) =>
  entrada.Type === 'ReportViewed' && entrada.Source === 'PublicPage'

/**
 * As linhas que a tela mostra, da mais nova para a mais antiga, a partir do que ja foi
 * lido (que vem do mais novo para o mais antigo).
 *
 * - **Do time, so a primeira abertura**, como "Aberto pela primeira vez pelo time": e o
 *   fato que conta (o tempo que o time levou para olhar).
 * - **De quem relatou, a primeira vez que abriu o acompanhamento**, numa frase so dela,
 *   e nao como se fosse o time. Qual e a primeira, a API diz (`primeiraVisita`): com o
 *   historico aos pedacos, a mais antiga na tela nem sempre e a primeira de verdade. As
 *   voltas so chegam quando pedidas.
 * - **O "nao andou" entra na linha do movimento** que o causou: "Movido de A para B, e
 *   quem relatou continua vendo a mesma etapa". Sozinho (sem movimento perto), fica
 *   como linha propria.
 */
function arrumar(lidas: ReportHistoryEntryViewModel[], primeiraVisita: string | null): Linha[] {
  const linhas: Linha[] = []
  let oTimeAbriu = false

  for (const entrada of [...lidas].reverse()) {
    if (deQuemRelatou(entrada)) {
      linhas.push({
        entrada,
        ator: null,
        acao:
          entrada.PublicId === primeiraVisita
            ? 'Quem relatou abriu o acompanhamento'
            : 'Quem relatou voltou ao acompanhamento',
        tipo: 'leitura',
      })
      continue
    }
    if (entrada.Type === 'ReportViewed') {
      // A API manda so a primeira; duas so se duas pessoas abriram juntas o relato novo.
      if (!oTimeAbriu) {
        oTimeAbriu = true
        linhas.push(
          entrada.AuthorName?.trim()
            ? {
                entrada,
                ator: entrada.AuthorName.trim(),
                acao: 'abriu o relato pela primeira vez',
                tipo: 'leitura',
              }
            : {
                entrada,
                ator: null,
                acao: 'O time abriu o relato pela primeira vez',
                tipo: 'leitura',
              },
        )
      }
      continue
    }

    if (entrada.Type === 'ReportPublicStageUnmapped') {
      const movimento = [...linhas]
        .reverse()
        .find((linha) => linha.entrada.Type === 'ReportStateChanged')
      const perto =
        movimento &&
        Math.abs(Date.parse(entrada.OccurredAt) - Date.parse(movimento.entrada.OccurredAt)) <=
          MESMO_MOVIMENTO_MS
      if (movimento && perto && !movimento.acao.includes(', e quem relatou')) {
        movimento.acao = `${movimento.acao}, e quem relatou continua vendo a mesma etapa`
        continue
      }
    }

    linhas.push({ entrada, ...descrever(entrada) })
  }

  return linhas.reverse()
}

/** O desenho de cada linha: o que aconteceu, num olhar. */
type TipoDoFato = 'comentario' | 'movimento' | 'campo' | 'leitura' | 'marco' | 'relogio'

/** Quem do time fez: o nome de agora; sem nome (conta esvaziada, evento antigo), alguem do time. */
const doTime = (entrada: ReportHistoryEntryViewModel) =>
  entrada.AuthorName?.trim() || 'Alguém do time'

/**
 * A frase de cada linha, com quem fez na frente quando ha alguem do time por tras.
 *
 * - **Quem relatou e o sistema nao viram "alguem do time"**: as linhas deles sao frases
 *   inteiras ("Quem relatou respondeu", "Relato recebido").
 * - **Sem autor num evento que so o time faz** (os campos do card, o comentario entre o
 *   time), a linha diz "Alguém do time": o evento e de antes de o autor ser guardado.
 * - **Tipo que esta versao nao conhece** aparece com o proprio valor, em vez de sumir: a
 *   API pode ganhar um tipo antes de o painel ser atualizado.
 */
function descrever(entrada: ReportHistoryEntryViewModel): Omit<Linha, 'entrada'> {
  const autor = entrada.AuthorName?.trim() || null
  const doTimeOu = (acao: string, semAutor: string, tipo: TipoDoFato) =>
    autor ? { ator: autor, acao, tipo } : { ator: null, acao: semAutor, tipo }
  const peloTime = (acao: string, tipo: TipoDoFato) => ({ ator: doTime(entrada), acao, tipo })
  const frase = (acao: string, tipo: TipoDoFato) => ({ ator: null, acao, tipo })

  switch (entrada.Type) {
    case 'ReportCreated':
      return frase('Relato recebido', 'marco')
    case 'ReportStateChanged': {
      // Sem coluna de origem o relato entrou na fila agora, e nao veio de lugar nenhum.
      const destino = entrada.ToStateName ?? 'outra coluna'
      return entrada.FromStateName
        ? doTimeOu(
            `moveu de ${entrada.FromStateName} para ${destino}`,
            `Movido de ${entrada.FromStateName} para ${destino}`,
            'movimento',
          )
        : doTimeOu(`colocou em ${destino}`, `Colocado em ${destino}`, 'movimento')
    }
    case 'ReportInternalCommented':
      return peloTime('comentou entre o time', 'comentario')
    case 'ReportPublicCommented':
      return doTimeOu('escreveu para quem relatou', 'Mensagem para quem relatou', 'comentario')
    // As duas falam do **outro lado**, com o vocabulario do resto do painel.
    case 'ReportPublicStageChanged':
      return frase('Quem relatou passou a ver outra etapa', 'movimento')
    case 'ReportPublicStageUnmapped':
      return frase('Quem relatou continua vendo a mesma etapa', 'movimento')
    // Sem o desfecho e sem o motivo: eles aparecem no bloco do encerramento.
    case 'ReportClosed':
      return doTimeOu('encerrou o relato', 'Relato encerrado', 'marco')
    case 'ReportConfirmed':
      return frase('Quem relatou confirmou que resolveu', 'marco')
    case 'ReportReopened':
      return frase('Quem relatou reabriu', 'marco')
    // Pedir informacao e devolver, e nao recusar: a frase diz de quem e a vez.
    case 'ReportInfoRequested':
      return doTimeOu(
        'pediu informação a quem relatou',
        'Devolvido pedindo informação',
        'comentario',
      )
    case 'ReportReplied':
      return frase('Quem relatou respondeu', 'comentario')
    // "Desfez o encerramento", e nao "reabriu": reabrir e quem relatou dizendo que continua.
    case 'ReportClosureCancelled':
      return doTimeOu('desfez o encerramento', 'Deixou de estar encerrado', 'marco')
    // "Liberou", e nao "publicou": o relato so aparece se o projeto tambem for publico.
    case 'ReportPublished':
      return doTimeOu('liberou para o público', 'Liberado para o público', 'marco')
    case 'ReportModerationRejected':
      return doTimeOu('manteve fora do público', 'Não vai para o público', 'marco')
    case 'TeamCardCreated':
      return peloTime('criou o card', 'marco')
    case 'TeamCardEdited':
      return peloTime('editou o título ou a descrição', 'campo')
    case 'CardArchived':
      return peloTime('arquivou', 'marco')
    case 'CardUnarchived':
      return peloTime('desarquivou', 'marco')
    case 'CardTitleChanged':
      return peloTime(
        entrada.TitleRestored ? 'tirou o título do time' : 'reescreveu o título',
        'campo',
      )
    case 'CardAssigneeChanged':
      // Nulo e ninguem; o texto vazio e alguem sem nome nem e-mail, que nao vira ninguem.
      return peloTime(
        entrada.To === null
          ? 'tirou o responsável'
          : `passou para ${entrada.To || 'alguém sem nome'}`,
        'campo',
      )
    case 'CardPriorityChanged':
      return peloTime(
        entrada.To ? `mudou a prioridade para ${entrada.To}` : 'tirou a prioridade',
        'campo',
      )
    case 'CardDueDateChanged':
      return peloTime(
        entrada.To ? `definiu o prazo para ${formatDay(entrada.To)}` : 'tirou o prazo',
        'campo',
      )
    case 'CardLabelsChanged': {
      const mudancas = [
        ...entrada.Added.map((nome) => `+ ${nome}`),
        ...entrada.Removed.map((nome) => `− ${nome}`),
      ]
      return peloTime(
        mudancas.length > 0 ? `mudou as etiquetas (${mudancas.join(', ')})` : 'mudou as etiquetas',
        'campo',
      )
    }
    case 'CardLinked':
    case 'CardUnlinked': {
      // O tipo vem do evento, e o numero e o do outro card. Tipo desconhecido, frase geral.
      const frases = entrada.From ? VINCULOS[entrada.From] : undefined
      const ganhou = entrada.Type === 'CardLinked'
      if (!frases || !entrada.To)
        return peloTime(ganhou ? 'vinculou outro card' : 'desfez um vínculo', 'campo')
      return peloTime(ganhou ? frases.ganhou(entrada.To) : frases.perdeu(entrada.To), 'campo')
    }
    case 'CardSprintChanged':
      // Nulo e o backlog: o nome da epoca, como o da coluna.
      return peloTime(
        entrada.To
          ? entrada.From
            ? `mudou de ${entrada.From} para ${entrada.To}`
            : `planejou na ${entrada.To}`
          : `levou de ${entrada.From ?? 'uma sprint'} para o backlog`,
        'movimento',
      )
    case 'CardPointsChanged':
      return peloTime(
        entrada.To !== null ? `estimou em ${formatPoints(entrada.To)}` : 'tirou a estimativa',
        'campo',
      )
    default:
      return frase(entrada.Type, 'marco')
  }
}

/** O vinculo visto deste card, com quem fez na frente: "Ana marcou como duplicado de #6". */
const VINCULOS: Record<string, { ganhou: (n: string) => string; perdeu: (n: string) => string }> = {
  duplicate_of: {
    ganhou: (n) => `marcou como duplicado de #${n}`,
    perdeu: (n) => `desmarcou o duplicado de #${n}`,
  },
  duplicated_by: {
    ganhou: (n) => `marcou #${n} como duplicado deste`,
    perdeu: (n) => `desmarcou #${n} como duplicado deste`,
  },
  blocks: {
    ganhou: (n) => `marcou que este bloqueia #${n}`,
    perdeu: (n) => `tirou o bloqueio de #${n}`,
  },
  blocked_by: {
    ganhou: (n) => `marcou que #${n} bloqueia este`,
    perdeu: (n) => `tirou o bloqueio por #${n}`,
  },
  relates_to: {
    ganhou: (n) => `relacionou a #${n}`,
    perdeu: (n) => `desfez a relação com #${n}`,
  },
}

/** Os desenhos das linhas: pequenos, no mesmo tom, so para o olho achar o tipo. */
function IconeDoFato({ tipo }: { tipo: TipoDoFato }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {tipo === 'comentario' && <path d="M2.5 3.5h11v7H7l-3 2.5v-2.5H2.5z" />}
      {tipo === 'movimento' && <path d="M3 8h9M9 4.5L12.5 8 9 11.5" />}
      {tipo === 'campo' && <path d="M10.5 2.5l3 3-7.5 7.5H3v-3z" />}
      {tipo === 'leitura' && (
        <>
          <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z" />
          <circle cx="8" cy="8" r="2" />
        </>
      )}
      {tipo === 'marco' && <circle cx="8" cy="8" r="3" />}
      {tipo === 'relogio' && (
        <>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 5v3l2 1.5" />
        </>
      )}
    </svg>
  )
}

/** Os pontos como o time le: "2,5", sem o ".0" de quem guardou. */
function formatPoints(valor: string): string {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero.toLocaleString('pt-BR') : valor
}

/** Quanto a tela leva para descer ate o historico (e voltar), devagar. */
const DESCIDA_MS = 750
