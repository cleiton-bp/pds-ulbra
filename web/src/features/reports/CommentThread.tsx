import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { initialsOf } from '@/shared/components/cardFace'
import { DropdownGroup, DropdownItem, DropdownMenu } from '@/shared/components/DropdownMenu'
import { cn } from '@/shared/lib/cn'
import { formatDateTime } from '@/shared/lib/datetime'

/** Uma acao do menu de uma mensagem: responder, copiar, editar, apagar. */
export interface AcaoDaMensagem {
  rotulo: string
  aoEscolher: () => void
}

/** Uma mensagem como o chat desenha. Quem monta decide o lado, o nome e o que ela faz. */
export interface MensagemDoChat {
  id: string
  /** Quem escreveu: as mensagens seguidas da mesma pessoa, no mesmo dia, ficam juntas. */
  autor: string
  nome: string
  foto: string | null
  /** Quem relatou: a foto vira o desenho de uma pessoa, porque ela nao tem conta aqui. */
  deFora: boolean
  /** Do lado de quem esta escrevendo. */
  direita: boolean
  /**
   * O nome e a foto na primeira mensagem da sequencia. Falso nas suas: voce sabe quem
   * escreveu. Verdadeiro nas do time a direita, na conversa com quem relatou: ali o lado e
   * o do time, e a foto diz quem do time falou.
   */
  mostrarNome: boolean
  criadaEm: string
  editadaEm?: string | null
  /** A mensagem que esta responde. `id` nulo quando a original foi apagada. */
  citacao?: { id: string | null; nome: string; texto: string | null } | null
  corpo: ReactNode
  /** Embaixo do texto, dentro do balao: os arquivos da resposta, ou o campo da correcao. */
  extra?: ReactNode
  acoes: AcaoDaMensagem[]
}

/**
 * A conversa como um chat.
 *
 * **Cada caixa rola por dentro**, e nao o card inteiro: a conversa longa empurrava tudo para
 * baixo e o card virava uma rolagem sem fim. Abre nas mensagens mais recentes, como todo chat.
 *
 * **O seu lado fica a direita**, com outra cor, e o dos outros a esquerda, com a foto e o
 * nome na primeira mensagem de cada sequencia. O dia aparece no centro, antes da primeira
 * mensagem dele.
 *
 * **As anteriores vem ao subir**: perto das tres primeiras mensagens, o chat pede o pedaco
 * de antes e o encaixa em cima, sem a tela pular. O botao no topo faz o mesmo, para quem
 * usa o teclado e para a conversa curta, que nao chega a rolar.
 *
 * **Mensagem nova nao arranca ninguem do lugar.** Quem esta no fim acompanha a nova; quem
 * subiu para ler as antigas ve o botao "Novas mensagens".
 *
 * **Sem moldura.** O balao e so o fundo, e as pontas da area que rola esmaecem quando ha
 * mais conversa acima ou abaixo: a borda em volta gastava espaco e cortava as mensagens.
 */
