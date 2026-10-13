import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type ConfigureOverview,
  computeFirstSteps,
  type FirstStep,
  heldDomain,
  loadConfigureOverview,
  type OptionalStep,
  POSITION_SUMMARY,
  panelHost,
  VISIBILITY_SUMMARY,
  visibilityStep,
} from '@/app/configure/overview'
import { SettingsSearch } from '@/app/configure/SettingsSearch'
import { CONFIG_AREAS, type ConsoleSection } from '@/app/navigation'
import { SectionIcon } from '@/app/SectionIcon'
import type { ProjectViewModel } from '@/contracts'
import { AuthorizeDomain } from '@/features/onboarding/AuthorizeDomain'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import type { ScrollToHashState } from '@/shared/hooks/useScrollToHash'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'

/** A escolha de ver todos os passos ou so o proximo, por projeto. Conveniencia de quem olha. */
const PASSOS_VISTOS = 'pds.web.primeirosPassos.'

/** Os links da pagina levam ao campo e o acendem, como a busca. */
const REALCE: ScrollToHashState = { realce: true }

/**
 * "Configurar o projeto": a pagina central da configuracao.
 *
 * **A pessoa precisa olhar e entender o que faz ali.** Por isso, de cima para baixo:
 * a busca, logo sob o titulo, para quem ja sabe o que quer mudar; os primeiros passos,
 * com so o proximo aberto — uma coisa a fazer de cada vez, e nao cinco blocos iguais;
 * e tudo o que da para ajustar, nas cinco areas, com o que esta configurado em cada tela.
 */
