import { type MouseEvent, type ReactNode, useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  HeldOriginViewModel,
  ObservedOriginViewModel,
  ProjectOriginViewModel,
  ProjectViewModel,
  WidgetPosition,
} from '@/contracts'
import { projectKeyService, projectOriginService, projectWidgetSettingsService } from '@/data'
import { accentStyle } from '@/embed/appearance'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { AuthorizeDomain } from '@/features/onboarding/AuthorizeDomain'
import { TestReportDialog } from '@/features/onboarding/TestReportDialog'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { LauncherIconSvg } from '@/shared/components/LauncherIcon'
import { MoreOptions } from '@/shared/components/MoreOptions'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import type { ScrollToHashState } from '@/shared/hooks/useScrollToHash'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'
import { domainAuthorized, scriptInstalled, testReportSent } from '@/shared/lib/installSignals'
import { buildOwnTriggerSnippet, buildSnippet, OWN_TRIGGER_EXAMPLES } from '@/shared/lib/loader'

/**
 * Substitui a visao geral com graficos que um console costuma ter na entrada:
 * sem relato nenhum, metrica seriam seis caixas zeradas — e metrica vazia parece
 * sistema quebrado, nao sistema novo.
 *
 * **Um passo de cada vez.** Os tres passos sao um acordeao (`<details name>`): abre o
 * primeiro que falta, e o resto fica no titulo. Tres blocos abertos, um embaixo do
 * outro, nao diziam por onde comecar — e quem voltava rolava por tudo de novo.
 *
 * **O estado vem dos dados, e nao de uma caixa de marcar**: script colado e um relato
 * de fora do painel, dominio autorizado e a lista com alguem, teste e um relato do
 * painel — os mesmos sinais da pagina central (`installSignals`). Uma lista marcada a
 * mao mente no dia em que alguem tira o script do sistema.
 *
 * **O botao de cada passo mora no titulo**: copiar o bloco ou abrir o teste nao pede
 * abrir o passo antes.
 *
 * O terceiro passo abre a **propria ferramenta**, e nao uma simulacao dela: um teste
 * que passa com o carregador quebrado nao testa a instalacao, que e exatamente o que
 * ele existe para conferir.
 *
 * **Diz se ja esta funcionando.** Com os tres feitos, os passos ficam fechados e o
 * titulo leva o selo com o ultimo relato: quem volta para conferir ve na hora que nao
 * precisa fazer nada.
 */

/** O nome do acordeao: com o mesmo `name`, o navegador deixa um passo aberto so. */
const ACORDEAO = 'instalacao'

/** Os links da previa levam ao campo e o acendem, como a busca. */
const REALCE: ScrollToHashState = { realce: true }

type InstallStepKey = 'script' | 'domain' | 'test'

const ORDEM: InstallStepKey[] = ['script', 'domain', 'test']

/**
 * O que decide o estado dos passos. Cada leitura pode falhar sozinha — sem a lista,
 * o passo fica sem "feito" nem "falta", e o resto da tela segue.
 */
interface InstallStatus {
  origins: ProjectOriginViewModel[] | null
  observed: ObservedOriginViewModel[] | null
  /** "Aguardando liberação": os enderecos com relato retido. */
  pending: HeldOriginViewModel[] | null
}

async function loadInstallStatus(projectPublicId: string): Promise<InstallStatus> {
  const [origins, observed, pending] = await Promise.all([
    ouNulo(projectOriginService.listProjectOrigins(projectPublicId)),
    ouNulo(projectOriginService.listObservedOrigins(projectPublicId)),
    ouNulo(projectOriginService.listPendingOrigins(projectPublicId)),
  ])
  return { origins, observed, pending }
}

function ouNulo<T>(promessa: Promise<T>): Promise<T | null> {
  return promessa.catch(() => null)
}

/**
 * Feito, falta, ou `null` quando a leitura que decide falhou: os mesmos sinais dos
 * primeiros passos da pagina central (`installSignals`).
 */
function stepsDone(
  project: ProjectViewModel,
  { origins, observed }: InstallStatus,
): Record<InstallStepKey, boolean | null> {
  return {
    script: scriptInstalled(project, observed),
    domain: domainAuthorized(origins),
    test: testReportSent(observed),
  }
}

