import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  type HeldOriginViewModel,
  MAX_ORIGIN_DOMAIN_LENGTH,
  type ObservedOriginViewModel,
  type ProjectBlockedOriginViewModel,
  type ProjectOriginViewModel,
} from '@/contracts'
import { describeError, projectOriginService, projectReportService } from '@/data'
import { AllowedOriginsSection } from '@/features/projects/AllowedOriginsSection'
import { DeleteBlockedOriginDialog } from '@/features/reports/DeleteBlockedOriginDialog'
import { rememberBlockedOriginFilter } from '@/features/reports/useWorkFilters'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { cn } from '@/shared/lib/cn'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'

/**
 * De onde vem cada relato, e quem pode mandar: a tela de Dominios do projeto.
 *
 * **Abas com contagem, na ordem em que a pessoa reage.** Aguardando (o que espera
 * decisao, e onde o sino leva), Autorizados, Bloqueados (com os cards que ja vieram de
 * la), Histórico (os dominios que mandaram relatos) e Proteção (os limites). Empilhadas,
 * eram umas dezenove linhas de ajuda antes da primeira lista, dois campos iguais um
 * embaixo do outro (permitir e bloquear) e um "Aguardando" vazio no topo de toda visita.
 * Agora cada campo mora so na aba dele, e a contagem diz onde ha o que ver sem abrir.
 *
 * **Abre em Aguardando quando ha retido; senao, em Autorizados.** A decisao e tomada uma
 * vez, quando a lista de espera chega: liberar o ultimo retido nao arrasta a pessoa para
 * outra aba no meio do que ela fazia. Nada mais e lembrado.
 *
 * **Todas as abas ficam montadas**, so escondidas: o que foi escrito num campo, o foco
 * que volta ao titulo depois de uma acao e o aviso de sair com os limites sem salvar
 * sobrevivem a troca de aba. E as ancoras de sempre continuam existindo — o `#` do
 * endereco escolhe a aba antes de a casca procurar o alvo (ver `abaDaAncora`).
 *
 * **Fora da lista, retido**: o relato de um dominio que a lista de autorizados nao cobre
 * chega (quem relatou acompanha como sempre), mas so entra no Trabalho quando alguem
 * permite o dominio; bloquear apaga os retidos de vez. A lista comeca vazia, entao todo
 * dominio novo passa por aqui uma vez.
 *
 * **Tudo vale na hora**: a API le as duas listas a cada relato, sem cache. E as duas
 * listas nunca se contradizem — bloquear tira da de autorizados, e permitir tira da de
 * bloqueados.
 */