export function CommentThread({
  rotulo,
  mensagens,
  temMais,
  carregando,
  aoPedirAnteriores,
  aoIrPara,
  vazio,
  paraFora = false,
  cheia = false,
  visivel = true,
}: {
  /** O nome da conversa para o leitor de tela. */
  rotulo: string
  /** Da mais antiga para a mais nova. */
  mensagens: MensagemDoChat[]
  temMais: boolean
  carregando: boolean
  aoPedirAnteriores: () => void
  /** Leva ate a mensagem citada, trazendo as anteriores se ela ainda nao esta na tela. */
  aoIrPara: (id: string) => void
  vazio: string
  /** A conversa com quem relatou: o lado do time fica ambar, a cor do que sai para fora. */
  paraFora?: boolean
  /** Expandida: ocupa a altura que sobra em quem a monta, em vez da altura limitada. */
  cheia?: boolean
  /** Falso na aba de tras: escondida, a caixa nao tem altura, e ao voltar abre no fim. */
  visivel?: boolean
}) {
  const caixa = useRef<HTMLElement>(null)
  const noFim = useRef(true)
  const ancora = useRef<{ altura: number; topo: number } | null>(null)
  const antes = useRef<{ primeira: string | null; ultima: string | null; montou: boolean }>({
    primeira: null,
    ultima: null,
    montou: false,
  })
  const [novas, setNovas] = useState(false)
  const [menuDe, setMenuDe] = useState<string | null>(null)
  // Ha conversa escondida acima ou abaixo: a ponta daquele lado esmaece.
  const [pontas, setPontas] = useState({ acima: false, abaixo: false })

  const primeira = mensagens[0]?.id ?? null
  const ultima = mensagens.at(-1)?.id ?? null
  const ultimaEMinha = mensagens.at(-1)?.direita ?? false

  // So le a caixa e guarda: a mesma funcao a vida toda, e os efeitos podem depender dela.
  const medirPontas = useCallback(() => {
    const el = caixa.current
    if (!el) return
    const acima = el.scrollTop > 2
    const abaixo = el.scrollHeight - el.scrollTop - el.clientHeight > 2
    setPontas((antes) =>
      antes.acima === acima && antes.abaixo === abaixo ? antes : { acima, abaixo },
    )
  }, [])

  // Antes de pintar, para nada pular: a abertura no fim, o encaixe das anteriores no mesmo
  // lugar e a mensagem nova levando quem esta no fim.
  useLayoutEffect(() => {
    const el = caixa.current
    const anterior = antes.current
    if (!el) return

    if (!anterior.montou) {
      if (primeira !== null) {
        el.scrollTop = el.scrollHeight
        anterior.montou = true
      }
    } else {
      if (primeira !== anterior.primeira && ancora.current) {
        el.scrollTop = el.scrollHeight - ancora.current.altura + ancora.current.topo
        ancora.current = null
      }
      if (ultima !== anterior.ultima && anterior.ultima !== null) {
        // A sua, mande de onde mandar, vai para o fim: e ali que voce a procura.
        if (noFim.current || ultimaEMinha) {
          el.scrollTop = el.scrollHeight
          setNovas(false)
        } else setNovas(true)
      }
    }

    anterior.primeira = primeira
    anterior.ultima = ultima
    medirPontas()
  }, [primeira, ultima, ultimaEMinha, medirPontas])

  // Expandir, recolher ou voltar a aba muda a altura: quem estava no fim continua no fim,
  // e a aba que estava escondida desde o comeco abre nas mais recentes.
  const tamanho = `${cheia}-${visivel}`
  const tamanhoAntes = useRef(tamanho)
  useLayoutEffect(() => {
    if (tamanhoAntes.current === tamanho) return
    tamanhoAntes.current = tamanho
    const el = caixa.current
    if (el && noFim.current) el.scrollTop = el.scrollHeight
    medirPontas()
  }, [tamanho, medirPontas])

  function pedirAnteriores() {
    const el = caixa.current
    if (!el || !temMais || carregando) return
    ancora.current = { altura: el.scrollHeight, topo: el.scrollTop }
    aoPedirAnteriores()
  }

  function aoRolar() {
    const el = caixa.current
    if (!el) return
    noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (noFim.current && novas) setNovas(false)
    medirPontas()

    // Perto das tres primeiras mensagens, as de antes ja vem chegando.
    const terceira = el.querySelectorAll<HTMLElement>('[data-mensagem]')[2]
    const limite = terceira ? terceira.offsetTop : 120
    if (el.scrollTop <= limite) pedirAnteriores()
  }

  function irAoFim() {
    const el = caixa.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setNovas(false)
  }

  /** O clique na mensagem abre o menu dela, como os tres pontos. Selecionar texto nao abre. */
  function aoClicarNaMensagem(evento: MouseEvent<HTMLDivElement>, mensagem: MensagemDoChat) {
    if (mensagem.acoes.length === 0) return
    const alvo = evento.target as HTMLElement
    if (alvo.closest('a, button, textarea, input, [role="menu"]')) return
    if ((window.getSelection?.()?.toString() ?? '').length > 0) return
    setMenuDe(mensagem.id)
  }

  return (
    <div className={cn('relative', cheia && 'flex min-h-0 flex-1 flex-col')}>
      <section
        ref={caixa}
        onScroll={aoRolar}
        aria-label={rotulo}
        className={cn(
          'relative overflow-y-auto overscroll-contain py-1 pr-2 [scrollbar-gutter:stable]',
          cheia ? 'min-h-0 flex-1' : 'max-h-[min(24rem,50vh)]',
        )}
      >
        {temMais ? (
          <div className="mb-1.5 flex justify-center">
            {carregando ? (
              <span className="py-1 text-caption text-fg-muted">
                Carregando mensagens anteriores…
              </span>
            ) : (
              <button
                type="button"
                onClick={pedirAnteriores}
                className="cursor-pointer rounded-full px-2.5 py-1 text-caption text-fg-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-sunken hover:text-fg active:scale-[0.97]"
              >
                Carregar mensagens anteriores
              </button>
            )}
          </div>
        ) : (
          mensagens.length > 0 && (
            <p className="mb-1.5 py-1 text-center text-caption text-fg-muted">Começo da conversa</p>
          )
        )}

        {mensagens.length === 0 && (
          <p className="py-4 text-center text-caption text-fg-muted">{vazio}</p>
        )}

        <ol className="flex flex-col">
          {mensagens.map((mensagem, indice) => {
            const anterior = mensagens[indice - 1]
            const outroDia = !anterior || diaDe(anterior.criadaEm) !== diaDe(mensagem.criadaEm)
            const comeca = outroDia || anterior?.autor !== mensagem.autor

            return (
              <ItemDaConversa
                key={mensagem.id}
                mensagem={mensagem}
                outroDia={outroDia}
                comeca={comeca}
                paraFora={paraFora}
                cheia={cheia}
                menuAberto={menuDe === mensagem.id}
                aoMenu={(aberto) => setMenuDe(aberto ? mensagem.id : null)}
                aoClicar={(evento) => aoClicarNaMensagem(evento, mensagem)}
                aoIrPara={aoIrPara}
              />
            )
          })}
        </ol>
      </section>

      {/* As pontas esmaecidas no lugar da moldura. Param antes da barra de rolagem. */}
      <div
        aria-hidden="true"
        className={cn(
          'chat-fade-top pointer-events-none absolute top-0 right-3 left-0 h-6 transition-opacity duration-200 ease-out',
          pontas.acima ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'chat-fade-bottom pointer-events-none absolute right-3 bottom-0 left-0 h-6 transition-opacity duration-200 ease-out',
          pontas.abaixo ? 'opacity-100' : 'opacity-0',
        )}
      />

      {novas && (
        <button
          type="button"
          onClick={irAoFim}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 animate-fade-in cursor-pointer rounded-full border border-border bg-surface-raised px-3 py-1 text-caption text-fg shadow-md transition-colors duration-150 hover:bg-surface-sunken"
        >
          Novas mensagens ↓
        </button>
      )}
    </div>
  )
}