export function StartScreen() {
  const project = useCurrentProject()
  const [testOpen, setTestOpen] = useState(false)

  const {
    data: keys,
    failed,
    reload: reloadKeys,
  } = useAsyncResource(
    useCallback(() => projectKeyService.listProjectKeys(project.PublicId), [project.PublicId]),
  )

  const { data: status, revalidate: revalidateStatus } = useAsyncResource(
    useCallback(() => loadInstallStatus(project.PublicId), [project.PublicId]),
  )

  const publicKey = keys?.find((key) => key.Type === 'Public' && key.IsActive)?.Value ?? ''
  const snippet = buildSnippet(publicKey)

  const done = status ? stepsDone(project, status) : null
  // O primeiro que falta abre; com tudo feito, nenhum — quem volta ve so os titulos.
  const aberto = done ? (ORDEM.find((key) => done[key] !== true) ?? null) : null
  const funcionando = done !== null && aberto === null

  return (
    <div className="max-w-170">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="font-semibold text-screen tracking-tight">Instalação</h1>
        {funcionando && <WorkingBadge lastReportAt={project.LastReportReceivedAt} />}
      </div>
      <p className="mb-6 text-fg-muted text-body">
        Três passos para o seu sistema (site ou aplicação) começar a mandar relatos para este
        projeto.
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

      {!failed && (keys === null || done === null) && <LoadingSteps />}

      {keys !== null && status !== null && done !== null && (
        <div className="flex flex-col gap-3">
          <Step
            id="script"
            number={1}
            title="Colar o script no seu sistema"
            // Relato retido conta como chegado: o que falta e liberar o endereco (passo 2).
            pending={
              status.pending?.length
                ? 'Chegou relato, e ele espera a liberação do endereço'
                : 'Ainda não chegou relato do seu sistema'
            }
            done={done.script}
            open={aberto === 'script'}
            // Sem a guarda, copiar o bloco sem chave "dava certo" e nao servia para nada.
            action={
              publicKey ? <CopyButton value={snippet} label="Copiar bloco" size="sm" /> : null
            }
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_13rem]">
              <div className="min-w-0">
                <p className="mb-3 text-detail text-fg-muted leading-relaxed">
                  Antes do fechamento do &lt;/body&gt;, em todas as páginas. A chave já vem
                  preenchida.
                </p>
                <pre className="m-0 whitespace-pre-wrap break-all rounded-lg border border-border bg-surface px-4 py-3.5 font-mono text-detail text-fg leading-relaxed">
                  {snippet}
                </pre>

                {/* O antigo primeiro passo: a chave ja vai no bloco, e sozinha ela so
                    serve a quem monta o script a mao. */}
                <div id="copiar-chave" className="mt-3 flex scroll-mt-6 items-center gap-2">
                  <span className="flex-none text-detail text-fg-muted">Chave pública</span>
                  <code className="flex h-8 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-surface px-3 font-mono text-detail text-fg">
                    {publicKey || '—'}
                  </code>
                  {publicKey && <CopyButton value={publicKey} size="sm" />}
                </div>
                <p className="mt-1.5 text-caption text-fg-muted">
                  Pode ficar visível no código: ela só aceita o envio de relatos — não lê nada.
                </p>
              </div>

              <WidgetPreview projectId={project.PublicId} />
            </div>
          </Step>

          <Step
            id="autorizar-endereco"
            number={2}
            title="Autorizar o endereço do seu sistema"
            pending="Nenhum endereço autorizado"
            done={done.domain}
            open={aberto === 'domain'}
          >
            <p className="text-detail text-fg-muted leading-relaxed">
              O primeiro relato de um endereço novo espera a sua liberação; o autorizado entra
              direto no Trabalho.
            </p>

            <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-detail">
              <OriginCounts status={status} />
              <Link
                to="../domains#autorizados"
                state={REALCE}
                className="text-fg underline underline-offset-4"
              >
                Abrir Domínios
              </Link>
            </p>

            <AuthorizeDomain
              projectPublicId={project.PublicId}
              held={status.pending?.find((origem) => origem.Domain !== null)?.Domain ?? null}
              onAuthorized={revalidateStatus}
            />

            <HowItWorks>
              A ferramenta abre em qualquer endereço que tenha a chave. Os relatos de um endereço
              novo ficam em “Aguardando liberação”, em Domínios, até você permitir ou bloquear o
              endereço — o relato de teste daqui do painel entra direto.
            </HowItWorks>
          </Step>

          <Step
            id="relato-de-teste"
            number={3}
            title="Fazer um relato de teste"
            pending="Ainda não testado"
            done={done.test}
            open={aberto === 'test'}
            action={
              <Button size="sm" disabled={!publicKey} onClick={() => setTestOpen(true)}>
                Abrir teste
              </Button>
            }
          >
            <p className="text-detail text-fg-muted leading-relaxed">
              Abre a mesma ferramenta que o seu sistema abre, com esta chave. O relato entra de
              verdade e aparece em Trabalho como qualquer outro.
            </p>

            {/* A pergunta que vem depois de enviar e "e agora, onde ele esta?", e a
                resposta e outra tela: a fila de relatos. */}
            <Link
              to="../reports"
              className="mt-3 inline-flex items-center gap-1.5 font-medium text-detail text-fg underline-offset-4 hover:underline"
            >
              Ver os relatos que chegaram
            </Link>
          </Step>

          {/* O caminho de quem ja tem um botao e a chave secreta sao a parte avancada da
              instalacao: o padrao continua sendo colar e funcionar. */}
          <MoreOptions
            id="mais-opcoes"
            className="details-smooth mt-2"
            title="Avançado"
            summary="Seu próprio botão · chave secreta"
          >
            <OwnTrigger publicKey={publicKey} />

            <section id="chave-secreta" className="mt-5 scroll-mt-6 border-border border-t pt-4">
              <h3 className="mb-1 font-medium text-body text-fg">Chave secreta</h3>
              <p className="text-detail text-fg-muted leading-relaxed">
                Para um sistema seu falar direto com a nossa API, sem a ferramenta. Ela fica em{' '}
                <Link to="../keys" className="text-fg underline underline-offset-4">
                  Chaves e integração avançada
                </Link>
                .
              </p>
            </section>
          </MoreOptions>
        </div>
      )}

      {publicKey && (
        <TestReportDialog
          publicKey={publicKey}
          open={testOpen}
          onOpenChange={(open) => {
            setTestOpen(open)
            // Ao fechar, confere de novo: o relato que acabou de sair marca o passo.
            if (!open) revalidateStatus()
          }}
        />
      )}
    </div>
  )
}

