import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type {
  InvitationUnavailableReason,
  ProjectInvitationsViewModel,
  ProjectInvitationViewModel,
  ProjectRole,
} from '@/contracts'
import { MAX_INVITATION_VALIDITY_DAYS, MIN_INVITATION_VALIDITY_DAYS } from '@/contracts'
import { describeError, projectTeamService } from '@/data'
import { LoadFailed, LoadingRows, roleName } from '@/features/projects/membersParts'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Select } from '@/shared/components/Select'
import { RadioGroup, type RadioOption } from '@/shared/components/SettingsControls'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { cn } from '@/shared/lib/cn'
import { formatDate, formatRelative } from '@/shared/lib/datetime'

/** O campo do e-mail: o "Convidar alguém" da aba Time leva o foco ate ele. */
export const INVITE_FIELD_ID = 'email-do-convite'
/** A ancora do prazo: a busca da configuracao leva ate ela, ja aberta. */
const VALIDITY_ID = 'prazo-do-convite'

/** Prazos que cobrem o comum; o atual entra na lista se for outro. */
const VALIDITY_OPTIONS = [1, 2, 3, 5, 7, 10, 14, 30]

/** Quanto tempo a tela acompanha um e-mail na fila antes de parar de perguntar. */
const POLL_INTERVAL_MS = 2000
const POLL_MAX_TRIES = 15

/** O bastante para pegar o erro de digitacao; o resto a API confere. */
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Em blocos, e nao numa caixa: o papel e escolhido lendo o que cada um faz. */
const ROLE_TILES: RadioOption<ProjectRole>[] = [
  { value: 'Member', label: 'Membro', note: 'trabalha nos cards', className: 'min-w-36 px-3' },
  {
    value: 'Administrator',
    label: 'Administrador',
    note: 'configura e convida',
    className: 'min-w-36 px-3',
  },
]

/** O que a aba de Convites mostra no titulo: quantos, e se algum pede acao. */
export interface InvitationsSummary {
  count: number
  attention: boolean
}

/** Nao saiu ou venceu: so reenviar resolve. */
function needsAttention(invitation: ProjectInvitationViewModel): boolean {
  return invitation.EmailStatus === 'Failed' || invitation.IsExpired
}

