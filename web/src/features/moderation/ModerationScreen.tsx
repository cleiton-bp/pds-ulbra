import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type {
  ModerationCountsViewModel,
  ModerationItemViewModel,
  ReportModerationState,
} from '@/contracts'
import { MODERATION_PAGE_SIZE } from '@/contracts'
import {
  describeError,
  isPanelError,
  type ModerationQuery,
  projectIdentitySettingsService,
  projectOriginService,
  projectReportService,
  projectReportTypeService,
} from '@/data'
import {
  ABAS,
  acoesDa,
  type Decisao,
  DetalheDoRelato,
  LinhaDaFila,
  type Marca,
  VAZIO,
} from '@/features/moderation/moderationParts'
import { useAvisosDeCard } from '@/features/moderation/useAvisosDeCard'
import { Button } from '@/shared/components/Button'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { Select } from '@/shared/components/Select'
import {
  type Shortcut,
  ShortcutsButton,
  ShortcutsDialog,
} from '@/shared/components/ShortcutsDialog'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { canConfigure } from '@/shared/lib/projectAccess'

/**
 * Quem le antes do resto do mundo — uma caixa de entrada: a lista compacta para achar,
 * o relato inteiro ao lado para ler e decidir.
 *
 * **A fila existe mesmo em projeto privado, e a secao nao some la.** Todo relato
 * nasce pendente — e isso que faz marcar o projeto como publico depois nao publicar o
 * historico inteiro de uma vez. Esconder a fila em projeto privado esconderia que ela
 * continua enchendo, e quem publicasse um dia encontraria uma fila de meses.
 *
 * **O texto aparece inteiro, e nao cortado**, no lado do detalhe. Quem decide publicar
 * precisa ler o que vai publicar: o que vaza costuma estar no meio de um paragrafo. A
 * lista so mostra a primeira linha — ela e para achar.
 *
 * **Decidir tira o relato da lista ali mesmo**, sem reler a fila: reler recolhia a
 * lista, voltava a rolagem ao topo e varria de novo os textos todos. O proximo fica
 * escolhido, e o teclado (J/K/L/N/X) faz o resto.
 *
 * **Liberar nao publica sozinho.** Sao duas condicoes, e nenhuma basta: o projeto num
 * nivel publico, e o relato liberado aqui. Em projeto privado a tela diz isso no topo
 * e a aba Esperando deixa de contar: com o numero, a fila parecia uma tarefa que nunca
 * acaba, e o time ia "limpa-la" por obrigacao.
 */
/** Os atalhos desta tela, ditos uma vez, no dialogo do "?". */
const ATALHOS: Shortcut[] = [
  { teclas: ['J', 'K'], oQue: 'O próximo e o anterior' },
  { teclas: ['L'], oQue: 'Liberar (ou liberar mesmo assim)' },
  { teclas: ['N'], oQue: 'Não publicar (ou tirar do público)' },
  { teclas: ['X'], oQue: 'Selecionar para o lote' },
  { teclas: ['?'], oQue: 'Mostrar ou esconder esta lista' },
]

