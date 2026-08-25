import { useEffect, useRef, useState } from 'react'
import { describeMode, environment } from '@/data'
import { renderGoogleButton } from '@/features/auth/googleIdentity'
import { useSessionStore } from '@/features/auth/sessionStore'
import { Brand } from '@/shared/components/Brand'
import { Button } from '@/shared/components/Button'

/**
 * Sem formulario e sem cadastro: quem entra pela primeira vez ganha conta e
 * usuario no mesmo movimento.
 *
 * Divergencia conhecida: o design escreve "Entrar com e-mail", mas a API so tem
 * `POST /auth/google` e o login por senha segue em aberto (E0-12). O botao diz o
 * que de fato faz.
 */
export function LoginScreen() {
  const signIn = useSessionStore((state) => state.signIn)
  const status = useSessionStore((state) => state.status)
  const error = useSessionStore((state) => state.error)

  const googleContainer = useRef<HTMLDivElement>(null)
  const [googleFailed, setGoogleFailed] = useState<string | null>(null)

  useEffect(() => {
    const clientId = environment.googleClientId
    const container = googleContainer.current
    if (!clientId || !container) return

    let cancelled = false

    renderGoogleButton(container, clientId, (idToken) => {
      if (!cancelled) void signIn(idToken)
    }).catch((reason: Error) => {
      if (!cancelled) setGoogleFailed(reason.message)
    })

    return () => {
      cancelled = true
    }
  }, [signIn])

  const useGoogleButton = Boolean(environment.googleClientId) && !googleFailed

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-100">
        <div className="rounded-xl border border-border bg-surface-raised p-8">
          <Brand size="lg" />

          <p className="mt-2.5 mb-7 text-fg-muted text-body leading-relaxed">
            Cole uma linha de script no seu site e os usuários dele passam a relatar problemas com o
            contexto técnico já anexado.
          </p>

          {useGoogleButton ? (
            // A politica do Google exige o botao desenhado pela biblioteca dele.
            <div ref={googleContainer} className="flex justify-center [color-scheme:light]" />
          ) : (
            <Button
              variant="primary"
              block
              className="h-10"
              disabled={status === 'loading'}
              onClick={() => void signIn(null)}
            >
              {status === 'loading' ? 'Abrindo a sessão…' : 'Entrar com Google'}
            </Button>
          )}

          {(error || googleFailed) && (
            <p role="alert" className="mt-3.5 text-detail text-error-fg leading-relaxed">
              {error ?? googleFailed}
            </p>
          )}

          <p className="mt-3 text-center text-detail text-fg-muted">
            Não existe cadastro separado: o primeiro acesso cria sua conta.
          </p>
        </div>

        <p className="mt-4 text-center text-detail text-fg-muted">
          {describeMode(environment.mode)}
          {environment.mode !== 'api' && ' · nada é gravado em servidor'}
        </p>
      </div>
    </main>
  )
}