export function DomainsSection({
  projectPublicId,
  protection,
}: {
  projectPublicId: string
  /** O que vai na aba Proteção: os limites de relato, que a tela le a parte. Sem ele, nao ha a aba. */
  protection?: ReactNode
}) {
  const navigate = useNavigate()
  const base = useId()

  const pendentes = useAsyncResource(
    useCallback(() => projectOriginService.listPendingOrigins(projectPublicId), [projectPublicId]),
  )

  const observados = useAsyncResource(
    useCallback(() => projectOriginService.listObservedOrigins(projectPublicId), [projectPublicId]),
  )
  const bloqueados = useAsyncResource(
    useCallback(() => projectOriginService.listBlockedOrigins(projectPublicId), [projectPublicId]),
  )

  /** Muda quando esta tela mexe na lista de autorizados: ela rele. */
  const [versaoAutorizados, setVersaoAutorizados] = useState(0)
  const leituras = useRef(0)
  /** Quantos autorizados ha, para a aba. A lista mora na secao dela; a contagem sobe para ca. */
  const [totalAutorizados, setTotalAutorizados] = useState<number | null>(null)

  // `revalidate`, e nao `refresh`: depois de uma mudanca, a leitura que ja estava a
  // caminho e de antes dela, e reaproveita-la mostraria a lista velha.
  const { revalidate: renovarPendentes } = pendentes
  const { revalidate: renovarObservados } = observados
  const { revalidate: renovarBloqueados } = bloqueados
  const renovar = useCallback(() => {
    renovarPendentes()
    renovarObservados()
    renovarBloqueados()
  }, [renovarPendentes, renovarObservados, renovarBloqueados])

  const aoMudarAutorizados = useCallback(
    (lista: ProjectOriginViewModel[]) => {
      setTotalAutorizados(lista.length)
      // A primeira e a leitura da tela; as outras sao mudancas — autorizar o que
      // estava bloqueado desbloqueia, autorizar libera os retidos, e a situacao de
      // cada dominio muda junto.
      leituras.current += 1
      if (leituras.current > 1) renovar()
    },
    [renovar],
  )

  const [bloqueando, setBloqueando] = useState<PedidoDeBloqueio | null>(null)
  const [desbloqueando, setDesbloqueando] = useState<PedidoDeDesbloqueio | null>(null)
  /** Os retidos sem dominio, esperando a confirmacao de apagar. */
  const [apagandoSemDominio, setApagandoSemDominio] = useState<HeldOriginViewModel | null>(null)
  const [revisando, setRevisando] = useState<{
    bloqueio: ProjectBlockedOriginViewModel
    acao: 'apagar'
  } | null>(null)

  // **A aba.** O `#` do endereco escolhe primeiro, na hora de desenhar, e nao num efeito:
  // a casca procura o alvo ja no quadro seguinte, e um alvo numa aba escondida nao tem
  // onde rolar nem como receber o foco. Cada navegacao nova (o mesmo aviso clicado de
  // novo, a busca levando a outro campo) escolhe de novo, pela `key` do endereco.
  const { hash, key } = useLocation()
  const ancora = (valor: string): Aba | null => {
    const aba = abaDaAncora(valor)
    return aba === 'protecao' && !protection ? null : aba
  }
  const [escolhida, setEscolhida] = useState<Aba | null>(() => ancora(hash))
  const [chaveVista, setChaveVista] = useState(key)
  if (chaveVista !== key) {
    setChaveVista(key)
    const daAncora = ancora(hash)
    if (daAncora) setEscolhida(daAncora)
  }
  // Sem `#` e sem escolha, decide pela lista de espera quando ela chega — uma vez so.
  // Se ela falhar, fica em Aguardando, que e onde a falha e o "Tentar de novo" estao.
  if (escolhida === null && pendentes.data !== null)
    setEscolhida(pendentes.data.length > 0 ? 'aguardando' : 'autorizados')
  else if (escolhida === null && pendentes.failed) setEscolhida('aguardando')
  const aba: Aba = escolhida ?? 'aguardando'

  const marcados = bloqueados.data?.reduce((soma, item) => soma + item.MarkedCount, 0) ?? 0
  const abas: { chave: Aba; rotulo: string; contagem: string | null; destaque?: boolean }[] = [
    {
      chave: 'aguardando',
      rotulo: 'Aguardando',
      contagem: pendentes.data ? String(pendentes.data.length) : null,
      // O que espera decisao chama atencao; as outras contagens so informam.
      destaque: (pendentes.data?.length ?? 0) > 0,
    },
    {
      chave: 'autorizados',
      rotulo: 'Autorizados',
      contagem: totalAutorizados === null ? null : String(totalAutorizados),
    },
    {
      chave: 'bloqueados',
      rotulo: 'Bloqueados',
      contagem: bloqueados.data
        ? marcados > 0
          ? `${bloqueados.data.length} · ${marcados === 1 ? '1 card' : `${marcados} cards`}`
          : String(bloqueados.data.length)
        : null,
    },
    { chave: 'historico', rotulo: 'Histórico', contagem: null },
    ...(protection ? [{ chave: 'protecao' as const, rotulo: 'Proteção', contagem: null }] : []),
  ]
  const painel = (chave: Aba) => `${base}-painel-${chave}`
  const guia = (chave: Aba) => `${base}-aba-${chave}`

  // **Uma acao por linha de cada vez.** O segundo clique, enquanto o primeiro esta a
  // caminho, mandaria o mesmo pedido de novo — e a resposta dele seria um erro sobre
  // uma coisa que ja deu certo. O ref decide na hora; o estado so desenha.
  const emAndamento = useRef(new Set<string>())
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(() => new Set())
  async function ocupar(chave: string, acao: () => Promise<void>) {
    if (emAndamento.current.has(chave)) return
    emAndamento.current.add(chave)
    setOcupados(new Set(emAndamento.current))
    try {
      await acao()
    } finally {
      emAndamento.current.delete(chave)
      setOcupados(new Set(emAndamento.current))
    }
  }

  // **O foco nao some com a linha.** Permitir, bloquear, liberar e desbloquear tiram a
  // linha (ou o botao) da tela; sem isto o foco caia no corpo da pagina, e quem usa
  // teclado recomecava do topo. Ele vai para o titulo da lista em que a pessoa estava.
  const titulos = {
    pendentes: useRef<HTMLHeadingElement>(null),
    observados: useRef<HTMLHeadingElement>(null),
    bloqueados: useRef<HTMLHeadingElement>(null),
  }
  // Vale por alguns segundos: e a resposta da mudanca que tira a linha, e nao uma
  // atualizacao qualquer de depois, que pode chegar com a pessoa em outro lugar.
  const focoDepois = useRef<{ lista: Lista; ate: number } | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda quando uma das listas chega de novo; os refs sao estaveis
  useEffect(() => {
    if (!focoDepois.current) return
    // Depois do dialogo devolver o foco: so o que ficou no corpo da pagina se perdeu.
    const espera = window.setTimeout(() => {
      const pedido = focoDepois.current
      if (!pedido) return
      if (Date.now() > pedido.ate) {
        focoDepois.current = null
        return
      }
      const ativo = document.activeElement
      if (ativo && ativo !== document.body) return
      focoDepois.current = null
      titulos[pedido.lista].current?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(espera)
  }, [pendentes.data, observados.data, bloqueados.data])

  function depoisDaMudanca(lista: Lista) {
    focoDepois.current = { lista, ate: Date.now() + 5000 }
    renovar()
  }

  async function permitir(dominio: string, lista: Lista, estavaBloqueado = false) {
    await ocupar(`dominio:${dominio}`, async () => {
      try {
        await projectOriginService.addProjectOrigin(projectPublicId, {
          Domain: dominio,
          AllowsSubdomains: false,
        })
        toast.done(
          estavaBloqueado
            ? `${dominio} desbloqueado e autorizado: os relatos de lá entram direto no Trabalho.`
            : `${dominio} autorizado: os relatos de lá entram direto no Trabalho.`,
        )
        setVersaoAutorizados((versao) => versao + 1)
        depoisDaMudanca(lista)
      } catch (falha) {
        toast.error(describeError(falha))
      }
    })
  }

  async function bloquear(pedido: PedidoDeBloqueio) {
    await projectOriginService.blockOrigin(projectPublicId, {
      Domain: pedido.dominio,
      IncludesSubdomains: pedido.subdominios,
    })
    toast.done(
      pedido.subdominios
        ? `${rotuloDoBloqueio(pedido)} bloqueado, com os subdomínios. Novos relatos de lá são recusados a partir de agora.`
        : `${rotuloDoBloqueio(pedido)} bloqueado. Novos relatos de lá são recusados a partir de agora.`,
    )
    // Os retidos de la sairam de vez, e a lista de espera muda.
    // Bloquear tira o dominio da lista de autorizados, se ele estava la.
    setVersaoAutorizados((versao) => versao + 1)
    depoisDaMudanca(pedido.lista)
  }

  async function desbloquear(pedido: PedidoDeDesbloqueio) {
    await ocupar(`bloqueio:${pedido.PublicId}`, async () => {
      try {
        await projectOriginService.unblockOrigin(projectPublicId, pedido.PublicId)
        toast.done(
          pedido.subdominios
            ? `${pedido.rotulo} desbloqueado: o domínio e os subdomínios voltam a abrir a ferramenta.`
            : `${pedido.rotulo} desbloqueado.`,
        )
        depoisDaMudanca(pedido.lista)
      } catch (falha) {
        toast.error(describeError(falha))
      }
    })
  }

  async function manter(bloqueio: ProjectBlockedOriginViewModel) {
    await ocupar(`bloqueio:${bloqueio.PublicId}`, async () => {
      try {
        const feito = await projectReportService.keepBlockedOriginReports(projectPublicId, {
          BlockedOriginId: bloqueio.PublicId,
        })
        toast.done(
          feito.Affected === 1
            ? '1 card mantido: a marca de origem bloqueada saiu.'
            : `${feito.Affected} cards mantidos: a marca de origem bloqueada saiu.`,
        )
        depoisDaMudanca('bloqueados')
      } catch (falha) {
        toast.error(describeError(falha))
      }
    })
  }

  async function apagar(bloqueio: ProjectBlockedOriginViewModel, confirmacao: string) {
    try {
      const feito = await projectReportService.deleteBlockedOriginReports(projectPublicId, {
        BlockedOriginId: bloqueio.PublicId,
        Confirmation: confirmacao,
      })
      toast.done(
        `${feito.Affected === 1 ? '1 card apagado' : `${feito.Affected} cards apagados`} de vez${feito.SubtasksDeleted > 0 ? `, com ${feito.SubtasksDeleted === 1 ? '1 subtarefa' : `${feito.SubtasksDeleted} subtarefas`}` : ''}.`,
      )
      setRevisando(null)
      depoisDaMudanca('bloqueados')
    } catch (falha) {
      toast.error(describeError(falha))
    }
  }

  /** Os retidos que nao disseram de onde vieram: liberar sem mexer nas listas. */
  async function liberarSemDominio() {
    await ocupar('sem-dominio', async () => {
      try {
        const feito = await projectOriginService.releasePendingOrigin(projectPublicId, {
          Domain: null,
        })
        toast.done(
          feito.Reports === 1
            ? '1 relato liberado: ele entrou no Trabalho.'
            : `${feito.Reports} relatos liberados: eles entraram no Trabalho.`,
        )
        depoisDaMudanca('pendentes')
      } catch (falha) {
        toast.error(describeError(falha))
      }
    })
  }

  async function apagarSemDominio() {
    await ocupar('sem-dominio', async () => {
      try {
        const feito = await projectOriginService.deletePendingOrigin(projectPublicId, {
          Domain: null,
        })
        toast.done(
          feito.Reports === 1
            ? '1 relato apagado de vez.'
            : `${feito.Reports} relatos apagados de vez.`,
        )
        depoisDaMudanca('pendentes')
      } catch (falha) {
        toast.error(describeError(falha))
      }
    })
  }

  function revisarNaLista() {
    rememberBlockedOriginFilter(projectPublicId)
    navigate(`/projects/${projectPublicId}/reports`)
  }

  /** O desbloqueio de uma linha da lista de bloqueados, pela mesma confirmacao. */
  function pedirDesbloqueio(
    bloqueio: Pick<ProjectBlockedOriginViewModel, 'PublicId' | 'Domain' | 'IncludesSubdomains'>,
    lista: Lista,
  ) {
    setDesbloqueando({
      PublicId: bloqueio.PublicId,
      rotulo: rotuloDoBloqueio({
        dominio: bloqueio.Domain,
        subdominios: bloqueio.IncludesSubdomains,
      }),
      subdominios: bloqueio.IncludesSubdomains,
      lista,
    })
  }

  return (
    // O `#dominios` continua no conjunto das abas, e nao no topo da tela: e para onde o
    // sino leva, a aba escolhida e Aguardando, e o foco cai no titulo da primeira lista —
    // a dos retidos, que e o que o aviso pede para decidir.
    <section id="dominios" className="scroll-mt-6">
      <Guias abas={abas} aba={aba} painel={painel} guia={guia} aoEscolher={setEscolhida} />

      <Painel id={painel('aguardando')} guia={guia('aguardando')} aberto={aba === 'aguardando'}>
        <PendingOrigins
          recurso={pendentes}
          titulo={titulos.pendentes}
          ocupados={ocupados}
          aoPermitir={(dominio) => void permitir(dominio, 'pendentes')}
          aoBloquear={(dominio) =>
            setBloqueando({ dominio, subdominios: false, lista: 'pendentes' })
          }
          aoLiberarSemDominio={() => void liberarSemDominio()}
          aoApagarSemDominio={setApagandoSemDominio}
        />
      </Painel>

      <Painel id={painel('autorizados')} guia={guia('autorizados')} aberto={aba === 'autorizados'}>
        <AllowedOriginsSection
          projectPublicId={projectPublicId}
          refreshKey={versaoAutorizados}
          onChange={aoMudarAutorizados}
        />
      </Painel>

      <Painel id={painel('bloqueados')} guia={guia('bloqueados')} aberto={aba === 'bloqueados'}>
        <BlockedOrigins
          recurso={bloqueados}
          titulo={titulos.bloqueados}
          ocupados={ocupados}
          aoBloquear={setBloqueando}
          aoDesbloquear={(bloqueio) => pedirDesbloqueio(bloqueio, 'bloqueados')}
          aoRevisar={revisarNaLista}
          aoManter={(bloqueio) => void manter(bloqueio)}
          aoApagar={(bloqueio) => setRevisando({ bloqueio, acao: 'apagar' })}
        />
      </Painel>

      <Painel id={painel('historico')} guia={guia('historico')} aberto={aba === 'historico'}>
        <ObservedOrigins
          recurso={observados}
          bloqueados={bloqueados.data}
          titulo={titulos.observados}
          ocupados={ocupados}
          aoPermitir={(dominio, estavaBloqueado) =>
            void permitir(dominio, 'observados', estavaBloqueado)
          }
          aoBloquear={(dominio) =>
            setBloqueando({ dominio, subdominios: false, lista: 'observados' })
          }
          aoDesbloquear={(bloqueio) => pedirDesbloqueio(bloqueio, 'observados')}
        />
      </Painel>

      {protection && (
        <Painel id={painel('protecao')} guia={guia('protecao')} aberto={aba === 'protecao'}>
          {/* `#mais-opcoes` era o "Mais opções" que guardava os limites: o endereco
              antigo chega aqui, e o foco vai para o titulo dos limites. */}
          <div id="mais-opcoes" className="scroll-mt-6">
            {protection}
          </div>
        </Painel>
      )}

      <ConfirmDialog
        open={apagandoSemDominio !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setApagandoSemDominio(null)
        }}
        tone="warn"
        title="Apagar de vez os relatos sem domínio?"
        description={`${apagandoSemDominio?.ReportCount === 1 ? 'O relato que chegou' : `Os ${apagandoSemDominio?.ReportCount ?? 0} relatos que chegaram`} sem dizer de que domínio veio saem de vez, com os anexos — o time nunca os viu. Quem relatou perde o acompanhamento. Não tem volta.`}
        confirmLabel="Apagar de vez"
        onConfirm={() => apagarSemDominio()}
      />

      <ConfirmDialog
        open={bloqueando !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setBloqueando(null)
        }}
        tone="warn"
        title={`Bloquear ${bloqueando ? rotuloDoBloqueio(bloqueando) : ''}?`}
        description={
          bloqueando?.subdominios
            ? `A ferramenta deixa de abrir em ${bloqueando.dominio.replace(/^\*\./, '')} e em todos os subdomínios dele, e o próximo relato de lá é recusado, a partir de agora. Os relatos que esperavam liberação, do domínio e dos subdomínios, são apagados de vez. Os cards que já tinham entrado ficam marcados com “Origem bloqueada”, para você decidir: manter ou apagar de vez.`
            : 'A ferramenta deixa de abrir nesse domínio e o próximo relato de lá é recusado, a partir de agora. Os relatos de lá que esperavam liberação são apagados de vez. Os cards que já tinham entrado ficam marcados com “Origem bloqueada”, para você decidir: manter ou apagar de vez.'
        }
        confirmLabel="Bloquear"
        onConfirm={async () => {
          if (!bloqueando) return
          try {
            await bloquear(bloqueando)
            bloqueando.aoConcluir?.()
          } catch (falha) {
            const mensagem = describeError(falha)
            // Do campo, a recusa fica no campo, com o que foi escrito; das linhas, aviso.
            if (bloqueando.aoFalhar) bloqueando.aoFalhar(mensagem)
            else toast.error(mensagem)
          }
        }}
      />

      <ConfirmDialog
        open={desbloqueando !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setDesbloqueando(null)
        }}
        title={`Desbloquear ${desbloqueando?.rotulo ?? 'domínio'}?`}
        description={
          desbloqueando?.subdominios
            ? 'A ferramenta volta a abrir no domínio e em todos os subdomínios dele, e os cards de lá perdem a marca de origem bloqueada. Fora da lista de autorizados, o próximo relato de lá espera liberação.'
            : 'A ferramenta volta a abrir nesse domínio e os cards de lá perdem a marca de origem bloqueada. Fora da lista de autorizados, o próximo relato de lá espera liberação.'
        }
        confirmLabel="Desbloquear"
        onConfirm={() => (desbloqueando ? desbloquear(desbloqueando) : undefined)}
      />

      {revisando && (
        <DeleteBlockedOriginDialog
          count={revisando.bloqueio.MarkedCount}
          domain={revisando.bloqueio.IncludesSubdomains ? null : revisando.bloqueio.Domain}
          onConfirm={(confirmacao) => apagar(revisando.bloqueio, confirmacao)}
          onCancel={() => setRevisando(null)}
        />
      )}
    </section>
  )
}

