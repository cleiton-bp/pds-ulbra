import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  INVITE_FIELD_ID,
  InvitationsSection,
  type InvitationsSummary,
} from '@/features/projects/MembersInvitations'
import { TeamSection, type TeamState, useTeam } from '@/features/projects/MembersTeam'
import { Button } from '@/shared/components/Button'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { canConfigure } from '@/shared/lib/projectAccess'

/**
 * O time do projeto.
 *
 * **Todo o time abre esta tela**, e quem e so membro le: e daqui que se sabe com
 * quem se trabalha. Convidar, acompanhar os convites, mudar papel e remover
 * aparecem para quem administra — a API recusa o resto de qualquer forma.
 *
 * **Duas abas para quem administra**: o Time, que se abre primeiro porque e o que
 * se consulta, e os Convites, que se abrem quando ha o que fazer. As duas ficam
 * montadas: o envio na fila continua sendo acompanhado com o Time na frente, e a
 * contagem da aba de Convites acende quando algum nao saiu ou venceu.
 *
 * **O link do convite nunca aparece.** Ele so existe dentro do e-mail, e e isso
 * que faz o convite ser da pessoa convidada: aceitar exige entrar com o Google do
 * mesmo endereco. A tela mostra so onde o e-mail esta.
 */
export function MembersScreen() {
  const project = useCurrentProject()
  const admin = canConfigure(project)
  const team = useTeam(project.PublicId)

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Membros</h1>
      <p className="mb-1 text-body text-fg-muted leading-relaxed">
        {admin
          ? 'Quem trabalha neste projeto, e os convites para quem ainda vai entrar.'
          : 'Quem trabalha neste projeto.'}
      </p>
      <RolesHint />

      {admin ? (
        <AdminTabs projectPublicId={project.PublicId} team={team} />
      ) : (
        <TeamSection projectPublicId={project.PublicId} team={team} admin={false} inTab={false} />
      )}
    </div>
  )
}

/** O que cada papel faz, numa linha; o resto recolhido em "Como funciona". */
function RolesHint() {
  return (
    <>
      <p className="mb-2 text-detail text-fg-muted leading-relaxed">
        Administrador configura, convida e muda papéis; Membro trabalha nos cards.
      </p>
      <HowItWorks className="mb-6">
        <p>
          <strong className="font-medium text-fg">Dono</strong> é quem tem a conta: manda em todos
          os projetos dela, não muda de papel e não sai do time.
        </p>
        <p>
          <strong className="font-medium text-fg">Administrador</strong> configura o projeto,
          convida, muda o papel de quem está no time e remove pessoas.
        </p>
        <p>
          <strong className="font-medium text-fg">Membro</strong> trabalha nos cards e vê quem está
          no time. Para configurar ou convidar, precisa ser administrador.
        </p>
        <p>
          O convite vai por e-mail, e só vale para a conta Google do mesmo endereço: o link
          encaminhado para outra pessoa não serve para ela. Quem aceita sai dos Convites e aparece
          no Time.
        </p>
        <p>
          Quem não é dono sai do time pela própria linha. Quem administra e deixa de administrar
          perde a configuração na hora, e só outra pessoa que administra devolve o papel.
        </p>
      </HowItWorks>
    </>
  )
}

type Tab = 'time' | 'convites'
const TABS: Tab[] = ['time', 'convites']

/**
 * A aba em que mora cada ancora: a busca da configuracao leva a `#convidar` e a
 * `#prazo-do-convite` (Convites) e a `#time-do-projeto` (Time). Escolhida na hora de
 * desenhar, e nao num efeito: a casca procura o alvo ja no quadro seguinte, e alvo em
 * aba escondida nao tem onde rolar.
 */
function tabFromHash(hash: string): Tab | null {
  if (hash === '#convidar' || hash === '#prazo-do-convite') return 'convites'
  if (hash === '#time-do-projeto') return 'time'
  return null
}