function ItemDaConversa({
  mensagem,
  outroDia,
  comeca,
  paraFora,
  cheia,
  menuAberto,
  aoMenu,
  aoClicar,
  aoIrPara,
}: {
  mensagem: MensagemDoChat
  outroDia: boolean
  comeca: boolean
  paraFora: boolean
  cheia: boolean
  menuAberto: boolean
  aoMenu: (aberto: boolean) => void
  aoClicar: (evento: MouseEvent<HTMLDivElement>) => void
  aoIrPara: (id: string) => void
}) {
  const { direita, citacao } = mensagem
  const fundo = direita ? (paraFora ? 'bg-chat-outward' : 'bg-chat-mine') : 'bg-chat-theirs'

  return (
    <>
      {outroDia && (
        <li className="my-2.5 flex justify-center first:mt-1">
          <span
            title={formatDateTime(mensagem.criadaEm)}
            className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-caption text-fg-muted"
          >
            {rotuloDoDia(mensagem.criadaEm)}
          </span>
        </li>
      )}

      {/* O endereco da mensagem: o aviso da mencao, no sino, e a citacao rolam ate aqui. */}
      <li
        id={`comentario-${mensagem.id}`}
        data-mensagem
        tabIndex={-1}
        className={cn(
          'group flex items-start gap-1.5 rounded-lg outline-none',
          direita && 'flex-row-reverse',
          comeca ? 'mt-2 first:mt-0' : 'mt-0.5',
        )}
      >
        {/* A foto so na primeira da sequencia; nas outras, o lugar dela, para alinhar. As
            suas nao tem foto nem o lugar dela: encostam na borda e ganham largura. */}
        {mensagem.mostrarNome && (
          <div className="w-6 flex-none">
            {comeca && (
              <FotoDoChat nome={mensagem.nome} foto={mensagem.foto} deFora={mensagem.deFora} />
            )}
          </div>
        )}

        <div
          className={cn(
            // Expandida, a conversa vai de uma lateral a outra do card, e o balao tem um teto:
            // a linha muito comprida cansa a leitura.
            'flex min-w-0 flex-col',
            cheia ? 'max-w-[min(85%,40rem)]' : 'max-w-[85%]',
            direita ? 'items-end' : 'items-start',
          )}
        >
          {comeca && mensagem.mostrarNome && (
            <span className="mb-0.5 px-1 font-medium text-caption text-fg-muted">
              {mensagem.nome}
            </span>
          )}
          {!mensagem.mostrarNome && <span className="sr-only">{mensagem.nome}</span>}

          {/* Os tres pontos ficam fora do balao, no lado livre, sem ocupar lugar: aparecem no
              mouse e no teclado. No toque, tocar no balao ja abre o menu. */}
          <div className="relative max-w-full">
            {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: o clique e um atalho; os tres pontos ao lado fazem o mesmo pelo teclado. */}
            <div
              onClick={aoClicar}
              className={cn(
                'min-w-0 rounded-xl px-2.5 py-1 text-detail text-fg leading-normal',
                fundo,
                comeca && (direita ? 'rounded-tr-sm' : 'rounded-tl-sm'),
                mensagem.acoes.length > 0 && 'cursor-pointer',
              )}
            >
              {citacao && <Citacao citacao={citacao} aoIrPara={aoIrPara} />}
              {/* A hora na mesma linha do texto quando cabe, como num chat: a mensagem curta
                  nao vira um balao alto com a hora sozinha embaixo. */}
              <div className="flex flex-wrap items-end gap-x-2">
                <div className="min-w-0 whitespace-pre-wrap break-words">{mensagem.corpo}</div>
                {!mensagem.extra && <Hora mensagem={mensagem} />}
              </div>
              {mensagem.extra && (
                <>
                  {mensagem.extra}
                  <div className="mt-0.5 flex justify-end">
                    <Hora mensagem={mensagem} />
                  </div>
                </>
              )}
            </div>

            {mensagem.acoes.length > 0 && (
              <DropdownMenu
                width="w-48"
                align={direita ? 'end' : 'start'}
                open={menuAberto}
                onOpenChange={aoMenu}
                trigger={
                  <button
                    type="button"
                    aria-label="Ações da mensagem"
                    title="Ações da mensagem"
                    className={cn(
                      'absolute top-0.5 flex size-6 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-[opacity,background-color,color,transform] duration-150 ease-out hover:bg-surface-sunken hover:text-fg active:scale-90',
                      direita ? 'right-full mr-0.5' : 'left-full ml-0.5',
                      'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100',
                    )}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      width="16"
                      height="16"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <circle cx="8" cy="3.5" r="1.3" />
                      <circle cx="8" cy="8" r="1.3" />
                      <circle cx="8" cy="12.5" r="1.3" />
                    </svg>
                  </button>
                }
              >
                <DropdownGroup>
                  {mensagem.acoes.map((acao) => (
                    <DropdownItem key={acao.rotulo} onSelect={acao.aoEscolher}>
                      {acao.rotulo}
                    </DropdownItem>
                  ))}
                </DropdownGroup>
              </DropdownMenu>
            )}
          </div>
        </div>
      </li>
    </>
  )
}