/** "Funcionando · último relato há 5 minutos", com o caminho para os relatos. */
function WorkingBadge({ lastReportAt }: { lastReportAt: string | null }) {
  return (
    <p
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-surface-raised py-1 pr-3 pl-1.5 text-detail text-fg-muted"
    >
      <DoneGlyph />
      <span>
        <strong className="font-medium text-fg">Funcionando</strong>
        {lastReportAt && ` · último relato ${formatRelative(lastReportAt)}`}
      </span>
      <Link to="../reports" className="font-medium text-fg underline underline-offset-4">
        Ver em Trabalho
      </Link>
    </p>
  )
}

/** "2 autorizados · 1 aguardando": o que a lista tem hoje, sem sair da tela. */
function OriginCounts({ status }: { status: InstallStatus }) {
  const partes: string[] = []
  if (status.origins !== null) {
    const total = status.origins.length
    partes.push(
      total === 0 ? 'Nenhum autorizado' : `${total} ${total === 1 ? 'autorizado' : 'autorizados'}`,
    )
  }
  if (status.pending !== null && status.pending.length > 0) {
    partes.push(`${status.pending.length} aguardando`)
  }
  if (partes.length === 0) return null

  return <span className="font-medium text-fg">{partes.join(' · ')}</span>
}

/**
 * Um passo do acordeao. O `id` fica no `<summary>`, dentro do `<details>`: a busca leva
 * a `start#script`, e `useScrollToHash` abre o `<details>` em volta do alvo antes de
 * rolar.
 *
 * `open` so diz como o passo comeca — e muda quando os dados mudam (autorizou o
 * dominio, o passo seguinte abre). Abrir e fechar a mao e com o navegador.
 */