export function ModerationScreen() {
  const project = useCurrentProject()
  const pid = project.PublicId
  const idBase = useId()
  const [aba, setAba] = useState<ReportModerationState>('Pending')

  // Os filtros. A busca espera a pessoa parar de digitar: cada letra seria uma consulta.
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [tipo, setTipo] = useState('')
  const [chegada, setChegada] = useState<Chegada>('')
  const [origem, setOrigem] = useState('')
  const [soSensivel, setSoSensivel] = useState(false)

  useEffect(() => {
    const espera = setTimeout(() => setBuscaAplicada(busca.trim()), 300)
    return () => clearTimeout(espera)
  }, [busca])

  // Privado ou publico vem de Quem relata. Falhando a leitura, a tela fica como era:
  // sem a faixa, e com a contagem.
  const { data: identidade } = useAsyncResource(
    useCallback(() => projectIdentitySettingsService.getIdentitySettings(pid), [pid]),
  )
  const privado = identidade?.Visibility === 'Private'

  // As opcoes dos filtros. Falhando, o filtro some: a fila continua lendo sem ele.
  const { data: tipos } = useAsyncResource(
    useCallback(() => projectReportTypeService.listReportTypes(pid), [pid]),
  )
  const { data: origens } = useAsyncResource(
    useCallback(() => projectOriginService.listObservedOrigins(pid), [pid]),
  )

  const pedido = useMemo<ModerationQuery>(
    () => ({
      state: aba,
      limit: MODERATION_PAGE_SIZE,
      q: buscaAplicada || undefined,
      types: tipo ? [tipo] : undefined,
      origin: origem || undefined,
      ...periodo(chegada),
    }),
    [aba, buscaAplicada, tipo, origem, chegada],
  )

  const [fila, setFila] = useState<Fila | null>(null)
  const [contagem, setContagem] = useState<ModerationCountsViewModel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [falhou, setFalhou] = useState(false)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set())
  const [marcas, setMarcas] = useState<Map<string, Marca>>(() => new Map())
  const [decidindo, setDecidindo] = useState(false)
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null)
  const [novos, setNovos] = useState(0)
  const [atalhos, setAtalhos] = useState(false)

  // Cada leitura leva um numero: a resposta de um pedido velho (outra aba, outro
  // filtro) nao pode desenhar por cima da do pedido de agora.
  const pedidoAtual = useRef(0)
  // Quantos relatos a aba tem, pelo que a lista sabe: a ultima leitura menos o que
  // saiu daqui. E contra ele que o tempo real diz "N novos".
  const vistos = useRef(0)

  const carregar = useCallback(async () => {
    const minha = ++pedidoAtual.current
    setCarregando(true)
    setFalhou(false)
    setNovos(0)
    try {
      const pagina = await projectReportService.listModeration(pid, pedido)
      if (minha !== pedidoAtual.current) return
      setFila({ itens: pagina.Items, cursor: pagina.NextCursor, temMais: pagina.HasMore })
      setContagem(pagina.Counts)
      vistos.current = pagina.Counts[pedido.state]
      setMarcados(new Set())
      setMarcas(new Map())
      setSelecionado((atual) =>
        pagina.Items.some((item) => item.PublicId === atual)
          ? atual
          : (pagina.Items[0]?.PublicId ?? null),
      )
    } catch {
      if (minha !== pedidoAtual.current) return
      setFila(null)
      setFalhou(true)
    } finally {
      if (minha === pedidoAtual.current) setCarregando(false)
    }
  }, [pid, pedido])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function carregarMais() {
    if (!fila?.cursor || carregandoMais) return
    const minha = pedidoAtual.current
    setCarregandoMais(true)
    try {
      const pagina = await projectReportService.listModeration(pid, {
        ...pedido,
        after: fila.cursor,
      })
      if (minha !== pedidoAtual.current) return
      setFila((atual) =>
        atual
          ? {
              // O cursor e por valor, entao nao repete; o filtro e so a garantia de que
              // a chave da lista nunca duplica.
              itens: [
                ...atual.itens,
                ...pagina.Items.filter(
                  (novo) => !atual.itens.some((item) => item.PublicId === novo.PublicId),
                ),
              ],
              cursor: pagina.NextCursor,
              temMais: pagina.HasMore,
            }
          : atual,
      )
      setContagem(pagina.Counts)
      vistos.current = pagina.Counts[pedido.state]
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setCarregandoMais(false)
    }
  }

  // A lista esvaziou de tanto decidir, e ha mais no servidor: busca sozinho, em vez de
  // mostrar "nada esperando" com a fila cheia. Uma vez por cursor: falhando, o botao
  // continua la, e a tela nao fica tentando sem parar.
  const buscouSozinho = useRef<string | null>(null)
  useEffect(() => {
    if (!fila || fila.itens.length > 0 || !fila.temMais || !fila.cursor) return
    if (carregandoMais || carregando || buscouSozinho.current === fila.cursor) return
    buscouSozinho.current = fila.cursor
    void carregarMais()
  })

  // **O tempo real so reconta.** Relato novo nao entra na lista debaixo do cursor de
  // quem esta lendo — a linha que a pessoa ia clicar mudaria de lugar. A tela diz
  // "N novos — mostrar", e quem decide a hora de reler e a pessoa.
  const recontar = useCallback(async () => {
    const minha = pedidoAtual.current
    try {
      const pagina = await projectReportService.listModeration(pid, { ...pedido, limit: 1 })
      if (minha !== pedidoAtual.current) return
      setContagem(pagina.Counts)
      const diferenca = pagina.Counts[pedido.state] - vistos.current
      setNovos(diferenca > 0 ? diferenca : 0)
    } catch {
      // Recontar e conforto: falhando, fica o numero de antes.
    }
  }, [pid, pedido])
  useAvisosDeCard(pid, recontar)

  const itens = fila?.itens ?? []
  // "So sensivel" filtra o que ja veio: a varredura roda na leitura, e nao ha como
  // pedir ao banco os que ela marcaria sem varrer todos.
  const visiveis = soSensivel ? itens.filter((item) => item.Findings.length > 0) : itens
  const atual = visiveis.find((item) => item.PublicId === selecionado) ?? null

  // O escolhido saiu da lista (o lote, a troca de filtro): fica o primeiro que sobrou.
  useEffect(() => {
    if (selecionado !== null && visiveis.some((item) => item.PublicId === selecionado)) return
    const primeiro = visiveis[0]?.PublicId ?? null
    if (primeiro !== selecionado) setSelecionado(primeiro)
  })

  const marcar = (id: string, marca: Marca) => setMarcas((atuais) => new Map(atuais).set(id, marca))

  /** Tira da lista o que foi decidido, e acerta as contagens sem reler. */
  function tirarDaLista(ids: string[], para: Decisao) {
    setFila((atual) =>
      atual
        ? { ...atual, itens: atual.itens.filter((item) => !ids.includes(item.PublicId)) }
        : atual,
    )
    setContagem((atual) =>
      atual
        ? {
            ...atual,
            [aba]: Math.max(0, atual[aba] - ids.length),
            [para]: atual[para] + ids.length,
          }
        : atual,
    )
    setMarcados((atuais) => {
      const sobra = new Set(atuais)
      for (const id of ids) sobra.delete(id)
      return sobra
    })
    vistos.current = Math.max(0, vistos.current - ids.length)
  }

  /** O vizinho de baixo — ou o de cima, quando era o ultimo. */
  function vizinho(id: string): string | null {
    const onde = visiveis.findIndex((item) => item.PublicId === id)
    if (onde < 0) return null
    return visiveis[onde + 1]?.PublicId ?? visiveis[onde - 1]?.PublicId ?? null
  }

  const conflito = (falha: unknown) => isPanelError(falha) && falha.status === 409

  async function decidir(item: ModerationItemViewModel, decisao: Decisao) {
    if (decidindo || lote) return
    setDecidindo(true)
    try {
      // `From`: a decisao so vale sobre o estado que esta tela viu.
      await projectReportService.moderateReport(pid, item.PublicId, {
        Decision: decisao,
        From: item.State,
      })
      const proximo = vizinho(item.PublicId)
      tirarDaLista([item.PublicId], decisao)
      setSelecionado(proximo)
      avisarFeito([item], decisao, 0, 0)
    } catch (falha) {
      marcar(
        item.PublicId,
        conflito(falha)
          ? { tipo: 'outra-pessoa' }
          : { tipo: 'falha', motivo: describeError(falha) },
      )
      toast.error(describeError(falha))
    } finally {
      setDecidindo(false)
    }
  }

  /**
   * O lote: um por vez, na ordem da lista, pela mesma rota de decidir um so — as regras
   * sao as de sempre, e um recusado nao desfaz os outros. O 409 marca o relato
   * ("decidido por outra pessoa") e o lote segue.
   */
  async function aplicarLote(decisao: Decisao) {
    if (decidindo || lote) return
    const alvo = visiveis.filter(
      (item) => marcados.has(item.PublicId) && marcas.get(item.PublicId)?.tipo !== 'outra-pessoa',
    )
    if (alvo.length === 0) return
    const feitos: ModerationItemViewModel[] = []
    let outraPessoa = 0
    let falhas = 0
    setLote({ feitos: 0, total: alvo.length })
    for (const [i, item] of alvo.entries()) {
      try {
        await projectReportService.moderateReport(pid, item.PublicId, {
          Decision: decisao,
          From: item.State,
        })
        feitos.push(item)
        tirarDaLista([item.PublicId], decisao)
      } catch (falha) {
        if (conflito(falha)) {
          outraPessoa += 1
          marcar(item.PublicId, { tipo: 'outra-pessoa' })
          setMarcados((atuais) => {
            const sobra = new Set(atuais)
            sobra.delete(item.PublicId)
            return sobra
          })
        } else {
          falhas += 1
          marcar(item.PublicId, { tipo: 'falha', motivo: describeError(falha) })
        }
      }
      setLote({ feitos: i + 1, total: alvo.length })
    }
    setLote(null)
    avisarFeito(feitos, decisao, outraPessoa, falhas)
  }

  /**
   * O aviso do fim, com a volta quando ela existe.
   *
   * **"Desfazer" so onde desfaz de verdade.** No historico, a decisao anterior era
   * outra decisao, e voltar a ela e decidir de novo. Na fila, a anterior era "ninguem
   * decidiu" — e voltar para a fila a API recusa, porque alguem leu. Ali, depois de
   * liberar, o aviso oferece o que importa num engano: tirar do publico.
   */
  function avisarFeito(
    feitos: ModerationItemViewModel[],
    decisao: Decisao,
    outraPessoa: number,
    falhas: number,
  ) {
    const partes: string[] = []
    if (feitos.length > 0) partes.push(fraseFeita(aba, decisao, feitos.length))
    if (outraPessoa > 0)
      partes.push(
        outraPessoa === 1
          ? '1 já tinha sido decidido por outra pessoa.'
          : `${outraPessoa} já tinham sido decididos por outra pessoa.`,
      )
    if (falhas > 0)
      partes.push(
        falhas === 1
          ? '1 não deu certo: veja na lista.'
          : `${falhas} não deram certo: veja na lista.`,
      )
    if (partes.length === 0) return

    const volta =
      feitos.length === 0
        ? undefined
        : aba !== 'Pending'
          ? {
              label: 'Desfazer',
              run: () =>
                void voltar(feitos, aba as Decisao, decisao, (n) =>
                  n === 1 ? 'Voltou como estava.' : `${n} voltaram como estavam.`,
                ),
            }
          : decisao === 'Approved'
            ? {
                label: 'Tirar do público',
                run: () =>
                  void voltar(feitos, 'Rejected', 'Approved', (n) =>
                    n === 1
                      ? 'Tirado do público: está em Não publicáveis.'
                      : `${n} tirados do público: estão em Não publicáveis.`,
                  ),
              }
            : undefined

    const texto = partes.join(' ')
    if (feitos.length === 0) toast.error(texto)
    else toast.done(texto, volta ? { action: volta } : undefined)
  }

  /**
   * A volta, relato por relato, so sobre o que ainda esta como a decisao deixou
   * (`From`): o que outra pessoa mudou nesses segundos fica. Depois, rele a aba — a
   * volta e rara, e os relatos voltam para o lugar deles na ordem.
   */
  async function voltar(
    feitos: ModerationItemViewModel[],
    para: Decisao,
    de: Decisao,
    frase: (n: number) => string,
  ) {
    let voltaram = 0
    let mudaram = 0
    for (const item of feitos) {
      try {
        await projectReportService.moderateReport(pid, item.PublicId, { Decision: para, From: de })
        voltaram += 1
      } catch {
        mudaram += 1
      }
    }
    if (voltaram > 0) toast.done(frase(voltaram))
    if (mudaram > 0)
      toast.error(
        mudaram === 1
          ? '1 mudou depois da decisão e ficou como está.'
          : `${mudaram} mudaram depois da decisão e ficaram como estão.`,
      )
    void carregar()
  }

  function alternarMarca(id: string, marcado?: boolean) {
    setMarcados((atuais) => {
      const novos = new Set(atuais)
      const fica = marcado ?? !novos.has(id)
      if (fica) novos.add(id)
      else novos.delete(id)
      return novos
    })
  }

  function escolher(id: string) {
    setSelecionado(id)
    // No celular a lista vem antes do detalhe: escolher leva ate ele.
    if (window.matchMedia?.('(max-width: 767px)').matches)
      document.getElementById(`${idBase}-detalhe`)?.scrollIntoView?.({ block: 'start' })
  }

  function mover(passo: 1 | -1) {
    if (visiveis.length === 0) return
    const onde = visiveis.findIndex((item) => item.PublicId === selecionado)
    const proximo = visiveis[Math.min(visiveis.length - 1, Math.max(0, onde + passo))]
    if (!proximo) return
    setSelecionado(proximo.PublicId)
    document
      .querySelector(`[data-relato="${proximo.PublicId}"]`)
      ?.scrollIntoView?.({ block: 'nearest' })
  }

  // O teclado vale na tela inteira, menos onde a letra e texto: na busca, num campo, numa
  // lista aberta, num dialogo. A funcao muda a cada desenho; o ouvinte e um so.
  const teclado = useRef<(evento: globalThis.KeyboardEvent) => void>(() => {})
  teclado.current = (evento) => {
    if (evento.defaultPrevented || evento.ctrlKey || evento.metaKey || evento.altKey) return
    const alvo = evento.target instanceof HTMLElement ? evento.target : null
    if (
      alvo?.closest(
        'input:not([type="checkbox"]), textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="dialog"], [role="menu"]',
      )
    )
      return
    const tecla = evento.key.toLowerCase()
    if (tecla === '?') {
      evento.preventDefault()
      setAtalhos((aberto) => !aberto)
      return
    }
    if (tecla === 'j' || tecla === 'k') {
      evento.preventDefault()
      mover(tecla === 'j' ? 1 : -1)
      return
    }
    if (!atual) return
    if (tecla === 'x') {
      evento.preventDefault()
      if (marcas.get(atual.PublicId)?.tipo !== 'outra-pessoa') alternarMarca(atual.PublicId)
      return
    }
    if (tecla === 'l' || tecla === 'n') {
      const acao = acoesDa(atual.State).find((uma) => uma.tecla === tecla.toUpperCase())
      if (!acao || marcas.get(atual.PublicId)?.tipo === 'outra-pessoa') return
      evento.preventDefault()
      void decidir(atual, acao.decisao)
    }
  }
  useEffect(() => {
    const ouvir = (evento: globalThis.KeyboardEvent) => teclado.current(evento)
    window.addEventListener('keydown', ouvir)
    return () => window.removeEventListener('keydown', ouvir)
  }, [])

  function trocarAba(nova: ReportModerationState) {
    if (nova === aba) return
    // Os relatos de uma aba nao podem aparecer sob o nome da outra enquanto ela le.
    setFila(null)
    setSelecionado(null)
    setAba(nova)
  }

  const algumFiltro = busca !== '' || tipo !== '' || chegada !== '' || origem !== '' || soSensivel
  function limparFiltros() {
    setBusca('')
    setBuscaAplicada('')
    setTipo('')
    setChegada('')
    setOrigem('')
    setSoSensivel(false)
  }

  const marcaveis = visiveis.filter((item) => marcas.get(item.PublicId)?.tipo !== 'outra-pessoa')
  const todosMarcados =
    marcaveis.length > 0 && marcaveis.every((item) => marcados.has(item.PublicId))
  const quantosMarcados = visiveis.filter((item) => marcados.has(item.PublicId)).length
  const totalDaAba = contagem?.[aba] ?? null

  return (
    <div className="max-w-280">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Moderação</h1>
      <p className="mb-3 text-body text-fg-muted leading-relaxed">
        Relatos esperando a decisão de publicar. Nada aparece para o público sem passar por aqui.
      </p>

      <HowItWorks>
        <p>
          Para um relato aparecer na lista pública, valem duas condições juntas: o projeto aberto ao
          público e o relato liberado aqui. Nenhuma das duas basta sozinha.
        </p>
        <p>
          Todo relato nasce esperando, inclusive em projeto privado: abrir o projeto ao público
          depois não publica o histórico de uma vez.
        </p>
        <p>
          Esperando é fila, do mais antigo para o mais novo. Liberados e Não publicáveis são
          histórico, com a decisão mais recente primeiro — é lá que se tira do público o que foi
          liberado por engano.
        </p>
        <p>
          Não publicar não apaga nem encerra: o relato continua no Trabalho, e quem relatou não é
          avisado. Mudar de ideia é decidir de novo; voltar para a fila não existe, porque alguém já
          leu. Se outra pessoa decidir o mesmo relato antes de você, a sua decisão não grava por
          cima: a tela avisa.
        </p>
      </HowItWorks>

      {privado && (
        <p className="mb-5 rounded-lg border border-border bg-surface-raised px-3.5 py-2.5 text-detail text-fg-muted leading-relaxed">
          <strong className="font-medium text-fg">Este projeto é privado:</strong> nada daqui
          aparece para o público.
          {canConfigure(project) &&
            ' A fila só importa se você abrir os relatos ao público em Quem relata.'}
        </p>
      )}

      <Abas
        idBase={idBase}
        aba={aba}
        contagem={contagem}
        privado={privado}
        aoEscolher={trocarAba}
      />

      {/* A chave troca com a aba: o painel novo entra esmaecendo. */}
      <div
        key={aba}
        id={`${idBase}-painel`}
        role="tabpanel"
        aria-labelledby={`${idBase}-aba-${aba}`}
        className="flex animate-panel-in flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-[1_1_16rem]">
            <span className="sr-only">Buscar</span>
            <input
              type="search"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Texto, #número ou protocolo"
              maxLength={200}
              className="h-8 w-full rounded-lg border border-border bg-surface-raised px-2.5 text-detail text-fg placeholder:text-fg-placeholder"
            />
          </label>
          {tipos && tipos.length > 1 && (
            <Select
              size="sm"
              ariaLabel="Tipo"
              value={tipo}
              onChange={setTipo}
              className="w-40"
              options={[
                { value: '', label: 'Todos os tipos' },
                ...tipos.map((um) => ({ value: um.PublicId, label: um.Name })),
              ]}
            />
          )}
          <Select
            size="sm"
            ariaLabel="Chegada"
            value={chegada}
            onChange={(valor) => setChegada(valor as Chegada)}
            className="w-44"
            options={CHEGADAS}
          />
          {origens && origens.length > 0 && (
            <Select
              size="sm"
              ariaLabel="Origem"
              value={origem}
              onChange={setOrigem}
              className="w-44"
              options={[
                { value: '', label: 'Todas as origens' },
                ...origens.map((uma) => ({ value: uma.Domain, label: uma.Domain })),
                { value: 'none', label: 'Sem domínio' },
              ]}
            />
          )}
          <label className="flex items-center gap-1.5 text-detail text-fg-muted">
            <input
              type="checkbox"
              checked={soSensivel}
              onChange={(evento) => setSoSensivel(evento.target.checked)}
              className="size-3.5 accent-accent"
            />
            Só com dado sensível
          </label>
          {algumFiltro && (
            <Button size="sm" variant="quiet" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          )}
          <div className="ml-auto">
            <ShortcutsButton size="sm" onClick={() => setAtalhos(true)} />
          </div>
        </div>

        <ShortcutsDialog open={atalhos} onOpenChange={setAtalhos} atalhos={ATALHOS} />

        {novos > 0 && (
          <div role="status">
            <Button size="sm" onClick={() => void carregar()}>
              {novos === 1 ? '1 novo' : `${novos} novos`} — mostrar
            </Button>
          </div>
        )}

        {falhou && (
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
              Não deu para carregar a fila agora. Nada foi decidido: a falha foi ao consultar.
            </p>
            <Button onClick={() => void carregar()}>Tentar de novo</Button>
          </div>
        )}

        {carregando && fila === null && !falhou && (
          <div className="grid gap-3 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {fila !== null && visiveis.length === 0 && fila.temMais && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-body text-fg-muted leading-relaxed">
              {soSensivel
                ? 'Nenhum dos relatos carregados tem dado sensível.'
                : 'Os carregados já foram decididos.'}
            </p>
            <Button
              size="sm"
              variant="quiet"
              disabled={carregandoMais}
              onClick={() => void carregarMais()}
            >
              {carregandoMais ? 'Carregando…' : 'Mostrar mais'}
            </Button>
          </div>
        )}

        {fila !== null && visiveis.length === 0 && !fila.temMais && (
          <p className="text-body text-fg-muted leading-relaxed">
            {algumFiltro ? 'Nenhum relato desta aba passa nos filtros.' : VAZIO[aba]}
          </p>
        )}

        {fila !== null && visiveis.length > 0 && (
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <section
              aria-label="Relatos"
              aria-busy={carregando || undefined}
              className="overflow-hidden rounded-xl border border-border bg-surface-raised md:max-h-[75vh] md:overflow-y-auto"
            >
              <label className="flex items-center gap-2.5 border-border border-b px-3 py-2 text-caption text-fg-muted">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  onChange={(evento) => {
                    const marcar = evento.target.checked
                    setMarcados(
                      marcar ? new Set(marcaveis.map((item) => item.PublicId)) : new Set(),
                    )
                  }}
                  className="size-3.5 accent-accent"
                />
                Selecionar os {marcaveis.length} carregados
              </label>
              <ul>
                {visiveis.map((item) => (
                  <LinhaDaFila
                    key={item.PublicId}
                    item={item}
                    aba={aba}
                    selecionado={item.PublicId === atual?.PublicId}
                    marcado={marcados.has(item.PublicId)}
                    marca={marcas.get(item.PublicId)}
                    aoSelecionar={() => escolher(item.PublicId)}
                    aoMarcar={(marcado) => alternarMarca(item.PublicId, marcado)}
                  />
                ))}
              </ul>
              {fila.temMais && (
                <div className="border-border border-t p-2.5">
                  <Button
                    size="sm"
                    variant="quiet"
                    disabled={carregandoMais}
                    onClick={() => void carregarMais()}
                  >
                    {carregandoMais
                      ? 'Carregando…'
                      : totalDaAba !== null
                        ? `Mostrar mais (${itens.length} de ${totalDaAba})`
                        : 'Mostrar mais'}
                  </Button>
                </div>
              )}
            </section>

            {/* A chave troca com o relato escolhido: o detalhe novo entra esmaecendo. */}
            <section
              key={atual?.PublicId ?? 'nenhum'}
              id={`${idBase}-detalhe`}
              aria-label="Relato escolhido"
              className="animate-panel-in rounded-xl border border-border bg-surface-raised p-4 md:sticky md:top-4"
            >
              {atual ? (
                <DetalheDoRelato
                  item={atual}
                  projectPublicId={pid}
                  visibilidade={identidade?.Visibility ?? null}
                  marca={marcas.get(atual.PublicId)}
                  ocupado={decidindo || lote !== null}
                  aoDecidir={(decisao) => void decidir(atual, decisao)}
                />
              ) : (
                <p className="text-detail text-fg-muted">Escolha um relato na lista.</p>
              )}
            </section>
          </div>
        )}

        {quantosMarcados > 0 && (
          // Presa embaixo da tela: marcar a primeira caixa nao empurra as linhas, e o
          // proximo clique cai onde a pessoa mirou.
          <section
            aria-label="Ações em lote"
            className="sticky bottom-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-surface-raised px-3 py-2"
          >
            <span className="mr-1 font-medium text-detail text-fg tabular-nums">
              {lote
                ? `Decidindo ${lote.feitos} de ${lote.total}…`
                : quantosMarcados === 1
                  ? '1 selecionado'
                  : `${quantosMarcados} selecionados`}
            </span>
            {acoesDa(aba).map((acao) => (
              <Button
                key={acao.decisao}
                size="sm"
                variant={acao.principal ? 'primary' : 'secondary'}
                disabled={lote !== null || decidindo}
                onClick={() => void aplicarLote(acao.decisao)}
              >
                {acao.rotulo}
              </Button>
            ))}
            <Button
              size="sm"
              variant="quiet"
              disabled={lote !== null}
              onClick={() => setMarcados(new Set())}
            >
              Limpar seleção
            </Button>
          </section>
        )}
      </div>
    </div>
  )
}

