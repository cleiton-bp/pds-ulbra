import { selectThemeLabel, useThemeStore } from '@/app/themeStore'
import { describeMode, environment, resetDemoData } from '@/data'
import { useSessionStore } from '@/features/auth/sessionStore'
import {
  DropdownGroup,
  DropdownHeader,
  DropdownItem,
  DropdownMenu,
  DropdownSeparator,
} from '@/shared/components/DropdownMenu'
import { toast } from '@/shared/components/toastStore'

/**
 * O nome da conta aparece no cabecalho porque a conta e a fronteira de isolamento:
 * quem nao sabe em que conta esta nao sabe de quem e o dado que ve.
 */
export function AccountMenu() {
  const user = useSessionStore((state) => state.user)
  const signOut = useSessionStore((state) => state.signOut)
  const themeLabel = useThemeStore(selectThemeLabel)
  const toggleTheme = useThemeStore((state) => state.toggle)

  const initials = buildInitials(user?.Name)

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          aria-label="Conta"
          className="flex size-8 items-center justify-center rounded-full border border-border bg-surface-sunken font-semibold text-caption text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
        >
          {user?.AvatarUrl ? (
            <img
              src={user.AvatarUrl}
              alt=""
              className="size-full rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            initials
          )}
        </button>
      }
    >
      <DropdownHeader>
        <div className="font-medium text-fg text-body">{user?.Name ?? 'Sessão'}</div>
        <div className="mt-0.5 text-detail text-fg-muted">{user?.Email ?? '—'}</div>
        <div className="mt-2 text-detail text-fg-muted">{user?.Account.Name ?? '—'}</div>
      </DropdownHeader>

      <DropdownSeparator />

      <DropdownGroup>
        <DropdownItem onSelect={toggleTheme}>{themeLabel}</DropdownItem>
        <DropdownItem onSelect={() => void signOut()}>Sair</DropdownItem>
      </DropdownGroup>

      {/* Só fora do modo API: apagar dado de cliente por botão de tela, nunca. */}
      {environment.mode !== 'api' && (
        <>
          <DropdownSeparator />
          <DropdownGroup>
            <DropdownItem
              quiet
              onSelect={() => {
                resetDemoData()
                toast.done(`${describeMode(environment.mode)} reiniciados. Recarregue a página.`)
              }}
            >
              Reiniciar dados de demonstração
            </DropdownItem>
          </DropdownGroup>
        </>
      )}
    </DropdownMenu>
  )
}

/** Duas iniciais, como o "MN" do design. Cai para "?" quando nao ha nome. */
function buildInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'

  const first = parts[0]?.charAt(0) ?? ''
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : ''
  return (first + last).toUpperCase()
}
