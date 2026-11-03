import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import type { ScrollToHashState } from '@/shared/hooks/useScrollToHash'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'
import {
  domainAuthorized,
  isTestOrigin,
  markScriptCopied,
  scriptCopied,
  scriptInstalled,
  testReportSent,
} from '@/shared/lib/installSignals'
import { buildOwnTriggerSnippet, buildSnippet, OWN_TRIGGER_EXAMPLES } from '@/shared/lib/loader'
import { guideTarget, useScreenGuide } from '@/shared/tour/guideStore'

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

/** Os pontos da tela que a busca e os links alcancam, e o passo em que cada um mora. */
const PASSO_DA_ANCORA: Record<string, InstallStepKey> = {
  script: 'script',
  'copiar-chave': 'script',
  'proprio-botao': 'script',
  'mais-opcoes': 'script',
  'autorizar-endereco': 'domain',
  'relato-de-teste': 'test',
}

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
  const script = scriptInstalled(project, observed)
  return {
    script,
    domain: domainAuthorized(origins),
    // Com o sistema mandando relato, o teste ja nao tem o que provar (os mesmos sinais da
    // pagina central).
    test: script ? true : testReportSent(observed),
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

  const [copiado, setCopiado] = useState(() => scriptCopied(project.PublicId))
  // Copiar o script ou o recado para quem cuida do sistema: o passo sai das maos de quem
  // administra, e o guia segue para o proximo enquanto o primeiro relato nao chega.
  const marcarCopiado = useCallback(() => {
    markScriptCopied(project.PublicId)
    setCopiado(true)
  }, [project.PublicId])
  const done = status ? stepsDone(project, status) : null
  // O primeiro que falta abre; com tudo feito, nenhum, e quem volta ve so os titulos. O
  // script copiado espera o primeiro relato do sistema, e o passo seguinte abre no lugar.
  const aberto = done
    ? (ORDEM.find((key) => done[key] !== true && !(key === 'script' && copiado)) ??
      ORDEM.find((key) => done[key] !== true) ??
      null)
    : null
  // O passo aberto: o que a tela calcula, ate a pessoa abrir ou fechar um a mao. Um link
  // para dentro de um passo (a busca leva a `start#copiar-chave`) abre o passo dele.
  const location = useLocation()
  const [escolhido, setEscolhido] = useState<InstallStepKey | null | undefined>(
    () => PASSO_DA_ANCORA[location.hash.slice(1)],
  )
  useEffect(() => {
    const passo = PASSO_DA_ANCORA[location.hash.slice(1)]
    if (passo) setEscolhido(passo)
  }, [location.hash])
  // Quando o calculo muda (copiou o bloco, autorizou o dominio), a tela volta a decidir.
  const abertoAntes = useRef(aberto)
  useEffect(() => {
    if (abertoAntes.current !== null && abertoAntes.current !== aberto) setEscolhido(undefined)
    abertoAntes.current = aberto
  }, [aberto])
  const passoAberto = escolhido !== undefined ? escolhido : aberto
  const alternar = (passo: InstallStepKey) => setEscolhido(passoAberto === passo ? null : passo)

  const navigate = useNavigate()
  const avisarChegada = useCallback(() => {
    revalidateStatus()
    toast.done('Seu relato de teste chegou no Trabalho.', {
      action: { label: 'Ver o relato', run: () => navigate('../reports') },
    })
  }, [revalidateStatus, navigate])
  useAvisoDoTeste(project.PublicId, testOpen, avisarChegada)
  const funcionando = done !== null && aberto === null

  // O guia desta tela: os tres passos e a saida para a chave secreta. A previa so entra
  // com o passo do script aberto, que e onde ela mora.
  useScreenGuide('instalacao', [
    {
      alvo: 'passo-script',
      titulo: 'Colar o script',
      texto: 'Copie o script para o seu sistema, ou mande a quem cuida dele.',
    },
    {
      alvo: 'previa',
      titulo: 'Como vai ficar',
      texto: 'Uma prévia do botão como ele aparece no seu sistema.',
    },
    {
      alvo: 'passo-autorizar-endereco',
      titulo: 'Autorizar o endereço',
      texto: 'Diga de quais endereços os relatos podem chegar, e o resto fica de fora.',
    },
    {
      alvo: 'passo-relato-de-teste',
      titulo: 'Relato de teste',
      texto: 'Mande um relato pela página de teste e veja ele chegar ao Trabalho.',
    },
    {
      alvo: 'chave-secreta',
      titulo: 'Integrar pela API',
      texto: 'Para integrar sem o botão, a chave secreta fica na tela Chaves.',
    },
    {
      alvo: 'guia',
      titulo: 'Sempre à mão',
      texto: 'Volte aqui quando quiser rever o que cada parte desta tela faz.',
    },
  ])

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
                ? 'Chegou relato, esperando a liberação'
                : copiado
                  ? 'Esperando o primeiro relato'
                  : 'Ainda sem relato do seu sistema'
            }
            done={done.script}
            open={passoAberto === 'script'}
            onToggle={() => alternar('script')}
            // Sem a guarda, copiar o script sem chave "dava certo" e nao servia para nada.
            action={
              publicKey ? (
                <CopyButton
                  value={snippet}
                  label="Copiar script"
                  size="sm"
                  onCopied={marcarCopiado}
                />
              ) : null
            }
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_13rem]">
              <div className="min-w-0">
                <p className="mb-3 text-detail text-fg-muted leading-relaxed">
                  Cole antes do fechamento do &lt;/body&gt;, em todas as páginas do seu sistema.
                </p>
                <pre className="m-0 whitespace-pre-wrap break-all rounded-lg border border-border bg-surface px-4 py-3.5 font-mono text-detail text-fg leading-relaxed">
                  {snippet}
                </pre>

                {/* Quem administra o projeto muitas vezes nao e quem mexe no codigo: o recado
                    pronto leva o script, onde colar e o que vem depois, para mandar a quem
                    cuida do sistema. Copiar o recado tambem conta como o script entregue. */}
                {publicKey && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-detail text-fg-muted">
                      Não é você quem mexe no código do sistema?
                    </span>
                    <CopyButton
                      value={buildHandoffText(snippet)}
                      label="Copiar instruções para quem cuida dele"
                      size="sm"
                      onCopied={marcarCopiado}
                    />
                  </div>
                )}

                <ForWhoCodes publicKey={publicKey} />
              </div>

              <div {...guideTarget('previa')}>
                <WidgetPreview projectId={project.PublicId} />
              </div>
            </div>
          </Step>

          <Step
            id="autorizar-endereco"
            number={2}
            title="Autorizar o endereço do seu sistema"
            pending="Nenhum endereço autorizado"
            done={done.domain}
            open={passoAberto === 'domain'}
            onToggle={() => alternar('domain')}
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
              endereço, e o relato de teste daqui do painel entra direto.
            </HowItWorks>
          </Step>

          <Step
            id="relato-de-teste"
            number={3}
            title="Fazer um relato de teste"
            pending="Ainda não testado"
            done={done.test}
            open={passoAberto === 'test'}
            onToggle={() => alternar('test')}
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

          {/* **Tres passos, e nada mais com cara de passo.** O "Avançado" ja foi uma quarta
              caixa igual as dos passos, e quem chegava perguntava se precisava fazer aquilo
              tambem. O proprio botao foi para dentro do passo 1, que e o que ele substitui; a
              chave secreta e outra tarefa (integrar pela API) e mora em Chaves, entao aqui fica
              so a saida, dizendo para onde leva. */}
          <p
            id="chave-secreta"
            {...guideTarget('chave-secreta')}
            className="mt-2 flex scroll-mt-6 flex-wrap items-center gap-x-3 gap-y-1 text-detail text-fg-muted"
          >
            <span>
              Para integrar um sistema seu direto pela API, sem o botão, a chave secreta fica em
              Chaves.
            </span>
            <Link
              to="../keys"
              className="inline-flex items-center gap-1 font-medium text-fg transition-colors hover:text-fg-muted"
            >
              Abrir Chaves
              <Chevron className="size-2.5" />
            </Link>
          </p>

          {/* Daqui a pessoa volta ao roteiro: a Instalacao e o detalhe dos tres primeiros
              passos, e os outros dois moram na pagina central. */}
          {!funcionando && (
            <Link
              to="../configure"
              className="mt-1 self-start text-detail text-fg underline underline-offset-4 transition-colors hover:text-fg-muted"
            >
              Voltar aos primeiros passos
            </Link>
          )}
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
        {lastReportAt && `, último relato ${formatRelative(lastReportAt)}`}
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

  return <span className="font-medium text-fg">{partes.join(', ')}</span>
}