/** A hora da mensagem, e "editado" quando ela foi corrigida. */
function Hora({ mensagem }: { mensagem: MensagemDoChat }) {
  return (
    <span className="ml-auto flex flex-none gap-1.5 text-caption text-fg-muted tabular-nums">
      {mensagem.editadaEm && (
        <span title={`Corrigido em ${formatDateTime(mensagem.editadaEm)}`}>editado</span>
      )}
      <time dateTime={mensagem.criadaEm} title={formatDateTime(mensagem.criadaEm)}>
        {HORA.format(new Date(mensagem.criadaEm))}
      </time>
    </span>
  )
}

/** A mensagem citada, em cima do texto: um toque leva ate ela. */
function Citacao({
  citacao,
  aoIrPara,
}: {
  citacao: NonNullable<MensagemDoChat['citacao']>
  aoIrPara: (id: string) => void
}) {
  const conteudo = (
    <>
      <span className="block font-medium text-caption text-fg">{citacao.nome}</span>
      <span className="line-clamp-2 block text-caption text-fg-muted">
        {citacao.texto ?? 'Esta mensagem foi apagada'}
      </span>
    </>
  )

  const classe =
    'mt-0.5 mb-1 block w-full rounded-md border-chip-blue-glyph border-l-2 bg-surface-raised/70 px-2 py-0.5 text-left'

  return citacao.id ? (
    <button
      type="button"
      onClick={() => aoIrPara(citacao.id as string)}
      aria-label={`Ir para a mensagem de ${citacao.nome}`}
      className={cn(
        classe,
        'cursor-pointer transition-colors duration-150 hover:bg-surface-raised',
      )}
    >
      {conteudo}
    </button>
  ) : (
    <span className={classe}>{conteudo}</span>
  )
}