export function ConfigureScreen() {
  const project = useCurrentProject()

  const { data: overview, revalidate } = useAsyncResource(
    useCallback(() => loadConfigureOverview(project.PublicId), [project.PublicId]),
  )

  return (
    <div className="max-w-200">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Configurar o projeto</h1>
      <p className="mb-5 text-body text-fg-muted">
        Tudo o que você ajusta neste projeto, num lugar só.
      </p>

      <div className="mb-6">
        <SettingsSearch projectPublicId={project.PublicId} />
      </div>

      {overview ? (
        <FirstSteps project={project} overview={overview} onChange={revalidate} />
      ) : (
        <Skeleton className="mb-10 h-44 w-full rounded-xl" />
      )}

      <h2 className="mb-3 font-semibold text-lead">Tudo o que dá para ajustar</h2>
      {/* Duas colunas so quando cabem: a largura que conta e a da area de trabalho, que
          encolhe com o menu aberto, e nao a da janela. */}
      <div className="@container">
        <div className="grid @min-[36rem]:grid-cols-2 gap-3">
          {CONFIG_AREAS.map((area) => (
            <section
              key={area.key}
              aria-labelledby={`area-${area.key}`}
              className="rounded-xl border border-border bg-surface-raised p-4"
            >
              <h3 id={`area-${area.key}`} className="font-semibold text-body text-fg">
                {area.label}
              </h3>
              <p className="mb-2 text-detail text-fg-muted leading-relaxed">{area.purpose}</p>
              <ul className="flex flex-col">
                {area.sections.map((section) => (
                  <li key={section.key}>
                    <ScreenLink
                      section={section}
                      projectPublicId={project.PublicId}
                      summary={overview ? summaryOf(section, project, overview) : null}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Uma tela da area: o nome na primeira linha e o resumo na de baixo. Na mesma linha, o
 * resumo cortado com reticencias parecia parte do nome do link; embaixo, em cinza, se
 * le como o que a tela guarda hoje.
 *
 * O nome do link e so o nome da tela — e o que o leitor de tela anuncia e o que se
 * procura com o teclado —, e o resumo entra como descricao.
 */
function ScreenLink({
  section,
  projectPublicId,
  summary,
}: {
  section: ConsoleSection
  projectPublicId: string
  summary: string | null
}) {
  const nameId = `tela-${section.key}`
  const summaryId = `resumo-${section.key}`

  return (
    <Link
      to={`/projects/${projectPublicId}/${section.path}`}
      aria-labelledby={nameId}
      aria-describedby={summary ? summaryId : undefined}
      className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-sunken"
    >
      <SectionIcon section={section.key} className="mt-0.5 size-4 flex-none text-fg-muted" />
      <span className="min-w-0 flex-1">
        <span id={nameId} className="block font-medium text-body text-fg">
          {section.label}
        </span>
        {summary && (
          <span
            id={summaryId}
            className="mt-0.5 line-clamp-2 break-words text-caption text-fg-muted leading-snug"
          >
            {summary}
          </span>
        )}
      </span>
      <Chevron />
    </Link>
  )
}

/**
 * Os primeiros passos: o que falta para o primeiro relato chegar e ser tratado.
 *
 * **So o proximo passo fica aberto**, com o porque e a acao. Cinco blocos iguais, todos
 * abertos, nao diziam por onde comecar; um so diz. Os feitos viram uma linha de
 * confirmacoes, e a lista inteira esta a um clique.
 *
 * O do dominio se resolve aqui mesmo — e o que mais trava a primeira hora, e o endereco
 * que mandou relato e esta esperando aparece pronto para autorizar.
 */
function FirstSteps({
  project,
  overview,
  onChange,
}: {
  project: ProjectViewModel
  overview: ConfigureOverview
  onChange: () => void
}) {
  const steps = computeFirstSteps(project, overview)
  const feitos = steps.filter((step) => step.done === true)
  const proximo = steps.find((step) => step.done !== true) ?? null
  const completo = proximo === null

  const chave = PASSOS_VISTOS + project.PublicId
  const [escolha, setEscolha] = useState<'aberto' | 'fechado' | null>(() => lerEscolha(chave))
  useEffect(() => setEscolha(lerEscolha(chave)), [chave])

  // Sem escolha guardada, a pagina abre no proximo passo: a lista inteira e para conferir.
  const todos = escolha === 'aberto'

  function escolher(valor: 'aberto' | 'fechado') {
    setEscolha(valor)
    try {
      window.localStorage.setItem(chave, valor)
    } catch {
      // Sem onde guardar, a escolha vale ate sair da pagina.
    }
  }

  const authorize = (
    <AuthorizeDomain
      projectPublicId={project.PublicId}
      held={heldDomain(overview)?.Domain ?? null}
      onAuthorized={onChange}
    />
  )

  const alternar = (
    <button
      type="button"
      aria-expanded={todos}
      aria-controls="lista-de-primeiros-passos"
      onClick={() => escolher(todos ? 'fechado' : 'aberto')}
      className="flex-none text-detail text-fg underline underline-offset-4 hover:text-fg-muted"
    >
      {todos ? 'Esconder' : completo ? 'Ver os passos' : 'Ver todos os passos'}
    </button>
  )

  return (
    <section
      aria-labelledby="primeiros-passos"
      className="mb-10 rounded-xl border border-border bg-surface-raised p-5"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="primeiros-passos" className="font-semibold text-lead">
          Primeiros passos
        </h2>
        <span className="text-detail text-fg-muted tabular-nums">
          {feitos.length} de {steps.length}
        </span>
      </header>
      <div
        role="progressbar"
        aria-label="Primeiros passos feitos"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={feitos.length}
        aria-valuetext={`${feitos.length} de ${steps.length}`}
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${(feitos.length / steps.length) * 100}%` }}
        />
      </div>

      {todos ? (
        <>
          <p className="mt-4 mb-3 text-detail text-fg-muted">
            Cada passo se marca sozinho quando estiver feito.
          </p>
          <ol id="lista-de-primeiros-passos" className="flex flex-col gap-2">
            {steps.map((step) => (
              <StepRow key={step.key} step={step} projectPublicId={project.PublicId}>
                {step.key === 'domain' && step.done !== true && authorize}
              </StepRow>
            ))}
            <OptionalRow step={visibilityStep(overview)} projectPublicId={project.PublicId} />
          </ol>
          <div className="mt-3 flex justify-end">{alternar}</div>
        </>
      ) : proximo ? (
        <>
          <NextStep step={proximo} projectPublicId={project.PublicId}>
            {proximo.key === 'domain' ? authorize : null}
          </NextStep>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            {feitos.length > 0 ? <DoneLine steps={feitos} /> : <span />}
            {alternar}
          </div>
        </>
      ) : (
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="font-medium text-body text-fg">Tudo pronto</p>
            <p className="text-detail text-fg-muted">
              O seu sistema manda relatos, o domínio está autorizado e o time está no projeto.
            </p>
          </div>
          {alternar}
        </div>
      )}
    </section>
  )
}

/**
 * O proximo passo, aberto: o que fazer, por que, e o botao que leva ate la — ou, no do
 * dominio, o proprio campo para autorizar.
 */
function NextStep({
  step,
  projectPublicId,
  children,
}: {
  step: FirstStep
  projectPublicId: string
  children?: ReactNode
}) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <p className="font-medium text-caption text-fg-muted">Próximo passo</p>
      <h3 className="mt-0.5 font-medium text-body text-fg">{step.title}</h3>
      <p className="mt-0.5 text-detail text-fg-muted leading-relaxed">
        {step.done === null ? 'Não deu para conferir agora. ' : ''}
        {step.why}
      </p>
      {children ?? (
        <Link
          to={`/projects/${projectPublicId}/${step.to}`}
          state={REALCE}
          className="mt-3 inline-flex h-9 items-center rounded-lg border border-transparent bg-accent px-3.5 font-medium text-accent-fg text-body transition-colors hover:bg-accent-hover"
        >
          {step.action}
        </Link>
      )}
    </div>
  )
}

/** Os passos feitos numa linha so: confirmam o caminho sem disputar com o proximo. */
function DoneLine({ steps }: { steps: FirstStep[] }) {
  return (
    <ul
      aria-label="Passos feitos"
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1"
    >
      {steps.map((step, index) => (
        <li key={step.key} className="flex items-center gap-1.5 text-detail text-fg-muted">
          {index > 0 && <span aria-hidden>·</span>}
          <CheckGlyph className="size-3 text-fg" />
          {step.short}
        </li>
      ))}
    </ul>
  )
}

function StepRow({
  step,
  projectPublicId,
  children,
}: {
  step: FirstStep
  projectPublicId: string
  children?: ReactNode
}) {
  return (
    <li
      className={cn(
        'flex gap-3 rounded-lg border px-3.5 py-3',
        step.done ? 'border-transparent bg-surface' : 'border-border bg-surface',
      )}
    >
      <StepMark done={step.done} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
          <div className="min-w-0">
            <p className={cn('text-body', step.done ? 'text-fg-muted' : 'font-medium text-fg')}>
              {step.title}
              <span className="sr-only">
                {step.done === true ? ' (feito)' : step.done === false ? ' (a fazer)' : ''}
              </span>
            </p>
            <p className="text-caption text-fg-muted leading-relaxed">
              {step.done === null ? 'Não deu para conferir agora. ' : ''}
              {step.why}
            </p>
          </div>
          <StepAction to={`/projects/${projectPublicId}/${step.to}`} quiet={step.done === true}>
            {step.action}
          </StepAction>
        </div>
        {children}
      </div>
    </li>
  )
}

/**
 * O passo opcional, na lista completa: a marca tracejada e a etiqueta dizem que ele nao
 * entra na conta, e a linha de baixo mostra o valor de hoje.
 */
function OptionalRow({ step, projectPublicId }: { step: OptionalStep; projectPublicId: string }) {
  return (
    <li className="flex gap-3 rounded-lg border border-transparent bg-surface px-3.5 py-3">
      <span
        aria-hidden
        className="mt-0.5 size-5 flex-none rounded-full border border-border border-dashed"
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="font-medium text-body text-fg">
            {step.title}{' '}
            <span className="rounded-full bg-surface-sunken px-2 py-px font-normal text-caption text-fg-muted">
              opcional
            </span>
          </p>
          <p className="text-caption text-fg-muted leading-relaxed">{step.why}</p>
        </div>
        <StepAction to={`/projects/${projectPublicId}/${step.to}`}>{step.action}</StepAction>
      </div>
    </li>
  )
}

function StepAction({
  to,
  quiet = false,
  children,
}: {
  to: string
  quiet?: boolean
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      state={REALCE}
      className={cn(
        'flex-none rounded-lg border px-3 py-1.5 text-detail transition-colors',
        quiet
          ? 'border-transparent text-fg-muted hover:text-fg'
          : 'border-border bg-surface-raised text-fg hover:bg-surface-sunken',
      )}
    >
      {children}
    </Link>
  )
}

function StepMark({ done }: { done: boolean | null }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 flex size-5 flex-none items-center justify-center rounded-full border',
        done ? 'border-transparent bg-accent text-accent-fg' : 'border-border text-fg-muted',
      )}
    >
      {done && <CheckGlyph className="size-3" />}
    </span>
  )
}

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn('flex-none', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2.5 6.2 2.3 2.3 4.7-5" />
    </svg>
  )
}

/** A seta da linha: a tela inteira e o link, e a seta diz isso sem palavra. */
function Chevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="mt-1 size-3.5 flex-none text-fg-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  )
}

/**
 * O resumo de cada tela, em poucas palavras, **so com o que ja foi lido**: as telas cujo
 * resumo pediria outra leitura ficam sem ele. Uma pagina que dispara quinze leituras
 * para mostrar quinze frases demora mais que abrir a tela.
 */
function summaryOf(
  section: ConsoleSection,
  project: ProjectViewModel,
  { origins, observed, widget, members, invitations }: ConfigureOverview,
): string | null {
  switch (section.key) {
    case 'start':
      return project.LastReportReceivedAt
        ? `Último relato ${formatRelative(project.LastReportReceivedAt)}`
        : 'Nenhum relato ainda'
    case 'tool':
      if (!widget) return null
      if (!widget.IsEnabled) return 'Desligado no seu sistema'
      return `“${widget.LauncherLabel}”, ${POSITION_SUMMARY[widget.Position]}`
    case 'domains': {
      if (!origins) return null
      const host = panelHost()
      const esperando =
        observed?.filter((origem) => origem.Status === 'Unlisted' && origem.Domain !== host)
          .length ?? 0
      const autorizados =
        origins.length === 0
          ? 'Nenhum autorizado'
          : origins.length === 1
            ? '1 autorizado'
            : `${origins.length} autorizados`
      return esperando > 0 ? `${autorizados} · ${esperando} esperando` : autorizados
    }
    case 'reportTypes':
      if (!widget) return null
      return widget.Types.length === 1 ? '1 tipo' : `${widget.Types.length} tipos`
    case 'formTexts':
      return widget ? `“${widget.Title}”` : null
    case 'identity':
      return widget ? VISIBILITY_SUMMARY[widget.Visibility] : null
    case 'members': {
      if (!members) return null
      const pessoas = members.length === 1 ? '1 pessoa' : `${members.length} pessoas`
      if (!invitations || invitations.length === 0) return pessoas
      return `${pessoas} · ${invitations.length === 1 ? '1 convite' : `${invitations.length} convites`}`
    }
    case 'settings':
      return project.Status === 'Archived' ? 'Arquivado' : 'Ativo'
    default:
      return null
  }
}

function lerEscolha(chave: string): 'aberto' | 'fechado' | null {
  try {
    const valor = window.localStorage.getItem(chave)
    return valor === 'aberto' || valor === 'fechado' ? valor : null
  } catch {
    return null
  }
}