export function InvitationsSection({
  projectPublicId,
  teamEmails,
  onSummary,
}: {
  projectPublicId: string
  /** Os e-mails do time, para o "ja esta no time" sair antes de ir a API. */
  teamEmails: string[] | null
  onSummary: (summary: InvitationsSummary | null) => void
}) {
  /**
   * Quantas vezes a lista mudou por um clique daqui — convidar, reenviar, cancelar.
   * Cada leitura leva o numero de quando saiu: a que saiu antes de um clique chega
   * sem ele, e por cima traria de volta o convite que acabou de ser cancelado.
   */
  const edits = useRef(0)

  const { data, loading, failed, reload, refresh } = useAsyncResource(
    useCallback(async () => {
      const edit = edits.current
      return { list: await projectTeamService.listInvitations(projectPublicId), edit }
    }, [projectPublicId]),
  )

  const [view, setView] = useState<ProjectInvitationsViewModel | null>(null)
  useEffect(() => {
    // Lida antes do ultimo clique: nao vale, e a proxima ja sai com ele.
    if (data !== null && data.edit !== edits.current) {
      refresh()
      return
    }
    setView(data?.list ?? null)
  }, [data, refresh])

  useEffect(() => {
    onSummary(
      view === null
        ? null
        : { count: view.Items.length, attention: view.Items.some(needsAttention) },
    )
  }, [view, onSummary])

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProjectRole>('Member')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [resending, setResending] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<ProjectInvitationViewModel | null>(null)

  /** Convidar, reenviar e "Atualizar" comecam outra rodada de perguntas, com o tempo inteiro. */
  const [round, setRound] = useState(0)
  /** A rodada acabou com e-mail ainda na fila: a tela para de dizer "enviando". */
  const [stalled, setStalled] = useState(false)

  // Enquanto algum e-mail esta na fila, a tela pergunta de novo — quem convidou
  // quer ver "enviado" sem recarregar. Para sozinha depois de meio minuto: o
  // e-mail preso nao prende a tela, e a linha passa a "Ainda na fila", com
  // "Atualizar" para perguntar de novo e "Reenviar" ao lado.
  const waiting = view?.Items.some(
    (item) => item.EmailStatus === 'Pending' || item.EmailStatus === 'Sending',
  )
  useEffect(() => {
    // `round` so existe para um convite novo recomecar a contagem: com outro ja
    // esperando, `waiting` nao muda, e o novo ficaria sem pergunta nenhuma.
    void round
    setStalled(false)
    if (!waiting) return
    let tries = 0
    const timer = setInterval(() => {
      tries += 1
      refresh()
      if (tries >= POLL_MAX_TRIES) {
        clearInterval(timer)
        setStalled(true)
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [waiting, refresh, round])

  function askAgain() {
    setRound((value) => value + 1)
    refresh()
  }

  function upsert(invitation: ProjectInvitationViewModel) {
    edits.current += 1
    setRound((value) => value + 1)
    setView((current) =>
      current
        ? {
            ...current,
            Items: [
              invitation,
              ...current.Items.filter((item) => item.PublicId !== invitation.PublicId),
            ],
          }
        : current,
    )
  }

  /**
   * O que a tela ja sabe sem perguntar: endereco incompleto, pessoa do time, convite
   * aberto. A resposta sai na hora, no campo, e a API so recebe o que tem chance.
   */
  function localProblem(value: string): string | null {
    if (!EMAIL_FORMAT.test(value))
      return 'Esse endereço não parece um e-mail. Confira se ficou como nome@exemplo.com.'
    const lower = value.toLowerCase()
    if (teamEmails?.includes(lower)) return 'Essa pessoa já está no time.'
    if (view?.Items.some((item) => item.Email.toLowerCase() === lower))
      return 'Essa pessoa já tem um convite aberto. Para mandar de novo, use Reenviar na lista.'
    return null
  }

  async function invite() {
    const value = email.trim()
    if (value.length === 0 || sending) return

    const problem = localProblem(value)
    if (problem) {
      setError(problem)
      return
    }

    setSending(true)
    setError(null)

    try {
      upsert(
        await projectTeamService.createInvitation(projectPublicId, { Email: value, Role: role }),
      )
      setEmail('')
      toast.done('Convite na fila. O e-mail sai em instantes.')
    } catch (failure) {
      // Limite por hora e o que mais a API recusar: tudo e do campo — ha o que
      // corrigir, e a correcao e ali.
      setError(describeError(failure))
    } finally {
      setSending(false)
    }
  }

  async function resend(invitation: ProjectInvitationViewModel) {
    if (resending) return
    setResending(invitation.PublicId)

    try {
      upsert(await projectTeamService.resendInvitation(projectPublicId, invitation.PublicId))
      toast.done('Convite reenviado. O link anterior deixou de valer.')
    } catch (failure) {
      toast.error(describeError(failure))
    } finally {
      setResending(null)
    }
  }

  async function revoke(invitation: ProjectInvitationViewModel) {
    try {
      await projectTeamService.revokeInvitation(projectPublicId, invitation.PublicId)
      edits.current += 1
      setView((current) =>
        current
          ? {
              ...current,
              Items: current.Items.filter((item) => item.PublicId !== invitation.PublicId),
            }
          : current,
      )
      toast.done('Convite cancelado. O link deixou de valer.')
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  async function saveValidity(days: number): Promise<boolean> {
    try {
      const saved = await projectTeamService.saveTeamSettings(projectPublicId, {
        InvitationValidityDays: days,
      })
      setView((current) =>
        current ? { ...current, ValidityDays: saved.InvitationValidityDays } : current,
      )
      toast.done('Prazo salvo. Vale para o próximo convite.')
      return true
    } catch (failure) {
      toast.error(describeError(failure))
      return false
    }
  }

  return (
    <section aria-labelledby="convidar">
      <h2 id="convidar" className="mb-1 font-semibold text-lead">
        Convidar alguém
      </h2>

      {failed && (
        <div className="mt-3">
          <LoadFailed
            text="Não deu para carregar os convites agora. Os que já saíram continuam valendo."
            onRetry={reload}
          />
        </div>
      )}

      {loading && <LoadingRows />}

      {view !== null && (
        <>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            O convite vai por e-mail, e quem recebe entra com a conta Google do mesmo endereço.
          </p>

          {view.CanInvite ? (
            <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4">
              <TextField
                id={INVITE_FIELD_ID}
                ariaLabel="E-mail de quem vai entrar"
                value={email}
                onChange={(value) => {
                  setEmail(value)
                  if (error) setError(null)
                }}
                placeholder="nome@exemplo.com"
                error={error}
                maxLength={320}
                disabled={sending}
                onSubmit={invite}
              />
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="mb-1.5 text-detail text-fg-muted">Entra como</div>
                  <RadioGroup<ProjectRole>
                    label="Papel de quem vai entrar"
                    look="tile"
                    value={role}
                    onChange={setRole}
                    options={ROLE_TILES.map((option) => ({ ...option, disabled: sending }))}
                  />
                </div>
                <Button
                  variant="primary"
                  disabled={email.trim().length === 0 || sending}
                  onClick={invite}
                >
                  {sending ? 'Convidando…' : 'Convidar'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-border border-dashed px-3.5 py-3 text-detail text-fg-muted leading-relaxed">
              {unavailableText(view.UnavailableReason)}
            </div>
          )}

          <ValidityHint days={view.ValidityDays} onSave={saveValidity} />

          <h3 className="mt-8 mb-2 font-medium text-detail text-fg">Convites abertos</h3>
          {view.Items.length === 0 ? (
            <p className="text-detail text-fg-muted">
              Nenhum convite aberto. Quem aceita sai daqui e aparece no Time.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-border bg-surface-raised">
              {view.Items.map((invitation) => (
                <li
                  key={invitation.PublicId}
                  className="flex animate-fade-in flex-wrap items-center gap-x-3 gap-y-2 border-border border-b px-4 py-3 transition-colors duration-150 last:border-b-0 hover:bg-surface-sunken motion-reduce:transition-none"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body text-fg">{invitation.Email}</div>
                    <InvitationStatus
                      invitation={invitation}
                      stalled={stalled}
                      onAskAgain={askAgain}
                    />
                  </div>
                  {/* No celular, papel e botoes descem para a linha de baixo: ao lado
                      deles, o endereco ficava com tres letras. */}
                  <div className="flex flex-none items-center gap-1 max-sm:basis-full">
                    <span className="mr-2 flex-none rounded-md bg-surface-sunken px-2 py-0.5 font-medium text-caption text-fg-muted">
                      {roleName(invitation.Role)}
                    </span>
                    {/* Reenviar vale em qualquer situacao: e o que solta um e-mail
                        preso, e o reenvio no meio de um envio so troca o link. Em
                        destaque so quando e a unica saida — nao saiu ou venceu. */}
                    <Button
                      size="sm"
                      variant={needsAttention(invitation) ? 'secondary' : 'ghost'}
                      aria-label={`Reenviar o convite para ${invitation.Email}`}
                      disabled={resending === invitation.PublicId}
                      onClick={() => void resend(invitation)}
                    >
                      Reenviar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Cancelar o convite para ${invitation.Email}`}
                      onClick={() => setRevoking(invitation)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title={`Cancelar o convite de ${revoking?.Email ?? 'esta pessoa'}?`}
        description="O link do e-mail deixa de valer. Se mudar de ideia, é só convidar de novo."
        confirmLabel="Cancelar convite"
        onConfirm={() => (revoking ? revoke(revoking) : undefined)}
      />
    </section>
  )
}

/**
 * "Vale por 7 dias · mudar": o prazo e uma dica ao lado do convite, e nao uma linha
 * de configuracao no meio dele. "mudar" abre a escolha ali mesmo, e a escolha salva
 * na hora. A busca da configuracao leva a `#prazo-do-convite`, que chega aberto.
 */
function ValidityHint({
  days,
  onSave,
}: {
  days: number
  onSave: (days: number) => Promise<boolean>
}) {
  const { hash, key } = useLocation()
  const asked = hash === `#${VALIDITY_ID}`
  const [open, setOpen] = useState(asked)
  // Cada navegacao nova ate a ancora abre de novo, mesmo com a tela ja aberta.
  const [seenKey, setSeenKey] = useState(key)
  if (seenKey !== key) {
    setSeenKey(key)
    if (asked) setOpen(true)
  }

  // O foco acompanha a troca: abriu, vai para a escolha; salvou, volta ao "mudar".
  // Compara com o anterior para o modo estrito do React nao roubar o foco ao montar.
  const change = useRef<HTMLButtonElement>(null)
  const before = useRef(open)
  useEffect(() => {
    if (before.current === open) return
    before.current = open
    if (open) document.getElementById(VALIDITY_ID)?.focus()
    else change.current?.focus()
  }, [open])

  const options = [...new Set([...VALIDITY_OPTIONS, days])]
    .filter((item) => item >= MIN_INVITATION_VALIDITY_DAYS && item <= MAX_INVITATION_VALIDITY_DAYS)
    .sort((a, b) => a - b)
    .map((item) => ({ value: String(item), label: daysLabel(item) }))

  if (!open) {
    return (
      <p className="text-detail text-fg-muted">
        Vale por {daysLabel(days)} ·{' '}
        <button
          ref={change}
          type="button"
          aria-label="Mudar o prazo do convite"
          onClick={() => setOpen(true)}
          className="rounded text-fg underline underline-offset-4 hover:text-fg-muted"
        >
          mudar
        </button>
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-detail text-fg-muted">
      <span>O convite vale por</span>
      <Select
        id={VALIDITY_ID}
        size="sm"
        ariaLabel="Prazo do convite"
        value={String(days)}
        onChange={(value) =>
          void onSave(Number(value)).then((saved) => {
            if (saved) setOpen(false)
          })
        }
        options={options}
      />
      <span>a partir do envio. Mudar vale para o próximo convite.</span>
    </div>
  )
}

function daysLabel(days: number): string {
  return days === 1 ? '1 dia' : `${days} dias`
}

type EmailState = 'queued' | 'stalled' | 'sent' | 'failed' | 'expired'

/** Onde esta o e-mail. Nao saiu vem antes de vencido: reenviar resolve os dois. */
function emailState(invitation: ProjectInvitationViewModel, stalled: boolean): EmailState {
  if (invitation.EmailStatus === 'Failed') return 'failed'
  if (invitation.EmailStatus === 'Pending' || invitation.EmailStatus === 'Sending')
    return stalled ? 'stalled' : 'queued'
  if (invitation.IsExpired) return 'expired'
  return 'sent'
}

/** O selo de cada estado, no desenho do ponto de status (o do Ativo/Arquivado). */
const BADGES: Record<EmailState, { label: string; box: string; dot: string }> = {
  queued: {
    label: 'Na fila',
    box: 'border-border text-fg-muted',
    dot: 'bg-muted-dot animate-pulse motion-reduce:animate-none',
  },
  stalled: { label: 'Ainda na fila', box: 'border-border text-fg-muted', dot: 'bg-muted-dot' },
  sent: {
    label: 'Enviado',
    box: 'border-chip-green-border bg-chip-green-surface text-chip-green-fg',
    dot: 'bg-chip-green-glyph',
  },
  failed: {
    label: 'Não saiu',
    box: 'border-chip-red-border bg-chip-red-surface text-chip-red-fg',
    dot: 'bg-chip-red-glyph',
  },
  expired: {
    label: 'Venceu',
    box: 'border-warn-border bg-warn-surface text-warn-fg',
    dot: 'bg-warn-fg',
  },
}

/**
 * Onde esta o e-mail, num selo, com o que fazer ao lado e quem convidou. Depois de
 * meio minuto na fila a linha deixa de dizer "na fila" como se fosse andar: diz
 * "Ainda na fila" e oferece "Atualizar".
 */
function InvitationStatus({
  invitation,
  stalled,
  onAskAgain,
}: {
  invitation: ProjectInvitationViewModel
  stalled: boolean
  onAskAgain: () => void
}) {
  const state = emailState(invitation, stalled)
  const badge = BADGES[state]

  const detail =
    state === 'queued'
      ? 'o e-mail sai em instantes'
      : state === 'sent'
        ? `${formatRelative(invitation.EmailSentAt)} · vale até ${formatDate(invitation.ExpiresAt)}`
        : state === 'failed'
          ? 'reenvie para tentar de novo'
          : state === 'expired'
            ? 'reenvie para valer de novo'
            : null
  const invitedBy = `convidado ${
    invitation.InvitedByName ? `por ${invitation.InvitedByName} ` : ''
  }${formatRelative(invitation.CreatedAt)}`

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-fg-muted">
      <span
        className={cn(
          'inline-flex flex-none items-center gap-1.5 rounded-full border px-2 py-px font-medium',
          badge.box,
        )}
      >
        <span aria-hidden className={cn('size-1.5 flex-none rounded-full', badge.dot)} />
        {badge.label}
      </span>
      {state === 'stalled' && (
        <button
          type="button"
          onClick={onAskAgain}
          className="rounded font-medium text-fg underline underline-offset-4 hover:text-fg-muted"
        >
          Atualizar
        </button>
      )}
      <span>{[detail, invitedBy].filter(Boolean).join(' · ')}</span>
    </div>
  )
}

function unavailableText(reason: InvitationUnavailableReason | null): string {
  const motivo =
    reason === 'QueueNotConfigured'
      ? 'a fila de envio não está configurada'
      : reason === 'PanelUrlNotConfigured'
        ? 'o endereço do painel, que vai no link do e-mail, não está configurado'
        : 'o envio de e-mail não está configurado'

  return `Não dá para convidar agora: neste servidor, ${motivo}. Quem cuida da instalação resolve isso na configuração do servidor.`
}
