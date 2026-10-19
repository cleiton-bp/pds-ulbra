import type { ProjectRole, TeamMemberViewModel } from '@/contracts'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'

/**
 * As pecas que as duas abas de Membros dividem: o nome do papel, o rosto da pessoa,
 * o esqueleto e o bloco de falha. Separadas da tela para o Time e os Convites
 * ficarem cada um no seu arquivo.
 */

export const ROLE_OPTIONS: { value: ProjectRole; label: string }[] = [
  { value: 'Member', label: 'Membro' },
  { value: 'Administrator', label: 'Administrador' },
]

export function roleName(role: ProjectRole): string {
  return role === 'Administrator' ? 'Administrador' : 'Membro'
}

/** O nome que a tela usa para falar da pessoa — no botao, na confirmacao, no aviso. */
export function personName(member: TeamMemberViewModel, fallback = 'esta pessoa'): string {
  return member.Name ?? member.Email ?? fallback
}

export function Avatar({ member }: { member: TeamMemberViewModel }) {
  const initials = (member.Name ?? member.Email ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return member.AvatarUrl ? (
    <img
      src={member.AvatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      className="size-9 flex-none rounded-full"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-9 flex-none items-center justify-center rounded-full bg-surface-sunken font-medium text-detail text-fg-muted"
    >
      {initials}
    </span>
  )
}

export function LoadingRows() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
      {['w-48', 'w-40', 'w-56'].map((width) => (
        <div
          key={width}
          className="flex h-15 items-center gap-3.5 border-border border-b px-4 last:border-b-0"
        >
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className={`h-3 ${width}`} />
        </div>
      ))}
    </div>
  )
}

/** A lista nao veio: diz o que continua valendo, e oferece tentar de novo. */
export function LoadFailed({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-5">
      <p className="mb-3.5 text-body text-fg-muted leading-relaxed">{text}</p>
      <Button onClick={onRetry}>Tentar de novo</Button>
    </div>
  )
}