/**
 * Enquanto o teste esta aberto, confere a cada poucos segundos se o relato chegou. A
 * pergunta de quem acabou de enviar e "chegou?", e a resposta vem com o caminho ate ele.
 * Conta os relatos do endereco do teste: so um a mais e o que acabou de sair.
 */
function useAvisoDoTeste(projectPublicId: string, aberto: boolean, aoChegar: () => void) {
  const aoChegarAgora = useRef(aoChegar)
  aoChegarAgora.current = aoChegar

  useEffect(() => {
    if (!aberto) return
    let antes: number | null = null
    let vivo = true
    const conferir = async () => {
      const lista = await projectOriginService
        .listObservedOrigins(projectPublicId)
        .catch(() => null)
      if (!vivo || lista === null) return
      // A pagina de teste mora na origem do quadro, e os testes antigos sairam do painel.
      const total = lista
        .filter((origem) => isTestOrigin(origem.Domain))
        .reduce((soma, origem) => soma + origem.ReportCount, 0)
      if (antes !== null && total > antes) aoChegarAgora.current()
      antes = total
    }
    void conferir()
    const timer = window.setInterval(() => void conferir(), 4000)
    return () => {
      vivo = false
      window.clearInterval(timer)
    }
  }, [projectPublicId, aberto])
}

