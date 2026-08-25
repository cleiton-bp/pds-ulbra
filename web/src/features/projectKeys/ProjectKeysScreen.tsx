import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { RevealedSecretKeyViewModel } from '@/contracts'
import { projectKeyService } from '@/data'
import { RegenerateSecretDialog } from '@/features/projectKeys/RegenerateSecretDialog'
import { RevealedSecretPanel } from '@/features/projectKeys/RevealedSecretPanel'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { formatDate } from '@/shared/lib/datetime'

/** O que a criacao de projeto manda junto na navegacao. */
interface RevealState {
  revealedSecret?: RevealedSecretKeyViewModel
}

/**
 * A explicacao de cada chave fica **ao lado dela** (E1-11): quem integra le no
 * momento em que copia, que e quando a pergunta "posso deixar isso a vista?"
 * aparece. Os textos respondem pelo que a chave **faz**, nao pelo que ela e.
 */
export function ProjectKeysScreen() {
  const project = useCurrentProject()
  const location = useLocation()
  const navigate = useNavigate()

  const [regenerating, setRegenerating] = useState(false)

  // Capturada uma vez e apagada do historico: sem isso o valor ficaria no
  // `history.state` e voltaria a cada recarregamento, contradizendo o aviso de
  // que ele nao aparece de novo.
  const [revealed, setRevealed] = useState<RevealedSecretKeyViewModel | null>(
    () => (location.state as RevealState | null)?.revealedSecret ?? null,
  )

  useEffect(() => {
    if ((location.state as RevealState | null)?.revealedSecret) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  const {
    data: keys,
    loading,
    failed,
    reload: reloadKeys,
  } = useAsyncResource(
    useCallback(() => projectKeyService.listProjectKeys(project.PublicId), [project.PublicId]),
  )

  const publicKey = keys?.find((key) => key.Type === 'Public' && key.IsActive)
  const secretKey = keys?.find((key) => key.Type === 'Secret' && key.IsActive)
  const revoked = keys?.filter((key) => !key.IsActive) ?? []

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Chaves e integração</h1>
      <p className="mb-6 text-fg-muted text-body">
        Duas chaves, dois usos: uma fica no site, a outra fica no seu servidor.
      </p>

      {revealed && (
        <RevealedSecretPanel secret={revealed} onAcknowledge={() => setRevealed(null)} />
      )}

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
            Não deu para carregar as chaves deste projeto agora. Elas continuam valendo, e o script
            instalado no seu site não foi afetado.
          </p>
          <Button onClick={reloadKeys}>Tentar de novo</Button>
        </div>
      )}

      {loading && <LoadingCards />}

      {keys !== null && (
        <div className="flex flex-col gap-4">
          <article className="rounded-xl border border-border bg-surface-raised p-5">
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-lead">Chave pública</h2>
              <span className="text-detail text-fg-muted">vai no código do site</span>
            </header>

            <div className="mb-3.5 flex items-center gap-2">
              <code className="flex h-9 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-surface px-3 font-mono text-detail">
                {publicKey?.Value ?? '—'}
              </code>
              {publicKey?.Value && <CopyButton value={publicKey.Value} />}
            </div>

            <p className="text-detail text-fg-muted leading-relaxed">
              Esta chave serve para uma coisa só: enviar um relato para este projeto. Com ela
              ninguém consegue ler os relatos que você recebeu, ver dados da sua conta ou alterar
              qualquer coisa.
              <br />É por isso que ela pode ficar à vista no código do site, onde qualquer visitante
              pode lê-la. Se alguém copiar a sua chave pública, o máximo que consegue fazer é mandar
              um relato para você.
            </p>
          </article>

          <article className="rounded-xl border border-border bg-surface-raised p-5">
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-lead">Chave secreta</h2>
              <span className="text-detail text-fg-muted">fica no seu servidor</span>
            </header>

            {secretKey ? (
              <div className="mb-3.5 flex flex-wrap items-center gap-3">
                {/* Só o prefixo, e não por escolha de tela: o banco não tem o resto. */}
                <code className="flex h-9 items-center rounded-lg border border-border bg-surface px-3 font-mono text-detail text-fg-muted">
                  {secretKey.Prefix}•••
                </code>
                <span className="text-detail text-fg-muted">
                  criada em {formatDate(secretKey.CreatedAt)}
                </span>
              </div>
            ) : (
              <p className="mb-3.5 text-detail text-fg-muted">Nenhuma chave secreta ativa.</p>
            )}

            <p className="mb-4 text-detail text-fg-muted leading-relaxed">
              Esta é a chave que lê e altera relatos, então ela vive no seu servidor e não no site.
              Guardamos só uma impressão digital do valor, nunca o valor em si — por isso mostramos
              apenas o começo dela, e nem nós conseguimos recuperar o resto.
              <br />
              Perdeu a sua? Não há problema: gere outra e troque onde a antiga estiver.
            </p>

            <Button onClick={() => setRegenerating(true)}>Gerar nova chave</Button>
          </article>

          {revoked.length > 0 && (
            <article className="rounded-xl border border-border bg-surface-raised p-5">
              <h2 className="mb-1 font-semibold text-lead">Chaves revogadas</h2>
              <p className="mb-3 text-detail text-fg-muted">
                Chaves secretas que já não valem. Ficam aqui só como registro.
              </p>

              <ul className="border-border border-t">
                {revoked.map((key) => (
                  <li
                    key={key.PublicId}
                    className="flex items-center gap-3 border-border border-b px-0.5 py-3"
                  >
                    <code className="min-w-0 flex-1 font-mono text-detail text-fg-muted">
                      {key.Prefix}•••
                    </code>
                    <span className="flex-none text-detail text-fg-muted">
                      valeu de {formatDate(key.CreatedAt)} a {formatDate(key.RevokedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </div>
      )}

      <RegenerateSecretDialog
        projectPublicId={project.PublicId}
        open={regenerating}
        onOpenChange={setRegenerating}
        onRegenerated={(secret) => {
          setRevealed(secret)
          reloadKeys()
        }}
      />
    </div>
  )
}

function LoadingCards() {
  return (
    <div className="flex flex-col gap-4">
      {['w-[34%]', 'w-[30%]', 'w-[38%]'].map((width) => (
        <div key={width} className="rounded-xl border border-border bg-surface-raised p-5">
          <div className="mb-3.5 flex justify-between">
            <Skeleton className={`h-3 ${width}`} />
            <Skeleton className="h-2 w-30" />
          </div>
          <div className="mb-4 flex gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-22" />
          </div>
          <Skeleton className="mb-2 h-2 w-full" />
          <Skeleton className="h-2 w-2/3" />
        </div>
      ))}
    </div>
  )
}
