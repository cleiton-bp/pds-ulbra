import { useCallback, useEffect, useState } from 'react'
import { projectKeyService } from '@/data'
import {
  type IntegrationStep,
  markStep,
  readProgress,
} from '@/features/onboarding/integrationProgress'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { LockIcon } from '@/shared/components/LockIcon'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'

/**
 * Substitui a visao geral com graficos que um console costuma ter na entrada:
 * sem relato nenhum, metrica seriam seis caixas zeradas — e metrica vazia parece
 * sistema quebrado, nao sistema novo.
 *
 * O terceiro passo aparece bloqueado com o motivo escrito, em vez de escondido:
 * quem integrou quer saber como testar.
 */

/** Endereco do carregador. O definitivo depende do dominio (cards IN-01 e E2-01). */
const LOADER_URL = 'https://cdn.pds.app/pds.js'

export function StartScreen() {
  const project = useCurrentProject()

  const [done, setDone] = useState<IntegrationStep[]>([])

  useEffect(() => {
    setDone(readProgress(project.PublicId))
  }, [project.PublicId])

  const {
    data: keys,
    loading,
    failed,
    reload: reloadKeys,
  } = useAsyncResource(
    useCallback(() => projectKeyService.listProjectKeys(project.PublicId), [project.PublicId]),
  )

  function complete(step: IntegrationStep) {
    setDone(markStep(project.PublicId, step))
  }

  const publicKey = keys?.find((key) => key.Type === 'Public' && key.IsActive)?.Value ?? ''
  const snippet = buildSnippet(publicKey)

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Comece por aqui</h1>
      <p className="mb-6 text-fg-muted text-body">
        Três passos para este projeto começar a receber relatos dos seus usuários.
      </p>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
            Não deu para carregar os passos deste projeto agora. A sua chave e o script instalado
            seguem funcionando.
          </p>
          <Button onClick={reloadKeys}>Tentar de novo</Button>
        </div>
      )}

      {loading && <LoadingSteps />}

      {keys !== null && (
        <>
          <div className="mb-6 flex items-center gap-3">
            <div className="flex gap-1">
              {['key', 'snippet', 'test'].map((step) => (
                <div
                  key={step}
                  className={cn(
                    'h-1 w-9 rounded-full',
                    // O terceiro passo ainda nao existe, entao nunca esta feito.
                    done.some((item) => item === step) ? 'bg-active' : 'bg-surface-strong',
                  )}
                />
              ))}
            </div>
            <span className="text-detail text-fg-muted">{done.length} de 3 concluídos</span>
          </div>

          <div className="flex flex-col gap-3">
            <Step number={1} done={done.includes('key')} title="Copiar a chave pública">
              <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
                A chave pública identifica o projeto e pode ficar visível no código do site. Ela só
                aceita o envio de relatos — não lê nada.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex h-9 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-surface px-3 font-mono text-detail text-fg">
                  {publicKey || '—'}
                </code>
                {/* Sem a guarda, copiar string vazia "dava certo" e marcava o passo. */}
                {publicKey && <CopyButton value={publicKey} onCopied={() => complete('key')} />}
              </div>
            </Step>

            <Step number={2} done={done.includes('snippet')} title="Colar o script no site">
              <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
                Antes do fechamento do &lt;/body&gt;, em todas as páginas. A chave já vem
                preenchida.
              </p>
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                <pre className="m-0 whitespace-pre-wrap break-all px-4 py-3.5 font-mono text-detail text-fg leading-relaxed">
                  {snippet}
                </pre>
                <div className="flex justify-end border-border border-t bg-surface-raised px-2.5 py-2">
                  <CopyButton
                    value={snippet}
                    label="Copiar bloco"
                    size="sm"
                    onCopied={() => complete('snippet')}
                  />
                </div>
              </div>
            </Step>

            <Step locked title="Fazer um relato de teste">
              <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
                Bloqueado nesta etapa: o recebimento de relatos chega na próxima etapa do produto.
              </p>
              <Button disabled>Abrir relato de teste</Button>
            </Step>
          </div>
        </>
      )}
    </div>
  )
}

function buildSnippet(publicKey: string): string {
  // `data-key` em ingles (§1 do decisoes-de-projeto.md): vai aparecer no HTML de
  // todo cliente.
  return `<script\n  src="${LOADER_URL}"\n  data-key="${publicKey || 'pk_...'}"\n  defer></script>`
}

function Step({
  number,
  done = false,
  locked = false,
  title,
  children,
}: {
  number?: number
  done?: boolean
  locked?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex gap-3.5 rounded-xl border border-border bg-surface-raised px-5 py-4.5">
      {/* O traço do check vem de `text-active-fg` por `currentColor`. */}
      <div className="flex-none pt-px">
        {done ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-active text-active-fg">
            <svg
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M2.5 6.3 4.7 8.5 9.5 3.7" />
            </svg>
          </span>
        ) : (
          <span className="flex size-5 items-center justify-center rounded-full border border-border text-caption text-fg-muted">
            {locked ? <LockIcon className="size-[11px]" /> : number}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h2 className={cn('mb-1 font-semibold text-lead', locked ? 'text-fg-muted' : 'text-fg')}>
          {title}
        </h2>
        {children}
      </div>
    </section>
  )
}

function LoadingSteps() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex gap-1">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-1 w-9 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-2 w-26" />
      </div>

      <div className="flex flex-col gap-3">
        {['w-[42%]', 'w-[36%]', 'w-[48%]'].map((width) => (
          <div
            key={width}
            className="flex gap-3.5 rounded-xl border border-border bg-surface-raised px-5 py-4.5"
          >
            <Skeleton className="size-5 rounded-full" />
            <div className="flex-1">
              <Skeleton className={cn('mb-3 h-3', width)} />
              <Skeleton className="mb-2 h-2 w-full" />
              <Skeleton className="mb-4 h-2 w-3/4" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
