import * as Menu from '@radix-ui/react-dropdown-menu'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { NotificationViewModel } from '@/contracts'
import { describeError, notificationService } from '@/data'
import { revealComment } from '@/features/notifications/revealComment'
import { useUnreadCount } from '@/features/notifications/useUnreadCount'
import {
  DropdownGroup,
  DropdownHeader,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
} from '@/shared/components/DropdownMenu'
import { toast } from '@/shared/components/toastStore'
import { cn } from '@/shared/lib/cn'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'
import { openProfile, PROFILE_SOUNDS_SECTION } from '@/shared/lib/profileDialogStore'

/** O que aconteceu, na frase do aviso de card. */
const ACOES: Record<'Mention' | 'Assignment', string> = {
  Mention: 'mencionou você em',
  Assignment: 'escolheu você como responsável por',
}

/**
 * A frase do aviso do projeto — endereco novo ou envios pausados —, que nao tem card nem
 * quem fez. A pausa diz a camada, e nunca um IP: a API nao guarda nenhum.
 */
function fraseDoProjeto(aviso: NotificationViewModel): string {
  if (aviso.Kind === 'OriginPending') {
    return aviso.Subject
      ? `${aviso.Subject} mandou um relato: permitir ou bloquear?`
      : 'Chegou um relato sem dizer de que domínio veio: liberar ou apagar?'
  }
  const minutos = aviso.PausedUntil
    ? Math.max(
        1,
        Math.round((Date.parse(aviso.PausedUntil) - Date.parse(aviso.CreatedAt)) / 60_000),
      )
    : 15
  const pausa = `novos envios pausados por ${minutos} min`
  switch (aviso.LimitScope) {
    case 'Origin':
      return aviso.Subject
        ? `Muitos relatos vindos de ${aviso.Subject}: ${pausa}`
        : `Muitos relatos sem domínio de origem: ${pausa}`
    case 'Reporter':
      return `Muitos relatos de uma mesma pessoa: ${pausa}`
    case 'Ip':
      return `Muitos relatos de uma mesma conexão: ${pausa}`
    default:
      return `Muitos relatos neste projeto: ${pausa}`
  }
}

/**
 * Onde o aviso do projeto leva: os domínios esperando decisão, ou os limites — que
 * moram no "Mais opções" de Domínios, aberto sozinho pela rolagem ate o `#`.
 */
function destinoDoProjeto(aviso: NotificationViewModel): string {
  return aviso.Kind === 'OriginPending'
    ? `/projects/${aviso.Project.PublicId}/domains#dominios`
    : `/projects/${aviso.Project.PublicId}/domains#limites`
}

/** Avisos do mesmo tipo, da mesma pessoa e do mesmo projeto, dentro deste tempo, viram um. */
const JUNTAR_MS = 10 * 60_000

/** A partir de quantos seguidos eles se juntam: dois ainda se leem um a um. */
const JUNTAR_A_PARTIR_DE = 3

type Aba = 'unread' | 'all'

/** Uma linha do sino: um aviso, ou varios iguais seguidos. */
type Linha =
  | { tipo: 'um'; aviso: NotificationViewModel }
  | { tipo: 'varios'; chave: string; avisos: NotificationViewModel[] }

/**
 * Os avisos seguidos do mesmo tipo, da mesma pessoa e do mesmo projeto, perto no tempo,
 * viram uma linha: "escolheu voce como responsavel por 7 cards" — o lote que escolhe a
 * mesma pessoa em sete cards nao ocupa sete linhas. Abrir a linha mostra os sete.
 */
function agrupar(avisos: NotificationViewModel[]): Linha[] {
  const linhas: Linha[] = []
  let i = 0
  while (i < avisos.length) {
    const primeiro = avisos[i] as NotificationViewModel
    let fim = i + 1
    while (fim < avisos.length) {
      const proximo = avisos[fim] as NotificationViewModel
      // O aviso do projeto nao junta: cada um fala de um dominio, ou de uma pausa.
      const igual =
        primeiro.Card !== null &&
        proximo.Card !== null &&
        proximo.Kind === primeiro.Kind &&
        proximo.ActorName === primeiro.ActorName &&
        proximo.Project.PublicId === primeiro.Project.PublicId &&
        Date.parse(primeiro.CreatedAt) - Date.parse(proximo.CreatedAt) <= JUNTAR_MS
      if (!igual) break
      fim += 1
    }
    if (fim - i >= JUNTAR_A_PARTIR_DE) {
      linhas.push({ tipo: 'varios', chave: primeiro.PublicId, avisos: avisos.slice(i, fim) })
    } else {
      for (const aviso of avisos.slice(i, fim)) linhas.push({ tipo: 'um', aviso })
    }
    i = fim
  }
  return linhas
}

