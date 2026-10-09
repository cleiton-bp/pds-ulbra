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

/** O que aconteceu, na frase do aviso. */
const ACOES: Record<NotificationViewModel['Kind'], string> = {
  Mention: 'mencionou você em',
  Assignment: 'escolheu você como responsável por',
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
      const igual =
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
 * responsavel, de todos os projetos em que ela esta.
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
    navigate(`/projects/${aviso.Project.PublicId}/reports/${aviso.Card.PublicId}`)
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

  return (
    <DropdownMenu
      width="w-[min(24rem,calc(100vw-2rem))]"
      onOpenChange={(aberto) => {
        if (aberto) void ler(aba)
      }}
      trigger={
        <button
          type="button"
          aria-label={rotulo}
          className="relative flex size-8 items-center justify-center rounded-lg border border-border bg-surface-raised text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
        >
          <svg
            viewBox="0 0 16 16"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M4 6.5a4 4 0 0 1 8 0c0 3 1.2 4.2 1.5 4.5h-11C2.8 10.7 4 9.5 4 6.5ZM6.5 13a1.6 1.6 0 0 0 3 0" />
          </svg>
          {count > 0 && (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-semibold text-accent-fg text-caption leading-none tabular-nums"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
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
                  'cursor-pointer rounded-md px-2.5 py-1 text-caption outline-none',
                  'data-[highlighted]:ring-2 data-[highlighted]:ring-accent',
                  aba === opcao ? 'bg-surface-sunken font-medium text-fg' : 'text-fg-muted',
                )}
              >
                {opcao === 'unread' ? `Não lidos (${count})` : 'Todos'}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </div>
        <div className="mt-0.5 text-caption text-fg-muted">
          Menções e cards que passaram para você
        </div>
      </DropdownHeader>

      <DropdownSeparator />

      <div className="max-h-[min(28rem,65vh)] overflow-y-auto">
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
        <DropdownItem quiet onSelect={() => navigate('/profile')}>
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
        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none',
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
          {aviso.ActorName ?? 'Alguém do time'} {ACOES[aviso.Kind]}{' '}
          <span className="font-mono">#{aviso.Card.Number}</span> {aviso.Card.Headline}
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
  const cards = new Set(avisos.map((aviso) => aviso.Card.PublicId)).size
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
      {aviso.Project.Name} ·{' '}
      <time dateTime={aviso.CreatedAt} title={formatDateTime(aviso.CreatedAt)}>
        {formatRelative(aviso.CreatedAt)}
      </time>
      {!aviso.ReadAt && <span className="sr-only"> · não lido</span>}
    </span>
  )
}