function AdminTabs({ projectPublicId, team }: { projectPublicId: string; team: TeamState }) {
  const { hash, key } = useLocation()
  const [tab, setTab] = useState<Tab>(() => tabFromHash(hash) ?? 'time')
  // Cada navegacao nova (a busca levando a outro campo) escolhe de novo, pela `key`.
  const [seenKey, setSeenKey] = useState(key)
  if (seenKey !== key) {
    setSeenKey(key)
    const fromHash = tabFromHash(hash)
    if (fromHash) setTab(fromHash)
  }

  const [summary, setSummary] = useState<InvitationsSummary | null>(null)
  // Cada leitura da fila traz um objeto novo; so muda a tela quando o numero muda.
  const reportSummary = useCallback(
    (next: InvitationsSummary | null) =>
      setSummary((current) =>
        current !== null &&
        next !== null &&
        current.count === next.count &&
        current.attention === next.attention
          ? current
          : next,
      ),
    [],
  )

  // O "Convidar alguém" do Time troca de aba e leva o foco ao campo — depois do
  // desenho, quando a aba de Convites ja nao esta escondida.
  const [inviteRequest, setInviteRequest] = useState(0)
  useEffect(() => {
    if (inviteRequest > 0) document.getElementById(INVITE_FIELD_ID)?.focus()
  }, [inviteRequest])

  const members = team.members
  const teamEmails = members
    ? members.flatMap((member) => (member.Email ? [member.Email.toLowerCase()] : []))
    : null

  return (
    <>
      <Tabs
        tab={tab}
        onPick={setTab}
        // A acao da tela mora na linha das abas, ao lado dos Convites — e nao numa
        // linha so dela em cima da lista, onde ficava sozinha a direita. Na aba de
        // Convites ela some: o formulario ja esta ali, com o mesmo nome.
        action={
          tab === 'convites' ? undefined : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setTab('convites')
                setInviteRequest((value) => value + 1)
              }}
            >
              Convidar alguém
            </Button>
          )
        }
        items={[
          { key: 'time', label: 'Time', count: members?.length ?? null },
          {
            key: 'convites',
            label: 'Convites',
            count: summary?.count ?? null,
            attention: summary?.attention,
          },
        ]}
      />

      <Panel tab="time" open={tab === 'time'}>
        <TeamSection projectPublicId={projectPublicId} team={team} admin inTab />
      </Panel>
      <Panel tab="convites" open={tab === 'convites'}>
        <InvitationsSection
          projectPublicId={projectPublicId}
          teamEmails={teamEmails}
          onSummary={reportSummary}
        />
      </Panel>
    </>
  )
}

/** As abas, no desenho das de Domínios: setas, Home e End andam e escolhem. */
function Tabs({
  tab,
  onPick,
  items,
  action,
}: {
  tab: Tab
  onPick: (tab: Tab) => void
  items: { key: Tab; label: string; count: number | null; attention?: boolean }[]
  /** A acao da tela, no fim da linha das abas. */
  action?: ReactNode
}) {
  const buttons = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})

  const keys = (event: KeyboardEvent, current: Tab) => {
    const index = TABS.indexOf(current)
    const next =
      event.key === 'ArrowRight'
        ? TABS[(index + 1) % TABS.length]
        : event.key === 'ArrowLeft'
          ? TABS[(index - 1 + TABS.length) % TABS.length]
          : event.key === 'Home'
            ? TABS[0]
            : event.key === 'End'
              ? TABS[TABS.length - 1]
              : undefined
    if (!next) return
    event.preventDefault()
    onPick(next)
    buttons.current[next]?.focus()
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-4 border-border border-b">
      <div role="tablist" aria-label="Membros" className="flex gap-5">
        {items.map((item) => (
          <button
            key={item.key}
            ref={(node) => {
              buttons.current[item.key] = node
            }}
            id={`aba-${item.key}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            aria-controls={`painel-${item.key}`}
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => onPick(item.key)}
            onKeyDown={(event) => keys(event, item.key)}
            className={cn(
              '-mb-px flex h-9 flex-none items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 font-medium text-body transition-colors',
              tab === item.key
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {item.label}
            {/* O espaco e para o leitor de tela; na tela, quem afasta e o `gap`. */}
            {item.count !== null && ' '}
            {item.count !== null && (
              <span
                className={cn(
                  'tabular-nums',
                  item.attention ? 'text-chip-orange-fg' : 'font-normal text-fg-muted',
                )}
              >
                {`· ${item.count}`}
              </span>
            )}
            {/* A cor nao fala sozinha: o ponto e a frase escondida dizem o mesmo. */}
            {item.attention && (
              <>
                <span
                  aria-hidden
                  className="size-1.5 flex-none rounded-full bg-chip-orange-glyph"
                />
                <span className="sr-only">, algum precisa de atenção</span>
              </>
            )}
          </button>
        ))}
      </div>
      {action && <div className="mb-1.5 flex-none">{action}</div>}
    </div>
  )
}

/** O painel de uma aba: montado sempre, escondido quando a aba nao e a escolhida. */
function Panel({ tab, open, children }: { tab: Tab; open: boolean; children: ReactNode }) {
  return (
    <div
      id={`painel-${tab}`}
      role="tabpanel"
      aria-labelledby={`aba-${tab}`}
      hidden={!open}
      className="animate-panel-in"
    >
      {children}
    </div>
  )
}