function Step({
  id,
  number,
  title,
  pending,
  done,
  open,
  action,
  children,
}: {
  id: string
  number: number
  title: string
  /** O que ainda nao aconteceu, em palavras — "falta" sozinho nao dizia o que faltava. */
  pending: string
  done: boolean | null
  open: boolean
  /** O botao do passo, no titulo: funciona com o passo fechado. */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <details
      name={ACORDEAO}
      open={open}
      className="details-smooth group/passo rounded-xl border border-border bg-surface-raised"
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: o `<summary>` ja e interativo (foco e teclado do navegador); o clique so impede o botao de dentro de alternar o passo */}
      <summary
        id={id}
        onClick={soOBotaoAge}
        className="flex scroll-mt-6 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <Chevron className="size-3 flex-none text-fg-muted transition-transform duration-300 ease-out group-open/passo:rotate-90 motion-reduce:transition-none" />
          <span className="flex size-5 flex-none items-center justify-center rounded-full border border-border text-caption text-fg-muted">
            {number}
          </span>
          <h2 className="min-w-0 font-semibold text-fg text-lead">{title}</h2>
        </span>
        {done !== null && <StepState done={done} pending={pending} />}
        {action}
      </summary>

      <div className="border-border border-t px-5 pt-4 pb-5">{children}</div>
    </details>
  )
}

/**
 * O clique no botao do titulo e so dele: sem isto, copiar o bloco tambem abriria ou
 * fecharia o passo. O teclado no botao chega aqui como clique, e vale o mesmo.
 */
function soOBotaoAge(event: MouseEvent<HTMLElement>) {
  if (event.target instanceof Element && event.target.closest('button')) event.preventDefault()
}

/**
 * O estado do passo escrito, e nao so a cor: cor sozinha nao informa. Pendente, diz o
 * que ainda nao aconteceu ("Nenhum endereço autorizado"); "falta", sozinho, deixava a
 * pessoa sem saber o que faltava.
 */
function StepState({ done, pending }: { done: boolean; pending: string }) {
  return (
    <span
      className={cn(
        'inline-flex flex-none items-center gap-1.5 text-caption',
        done ? 'text-fg' : 'text-fg-muted',
      )}
    >
      {done ? (
        <DoneGlyph />
      ) : (
        <span className="size-3.5 rounded-full border border-border border-dashed" aria-hidden />
      )}
      {done ? 'Feito' : pending}
    </span>
  )
}

/** Ajuda longa recolhida: a linha de cima basta para quem so quer seguir. */
function HowItWorks({ children }: { children: ReactNode }) {
  return (
    <details className="details-smooth group/ajuda mt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-caption text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden">
        <Chevron className="size-2.5 transition-transform duration-300 ease-out group-open/ajuda:rotate-90 motion-reduce:transition-none" />
        Como funciona
      </summary>
      <p className="mt-1.5 text-detail text-fg-muted leading-relaxed">{children}</p>
    </details>
  )
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" />
    </svg>
  )
}

function DoneGlyph() {
  return (
    <span className="flex size-3.5 flex-none items-center justify-center rounded-full bg-active text-active-fg">
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="size-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m3 6.2 2 2 4-4.4" />
      </svg>
    </span>
  )
}

/**
 * O caminho de quem ja tem um botao, ou quer abrir de uma tela da propria aplicacao.
 *
 * **Fica no Avançado, e curto**: o padrao continua sendo colar e funcionar. Quem
 * dispensa o nosso botao ganha uma pagina que nao baixa nada da ferramenta ate alguem
 * pedir — e e isso que a frase diz, porque e o motivo de escolher.
 */
function OwnTrigger({ publicKey }: { publicKey: string }) {
  const script = buildOwnTriggerSnippet(publicKey)

  return (
    <section id="proprio-botao" className="scroll-mt-6">
      <h3 className="mb-1 font-medium text-body text-fg">Seu próprio botão</h3>
      <p className="mb-3 text-detail text-fg-muted leading-relaxed">
        Com <code className="font-mono text-fg">data-button="none"</code>, o nosso botão não aparece
        e nada da ferramenta é baixado até alguém pedir para abrir. Abra pelo seu botão, com o
        atributo <code className="font-mono text-fg">data-pds-open</code>, ou de qualquer tela, com{' '}
        <code className="font-mono text-fg">Pds.open()</code>.
      </p>
      <div className="flex flex-col gap-2.5">
        <SnippetBlock code={script} label="Copiar script" />
        <SnippetBlock code={OWN_TRIGGER_EXAMPLES} label="Copiar exemplo" />
      </div>
    </section>
  )
}

function SnippetBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <pre className="m-0 whitespace-pre-wrap break-all px-4 py-3.5 font-mono text-detail text-fg leading-relaxed">
        {code}
      </pre>
      <div className="flex justify-end border-border border-t bg-surface-raised px-2.5 py-2">
        <CopyButton value={code} label={label} size="sm" />
      </div>
    </div>
  )
}