/** A foto do Google, as iniciais sem ela, e o desenho de uma pessoa para quem relatou. */
export function FotoDoChat({
  nome,
  foto,
  deFora,
}: {
  nome: string
  foto: string | null
  deFora: boolean
}) {
  const [falhou, setFalhou] = useState<string | null>(null)
  const usar = foto && foto !== falhou ? foto : null

  return (
    <span
      aria-hidden="true"
      className="flex size-6 items-center justify-center overflow-hidden rounded-full bg-surface-sunken font-medium text-caption text-fg-muted"
    >
      {deFora ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M3 13.5a5 5 0 0 1 10 0" />
        </svg>
      ) : usar ? (
        <img
          src={usar}
          alt=""
          className="size-full"
          referrerPolicy="no-referrer"
          onError={() => setFalhou(usar)}
        />
      ) : (
        <span className="uppercase">{initialsOf(nome)}</span>
      )}
    </span>
  )
}

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const DIA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' })
const DIA_COM_ANO = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** O dia no fuso de quem le, para separar as mensagens. */
function diaDe(iso: string): string {
  const data = new Date(iso)
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`
}

/** "Hoje", "Ontem", "24 de novembro" e, de outro ano, "24 de novembro de 2025". */
export function rotuloDoDia(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso)
  const meiaNoite = (quando: Date) =>
    new Date(quando.getFullYear(), quando.getMonth(), quando.getDate()).getTime()
  const dias = Math.round((meiaNoite(agora) - meiaNoite(data)) / 86_400_000)
  if (dias === 0) return 'Hoje'
  if (dias === 1) return 'Ontem'
  return (data.getFullYear() === agora.getFullYear() ? DIA : DIA_COM_ANO).format(data)
}

/**
 * Rola ate a mensagem e a acende por um instante, como o aviso de mencao faz. Espera ela
 * aparecer por alguns quadros: quem chama pode ter acabado de trazer as anteriores.
 */
export function destacarMensagem(id: string, tentativas = 30): void {
  const alvo = document.getElementById(`comentario-${id}`)
  if (!alvo) {
    if (tentativas > 0) requestAnimationFrame(() => destacarMensagem(id, tentativas - 1))
    return
  }
  alvo.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  alvo.focus({ preventScroll: true })
  const cor = getComputedStyle(alvo).getPropertyValue('--warn-surface').trim() || 'transparent'
  alvo.animate?.(
    [
      { backgroundColor: cor, boxShadow: `0 0 0 6px ${cor}` },
      { backgroundColor: cor, boxShadow: `0 0 0 6px ${cor}`, offset: 0.7 },
      { backgroundColor: 'transparent', boxShadow: '0 0 0 6px transparent' },
    ],
    { duration: 2000, easing: 'ease-out' },
  )
}
