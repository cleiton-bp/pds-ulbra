import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { ProjectKeyViewModel, RevealedSecretKeyViewModel } from '@/contracts'
import { projectKeyService } from '@/data'
import { RegenerateSecretDialog } from '@/features/projectKeys/RegenerateSecretDialog'
import { RevealedSecretPanel } from '@/features/projectKeys/RevealedSecretPanel'
import { RevokedKeysPanel } from '@/features/projectKeys/RevokedKeysPanel'
import { Button } from '@/shared/components/Button'
import { LockIcon } from '@/shared/components/LockIcon'
import { MaskedValue } from '@/shared/components/MaskedValue'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { formatDateTime } from '@/shared/lib/datetime'

/** O que a criacao de projeto manda junto na navegacao. */
interface RevealState {
  revealedSecret?: RevealedSecretKeyViewModel
}

/**
 * A explicacao de cada chave fica **ao lado dela** (E1-11): quem integra le no
 * momento em que copia, que e quando a pergunta "posso deixar isso a vista?"
 * aparece. Os textos respondem pelo que a chave **faz**, nao pelo que ela e.
 *
 * **As duas chaves nao tem o mesmo peso.** A publica e usada por todo projeto
 * nos primeiros cinco minutos; a secreta serve a uma minoria, num uso que ainda
 * nao existe. Enquanto os dois cartoes tinham o mesmo tamanho, a tela ensinava
 * que as duas eram igualmente necessarias — e "fica no seu servidor", lido como
 * requisito, mandava procurar uma infraestrutura que muita gente nao tem. Agora
 * a publica e a tela, e a secreta fica recolhida atras de "Integracao avancada".
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

  // Quem chega com a chave recem-criada precisa achar de onde ela veio: ela mora
  // dentro da secao, e secao fechada esconderia o unico momento em que aparece.
  const [advancedOpen, setAdvancedOpen] = useState(() => revealed !== null)

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
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Chaves</h1>
      <p className="mb-6 text-fg-muted text-body">
        A chave pública identifica este projeto no seu site, e é a única que quase todo projeto usa.
      </p>

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
        <>
          <article className="rounded-xl border border-border bg-surface-raised p-5">
            <header className="mb-3.5 flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-fg text-lead">Chave pública</h2>
              <span className="flex-none text-detail text-fg-muted">vai no código do site</span>
            </header>

            <div className="mb-3.5">
              {publicKey?.Value ? (
                <MaskedValue value={publicKey.Value} />
              ) : (
                <code className="flex h-10 items-center rounded-lg border border-border bg-surface px-3.5 font-mono text-body text-fg-muted">
                  —
                </code>
              )}
            </div>

            <p className="text-detail text-fg-muted leading-relaxed">
              Esta chave serve para uma coisa só: enviar um relato para este projeto. Com ela
              ninguém consegue ler os relatos que você recebeu, ver dados da sua conta ou alterar
              qualquer coisa.
              <br />É por isso que ela pode ficar à vista no código do site, onde qualquer visitante
              pode lê-la. Se alguém copiar a sua chave pública, o máximo que consegue fazer é mandar
              um relato para você.
            </p>

            {/* A pergunta que vem depois de copiar e "colar onde?", e a resposta
                e outra tela. Sem esse atalho, ela se responde pelo menu. */}
            <Link
              to="../start"
              className="mt-4 inline-flex items-center gap-1.5 font-medium text-detail text-fg underline-offset-4 hover:underline"
            >
              Ver onde colar no site
              <Chevron />
            </Link>
          </article>

          <AdvancedSection
            open={advancedOpen}
            onToggle={() => setAdvancedOpen((current) => !current)}
            secretKey={secretKey}
            revealed={revealed}
            onAcknowledge={() => setRevealed(null)}
            revoked={revoked}
            onRegenerate={() => setRegenerating(true)}
          />
        </>
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

/**
 * A chave secreta e o que ja foi revogado, atras de um clique.
 *
 * Recolhida e nao escondida: o resumo diz para que ela serve e que ninguem
 * precisa dela para comecar, entao quem procura acha e quem nao procura nao e
 * obrigado a decidir nada.
 */
