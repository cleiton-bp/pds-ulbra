import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  ModerationCountsViewModel,
  ModerationItemViewModel,
  ProjectViewModel,
  ReportModerationState,
  ReportVisibility,
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
  AcoesDoRelato,
  acoesDa,
  type Decisao,
  DetalheDoRelato,
  LinhaDaFila,
  type Marca,
  vazioDa,
} from '@/features/moderation/moderationParts'
import { PrivacidadeNaFolha } from '@/features/moderation/PrivacidadeNaFolha'
import { useAvisosDeCard } from '@/features/moderation/useAvisosDeCard'
import { BottomSheet } from '@/shared/components/BottomSheet'
import { Button } from '@/shared/components/Button'
import { EyeIcon } from '@/shared/components/EyeIcon'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { LockIcon } from '@/shared/components/LockIcon'
import { reportTypeName } from '@/shared/components/ReportTypeGlyph'
import { Select } from '@/shared/components/Select'
import {
  type Shortcut,
  ShortcutsButton,
  ShortcutsDialog,
} from '@/shared/components/ShortcutsDialog'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import type { EstadoDaVolta } from '@/shared/components/VoltarDeOndeVeio'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'
import { canConfigure } from '@/shared/lib/projectAccess'
import { guideTarget, useScreenGuide } from '@/shared/tour/guideStore'