/**
 * O que da para ajustar no botao, cada um com o caminho para o proprio campo em O botão.
 *
 * **Etiqueta que parece clicavel e clica.** Antes elas eram tracejadas e mudas — quem
 * clicava em "Cor" nao ia a lugar nenhum. A lista e a dos campos que existem de verdade.
 */
const CUSTOMIZAVEL: Array<{ label: string; anchor: string }> = [
  { label: 'Cor', anchor: 'cor-do-botao' },
  { label: 'Canto', anchor: 'canto' },
  { label: 'Ícone', anchor: 'icone' },
  { label: 'Texto', anchor: 'texto-do-botao' },
  { label: 'Tamanho e formato', anchor: 'tamanho' },
  { label: 'Tema', anchor: 'tema' },
  { label: 'Páginas', anchor: 'paginas-escondidas' },
]

/** O canto do desenho, em classes: o desenho e pequeno, e a distancia escolhida nao cabe nele. */
const CANTO: Record<WidgetPosition, string> = {
  BottomRight: 'right-3.5 bottom-3.5',
  BottomLeft: 'left-3.5 bottom-3.5',
  TopRight: 'right-3.5 top-3.5',
  TopLeft: 'left-3.5 top-3.5',
}

/**
 * O que o script desenha no site do cliente: colar um bloco de codigo sem ver o que ele
 * produz e um ato de fe.
 *
 * **O desenho segue o projeto**: a cor, o canto, o texto e o icone que estao
 * publicados. Sem a leitura — ainda carregando, ou falhou —, o botao de fabrica: o
 * desenho e ilustracao, e nao vale uma tela de erro. A previa de verdade, com tudo, mora
 * em O botão.
 */
function WidgetPreview({ projectId }: { projectId: string }) {
  const { data } = useAsyncResource(
    useCallback(() => projectWidgetSettingsService.getWidgetSettings(projectId), [projectId]),
  )
  const settings = data ?? DEFAULT_WIDGET_SETTINGS
  const icone = settings.LauncherIcon !== 'None' ? settings.LauncherIcon : null
  const soIcone = settings.LauncherIconOnly && icone !== null

  return (
    <div className="self-start rounded-lg border border-border bg-surface p-3">
      <p className="mb-2.5 text-caption text-fg-muted">Como vai aparecer no seu sistema</p>

      <div className="relative h-28 overflow-hidden rounded-md border border-border bg-surface-sunken p-3.5">
        <div className="flex flex-col gap-2" aria-hidden="true">
          <div className="h-2 w-1/3 rounded bg-surface-strong" />
          <div className="h-1.5 w-3/5 rounded bg-surface-strong" />
          <div className="h-1.5 w-2/5 rounded bg-surface-strong" />
        </div>

        <span
          style={accentStyle(settings)}
          title={soIcone ? settings.LauncherLabel : undefined}
          className={cn(
            'absolute flex items-center gap-1.5 rounded-lg bg-[var(--widget-accent)] px-2.5 py-1.5',
            'font-medium text-[var(--widget-ink)] text-caption',
            CANTO[settings.Position] ?? CANTO.BottomRight,
          )}
        >
          {icone && <LauncherIconSvg icon={icone} size={14} />}
          {soIcone ? (
            <span className="sr-only">{settings.LauncherLabel}</span>
          ) : (
            settings.LauncherLabel
          )}
        </span>
      </div>

      <ul aria-label="Ajustar em O botão" className="mt-3 flex flex-wrap gap-1.5">
        {CUSTOMIZAVEL.map((item) => (
          <li key={item.anchor}>
            <Link
              to={`../tool#${item.anchor}`}
              state={REALCE}
              className="inline-flex rounded-md border border-border px-2 py-0.5 text-caption text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      <Link
        to="../tool"
        className="mt-2.5 inline-flex text-caption text-fg-muted underline-offset-4 hover:underline"
      >
        Ajustar o botão
      </Link>
    </div>
  )
}

function LoadingSteps() {
  return (
    <div className="flex flex-col gap-3">
      {['w-[42%]', 'w-[36%]', 'w-[48%]'].map((width) => (
        <div
          key={width}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-5 py-4"
        >
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className={cn('h-3', width)} />
          <Skeleton className="ml-auto h-3 w-10" />
        </div>
      ))}
    </div>
  )
}