function AdvancedSection({
  open,
  onToggle,
  secretKey,
  revealed,
  onAcknowledge,
  revoked,
  onRegenerate,
}: {
  open: boolean
  onToggle: () => void
  secretKey: ProjectKeyViewModel | undefined
  revealed: RevealedSecretKeyViewModel | null
  onAcknowledge: () => void
  revoked: ProjectKeyViewModel[]
  onRegenerate: () => void
}) {
  const section = useRef<HTMLElement>(null)

  /**
   * Aberta, a secao costuma nascer abaixo da dobra: o clique acontece e nada
   * parece ter acontecido. `nearest` rola o minimo para o conteudo caber, e nao
   * arranca a tela do lugar quando ele ja estava visivel.
   */
  const revealSection = useCallback(() => {
    section.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
    })
  }, [])

  // Chegou da criacao do projeto com a chave nova: ela mora aqui dentro, entao a
  // tela precisa levar ate ela.
  useEffect(() => {
    if (revealed) revealSection()
  }, [revealed, revealSection])

  return (
    <section
      ref={section}
      className="mt-4 scroll-mb-6 overflow-hidden rounded-xl border border-border bg-surface-raised"
    >
      <button
        type="button"
        onClick={() => {
          const opening = !open
          onToggle()
          // Sem transicao nao existe `transitionend`, entao quem pediu menos
          // movimento precisa do proprio empurrao, depois do React pintar.
          if (opening && prefersReducedMotion()) setTimeout(revealSection)
        }}
        aria-expanded={open}
        aria-controls="integracao-avancada"
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-sunken"
      >
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-fg text-lead">Integração avançada</h2>
          <p className="mt-0.5 text-detail text-fg-muted">
            A chave secreta, para um sistema seu conversar direto com a nossa API. Você não precisa
            dela para começar.
          </p>
        </div>
        <Chevron className={cn('text-fg-muted', open && 'rotate-90')} />
      </button>

      {/* Grade de uma linha indo de `0fr` a `1fr`: e o unico jeito de animar
          altura automatica sem chutar um `max-height`, que corta o conteudo no
          dia em que ele cresce. Fechado, o bloco continua no DOM para a
          transicao existir, entao `inert` o tira do foco e do leitor de tela. */}
      <div
        id="integracao-avancada"
        inert={!open}
        // Depois da altura chegar ao fim: chamada antes, a rolagem mira a
        // altura fechada e para no lugar errado.
        onTransitionEnd={(event) => {
          if (open && event.propertyName === 'grid-template-rows') revealSection()
        }}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          {/* A borda e o respiro moram aqui dentro: no cartao de fora, a linha
              sobreviveria a altura zero e apareceria com a secao fechada. */}
          <div className="border-border border-t px-5 py-4.5">
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="font-semibold text-fg text-body">Chave secreta</h3>
              <span className="flex-none text-detail text-fg-muted">nunca vai no site</span>
            </header>

            {revealed ? (
              <RevealedSecretPanel secret={revealed} onAcknowledge={onAcknowledge} />
            ) : secretKey ? (
              <div className="mb-3.5 flex flex-wrap items-center gap-3">
                {/* Só o prefixo, e não por escolha de tela: o banco não tem o resto. */}
                <code className="flex h-9 items-center rounded-lg border border-border bg-surface px-3 font-mono text-detail text-fg-muted">
                  {secretKey.Prefix}•••
                </code>
                <span className="text-detail text-fg-muted tabular-nums">
                  criada em {formatDateTime(secretKey.CreatedAt)}
                </span>
              </div>
            ) : (
              <p className="mb-3.5 text-detail text-fg-muted">Nenhuma chave secreta ativa.</p>
            )}

            <p className="mb-4 text-detail text-fg-muted leading-relaxed">
              Ela autentica chamadas feitas de fora do navegador, como um servidor ou um aplicativo
              seu falando direto com a nossa API. Como essas chamadas leem e alteram relatos, a
              chave não pode entrar no código do site, onde qualquer visitante conseguiria lê-la.
              <br />
              Guardamos só uma impressão digital do valor e nunca o valor em si, por isso mostramos
              apenas o começo dela e nem nós conseguimos recuperar o resto. Perdeu a sua? Gere outra
              e troque onde a antiga estiver.
            </p>

            {/* Mesmo cadeado do menu lateral e do terceiro passo da instalacao: no
                painel inteiro ele quer dizer "existe, ainda nao da para usar".

                A frase dizia que as rotas chegavam "junto com o recebimento de
                relatos", e o recebimento entrou na pds-012 sem elas: nenhuma rota
                aceita a chave secreta ainda. Agora ela diz o que falta e nao promete
                quando — a etapa e decisao que nao saiu.

                E "endereços" saiu do texto: com a lista de enderecos autorizados
                sendo conferida, a mesma palavra passou a significar dominio em
                outra tela do painel. */}
            <p className="mb-4 flex items-center gap-2 text-caption text-fg-muted">
              <LockIcon className="size-3" />
              Nenhuma rota da API aceita esta chave ainda.
            </p>

            <Button onClick={onRegenerate}>Gerar nova chave</Button>

            {revoked.length > 0 && <RevokedKeysPanel keys={revoked} />}
          </div>
        </div>
      </div>
    </section>
  )
}

/** O `?.` existe porque o ambiente de teste nao tem `matchMedia`. */
function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn('size-3 flex-none text-fg-disabled transition-transform', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4.5 2.5 4 3.5-4 3.5" />
    </svg>
  )
}

function LoadingCards() {
  return (
    <div className="flex flex-col gap-4">
      {['w-[34%]', 'w-[30%]'].map((width) => (
        <div key={width} className="rounded-xl border border-border bg-surface-raised p-5">
          <div className="mb-3.5 flex justify-between">
            <Skeleton className={cn('h-3', width)} />
            <Skeleton className="h-2 w-30" />
          </div>
          <div className="mb-4 flex gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-22" />
          </div>
          <Skeleton className="mb-2 h-2 w-full" />
          <Skeleton className="h-2 w-2/3" />
        </div>
      ))}
    </div>
  )
}
