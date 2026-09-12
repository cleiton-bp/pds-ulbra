import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { projectKeyService } from '@/data'
import { TestReportDialog } from '@/features/onboarding/TestReportDialog'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { LockIcon } from '@/shared/components/LockIcon'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { buildSnippet } from '@/shared/lib/loader'

/**
 * Substitui a visao geral com graficos que um console costuma ter na entrada:
 * sem relato nenhum, metrica seriam seis caixas zeradas — e metrica vazia parece
 * sistema quebrado, nao sistema novo.
 *
 * O terceiro passo abre a **propria ferramenta**, e nao uma simulacao dela: um
 * teste que passa com o carregador quebrado nao testa a instalacao, que e
 * exatamente o que ele existe para conferir.
 *
 * **Sem marcar passo como feito.** Houve barra de progresso, contagem e caixa de
 * marcar; o visto verde competia com o cadeado por atencao e a lista virava
 * formulario. Ficou o que a lista precisa ser: o numero de cada passo, e o
 * cadeado no unico que nao da para fazer ainda.
 */

export function StartScreen() {
  const project = useCurrentProject()

  const {
    data: keys,
    loading,
    failed,
    reload: reloadKeys,
  } = useAsyncResource(
    useCallback(() => projectKeyService.listProjectKeys(project.PublicId), [project.PublicId]),
  )

  const publicKey = keys?.find((key) => key.Type === 'Public' && key.IsActive)?.Value ?? ''
  const snippet = buildSnippet(publicKey)

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Instalação</h1>
      <p className="mb-6 text-fg-muted text-body">
        Duas coisas para o seu site começar a mandar relatos para este projeto.
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
        <div className="flex flex-col gap-3">
          <Step number={1} title="Copiar a chave pública">
            <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
              A chave pública identifica o projeto e pode ficar visível no código do site. Ela só
              aceita o envio de relatos — não lê nada.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex h-9 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-surface px-3 font-mono text-detail text-fg">
                {publicKey || '—'}
              </code>
              {/* Sem a guarda, copiar string vazia "dava certo" e marcava o passo. */}
              {publicKey && <CopyButton value={publicKey} />}
            </div>
          </Step>

          <Step number={2} title="Colar o script no site">
            <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
              Antes do fechamento do &lt;/body&gt;, em todas as páginas. A chave já vem preenchida.
            </p>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <pre className="m-0 whitespace-pre-wrap break-all px-4 py-3.5 font-mono text-detail text-fg leading-relaxed">
                {snippet}
              </pre>
              <div className="flex justify-end border-border border-t bg-surface-raised px-2.5 py-2">
                <CopyButton value={snippet} label="Copiar bloco" size="sm" />
              </div>
            </div>

            <WidgetPreview />
          </Step>

          <Step number={3} title="Fazer um relato de teste">
            <p className="mb-3.5 text-detail text-fg-muted leading-relaxed">
              Abre a mesma ferramenta que o seu site abre, com esta chave. O relato entra de
              verdade, e é por isso que ele aparece em Relatos como qualquer outro.
            </p>
            {publicKey ? (
              <TestReportDialog publicKey={publicKey} />
            ) : (
              <Button disabled>Abrir relato de teste</Button>
            )}

            {/* A pergunta que vem depois de enviar e "e agora, onde ele esta?", e a
                resposta e outra tela. Ate a pds-014 nao havia para onde apontar, e
                a frase acima terminava prometendo a lista para depois. */}
            <Link
              to="../reports"
              className="mt-4 inline-flex items-center gap-1.5 font-medium text-detail text-fg underline-offset-4 hover:underline"
            >
              Ver os relatos que chegaram
            </Link>
          </Step>
        </div>
      )}
    </div>
  )
}

/**
 * O que o script desenha no site do cliente.
 *
 * Colar um bloco de codigo sem ver o que ele produz e um ato de fe. A previa
 * mostra o resultado, e as etiquetas dizem quais partes dele sao escolha de quem
 * configura.
 *
 * **A lista e a dos campos que existem de verdade.** Ela ja teve "Fonte", que
 * nunca foi campo nenhum, e um cadeado de "em breve" — as duas coisas eram
 * verdade enquanto a secao Ferramenta nao existia, e viraram promessa falsa no dia
 * em que ela entrou.
 */
const CUSTOMIZAVEL = ['Cor', 'Canto', 'Tema', 'Textos']

function WidgetPreview() {
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-3">
      <p className="mb-2.5 text-caption text-fg-muted">Como vai aparecer no seu site</p>

      <div className="relative h-28 overflow-hidden rounded-md border border-border bg-surface-sunken p-3.5">
        <div className="flex flex-col gap-2" aria-hidden="true">
          <div className="h-2 w-1/3 rounded bg-surface-strong" />
          <div className="h-1.5 w-3/5 rounded bg-surface-strong" />
          <div className="h-1.5 w-2/5 rounded bg-surface-strong" />
        </div>

        <span className="absolute right-3.5 bottom-3.5 rounded-lg bg-accent px-2.5 py-1.5 font-medium text-accent-fg text-caption">
          Relatar
        </span>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {CUSTOMIZAVEL.map((item) => (
          <li
            key={item}
            className="rounded-md border border-border border-dashed px-2 py-0.5 text-caption text-fg-muted"
          >
            {item}
          </li>
        ))}
      </ul>

      <Link
        to="../tool"
        className="mt-2.5 inline-flex text-caption text-fg-muted underline-offset-4 hover:underline"
      >
        Mudar em Ferramenta
      </Link>
    </div>
  )
}

function Step({
  number,
  locked = false,
  title,
  children,
}: {
  number?: number
  locked?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex gap-3.5 rounded-xl border border-border bg-surface-raised px-5 py-4.5">
      <div className="flex-none pt-px">
        <span className="flex size-5 items-center justify-center rounded-full border border-border text-caption text-fg-muted">
          {locked ? <LockIcon className="size-[11px]" /> : number}
        </span>
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