/**
 * Um passo da Instalacao: **o titulo e o botao de abrir, dentro do cabecalho**, e o estado
 * e o botao do passo numa segunda linha, fora dele. Ja foi um `<summary>` com tudo numa
 * linha so: no celular o titulo virava uma palavra por linha, com o estado por cima, e o
 * leitor de tela ouvia um botao dentro de outro.
 *
 * Abre um passo por vez (quem decide e a tela), e o conteudo entra e sai deslizando, sem
 * movimento para quem pediu menos movimento.
 */
function Step({
  id,
  number,
  title,
  pending,
  done,
  open,
  onToggle,
  action,
  children,
}: {
  id: string
  number: number
  title: string
  /** O que ainda nao aconteceu, em palavras: "falta", sozinho, nao dizia o que faltava. */
  pending: string
  done: boolean | null
  open: boolean
  onToggle: () => void
  /** O botao do passo, ao lado do estado: funciona com o passo fechado. */
  action?: ReactNode
  children: ReactNode
}) {
  const conteudo = `${id}-conteudo`
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="rounded-xl border border-border bg-surface-raised"
      {...guideTarget(`passo-${id}`)}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4">
        <h2 className="flex min-w-0 flex-[1_1_16rem]">
          <button
            id={id}
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={conteudo}
            className="flex min-w-0 flex-1 scroll-mt-6 items-center gap-2.5 text-left font-semibold text-fg text-lead"
          >
            <Chevron
              className={cn(
                'size-3 flex-none text-fg-muted transition-transform duration-300 ease-out motion-reduce:transition-none',
                open && 'rotate-90',
              )}
            />
            <span
              aria-hidden
              className="flex size-5 flex-none items-center justify-center rounded-full border border-border font-normal text-caption text-fg-muted"
            >
              {number}
            </span>
            <span id={`${id}-titulo`} className="min-w-0">
              {title}
            </span>
          </button>
        </h2>
        {(done !== null || action) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {done !== null && <StepState done={done} pending={pending} />}
            {action}
          </div>
        )}
      </div>

      <div
        id={conteudo}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-border border-t px-5 pt-4 pb-5">{children}</div>
        </div>
      </div>
    </section>
  )
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
 * **Fica dentro do passo 1, recolhido, e curto**: o padrao continua sendo colar e funcionar. Quem
 * dispensa o nosso botao ganha uma pagina que nao baixa nada da ferramenta ate alguem
 * pedir — e e isso que a frase diz, porque e o motivo de escolher.
 */
