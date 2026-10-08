import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { NotificationViewModel } from '@/contracts'
import { describeError, notificationService } from '@/data'
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

/**
 * O sino do topo: as menções e as vezes em que a pessoa foi escolhida como
 * responsável, de todos os projetos em que ela está.
 *
 * **A lista é lida ao abrir**, e o número, o tempo todo (`useUnreadCount`). Abrir um
 * aviso leva ao card e o marca como lido; "Marcar todos como lidos" zera o número.
 */
export function NotificationBell() {
  const navigate = useNavigate()
  const { count, setCount } = useUnreadCount()
  const [avisos, setAvisos] = useState<NotificationViewModel[] | null>(null)
  const [falhou, setFalhou] = useState(false)

  async function aoAbrir(aberto: boolean) {
    if (!aberto) return
    setFalhou(false)
    try {
      const lista = await notificationService.listNotifications()
      setAvisos(lista.Items)
      setCount(lista.UnreadCount)
    } catch {
      setFalhou(true)
    }
  }

  async function abrirAviso(aviso: NotificationViewModel) {
    navigate(`/projects/${aviso.Project.PublicId}/reports/${aviso.Card.PublicId}`)
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
      // O card abriu; o aviso continua como não lido, e a próxima leitura conta certo.
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
    <>
      <DropdownMenu
        width="w-[min(22rem,calc(100vw-2rem))]"
        onOpenChange={(aberto) => void aoAbrir(aberto)}
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
          <div className="font-medium text-body text-fg">Avisos</div>
          <div className="mt-0.5 text-caption text-fg-muted">
            Menções e cards de que você é responsável
          </div>
        </DropdownHeader>

        <DropdownSeparator />

        <div className="max-h-96 overflow-y-auto">
          <DropdownGroup>
            {avisos === null && !falhou && (
              <p className="px-2.5 py-2 text-detail text-fg-muted">Carregando…</p>
            )}
            {falhou && (
              <p className="px-2.5 py-2 text-detail text-fg-muted">
                Não deu para carregar os avisos.
              </p>
            )}
            {avisos?.length === 0 && (
              <p className="px-2.5 py-2 text-detail text-fg-muted">Nenhum aviso por aqui.</p>
            )}
            {avisos?.map((aviso) => (
              <DropdownItem key={aviso.PublicId} onSelect={() => void abrirAviso(aviso)}>
                <span
                  className={cn(
                    'mt-1.5 size-2 flex-none self-start rounded-full',
                    aviso.ReadAt ? 'bg-transparent' : 'bg-accent',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-detail leading-snug',
                      aviso.ReadAt ? 'text-fg-muted' : 'text-fg',
                    )}
                  >
                    <span className="font-medium">{aviso.ActorName ?? 'Alguém do time'}</span>{' '}
                    {ACOES[aviso.Kind]} <span className="font-mono">#{aviso.Card.Number}</span>{' '}
                    {aviso.Card.Headline}
                  </span>
                  <span className="mt-0.5 block text-caption text-fg-muted">
                    {aviso.Project.Name} ·{' '}
                    <time dateTime={aviso.CreatedAt} title={formatDateTime(aviso.CreatedAt)}>
                      {formatRelative(aviso.CreatedAt)}
                    </time>
                    {!aviso.ReadAt && <span className="sr-only"> · não lido</span>}
                  </span>
                </span>
              </DropdownItem>
            ))}
          </DropdownGroup>
        </div>

        <DropdownSeparator />

        <DropdownGroup>
          {count > 0 && (
            <DropdownItem quiet onSelect={() => void lerTudo()}>
              Marcar todos como lidos
            </DropdownItem>
          )}
          <DropdownItem quiet onSelect={() => navigate('/profile')}>
            Preferências de aviso
          </DropdownItem>
        </DropdownGroup>
      </DropdownMenu>
    </>
  )
}