/**
 * O sino do topo: as mencoes e as vezes em que a pessoa foi escolhida como
 * responsavel, de todos os projetos em que ela esta — e, para quem administra, os
 * avisos do projeto: um dominio novo mandou relato, ou os envios foram pausados por
 * excesso. Esses levam a tela onde se decide, e nao a um card.
 *
 * **A lista e lida ao abrir**, e o numero, o tempo todo (`useUnreadCount`). **"Nao lidos"
 * e o padrao**, e "Todos" mostra tambem os lidos; cada um vem de cinquenta em cinquenta,
 * e "Ver os mais antigos" traz os seguintes — o numero do sino nunca promete o que a
 * lista nao alcanca. Abrir um aviso leva ao card e o marca como lido; o da mencao leva
 * ate o comentario. "Marcar todos como lidos" zera o numero.
 */
export function NotificationBell() {
  const navigate = useNavigate()
  const { count, setCount } = useUnreadCount()
  const [aba, setAba] = useState<Aba>('unread')
  const [avisos, setAvisos] = useState<NotificationViewModel[] | null>(null)
  const [temMais, setTemMais] = useState(false)
  const [lendoMais, setLendoMais] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set())
  const vez = useRef(0)
  const desistir = useRef<(() => void) | null>(null)
  const gatilho = useRef<HTMLButtonElement>(null)

  useEffect(() => () => desistir.current?.(), [])

  async function ler(qual: Aba) {
    const minha = ++vez.current
    setFalhou(false)
    setAvisos(null)
    setTemMais(false)
    setAbertos(new Set())
    try {
      const lista = await notificationService.listNotifications({ unreadOnly: qual === 'unread' })
      if (minha !== vez.current) return
      setAvisos(lista.Items)
      setTemMais(lista.HasMore === true)
      setCount(lista.UnreadCount)
    } catch {
      if (minha === vez.current) setFalhou(true)
    }
  }

  async function lerMais() {
    const ultimo = avisos?.[avisos.length - 1]
    if (!ultimo || lendoMais) return
    const minha = vez.current
    setLendoMais(true)
    try {
      const lista = await notificationService.listNotifications({
        unreadOnly: aba === 'unread',
        before: ultimo.PublicId,
        // Se o ultimo sumiu nesse meio-tempo, a pagina segue pela hora dele.
        beforeAt: ultimo.CreatedAt,
      })
      if (minha !== vez.current) return
      setAvisos((atuais) => {
        const tem = new Set((atuais ?? []).map((item) => item.PublicId))
        return [...(atuais ?? []), ...lista.Items.filter((item) => !tem.has(item.PublicId))]
      })
      setTemMais(lista.HasMore === true)
      setCount(lista.UnreadCount)
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setLendoMais(false)
    }
  }

  async function abrirAviso(aviso: NotificationViewModel) {
    navigate(
      aviso.Card
        ? `/projects/${aviso.Project.PublicId}/reports/${aviso.Card.PublicId}`
        : destinoDoProjeto(aviso),
    )
    desistir.current?.()
    desistir.current = aviso.Comment ? revealComment(aviso.Comment.PublicId) : null
    if (aviso.ReadAt) return
    try {
      const resposta = await notificationService.markRead(aviso.PublicId)
      setCount(resposta.UnreadCount)
      const agora = new Date().toISOString()
      setAvisos((lista) =>
        (lista ?? []).map((item) =>
          item.PublicId === aviso.PublicId ? { ...item, ReadAt: agora } : item,
        ),
      )
    } catch {
      // O card abriu; o aviso continua como nao lido, e a proxima leitura conta certo.
    }
  }

  async function lerTudo() {
    try {
      const resposta = await notificationService.markAllRead()
      setCount(resposta.UnreadCount)
      const agora = new Date().toISOString()
      setAvisos((lista) => (lista ?? []).map((item) => ({ ...item, ReadAt: item.ReadAt ?? agora })))
    } catch (falha) {
      toast.error(describeError(falha))
    }
  }

  const rotulo =
    count === 0 ? 'Avisos' : `Avisos: ${count} ${count === 1 ? 'não lido' : 'não lidos'}`

  /**
   * **O sino chama enquanto houver aviso nao lido**: balanca de tempo em tempo
   * (`animate-sino`), com um anel suave saindo da capsula (`animate-capsula-onda`). So para
   * com a lista aberta, e volta ao fechar se ainda houver nao lido. Com o movimento
   * reduzido no sistema, nada se mexe: fica a capsula com o numero.
   */
  const [listaAberta, setListaAberta] = useState(false)
  const chamando = count > 0 && !listaAberta

  // Chegou aviso enquanto ja chamava: o ciclo recomeca, e o balanco vem na hora. Pela
  // propria animacao (`currentTime`), e nao trocando a chave do desenho: dentro do gatilho
  // do Radix (`asChild`), o desenho de chave velha ficava no botao, ao lado do novo.
  const desenhoDoSino = useRef<HTMLSpanElement>(null)
  const ondaDaCapsula = useRef<HTMLSpanElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a conta e o gatilho de recomecar
  useEffect(() => {
    if (!chamando) return
    for (const elemento of [desenhoDoSino.current, ondaDaCapsula.current]) {
      for (const animacao of elemento?.getAnimations?.() ?? []) animacao.currentTime = 0
    }
  }, [count, chamando])

  /**
   * **O toque responde**: o sino da uma balancada curta (uns 400ms) a cada clique, por cima
   * do que estiver fazendo (`rotate`, que soma com o `transform` do balanco de tempo em
   * tempo), e o botao encolhe um pouco enquanto e apertado (`active:scale`). Com o
   * movimento reduzido do sistema, nada.
   */
  function balancarNoToque() {
    const desenho = desenhoDoSino.current
    if (!desenho?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // As posicoes espalhadas no tempo, com a suavizacao entre cada uma: com uma curva de
    // saida forte no todo, os picos caiam nos primeiros milissegundos, entre um quadro e
    // outro, e o balanco mal se via (5 graus).
    desenho.animate(
      [
        { rotate: '0deg', offset: 0, easing: 'ease-out' },
        { rotate: '-15deg', offset: 0.18, easing: 'ease-in-out' },
        { rotate: '12deg', offset: 0.4, easing: 'ease-in-out' },
        { rotate: '-6deg', offset: 0.62, easing: 'ease-in-out' },
        { rotate: '2deg', offset: 0.82, easing: 'ease-in-out' },
        { rotate: '0deg', offset: 1 },
      ],
      { duration: 460 },
    )
  }

  // No celular o menu vai de uma borda a outra, a 8 de cada lado (a folga dos menus): com
  // 2rem a menos, ele ficava a 8 da esquerda e a 24 da direita.
  return (
    <DropdownMenu
      width="w-[min(24rem,calc(100vw-1rem))]"
      onOpenChange={(aberto) => {
        setListaAberta(aberto)
        if (aberto) void ler(aba)
      }}
      trigger={
        // O botao e so a area do toque (44 no celular) e o anel de foco; o desenho mora na
        // capsula de dentro, que muda com os avisos. `group` faz o aperto do botao encolher a
        // capsula (`group-active`).
        <button
          ref={gatilho}
          type="button"
          aria-label={rotulo}
          onPointerDown={balancarNoToque}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter' || evento.key === ' ') balancarNoToque()
          }}
          className="group relative flex h-8 min-w-8 items-center justify-center rounded-full max-sm:h-11 max-sm:min-w-11 sm:pointer-coarse:h-10 sm:pointer-coarse:min-w-10"
        >
          {/* **Com aviso nao lido, uma capsula com o sino e o numero lado a lado**, num fundo
              verde suave: o numero nunca fica por cima do icone. O selo no ombro do sino, com
              o numero dentro, cobria o desenho e, com dois algarismos, avancava sobre a foto.
              Sem aviso, o sino de sempre. */}
          <span
            className={cn(
              'relative flex h-8 items-center justify-center gap-1.5 transition-[background-color,color,scale,padding] duration-200 ease-out group-active:scale-[0.94] motion-reduce:transition-none motion-reduce:group-active:scale-100',
              count > 0
                ? 'rounded-full border border-active/35 bg-active/12 pr-3 pl-2.5 text-fg hover:bg-active/18'
                : 'w-8 rounded-lg border border-border bg-surface-raised text-fg-muted hover:bg-surface-sunken hover:text-fg max-sm:border-transparent max-sm:bg-transparent',
            )}
          >
            {/* O anel que sai da capsula, junto com o balanco. */}
            {chamando && (
              <span
                ref={ondaDaCapsula}
                aria-hidden
                className="pointer-events-none absolute inset-0 animate-capsula-onda rounded-full"
              />
            )}
            <span
              ref={desenhoDoSino}
              className={cn(
                'flex origin-[50%_15%]',
                count > 0 && 'text-active',
                chamando && 'animate-sino',
              )}
            >
              <svg
                viewBox="0 0 16 16"
                className="size-4 max-sm:size-[1.125rem]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4 6.5a4 4 0 0 1 8 0c0 3 1.2 4.2 1.5 4.5h-11C2.8 10.7 4 9.5 4 6.5ZM6.5 13a1.6 1.6 0 0 0 3 0" />
              </svg>
            </span>
            {count > 0 && (
              <span
                aria-hidden
                className="animate-fade-in font-semibold text-detail leading-none tabular-nums"
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </span>
        </button>
      }
    >
      <DropdownHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-body text-fg">Avisos</div>
          {/* As abas sao itens do menu: as setas chegam nelas, e escolher nao fecha o sino. */}
          <Menu.RadioGroup
            value={aba}
            onValueChange={(valor) => {
              const nova = valor as Aba
              setAba(nova)
              void ler(nova)
            }}
            className="flex rounded-lg border border-border p-0.5"
            aria-label="Quais avisos"
          >
            {(['unread', 'all'] as const).map((opcao) => (
              <Menu.RadioItem
                key={opcao}
                value={opcao}
                onSelect={(evento) => evento.preventDefault()}
                className={cn(
                  // No mouse, so o texto acende; o anel de foco do painel fica para o
                  // teclado, por dentro da aba para nao bater na borda do grupo. No toque a
                  // aba cresce ate 40, com o texto no meio.
                  'flex cursor-pointer items-center rounded-md px-2.5 py-1 text-caption transition-colors duration-150 focus-visible:-outline-offset-2 pointer-coarse:min-h-10',
                  aba === opcao
                    ? 'bg-surface-sunken font-medium text-fg'
                    : 'text-fg-muted data-[highlighted]:text-fg',
                )}
              >
                {opcao === 'unread' ? `Não lidos (${count})` : 'Todos'}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </div>
        <div className="mt-0.5 text-caption text-fg-muted">
          Menções, cards que passaram para você e avisos do projeto
        </div>
      </DropdownHeader>

      <DropdownSeparator />

      {/* Em tela baixa (o celular deitado) o menu inteiro ja rola na altura que sobra:
          com a lista rolando tambem, eram duas rolagens, uma dentro da outra. */}
      <div className="max-h-[min(28rem,65vh)] overflow-y-auto [@media(max-height:30rem)]:max-h-none">
        <DropdownGroup>
          {avisos === null && !falhou && (
            <p className="px-2.5 py-2 text-detail text-fg-muted">Carregando…</p>
          )}
          {falhou && (
            <>
              <p className="px-2.5 pt-2 pb-1 text-detail text-fg-muted">
                Não deu para carregar os avisos.
              </p>
              <ItemQueFica onSelect={() => void ler(aba)}>Tentar de novo</ItemQueFica>
            </>
          )}
          {avisos?.length === 0 && (
            <p className="px-2.5 py-2 text-detail text-fg-muted">
              {aba === 'unread' ? 'Nenhum aviso não lido.' : 'Nenhum aviso por aqui.'}
            </p>
          )}
          {avisos &&
            agrupar(avisos).map((linha) =>
              linha.tipo === 'um' ? (
                <DropdownItem
                  key={linha.aviso.PublicId}
                  onSelect={() => void abrirAviso(linha.aviso)}
                >
                  <Aviso aviso={linha.aviso} />
                </DropdownItem>
              ) : (
                <Grupo
                  key={linha.chave}
                  avisos={linha.avisos}
                  aberto={abertos.has(linha.chave)}
                  aoAlternar={() =>
                    setAbertos((atuais) => {
                      const novos = new Set(atuais)
                      if (novos.has(linha.chave)) novos.delete(linha.chave)
                      else novos.add(linha.chave)
                      return novos
                    })
                  }
                  aoAbrir={(aviso) => void abrirAviso(aviso)}
                />
              ),
            )}
          {avisos && temMais && (
            <ItemQueFica onSelect={() => void lerMais()}>
              {lendoMais
                ? 'Carregando…'
                : aba === 'unread'
                  ? 'Ver os não lidos mais antigos'
                  : 'Ver os mais antigos'}
            </ItemQueFica>
          )}
        </DropdownGroup>
      </div>

      <DropdownSeparator />

      <DropdownGroup>
        {/* So com a lista na tela: marcar sem ver o que se marca nao e escolha. */}
        {avisos !== null && count > 0 && (
          <DropdownItem quiet onSelect={() => void lerTudo()}>
            Marcar todos como lidos
          </DropdownItem>
        )}
        {/* O perfil abre por cima da tela, ja nos sons, e o foco volta ao sino ao fechar. */}
        <DropdownItem
          quiet
          onSelect={() =>
            openProfile({ section: PROFILE_SOUNDS_SECTION, returnFocusTo: gatilho.current })
          }
        >
          Preferências de aviso
        </DropdownItem>
      </DropdownGroup>
    </DropdownMenu>
  )
}

/** Um item do sino que nao fecha o menu: carregar mais, tentar de novo, abrir um grupo. */
function ItemQueFica({
  onSelect,
  children,
  className,
  expandido,
}: {
  onSelect: () => void
  children: ReactNode
  className?: string
  expandido?: boolean
}) {
  return (
    <Menu.Item
      onSelect={(evento) => {
        evento.preventDefault()
        onSelect()
      }}
      aria-expanded={expandido}
      className={cn(
        // No toque, a altura dos itens do menu (`DropdownItem`).
        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none pointer-coarse:py-2.5',
        'text-detail text-fg-muted data-[highlighted]:bg-surface-sunken data-[highlighted]:text-fg',
        className,
      )}
    >
      {children}
    </Menu.Item>
  )
}

/**
 * Um aviso em duas linhas — tres, na mencao: a frase, com o titulo cortado; o comeco do
 * comentario, entre aspas; e o projeto com a hora. **O nao lido vem em negrito**, alem
 * do ponto: no tema escuro, o ponto sozinho mal se via.
 */
function Aviso({ aviso }: { aviso: NotificationViewModel }) {
  const lido = aviso.ReadAt !== null
  return (
    <>
      <Ponto lido={lido} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-detail leading-snug',
            lido ? 'text-fg-muted' : 'font-semibold text-fg',
          )}
        >
          {aviso.Card && (aviso.Kind === 'Mention' || aviso.Kind === 'Assignment') ? (
            <>
              {aviso.ActorName ?? 'Alguém do time'} {ACOES[aviso.Kind]}{' '}
              <span className="tabular-nums">#{aviso.Card.Number}</span> {aviso.Card.Headline}
            </>
          ) : (
            fraseDoProjeto(aviso)
          )}
        </span>
        {aviso.Comment && (
          <span className="mt-0.5 block truncate text-caption text-fg-muted italic">
            “{aviso.Comment.Excerpt}”
          </span>
        )}
        <Rodape aviso={aviso} />
      </span>
    </>
  )
}

/** Varios avisos iguais seguidos, numa linha; aberta, cada um aparece embaixo. */
function Grupo({
  avisos,
  aberto,
  aoAlternar,
  aoAbrir,
}: {
  avisos: NotificationViewModel[]
  aberto: boolean
  aoAlternar: () => void
  aoAbrir: (aviso: NotificationViewModel) => void
}) {
  const primeiro = avisos[0] as NotificationViewModel
  const lido = avisos.every((aviso) => aviso.ReadAt !== null)
  const cards = new Set(avisos.map((aviso) => aviso.Card?.PublicId)).size
  const frase =
    primeiro.Kind === 'Assignment'
      ? `escolheu você como responsável por ${cards} cards`
      : `mencionou você ${avisos.length} vezes`
  return (
    <>
      <ItemQueFica onSelect={aoAlternar} expandido={aberto} className="items-start text-body">
        <Ponto lido={lido} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-detail leading-snug',
              lido ? 'text-fg-muted' : 'font-semibold text-fg',
            )}
          >
            {primeiro.ActorName ?? 'Alguém do time'} {frase}
          </span>
          <Rodape aviso={primeiro} />
        </span>
        <span className="mt-0.5 flex-none text-caption text-fg-muted">
          {aberto ? 'Esconder' : 'Ver'}
        </span>
      </ItemQueFica>
      {aberto &&
        avisos.map((aviso) => (
          <DropdownItem key={aviso.PublicId} onSelect={() => aoAbrir(aviso)}>
            <span className="w-3 flex-none" aria-hidden />
            <Aviso aviso={aviso} />
          </DropdownItem>
        ))}
    </>
  )
}

function Ponto({ lido }: { lido: boolean }) {
  return (
    <span
      className={cn(
        'mt-1.5 size-2 flex-none self-start rounded-full',
        lido ? 'bg-transparent' : 'bg-accent ring-1 ring-border',
      )}
    />
  )
}

function Rodape({ aviso }: { aviso: NotificationViewModel }) {
  return (
    <span className="mt-0.5 block truncate text-caption text-fg-muted">
      {aviso.Project.Name},{' '}
      <time dateTime={aviso.CreatedAt} title={formatDateTime(aviso.CreatedAt)}>
        {formatRelative(aviso.CreatedAt)}
      </time>
      {!aviso.ReadAt && <span className="sr-only">, não lido</span>}
    </span>
  )
}
