import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { InvitationPreviewViewModel } from '@/contracts'
import { describeError, isPanelError, projectTeamService } from '@/data'
import { useSessionStore } from '@/features/auth/sessionStore'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { formatDate } from '@/shared/lib/datetime'

/**
 * A pagina que o link do e-mail abre: `/invite#t=...`.
 *
 * **O link vem depois do `#`**, e por isso nunca chega a servidor nenhum na hora de
 * abrir a pagina — nem a log de proxy. Daqui ele vai para a API no corpo do
 * pedido, e so.
 *
 * **Sem sessao, quem desenha a entrada e o `RequireSession`, no mesmo endereco** —
 * e o `#` sobrevive ao login. Por isso aqui ja existe sempre alguem logado, e a
 * pergunta e outra: e a pessoa convidada? Com a conta errada a pagina nao mostra
 * nada do projeto, so a pista do endereco e o caminho para trocar de conta.
 */
export function InviteScreen() {
  const { hash } = useLocation()
  const token =
    new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('t')?.trim() ?? ''

  return (
    <div className="px-5 py-10 lg:pt-16">
      <div className="mx-auto w-full max-w-120 rounded-xl border border-border bg-surface-raised p-6">
        {token ? (
          <Invitation token={token} />
        ) : (
          <Message title="Este link está incompleto" text={INCOMPLETE} />
        )}
      </div>
    </div>
  )
}

const INCOMPLETE =
  'Ele pode ter sido cortado na hora de copiar. Abra o link direto do e-mail do convite, até o último caractere.'

type InvitationState =
  | { kind: 'loading' }
  | { kind: 'ready'; preview: InvitationPreviewViewModel }
  /** O 404 e uma resposta, e nao uma falha: o link nao vale mais. */
  | { kind: 'gone' }
  | { kind: 'failed' }

function Invitation({ token }: { token: string }) {
  const navigate = useNavigate()
  const loadProjects = useProjectsStore((state) => state.load)
  const signOut = useSessionStore((state) => state.signOut)
  const [state, setState] = useState<InvitationState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    // `attempt` so existe para o "Tentar de novo" buscar outra vez.
    void attempt
    let alive = true
    setState({ kind: 'loading' })

    projectTeamService
      .previewInvitation(token)
      .then((preview) => {
        if (alive) setState({ kind: 'ready', preview })
      })
      .catch((failure) => {
        if (!alive) return
        setState(
          isPanelError(failure) && failure.status === 404 ? { kind: 'gone' } : { kind: 'failed' },
        )
      })

    return () => {
      alive = false
    }
  }, [token, attempt])

  async function accept() {
    setAccepting(true)
    try {
      const accepted = await projectTeamService.acceptInvitation(token)
      // A lista de projetos guardada ainda nao tem este: sem recarregar, o projeto
      // abriria como "nao encontrado".
      await loadProjects()
      // Quem ja estava no time so fechou o convite: "entrou" seria mentira.
      if (state.kind === 'ready' && state.preview.Status === 'Valid')
        toast.done(`Você entrou no time de ${accepted.ProjectName}.`)
      navigate(`/projects/${accepted.ProjectPublicId}`, { replace: true })
    } catch (failure) {
      toast.error(describeError(failure))
      setAccepting(false)
    }
  }

  if (state.kind === 'loading') return <LoadingInvitation />

  if (state.kind === 'gone') {
    return (
      <Message
        title="Este convite não vale mais"
        text="Ele foi cancelado, ou substituído por um convite mais novo. Peça um novo a quem convidou você."
      />
    )
  }

  if (state.kind === 'failed') {
    return (
      <>
        <Message
          title="Não deu para abrir o convite agora"
          text="A falha foi ao consultar: o convite continua como estava."
        />
        <div className="mt-4">
          <Button onClick={() => setAttempt((value) => value + 1)}>Tentar de novo</Button>
        </div>
      </>
    )
  }

  return (
    <ByStatus
      preview={state.preview}
      accepting={accepting}
      onAccept={accept}
      onSwitchAccount={signOut}
    />
  )
}

function ByStatus({
  preview,
  accepting,
  onAccept,
  onSwitchAccount,
}: {
  preview: InvitationPreviewViewModel
  accepting: boolean
  onAccept: () => void
  onSwitchAccount: () => Promise<void>
}) {
  const papel = preview.Role === 'Administrator' ? 'administrador' : 'membro'

  switch (preview.Status) {
    case 'Valid':
      return (
        <>
          <p className="mb-1 text-detail text-fg-muted">Convite para o time</p>
          <h1 className="mb-3 font-semibold text-lead text-fg">{preview.ProjectName}</h1>
          <p className="mb-5 text-body text-fg-muted leading-relaxed">
            <strong className="font-medium text-fg">{preview.InvitedByName}</strong> convidou você
            para trabalhar neste projeto como {papel}. O convite vale até{' '}
            {formatDate(preview.ExpiresAt)}.
          </p>
          <Button variant="primary" disabled={accepting} onClick={onAccept}>
            {accepting ? 'Entrando…' : 'Aceitar o convite'}
          </Button>
        </>
      )

    case 'WrongAccount':
      return (
        <>
          <Message
            title="Este convite é para outra conta"
            text={`Ele foi enviado para ${preview.InvitedEmailHint ?? 'outro endereço'}, e só vale entrando com a conta Google desse endereço.`}
          />
          <div className="mt-4">
            <Button onClick={() => void onSwitchAccount()}>Sair e entrar com outra conta</Button>
          </div>
        </>
      )

    case 'EmailNotVerified':
      return (
        <>
          <Message
            title="O Google ainda não confirmou este e-mail"
            text={`O convite é para ${preview.InvitedEmailHint ?? 'este endereço'}, e só vale com o e-mail confirmado pelo Google. Confirme o endereço na sua conta Google e entre de novo.`}
          />
          <div className="mt-4">
            <Button onClick={() => void onSwitchAccount()}>Sair e entrar de novo</Button>
          </div>
        </>
      )

    case 'Expired':
      return (
        <Message
          title="Este convite venceu"
          text={`O convite para ${preview.ProjectName} valia até ${formatDate(preview.ExpiresAt)}. Peça a ${preview.InvitedByName} para reenviar.`}
        />
      )

    case 'AlreadyMember':
      // Ja estava no time — ou e dona. Abrir passa pelo aceite, que fecha o convite:
      // sem isso ele ficava aberto para sempre na tela de quem convidou.
      return (
        <>
          <Message
            title={`Você já está no time de ${preview.ProjectName}`}
            text="Este convite não muda nada para você. Abrir o projeto encerra o convite."
          />
          <div className="mt-4">
            <Button disabled={accepting} onClick={onAccept}>
              {accepting ? 'Abrindo…' : 'Abrir o projeto'}
            </Button>
          </div>
        </>
      )

    default:
      // Ja aceito por ela, que continua no time: so falta levar ate o projeto.
      return (
        <>
          <Message
            title={`Você já está no time de ${preview.ProjectName}`}
            text="Não há mais nada a fazer com este convite."
          />
          <div className="mt-4">
            <Link
              to={`/projects/${preview.ProjectPublicId}`}
              className="font-medium text-body text-fg underline underline-offset-4"
            >
              Abrir o projeto
            </Link>
          </div>
        </>
      )
  }
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <>
      <h1 className="mb-2 font-semibold text-lead text-fg">{title}</h1>
      <p className="text-body text-fg-muted leading-relaxed">{text}</p>
    </>
  )
}

function LoadingInvitation() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  )
}