/**
 * O que so quem programa usa, recolhido dentro do passo 1: a chave publica sozinha (ela ja
 * vai no script, e sozinha so serve a quem monta o script a mao) e o jeito de abrir pelo
 * proprio botao. Antes isso morava num "Avançado" com cara de quarto passo, junto da chave
 * secreta, que e outra tarefa.
 */
function ForWhoCodes({ publicKey }: { publicKey: string }) {
  return (
    // `#mais-opcoes` era o "Avançado": o endereco antigo abre esta parte, que guarda o que ele tinha do passo 1.
    <details
      id="mais-opcoes"
      className="details-smooth group/programa mt-4 scroll-mt-6 border-border border-t pt-3"
    >
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-detail text-fg-muted transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
        <Chevron className="size-2.5 transition-transform duration-300 ease-out group-open/programa:rotate-90 motion-reduce:transition-none" />
        Para quem programa: a chave pública e o seu próprio botão
      </summary>
      <div className="mt-3 flex flex-col gap-5">
        <div id="copiar-chave" className="scroll-mt-6">
          <div className="flex items-center gap-2">
            <span className="flex-none text-detail text-fg-muted">Chave pública</span>
            <code className="flex h-8 min-w-0 flex-1 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border bg-surface px-3 font-mono text-detail text-fg">
              {publicKey || 'sem chave ainda'}
            </code>
            {publicKey && <CopyButton value={publicKey} size="sm" />}
          </div>
          <p className="mt-1.5 text-caption text-fg-muted">
            Ela já vai no script e pode ficar visível no código, porque só aceita o envio de
            relatos.
          </p>
        </div>
        <OwnTrigger publicKey={publicKey} />
      </div>
    </details>
  )
}

/**
 * O recado pronto para quem cuida do sistema: o script, onde colar e o que vem depois. Vai
 * por e-mail ou mensagem, entao pode ter varias frases; sem o nome do produto, que mora so
 * na marca.
 */
function buildHandoffText(snippet: string): string {
  return [
    'Para ligar o botão de relato no nosso sistema:',
    '',
    '1. Cole este código antes do fechamento do </body>, em todas as páginas:',
    '',
    snippet,
    '',
    '2. Me diga o endereço do sistema (por exemplo, loja.com.br), para eu autorizar no painel.',
    '',
    'Depois, abra o sistema e mande um relato pelo botão para conferir.',
  ].join('\n')
}

function OwnTrigger({ publicKey }: { publicKey: string }) {
  const script = buildOwnTriggerSnippet(publicKey)

  return (
    <section id="proprio-botao" className="scroll-mt-6">
      <h3 className="mb-1 font-medium text-body text-fg">Seu próprio botão</h3>
      <p className="mb-3 text-detail text-fg-muted leading-relaxed">
        Com <code className="font-mono text-fg">data-button="none"</code>, o nosso botão não aparece
        e nada da ferramenta é baixado até alguém pedir para abrir. Abra pelo seu botão, com o
        atributo <code className="font-mono text-fg">data-relatofacil-open</code>, ou de qualquer
        tela, com <code className="font-mono text-fg">RelatoFacil.open()</code>.
      </p>
      <div className="flex flex-col gap-2.5">
        {/* Nome proprio: no mesmo passo ja ha o "Copiar script" do titulo, que e outro script. */}
        <SnippetBlock code={script} label="Copiar script do próprio botão" />
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

      {/* Um link so, com o destino escrito: as sete etiquetas (Cor, Canto, Icone...)
          pareciam marcadores, e cada uma trocava de tela sem avisar. */}
      <Link
        to="../tool"
        className="mt-3 inline-flex items-center gap-1 font-medium text-caption text-fg transition-colors hover:text-fg-muted"
      >
        Mudar a aparência em O botão
        <Chevron className="size-2.5" />
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