/**
 * Quem le antes do resto do mundo — uma caixa de entrada: a lista compacta para achar,
 * o relato inteiro ao lado para ler e decidir.
 *
 * **A fila existe mesmo em projeto privado, e a secao nao some la.** Todo relato
 * nasce pendente — e isso que faz marcar o projeto como publico depois nao publicar o
 * historico inteiro de uma vez. Esconder a fila em projeto privado esconderia que ela
 * continua enchendo, e quem publicasse um dia encontraria uma fila de meses.
 *
 * **E ela abre aberta, nos dois.** Ja esteve recolhida no privado, atras de uma linha
 * cinza igual a do "Como funciona": a tela abria quase vazia, sem dizer se havia zero
 * ou trinta relatos, e o trabalho parecia ajuda opcional. O privado muda a frase do
 * topo, o peso do Liberar e os numeros das abas, nunca a forma: abrir o projeto ao
 * publico nao tira nada do lugar.
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
 * nivel publico, e o relato liberado aqui. Em projeto privado a tela diz isso no topo,
 * o Liberar perde o destaque e as abas deixam de contar: com o numero e o botao cheio
 * de cor, a fila parecia uma tarefa que nunca acaba, e o time ia "limpa-la" por
 * obrigacao. Os avisos depois de decidir dizem o efeito real, sem prometer publico.
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
  // com a contagem, e com uma frase neutra no topo.
  const {
    data: identidade,
    loading: lendoPrivacidade,
    revalidate: relerPrivacidade,
  } = useAsyncResource(
    useCallback(() => projectIdentitySettingsService.getIdentitySettings(pid), [pid]),
  )
  const visibilidade = identidade?.Visibility ?? null
  const privado = visibilidade === 'Private'
  // **Enquanto a privacidade nao chega, a tela fica do lado calmo**: sem numero nas
  // abas e sem Liberar em destaque. Pintando como publica e depois virando privada, ela
  // mudava de forma na frente de quem acabou de entrar.
  const calmo = privado || lendoPrivacidade

  // Abas, filtros, lista e detalhe: e so aqui que as teclas de uma letra agem.
  const regiaoDaFila = useRef<HTMLDivElement>(null)

  // O guia desta tela. Espera a privacidade: e ela que decide o que liberar faz.
  useScreenGuide(
    'moderacao',
    lendoPrivacidade
      ? null
      : [
          {
            alvo: 'mod-estado',
            titulo: 'Público ou privado',
            texto: privado
              ? 'Neste projeto privado, nada daqui vai a público por enquanto.'
              : 'Esta frase diz quem decide o que aparece na lista pública.',
          },
          {
            alvo: 'mod-abas',
            titulo: 'As três abas',
            texto: 'Esperando é a fila, e Liberados e Não publicáveis guardam o histórico.',
          },
          {
            alvo: 'mod-filtros',
            titulo: 'Achar um relato',
            texto: 'Busque e filtre por tipo, data, origem ou dado sensível.',
          },
          {
            alvo: 'mod-lista',
            titulo: 'A lista',
            texto: 'Clique num relato para ler, ou marque vários para decidir de uma vez.',
          },
          {
            alvo: 'mod-detalhe',
            titulo: 'Ler e decidir',
            texto: 'Leia o relato inteiro e veja como ele apareceria na lista pública.',
          },
          {
            alvo: 'mod-atalhos',
            titulo: 'Atalhos',
            texto: 'J e K andam pela lista, L libera e N marca como não publicável.',
          },
          {
            alvo: 'guia',
            titulo: 'Guia por tela',
            texto: 'Cada tela tem o seu guia, sempre neste botão, com o nome dela.',
          },
        ],
  )

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

  // **No celular e no tablet em pe, a lista fica sozinha**, e tocar num relato abre ele numa
  // folha que sobe de baixo, com as decisoes presas no pe. Antes o detalhe vinha embaixo da lista
  // inteira: tocar pulava para o fim da pagina, e para o proximo era preciso voltar.
  const estreito = useMediaQuery('(max-width: 47.99rem)')
  const [folha, setFolha] = useState(false)
  // No celular os filtros sobem numa folha, como no Trabalho: na linha, eram tres fileiras
  // antes do primeiro relato.
  const celular = useMediaQuery('(max-width: 39.99rem)')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  // E a privacidade tambem muda ali mesmo, numa folha: o link levava a outra tela.
  const [privacidadeAberta, setPrivacidadeAberta] = useState(false)

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
      // Na folha, o proximo entra no lugar, como na lista; acabou a lista, ela fecha.
      if (proximo === null) setFolha(false)
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
    if (feitos.length > 0) partes.push(fraseFeita(aba, decisao, feitos.length, privado))
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
                // No privado nada chegou ao publico: a volta e a mesma decisao, com o
                // nome que ela tem la.
                label: privado ? 'Não publicar' : 'Tirar do público',
                run: () =>
                  void voltar(feitos, 'Rejected', 'Approved', (n) =>
                    privado
                      ? n === 1
                        ? 'Marcado como não publicável.'
                        : `${n} marcados como não publicáveis.`
                      : n === 1
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
    if (estreito) setFolha(true)
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

  // O teclado vale na fila, menos onde a letra e texto: na busca, num campo, numa lista
  // aberta, num dialogo. A funcao muda a cada desenho; o ouvinte e um so.
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
    // **So no que esta a vista.** Com o foco no menu, no cabecalho ou no "Como
    // funciona", uma letra decidia um relato que a pessoa nem estava olhando. Valem o
    // foco dentro da fila (abas, lista, detalhe) e o foco solto na pagina.
    const solto = alvo === null || alvo === document.body || alvo.tagName === 'MAIN'
    if (!solto && !regiaoDaFila.current?.contains(alvo)) return
    if (tecla === 'j' || tecla === 'k') {
      evento.preventDefault()
      mover(tecla === 'j' ? 1 : -1)
      return
    }
    // Decidir e marcar esperam a privacidade: e ela que diz o que o aviso vai prometer.
    if (!atual || lendoPrivacidade) return
    if (tecla === 'x') {
      evento.preventDefault()
      if (marcas.get(atual.PublicId)?.tipo !== 'outra-pessoa') alternarMarca(atual.PublicId)
      return
    }
    if (tecla === 'l' || tecla === 'n') {
      const acao = acoesDa(atual.State, calmo).find((uma) => uma.tecla === tecla.toUpperCase())
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
  // O que o "Filtros" do celular conta: tudo menos a busca, que fica a vista.
  const filtrosLigados = [tipo, chegada, origem].filter(Boolean).length + (soSensivel ? 1 : 0)
  function limparFiltros() {
    setBusca('')
    setBuscaAplicada('')
    setTipo('')
    setChegada('')
    setOrigem('')
    setSoSensivel(false)
  }

  /**
   * Os filtros, ditos uma vez: na linha da tela larga, com a largura de cada um; na folha
   * do celular (`naFolha`), um embaixo do outro, na largura toda e mais altos para o dedo.
   */
  function menus(naFolha: boolean) {
    const largura = (naLinha: string) => (naFolha ? 'w-full' : naLinha)
    const gatilho = naFolha ? 'h-10' : 'pointer-coarse:h-9'
    return (
      <>
        {tipos && tipos.length > 1 && (
          <Select
            size="sm"
            ariaLabel="Tipo"
            value={tipo}
            onChange={setTipo}
            className={largura('w-40')}
            triggerClassName={gatilho}
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
          className={largura('w-44')}
          triggerClassName={gatilho}
          options={CHEGADAS}
        />
        {origens && origens.length > 0 && (
          <Select
            size="sm"
            ariaLabel="Origem"
            value={origem}
            onChange={setOrigem}
            className={largura('w-44')}
            triggerClassName={gatilho}
            options={[
              { value: '', label: 'Todas as origens' },
              ...origens.map((uma) => ({ value: uma.Domain, label: uma.Domain })),
              { value: 'none', label: 'Sem domínio' },
            ]}
          />
        )}
        <label
          className={cn(
            'flex items-center gap-1.5 text-detail text-fg-muted',
            naFolha ? 'min-h-10 gap-2.5 text-body text-fg' : 'pointer-coarse:min-h-9',
          )}
        >
          <input
            type="checkbox"
            checked={soSensivel}
            onChange={(evento) => setSoSensivel(evento.target.checked)}
            className={cn('accent-accent', naFolha ? 'size-4' : 'size-3.5')}
          />
          Só com dado sensível
        </label>
      </>
    )
  }

  const marcaveis = visiveis.filter((item) => marcas.get(item.PublicId)?.tipo !== 'outra-pessoa')
  const todosMarcados =
    marcaveis.length > 0 && marcaveis.every((item) => marcados.has(item.PublicId))
  const quantosMarcados = visiveis.filter((item) => marcados.has(item.PublicId)).length
  const totalDaAba = contagem?.[aba] ?? null

  return (
    <div className="max-w-280">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Moderação</h1>
      <div {...guideTarget('mod-estado')}>
        <FraseDeEstado
          project={project}
          visibilidade={visibilidade}
          lendo={lendoPrivacidade}
          aoMudar={estreito ? () => setPrivacidadeAberta(true) : undefined}
        />
      </div>
      {estreito && canConfigure(project) && (
        <PrivacidadeNaFolha
          open={privacidadeAberta}
          onOpenChange={setPrivacidadeAberta}
          projectPublicId={pid}
          aoSalvar={relerPrivacidade}
        />
      )}

      <HowItWorks>
        <p>
          Um relato só aparece na lista pública com o projeto aberto ao público e o relato liberado
          aqui, e nenhuma das duas condições basta sozinha.
        </p>
        <p>
          Todo relato nasce esperando, inclusive em projeto privado, para que abrir o projeto depois
          não publique o histórico de uma vez.
        </p>
        <p>
          Esperando é a fila, do mais antigo para o mais novo, e Liberados e Não publicáveis guardam
          o histórico, com a decisão mais recente primeiro.
        </p>
        <p>
          Não publicar não apaga nem encerra o relato, que continua no Trabalho sem aviso a quem
          relatou.
        </p>
        <p>
          Para mudar de ideia, decida de novo, e se outra pessoa decidir o mesmo relato antes de
          você, a tela avisa sem gravar por cima.
        </p>
      </HowItWorks>

      {/* As abas entram na regiao das teclas: depois de clicar numa, J e K continuam
          andando pela lista. */}
      <div ref={regiaoDaFila}>
        <div {...guideTarget('mod-abas')}>
          <Abas
            idBase={idBase}
            aba={aba}
            contagem={contagem}
            calmo={calmo}
            aoEscolher={trocarAba}
          />
        </div>

        {/* A chave troca com a aba: o painel novo entra esmaecendo. */}
        <div
          key={aba}
          id={`${idBase}-painel`}
          role="tabpanel"
          aria-labelledby={`${idBase}-aba-${aba}`}
          className="flex animate-panel-in flex-col gap-3"
        >
          {/* No celular os filtros dividem a linha de dois em dois (`max-sm:flex-[1_1_8rem]`),
              em vez de cada um numa linha com metade dela vazia, e crescem para o dedo. */}
          <div className="flex flex-wrap items-center gap-2" {...guideTarget('mod-filtros')}>
            <label className="relative min-w-0 flex-[1_1_16rem] max-sm:flex-[1_1_8rem]">
              <span className="sr-only">Buscar</span>
              <input
                type="search"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                // No celular o campo divide a linha com o "Filtros": a frase inteira cortava.
                placeholder={celular ? 'Buscar' : 'Texto, #número ou protocolo'}
                title="Busca no texto, no #número e no protocolo"
                maxLength={200}
                className="h-8 w-full rounded-lg border border-border bg-surface-raised px-2.5 text-detail text-fg placeholder:text-fg-placeholder pointer-coarse:h-9"
              />
            </label>
            {celular ? (
              // O mesmo botao do Trabalho: com filtro ligado, ganha o realce e diz quantos.
              <button
                type="button"
                aria-expanded={filtrosAbertos}
                onClick={() => setFiltrosAbertos(true)}
                className={cn(
                  'alvo-de-toque relative flex h-9 flex-none items-center rounded-lg border px-3 text-detail transition-all duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
                  filtrosLigados > 0
                    ? 'border-accent bg-accent/8 text-fg hover:bg-accent/12'
                    : 'border-border bg-surface text-fg-muted hover:bg-surface-sunken hover:text-fg',
                )}
              >
                {filtrosLigados > 0 ? `Filtros (${filtrosLigados})` : 'Filtros'}
              </button>
            ) : (
              <>
                {menus(false)}
                {algumFiltro && (
                  <Button size="sm" variant="quiet" onClick={limparFiltros}>
                    Limpar filtros
                  </Button>
                )}
              </>
            )}
            <div className="ml-auto">
              <span className="flex" {...guideTarget('mod-atalhos')}>
                <ShortcutsButton size="sm" onClick={() => setAtalhos(true)} />
              </span>
            </div>
          </div>

          {celular && (
            <BottomSheet
              open={filtrosAbertos}
              onOpenChange={setFiltrosAbertos}
              title="Filtros"
              footer={
                <>
                  {algumFiltro ? (
                    <button
                      type="button"
                      onClick={limparFiltros}
                      className="alvo-de-toque relative h-9 rounded-lg px-2 text-detail text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                    >
                      Limpar filtros
                    </button>
                  ) : (
                    <span />
                  )}
                  <Button variant="primary" onClick={() => setFiltrosAbertos(false)}>
                    Ver os relatos
                  </Button>
                </>
              }
            >
              <div className="flex flex-col gap-3">{menus(true)}</div>
            </BottomSheet>
          )}

          <ShortcutsDialog open={atalhos} onOpenChange={setAtalhos} atalhos={ATALHOS} />

          {novos > 0 && (
            <div role="status">
              <Button size="sm" onClick={() => void carregar()}>
                {novos === 1 ? '1 novo' : `${novos} novos`}, mostrar
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
              {algumFiltro ? 'Nenhum relato desta aba passa nos filtros.' : vazioDa(aba, privado)}
            </p>
          )}

          {fila !== null && visiveis.length > 0 && (
            <div className="grid items-start gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <section
                aria-label="Relatos"
                {...guideTarget('mod-lista')}
                aria-busy={carregando || undefined}
                className="overflow-hidden rounded-xl border border-border bg-surface-raised md:max-h-[75vh] md:overflow-y-auto"
              >
                <label className="flex items-center gap-2.5 border-border border-b px-3 py-2 text-caption text-fg-muted pointer-coarse:py-3">
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
                      // Sem o detalhe ao lado, o realce parecia um toque preso na linha.
                      selecionado={!estreito && item.PublicId === atual?.PublicId}
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
              {!estreito && (
                <section
                  key={atual?.PublicId ?? 'nenhum'}
                  id={`${idBase}-detalhe`}
                  aria-label="Relato escolhido"
                  {...guideTarget('mod-detalhe')}
                  className="animate-panel-in rounded-xl border border-border bg-surface-raised p-4 md:sticky md:top-4"
                >
                  {atual ? (
                    <DetalheDoRelato
                      item={atual}
                      projectPublicId={pid}
                      visibilidade={visibilidade}
                      calmo={calmo}
                      marca={marcas.get(atual.PublicId)}
                      ocupado={decidindo || lote !== null}
                      aoDecidir={(decisao) => void decidir(atual, decisao)}
                    />
                  ) : (
                    <p className="text-detail text-fg-muted">Escolha um relato na lista.</p>
                  )}
                </section>
              )}
            </div>
          )}

          {/* No celular, o relato tocado abre aqui, com as decisoes no pe. Decidindo, o
              proximo entra no lugar, e a folha so fecha quando a lista acaba. */}
          {estreito && atual && (
            <BottomSheet
              open={folha}
              onOpenChange={setFolha}
              title={reportTypeName(atual.Type)}
              subtitle={
                <>
                  <span className="font-mono">{atual.TrackingCode}</span>, chegou{' '}
                  {formatRelative(atual.CreatedAt)}
                </>
              }
              footer={
                marcas.get(atual.PublicId)?.tipo === 'outra-pessoa' ? undefined : (
                  <AcoesDoRelato
                    item={atual}
                    calmo={calmo}
                    ocupado={decidindo || lote !== null}
                    aoDecidir={(decisao) => void decidir(atual, decisao)}
                    naFolha
                  />
                )
              }
            >
              <div key={atual.PublicId} className="animate-panel-in">
                <DetalheDoRelato
                  item={atual}
                  projectPublicId={pid}
                  visibilidade={visibilidade}
                  calmo={calmo}
                  marca={marcas.get(atual.PublicId)}
                  ocupado={decidindo || lote !== null}
                  aoDecidir={(decisao) => void decidir(atual, decisao)}
                  naFolha
                />
              </div>
            </BottomSheet>
          )}

          {quantosMarcados > 0 && (
            // Presa embaixo da tela: marcar a primeira caixa nao empurra as linhas, e o
            // proximo clique cai onde a pessoa mirou. O preso conta a partir da folga do pe
            // do `main` da casca (pb-32, e pb-40 no lg), e nao da borda da janela: com
            // `bottom-3` a barra ficava 140 acima do fim da tela no celular, no meio da
            // lista. O desconto da folga a leva para 12 da borda; mudando a folga da casca,
            // muda aqui junto.
            <section
              aria-label="Ações em lote"
              className="sticky bottom-[calc(0.75rem-8rem)] flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-surface-raised px-3 py-2 lg:bottom-[calc(0.75rem-10rem)]"
            >
              <span className="mr-1 font-medium text-detail text-fg tabular-nums max-sm:flex-1">
                {lote
                  ? `Decidindo ${lote.feitos} de ${lote.total}…`
                  : quantosMarcados === 1
                    ? '1 selecionado'
                    : `${quantosMarcados} selecionados`}
              </span>
              {/* No celular as decisoes descem para uma linha propria, dividindo a largura
                  como no pe da folha (o principal a direita), e o limpar vira um X ao lado
                  da contagem: numa linha so, o "Limpar seleção" quebrava sozinho embaixo. */}
              <div className="flex gap-2 max-sm:order-last max-sm:w-full max-sm:flex-row-reverse">
                {acoesDa(aba, calmo).map((acao) => (
                  <Button
                    key={acao.decisao}
                    size="sm"
                    variant={acao.principal ? 'primary' : 'secondary'}
                    className="max-sm:flex-1"
                    disabled={lote !== null || decidindo}
                    onClick={() => void aplicarLote(acao.decisao)}
                  >
                    {acao.rotulo}
                  </Button>
                ))}
              </div>
              <Button
                size="sm"
                variant="quiet"
                className="max-sm:-mr-1.5 max-sm:px-2"
                disabled={lote !== null}
                onClick={() => setMarcados(new Set())}
              >
                <span className="max-sm:sr-only">Limpar seleção</span>
                <svg
                  viewBox="0 0 12 12"
                  className="size-3 sm:hidden"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="m2.5 2.5 7 7m0-7-7 7" />
                </svg>
              </Button>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * A frase do topo: o estado do projeto e o que decidir aqui faz, numa frase so.
 *
 * **Uma voz so.** Ja foram quatro: o subtitulo dizia "relatos esperando a decisao", a
 * faixa do privado dizia "nao ha o que decidir agora", o recolhido falava em relatos
 * que "esperariam", e embaixo vinha um Liberar. A frase diz o estado, a consequencia e
 * se ha pressa, e o resto da tela concorda com ela.
 *
 * **O link diz para onde leva.** "Abrir os relatos ao publico" parecia publicar ali
 * mesmo; "Mudar a privacidade" leva a tela que decide isso, e so aparece para quem
 * pode mudar. Na tela larga ele leva com o caminho de volta (`VoltarDeOndeVeio`); no
 * celular (`aoMudar`), abre a folha com a mesma pergunta, sem sair da fila.
 */
function FraseDeEstado({
  project,
  visibilidade,
  lendo,
  aoMudar,
}: {
  project: ProjectViewModel
  visibilidade: ReportVisibility | null
  lendo: boolean
  aoMudar?: () => void
}) {
  // A altura de uma linha (duas no celular): a frase chega sem empurrar a fila.
  if (lendo) return <Skeleton className="mb-3 h-6 w-full max-w-xl max-sm:h-12" />

  // No dedo a area cresce para cima e para baixo sem mexer na linha: com 17 de altura, o
  // link no fim da frase era o menor alvo da tela.
  const estiloDoLink = 'whitespace-nowrap text-fg underline underline-offset-4 pointer-coarse:py-3'
  const volta: EstadoDaVolta = {
    voltarPara: `/projects/${project.PublicId}/moderation`,
    rotuloDaVolta: 'Moderação',
  }
  const link =
    canConfigure(project) &&
    (aoMudar ? (
      <button type="button" onClick={aoMudar} className={estiloDoLink}>
        Mudar a privacidade
      </button>
    ) : (
      <Link
        to={`/projects/${project.PublicId}/identity#visibilidade`}
        state={volta}
        className={estiloDoLink}
      >
        Mudar a privacidade
      </Link>
    ))

  // Sem saber a privacidade, a frase nao afirma nenhum dos dois estados.
  if (visibilidade === null)
    return (
      <p className="mb-3 text-body text-fg-muted leading-relaxed">
        Aqui você decide quais relatos aparecem na lista pública do projeto. {link}
      </p>
    )

  const privado = visibilidade === 'Private'
  const Icone = privado ? LockIcon : EyeIcon
  return (
    <p className="mb-3 text-body text-fg-muted leading-relaxed animate-fade-in">
      <Icone className="mr-1.5 inline size-3.5 -translate-y-px text-fg" />
      <strong className="font-medium text-fg">
        {privado ? 'Este projeto é privado' : 'Este projeto é público'}
      </strong>
      {privado
        ? ', então nada daqui vai a público e você pode decidir sem pressa.'
        : ', então um relato só aparece na lista pública depois que você ou alguém do time o libera aqui.'}{' '}
      {link}
    </p>
  )
}

/** As abas, acessiveis como as de Dominios: setas, Home e End trocam e levam o foco. */
function Abas({
  idBase,
  aba,
  contagem,
  calmo,
  aoEscolher,
}: {
  idBase: string
  aba: ReportModerationState
  contagem: ModerationCountsViewModel | null
  /** Projeto privado, ou privacidade ainda a caminho: nenhuma aba conta. */
  calmo: boolean
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
    // No celular as tres abas repartem a largura em tres colunas, e o nome longo quebra em
    // duas linhas: numa linha so, "Nao publicaveis" ficava cortado na borda em 320.
    <div
      role="tablist"
      aria-label="Moderação"
      // `tabs-scroll`: rola so para o lado, e a linha de baixo nao abre rolagem vertical.
      className="tabs-scroll mb-4 flex gap-5 max-sm:grid max-sm:grid-cols-3 max-sm:gap-2"
    >
      {chaves.map((chave) => {
        // Em projeto privado, nenhuma aba conta: com o numero, a fila parecia uma tarefa
        // que nunca acaba, e so ela sem numero, ao lado de duas com, parecia faltar algo.
        const numero = contagem === null || calmo ? null : contagem[chave]
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
              'flex h-9 flex-none items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 font-medium text-body transition-colors sm:pointer-coarse:h-11',
              'max-sm:h-auto max-sm:min-h-11 max-sm:flex-wrap max-sm:justify-center max-sm:gap-x-1 max-sm:gap-y-0 max-sm:whitespace-normal max-sm:py-1.5 max-sm:text-center max-sm:leading-tight',
              aba === chave
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {ABAS[chave]}
            {numero !== null && ' '}
            {numero !== null && (
              <span className="font-normal text-fg-muted tabular-nums">{numero}</span>
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

/**
 * "Liberado para o publico.", "3 tirados do publico." — o aviso do fim, pela aba e pela
 * decisao. **No privado, sem prometer publico**: liberar ali guarda a decisao para o dia
 * em que o projeto abrir, e o que nunca foi a publico nao e "tirado" de la.
 */
function fraseFeita(
  aba: ReportModerationState,
  decisao: Decisao,
  n: number,
  privado: boolean,
): string {
  if (decisao === 'Rejected')
    return aba === 'Approved' && !privado
      ? n === 1
        ? 'Tirado do público.'
        : `${n} tirados do público.`
      : n === 1
        ? 'Marcado como não publicável.'
        : `${n} marcados como não publicáveis.`
  if (privado)
    return n === 1
      ? 'Liberado, e só aparece se o projeto abrir ao público.'
      : `${n} liberados, e só aparecem se o projeto abrir ao público.`
  return n === 1 ? 'Liberado para o público.' : `${n} liberados para o público.`
}