/** As abas, acessiveis como as de Dominios: setas, Home e End trocam e levam o foco. */
function Abas({
  idBase,
  aba,
  contagem,
  privado,
  aoEscolher,
}: {
  idBase: string
  aba: ReportModerationState
  contagem: ModerationCountsViewModel | null
  privado: boolean
  aoEscolher: (aba: ReportModerationState) => void
}) {
  const botoes = useRef<Partial<Record<ReportModerationState, HTMLButtonElement | null>>>({})
  const chaves: ReportModerationState[] = ['Pending', 'Approved', 'Rejected']

  const teclas = (evento: KeyboardEvent, atual: ReportModerationState) => {
    const indice = chaves.indexOf(atual)
    const proxima =
      evento.key === 'ArrowRight'
        ? chaves[(indice + 1) % chaves.length]
        : evento.key === 'ArrowLeft'
          ? chaves[(indice - 1 + chaves.length) % chaves.length]
          : evento.key === 'Home'
            ? chaves[0]
            : evento.key === 'End'
              ? chaves[chaves.length - 1]
              : undefined
    if (!proxima) return
    evento.preventDefault()
    aoEscolher(proxima)
    botoes.current[proxima]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Moderação"
      className="mb-4 flex gap-5 overflow-x-auto border-border border-b"
    >
      {chaves.map((chave) => {
        // Em projeto privado, a fila nao conta: com o numero, ela parecia uma tarefa
        // que nunca acaba. As abas decididas contam sempre — nao sao tarefa.
        const numero =
          contagem === null || (chave === 'Pending' && privado) ? null : contagem[chave]
        return (
          <button
            key={chave}
            ref={(no) => {
              botoes.current[chave] = no
            }}
            id={`${idBase}-aba-${chave}`}
            type="button"
            role="tab"
            aria-selected={aba === chave}
            aria-controls={`${idBase}-painel`}
            tabIndex={aba === chave ? 0 : -1}
            onClick={() => aoEscolher(chave)}
            onKeyDown={(evento) => teclas(evento, chave)}
            className={cn(
              '-mb-px flex h-9 flex-none items-center whitespace-nowrap border-b-2 px-0.5 font-medium text-body transition-colors',
              aba === chave
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {ABAS[chave]}
            {numero !== null && (
              <span className="font-normal text-fg-muted tabular-nums">{` (${numero})`}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

interface Fila {
  itens: ModerationItemViewModel[]
  cursor: string | null
  temMais: boolean
}

type Chegada = '' | 'hoje' | '7d' | '30d' | 'antigos'

const CHEGADAS: { value: Chegada; label: string }[] = [
  { value: '', label: 'Qualquer data' },
  { value: 'hoje', label: 'Chegou hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'antigos', label: 'Há mais de 7 dias' },
]

/**
 * O periodo da chegada, em instantes. **O dia e o de quem olha**: no fim da noite no
 * Brasil, o dia em UTC ja e o seguinte, e "chegou hoje" deixaria de fora a manha.
 */
function periodo(chegada: Chegada, agora: Date = new Date()): { from?: string; to?: string } {
  if (chegada === '') return {}
  const dia = (atras: number) =>
    new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - atras).toISOString()
  if (chegada === 'hoje') return { from: dia(0) }
  if (chegada === '7d') return { from: dia(6) }
  if (chegada === '30d') return { from: dia(29) }
  return { to: dia(7) }
}

/** "Liberado para o publico.", "3 tirados do publico." — o aviso do fim, pela aba e pela decisao. */
function fraseFeita(aba: ReportModerationState, decisao: Decisao, n: number): string {
  if (decisao === 'Rejected')
    return aba === 'Approved'
      ? n === 1
        ? 'Tirado do público.'
        : `${n} tirados do público.`
      : n === 1
        ? 'Marcado como não publicável.'
        : `${n} marcados como não publicáveis.`
  return n === 1 ? 'Liberado para o público.' : `${n} liberados para o público.`
}