/** As listas da tela, para onde o foco volta quando a linha some. */
type Lista = 'pendentes' | 'observados' | 'bloqueados'

/** As abas da tela, na ordem em que aparecem. */
type Aba = 'aguardando' | 'autorizados' | 'bloqueados' | 'historico' | 'protecao'

/**
 * A aba em que mora cada ancora da tela. O sino leva a `#dominios` e `#limites`, a
 * Instalacao a `#autorizados`, a busca da configuracao a cada lista e a cada limite
 * (`#limite-por-ip`, `#intervalo-minimo`). Ancora de fora da tela nao escolhe nada.
 */
function abaDaAncora(hash: string): Aba | null {
  let id: string
  try {
    id = decodeURIComponent(hash.replace(/^#/, ''))
  } catch {
    // `%` solto no endereco: nao e ancora de ninguem.
    return null
  }
  if (id === 'dominios' || id === 'aguardando-liberacao') return 'aguardando'
  if (id === 'autorizados') return 'autorizados'
  if (id === 'bloqueados') return 'bloqueados'
  if (id === 'dominios-observados') return 'historico'
  if (
    id === 'limites' ||
    id === 'mais-opcoes' ||
    id === 'intervalo-minimo' ||
    id.startsWith('limite-')
  )
    return 'protecao'
  return null
}

/**
 * As abas, no padrao de abas acessivel: setas trocam e levam o foco (a aba segue o foco,
 * como em Lista e Quadro do Trabalho), Home e End vao as pontas, e so a aba escolhida
 * entra na ordem do Tab. Com muitas contagens e tela estreita, a fileira rola de lado em
 * vez de quebrar.
 */
function Guias({
  abas,
  aba,
  painel,
  guia,
  aoEscolher,
}: {
  abas: { chave: Aba; rotulo: string; contagem: string | null; destaque?: boolean }[]
  aba: Aba
  painel: (chave: Aba) => string
  guia: (chave: Aba) => string
  aoEscolher: (aba: Aba) => void
}) {
  const botoes = useRef<Partial<Record<Aba, HTMLButtonElement | null>>>({})
  const chaves = abas.map((item) => item.chave)

  const teclas = (evento: KeyboardEvent, atual: Aba) => {
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
      aria-label="Domínios"
      className="mb-6 flex gap-5 overflow-x-auto border-border border-b"
    >
      {abas.map((item) => (
        <button
          key={item.chave}
          ref={(no) => {
            botoes.current[item.chave] = no
          }}
          id={guia(item.chave)}
          type="button"
          role="tab"
          aria-selected={aba === item.chave}
          aria-controls={painel(item.chave)}
          tabIndex={aba === item.chave ? 0 : -1}
          onClick={() => aoEscolher(item.chave)}
          onKeyDown={(evento) => teclas(evento, item.chave)}
          className={cn(
            '-mb-px flex h-9 flex-none items-center whitespace-nowrap border-b-2 px-0.5 font-medium text-body transition-colors',
            aba === item.chave
              ? 'border-accent text-fg'
              : 'border-transparent text-fg-muted hover:text-fg',
          )}
        >
          {item.rotulo}
          {item.contagem !== null && (
            <span
              className={cn(
                'tabular-nums',
                item.destaque ? 'text-chip-orange-fg' : 'font-normal text-fg-muted',
              )}
            >
              {` (${item.contagem})`}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/** O painel de uma aba: montado sempre, escondido quando a aba nao e a escolhida. */
function Painel({
  id,
  guia,
  aberto,
  children,
}: {
  id: string
  guia: string
  aberto: boolean
  children: ReactNode
}) {
  return (
    // `animate-panel-in`: a aba escolhida entra esmaecendo, em vez de trocar de uma vez.
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={guia}
      hidden={!aberto}
      className="animate-panel-in"
    >
      {children}
    </div>
  )
}

/**
 * Um bloqueio esperando confirmacao. O do campo traz o que fazer com a resposta: a
 * recusa da API e do campo, e o campo so limpa quando deu certo.
 */
interface PedidoDeBloqueio {
  dominio: string
  subdominios: boolean
  lista: Lista
  aoConcluir?: () => void
  aoFalhar?: (mensagem: string) => void
}

interface PedidoDeDesbloqueio {
  PublicId: string
  /** O texto do bloqueio como a lista mostra: `*.loja.com` no curinga. */
  rotulo: string
  subdominios: boolean
  lista: Lista
}

/**
 * O bloqueio como a pessoa o le: `*.loja.com` quando vale para os subdominios. O
 * curinga digitado no campo conta como a caixa marcada, como na API.
 */
function rotuloDoBloqueio({ dominio, subdominios }: { dominio: string; subdominios: boolean }) {
  const semCuringa = dominio.replace(/^\*\./, '')
  return subdominios || dominio.startsWith('*.') ? `*.${semCuringa}` : semCuringa
}

type Recurso<T> = ReturnType<typeof useAsyncResource<T>>

/**
 * "Aguardando liberação": os relatos retidos de cada dominio fora da lista, com quantos e
 * o mais novo quando. Permitir poe o dominio na lista e os retidos no topo do quadro;
 * bloquear apaga os retidos de vez. Os que nao disseram de onde vieram nao tem dominio
 * para permitir: liberar ou apagar so eles.
 */
function PendingOrigins({
  recurso,
  titulo,
  ocupados,
  aoPermitir,
  aoBloquear,
  aoLiberarSemDominio,
  aoApagarSemDominio,
}: {
  recurso: Recurso<HeldOriginViewModel[]>
  titulo: RefObject<HTMLHeadingElement | null>
  ocupados: ReadonlySet<string>
  aoPermitir: (dominio: string) => void
  aoBloquear: (dominio: string) => void
  aoLiberarSemDominio: () => void
  aoApagarSemDominio: (linha: HeldOriginViewModel) => void
}) {
  const { data: retidos, loading, failed, reload } = recurso

  return (
    <div id="aguardando-liberacao" className="scroll-mt-6">
      <h3 ref={titulo} tabIndex={-1} className="mb-1 font-semibold text-body outline-none">
        Aguardando liberação
      </h3>
      <p className="mb-2 text-detail text-fg-muted leading-relaxed">
        Relatos de domínios fora dos autorizados: o time só os vê depois que você permite o domínio.
      </p>

      <HowItWorks>
        <p>
          Quem relatou não percebe nada e acompanha como sempre. Permitir põe o domínio entre os
          autorizados, e o relato entra no topo do quadro, como um relato novo. Bloquear apaga esses
          relatos de vez, e o próximo de lá é recusado.
        </p>
        <p>
          Os relatos que chegaram sem dizer de que domínio vieram não têm o que permitir: libere ou
          apague só eles, sem mexer nas listas.
        </p>
      </HowItWorks>

      {failed && <FalhaAoLer aoTentar={reload} />}
      {loading && <Esqueleto />}

      {retidos !== null && retidos.length === 0 && (
        <p className="rounded-lg border border-border border-dashed px-3.5 py-3 text-detail text-fg-muted leading-relaxed">
          Nenhum relato esperando. Quando um domínio fora dos autorizados mandar relato, ele aparece
          aqui e o sino avisa — autorize o domínio do seu site em “Autorizados” para os relatos de
          lá entrarem direto.
        </p>
      )}

      {retidos !== null && retidos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {retidos.map((linha) => {
            const ocupada = ocupados.has(linha.Domain ? `dominio:${linha.Domain}` : 'sem-dominio')
            return (
              <li
                key={linha.Domain ?? '(sem domínio)'}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-raised py-2 pr-2 pl-3.5"
              >
                <div className="min-w-0 flex-1">
                  {linha.Domain ? (
                    <code className="block truncate font-mono text-detail text-fg">
                      {linha.Domain}
                    </code>
                  ) : (
                    <span className="block text-detail text-fg">Sem domínio informado</span>
                  )}
                  <span className="text-caption text-fg-muted">
                    {linha.ReportCount === 1 ? '1 relato' : `${linha.ReportCount} relatos`} · o
                    último{' '}
                    <time dateTime={linha.LastReportAt} title={formatDateTime(linha.LastReportAt)}>
                      {formatRelative(linha.LastReportAt)}
                    </time>
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {linha.Domain ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ocupada}
                        aria-label={`Permitir ${linha.Domain}`}
                        onClick={() => aoPermitir(linha.Domain as string)}
                      >
                        Permitir
                      </Button>
                      <Button
                        size="sm"
                        disabled={ocupada}
                        aria-label={`Bloquear ${linha.Domain}`}
                        onClick={() => aoBloquear(linha.Domain as string)}
                      >
                        Bloquear
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ocupada}
                        aria-label="Liberar os relatos sem domínio"
                        onClick={aoLiberarSemDominio}
                      >
                        Liberar
                      </Button>
                      <Button
                        size="sm"
                        variant="warn"
                        disabled={ocupada}
                        aria-label="Apagar de vez os relatos sem domínio"
                        onClick={() => aoApagarSemDominio(linha)}
                      >
                        Apagar de vez
                      </Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * "Domínios que mandaram relatos": quantos, o ultimo quando, como o projeto os trata e o
 * que da para fazer com cada um. Do mais recente para o mais antigo.
 */
function ObservedOrigins({
  recurso,
  bloqueados,
  titulo,
  ocupados,
  aoPermitir,
  aoBloquear,
  aoDesbloquear,
}: {
  recurso: Recurso<ObservedOriginViewModel[]>
  /** A lista de bloqueados, para achar a linha que barra cada dominio. */
  bloqueados: ProjectBlockedOriginViewModel[] | null
  titulo: RefObject<HTMLHeadingElement | null>
  ocupados: ReadonlySet<string>
  aoPermitir: (dominio: string, estavaBloqueado: boolean) => void
  aoBloquear: (dominio: string) => void
  aoDesbloquear: (
    bloqueio: Pick<ProjectBlockedOriginViewModel, 'PublicId' | 'Domain' | 'IncludesSubdomains'>,
  ) => void
}) {
  const { data: origens, loading, failed, reload } = recurso

  return (
    <div id="dominios-observados" className="scroll-mt-6">
      <h3 ref={titulo} tabIndex={-1} className="mb-1 font-semibold text-body outline-none">
        Domínios que mandaram relatos
      </h3>
      <p className="mb-2 text-detail text-fg-muted leading-relaxed">
        Os relatos que entraram no Trabalho, contados pelo domínio de cada um. Se aparecer um que
        não é seu, bloqueie.
      </p>

      <HowItWorks>
        <p>
          Conta os arquivados inclusive. A situação diz o que acontece com o próximo relato de cada
          domínio: “Autorizado” entra direto; “Fora da lista” espera em “Aguardando liberação”;
          “Bloqueado” é recusado.
        </p>
        <p>
          Com um bloqueio que vale para os subdomínios (
          <code className="font-mono">*.loja.com</code>
          ), um domínio coberto por ele não se permite daqui: o botão desfaz o bloqueio que o barra.
        </p>
      </HowItWorks>

      {failed && <FalhaAoLer aoTentar={reload} />}
      {loading && <Esqueleto />}

      {origens !== null && origens.length === 0 && (
        <p className="rounded-lg border border-border border-dashed px-3.5 py-3 text-detail text-fg-muted">
          Nenhum relato chegou com domínio ainda. Quando chegar, ele aparece aqui.
        </p>
      )}

      {origens !== null && origens.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[34rem] text-detail">
            <thead className="bg-surface-sunken text-left text-caption text-fg-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Domínio
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Relatos
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Último
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Situação
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {origens.map((origem) => (
                <tr key={origem.Domain} className="border-border border-t">
                  <th
                    scope="row"
                    className="max-w-56 truncate px-3 py-2 text-left font-mono font-normal text-fg"
                  >
                    {origem.Domain}
                  </th>
                  <td className="px-3 py-2 text-right text-fg tabular-nums">
                    {origem.ReportCount}
                  </td>
                  <td
                    className="px-3 py-2 text-fg-muted"
                    title={formatDateTime(origem.LastReportAt)}
                  >
                    {formatRelative(origem.LastReportAt)}
                  </td>
                  <td className="px-3 py-2">
                    <Situacao origem={origem} />
                  </td>
                  <td className="px-3 py-1.5">
                    <AcoesDaOrigem
                      origem={origem}
                      bloqueados={bloqueados}
                      ocupados={ocupados}
                      aoPermitir={aoPermitir}
                      aoBloquear={aoBloquear}
                      aoDesbloquear={aoDesbloquear}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * As acoes de um dominio que mandou relatos, pela situacao dele.
 *
 * **O bloqueado por outra linha nao se permite daqui.** Com `*.loja.com` bloqueado,
 * permitir `app.loja.com` nao mudaria nada — o bloqueio vence, e a API recusa. O que da
 * para fazer e desbloquear a linha que barra, e o botao diz qual, com o texto dela.
 */
function AcoesDaOrigem({
  origem,
  bloqueados,
  ocupados,
  aoPermitir,
  aoBloquear,
  aoDesbloquear,
}: {
  origem: ObservedOriginViewModel
  bloqueados: ProjectBlockedOriginViewModel[] | null
  ocupados: ReadonlySet<string>
  aoPermitir: (dominio: string, estavaBloqueado: boolean) => void
  aoBloquear: (dominio: string) => void
  aoDesbloquear: (
    bloqueio: Pick<ProjectBlockedOriginViewModel, 'PublicId' | 'Domain' | 'IncludesSubdomains'>,
  ) => void
}) {
  const ocupada = ocupados.has(`dominio:${origem.Domain}`)

  if (origem.Status !== 'Blocked') {
    return (
      <div className="flex justify-end gap-1.5">
        {origem.Status === 'Unlisted' && (
          <Button
            size="sm"
            variant="ghost"
            disabled={ocupada}
            aria-label={`Permitir ${origem.Domain}`}
            onClick={() => aoPermitir(origem.Domain, false)}
          >
            Permitir
          </Button>
        )}
        <Button
          size="sm"
          disabled={ocupada}
          aria-label={`Bloquear ${origem.Domain}`}
          onClick={() => aoBloquear(origem.Domain)}
        >
          Bloquear
        </Button>
      </div>
    )
  }

  // A linha que barra este dominio. Sem a lista ainda, vale o dominio da propria linha.
  const bloqueio = bloqueados?.find((item) => item.PublicId === origem.BlockedOriginId) ?? null
  const curinga =
    bloqueio !== null && (bloqueio.IncludesSubdomains || bloqueio.Domain !== origem.Domain)
  const rotulo = bloqueio
    ? rotuloDoBloqueio({ dominio: bloqueio.Domain, subdominios: bloqueio.IncludesSubdomains })
    : origem.Domain
  const desbloqueando = origem.BlockedOriginId
    ? ocupados.has(`bloqueio:${origem.BlockedOriginId}`)
    : false

  return (
    <div className="flex justify-end gap-1.5">
      {origem.BlockedOriginId && (
        <Button
          size="sm"
          variant="ghost"
          disabled={desbloqueando || ocupada}
          aria-label={curinga ? undefined : `Desbloquear ${origem.Domain}`}
          onClick={() =>
            aoDesbloquear(
              bloqueio ?? {
                PublicId: origem.BlockedOriginId as string,
                Domain: origem.Domain,
                IncludesSubdomains: false,
              },
            )
          }
        >
          {curinga ? `Desbloquear ${rotulo}` : 'Desbloquear'}
        </Button>
      )}
      {!curinga && (
        <Button
          size="sm"
          variant="ghost"
          disabled={desbloqueando || ocupada}
          aria-label={`Permitir ${origem.Domain}`}
          onClick={() => aoPermitir(origem.Domain, true)}
        >
          Permitir
        </Button>
      )}
    </div>
  )
}

/** A situacao do dominio, com a palavra: a cor nunca sozinha. */
function Situacao({ origem }: { origem: ObservedOriginViewModel }) {
  if (origem.Status === 'Blocked')
    return (
      <span className="text-chip-red-fg">
        Bloqueado
        {origem.MarkedCount > 0 &&
          ` · ${origem.MarkedCount === 1 ? '1 card marcado' : `${origem.MarkedCount} cards marcados`}`}
      </span>
    )
  if (origem.Status === 'Allowed') return <span className="text-fg">Autorizado</span>
  // Fora de lista: o que ja entrou fica (entrou liberado, ou antes da regra), e o
  // proximo relato de la espera liberacao.
  return <span className="text-chip-orange-fg">Fora da lista: o próximo espera</span>
}

/**
 * "Bloqueados": o campo para bloquear um dominio que ainda nao mandou nada, e a lista,
 * com os cards marcados de cada um e o que fazer com eles.
 */
function BlockedOrigins({
  recurso,
  titulo,
  ocupados,
  aoBloquear,
  aoDesbloquear,
  aoRevisar,
  aoManter,
  aoApagar,
}: {
  recurso: Recurso<ProjectBlockedOriginViewModel[]>
  titulo: RefObject<HTMLHeadingElement | null>
  ocupados: ReadonlySet<string>
  /** Pede a confirmacao; a recusa da API volta pelo `aoFalhar`, para o campo. */
  aoBloquear: (pedido: PedidoDeBloqueio) => void
  aoDesbloquear: (bloqueio: ProjectBlockedOriginViewModel) => void
  aoRevisar: () => void
  aoManter: (bloqueio: ProjectBlockedOriginViewModel) => void
  aoApagar: (bloqueio: ProjectBlockedOriginViewModel) => void
}) {
  const subdominiosId = useId()
  const { data: bloqueados, loading, failed, reload } = recurso
  const [dominio, setDominio] = useState('')
  const [subdominios, setSubdominios] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Bloquear apaga de vez os retidos (e os dos subdominios, com a caixa marcada): pede a
  // mesma confirmacao das linhas, e o campo so limpa quando deu certo.
  function bloquear() {
    const valor = dominio.trim()
    if (valor.length === 0) return
    setErro(null)
    aoBloquear({
      dominio: valor,
      subdominios,
      lista: 'bloqueados',
      aoConcluir: () => {
        setDominio('')
        setSubdominios(false)
      },
      aoFalhar: setErro,
    })
  }

  return (
    <div id="bloqueados" className="scroll-mt-6">
      <h3 ref={titulo} tabIndex={-1} className="mb-1 font-semibold text-body outline-none">
        Bloqueados
      </h3>
      <p className="mb-2 text-detail text-fg-muted leading-relaxed">
        A ferramenta não abre nesses domínios e o relato de lá é recusado.
      </p>

      <HowItWorks>
        <p>
          Bloquear apaga de vez os relatos de lá que esperavam liberação. Os cards que já tinham
          entrado ficam marcados com “Origem bloqueada”: “Revisar na lista” mostra quais são,
          “Manter” tira a marca e “Apagar de vez” não tem volta.
        </p>
        <p>
          Desbloquear não autoriza: fora da lista de autorizados, o próximo relato de lá espera em
          “Aguardando liberação”.
        </p>
      </HowItWorks>

      {failed && <FalhaAoLer aoTentar={reload} />}
      {loading && <Esqueleto />}

      {bloqueados !== null && bloqueados.length === 0 && (
        <p className="mb-4 rounded-lg border border-border border-dashed px-3.5 py-3 text-detail text-fg-muted leading-relaxed">
          Nenhum domínio bloqueado. Se aparecer no Histórico um domínio que não é seu, bloqueie por
          lá ou escreva-o abaixo.
        </p>
      )}

      {bloqueados !== null && bloqueados.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {bloqueados.map((bloqueio) => {
            const rotulo = rotuloDoBloqueio({
              dominio: bloqueio.Domain,
              subdominios: bloqueio.IncludesSubdomains,
            })
            const ocupada = ocupados.has(`bloqueio:${bloqueio.PublicId}`)
            return (
              <li
                key={bloqueio.PublicId}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-raised py-2 pr-2 pl-3.5"
              >
                <div className="min-w-0 flex-1">
                  <code className="block truncate font-mono text-detail text-fg">{rotulo}</code>
                  <span className="text-caption text-fg-muted">
                    Bloqueado {formatRelative(bloqueio.BlockedAt)}
                    {bloqueio.BlockedByName ? ` por ${bloqueio.BlockedByName}` : ''}
                  </span>
                </div>

                {bloqueio.MarkedCount > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-caption text-chip-orange-fg">
                      {bloqueio.MarkedCount === 1
                        ? '1 card marcado'
                        : `${bloqueio.MarkedCount} cards marcados`}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Revisar na lista os cards de ${rotulo}`}
                      onClick={aoRevisar}
                    >
                      Revisar na lista
                    </Button>
                    <Button
                      size="sm"
                      disabled={ocupada}
                      aria-label={`Manter os cards de ${rotulo}`}
                      onClick={() => aoManter(bloqueio)}
                    >
                      Manter
                    </Button>
                    <Button
                      size="sm"
                      variant="warn"
                      disabled={ocupada}
                      aria-label={`Apagar de vez os cards de ${rotulo}`}
                      onClick={() => aoApagar(bloqueio)}
                    >
                      Apagar de vez
                    </Button>
                  </div>
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  disabled={ocupada}
                  aria-label={`Desbloquear ${rotulo}`}
                  onClick={() => aoDesbloquear(bloqueio)}
                >
                  Desbloquear
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      {bloqueados !== null && (
        <div>
          <div className="flex items-start gap-2">
            <TextField
              className="min-w-0 flex-1"
              ariaLabel="Domínio a bloquear"
              value={dominio}
              onChange={(valor) => {
                setDominio(valor)
                if (erro) setErro(null)
              }}
              placeholder="copia-da-loja.com"
              error={erro}
              maxLength={MAX_ORIGIN_DOMAIN_LENGTH}
              onSubmit={bloquear}
            />
            <Button disabled={dominio.trim().length === 0} onClick={bloquear}>
              Bloquear domínio
            </Button>
          </div>
          <label htmlFor={subdominiosId} className="mt-3 flex items-start gap-2">
            <input
              id={subdominiosId}
              type="checkbox"
              checked={subdominios}
              onChange={(evento) => setSubdominios(evento.target.checked)}
              className="mt-0.5 size-3.5 flex-none accent-accent"
            />
            <span className="text-detail text-fg-muted leading-normal">
              Incluir os subdomínios — sem isso, só o endereço exato é bloqueado.
            </span>
          </label>
        </div>
      )}
    </div>
  )
}

function FalhaAoLer({ aoTentar }: { aoTentar: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-5">
      <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
        Não deu para carregar agora. A falha foi ao consultar: nada mudou.
      </p>
      <Button onClick={aoTentar}>Tentar de novo</Button>
    </div>
  )
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-2">
      {['w-48', 'w-40'].map((largura) => (
        <div
          key={largura}
          className="flex h-11 items-center rounded-lg border border-border bg-surface-raised px-3.5"
        >
          <Skeleton className={`h-3 ${largura}`} />
        </div>
      ))}
    </div>
  )
}
