import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { MAX_ORIGIN_DOMAIN_LENGTH, type ProjectOriginViewModel } from '@/contracts'
import { describeError, projectOriginService } from '@/data'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/**
 * Os enderecos cujo relato entra direto no Trabalho.
 *
 * **Fora da lista, o relato e recebido e fica retido** — em "Aguardando liberacao", a
 * primeira aba —, e nao recusado: a ferramenta abre em qualquer endereco que nao esteja
 * bloqueado. A lista vazia nao autoriza ninguem, entao todo endereco novo passa uma vez
 * pela pergunta "permitir ou bloquear?". Antes ela nascia aberta e o relato de quem
 * copiou a chave entrava sem ninguem ter dito sim.
 *
 * **E o texto nao promete muro.** Quem declara o endereco e o carregador, que e
 * codigo nosso — entao a lista pega a chave colada no site errado, que e o caso
 * comum, e nao pega quem falar direto com a API. Por isso existem os limites por IP e
 * por projeto, na aba Proteção desta mesma tela.
 *
 * **O curinga nao e uma linha propria.** O banco guarda o dominio e um sim/nao;
 * quem escreve `*.` e a tela, na hora de mostrar. Guardar as duas formas faria a
 * mesma autorizacao existir de dois jeitos, e um deles ficaria em desacordo com a
 * caixa marcada.
 */
export function AllowedOriginsSection({
  projectPublicId,
  refreshKey = 0,
  onChange,
}: {
  projectPublicId: string
  /**
   * Muda quando outra parte da tela de Dominios mexeu nesta lista — bloquear tira o
   * endereco daqui, e "Permitir" poe. A lista e relida sem o esqueleto voltar.
   */
  refreshKey?: number
  /**
   * A lista como esta agora, a cada mudanca: a tela de Dominios rele as outras listas e
   * poe a contagem na aba "Autorizados".
   */
  onChange?: (origins: ProjectOriginViewModel[]) => void
}) {
  const subdomainsId = useId()

  const {
    data: loaded,
    loading,
    failed,
    reload,
    revalidate,
  } = useAsyncResource(
    useCallback(() => projectOriginService.listProjectOrigins(projectPublicId), [projectPublicId]),
  )

  // Copia local para adicionar e remover sem o esqueleto voltar: `useAsyncResource`
  // zera os dados a cada nova busca, e piscar a lista inteira a cada dominio
  // removido faria a tela parecer que recarregou sozinha.
  const [origins, setOrigins] = useState<ProjectOriginViewModel[] | null>(null)
  useEffect(() => setOrigins(loaded), [loaded])

  // A primeira leitura ja acontece sozinha; so a mudanca de fora pede outra. Com
  // `revalidate`: a leitura a caminho e de antes da mudanca, e nao serve.
  const chaveLida = useRef(refreshKey)
  useEffect(() => {
    if (chaveLida.current === refreshKey) return
    chaveLida.current = refreshKey
    revalidate()
  }, [refreshKey, revalidate])

  const avisar = useRef(onChange)
  avisar.current = onChange
  useEffect(() => {
    if (origins !== null) avisar.current?.(origins)
  }, [origins])

  const [domain, setDomain] = useState('')
  const [allowsSubdomains, setAllowsSubdomains] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<ProjectOriginViewModel | null>(null)

  async function add() {
    const value = domain.trim()
    if (value.length === 0 || adding) return

    setAdding(true)
    setError(null)

    try {
      const created = await projectOriginService.addProjectOrigin(projectPublicId, {
        Domain: value,
        AllowsSubdomains: allowsSubdomains,
      })

      // A API devolve o dominio ja normalizado, e e essa forma que entra na lista:
      // reaproveitar o que foi digitado deixaria `SITE.com/` na tela ate recarregar.
      setOrigins((list) => [...(list ?? []), created].sort(byDomain))
      setDomain('')
      setAllowsSubdomains(false)
    } catch (failure) {
      // Erro de dominio invalido ou repetido pertence ao campo: ha o que corrigir,
      // e a correcao e ali.
      setError(describeError(failure))
    } finally {
      setAdding(false)
    }
  }

  async function remove(origin: ProjectOriginViewModel) {
    try {
      await projectOriginService.removeProjectOrigin(projectPublicId, origin.PublicId)
      setOrigins((list) => (list ?? []).filter((item) => item.PublicId !== origin.PublicId))
      toast.done('Domínio removido.')
    } catch (failure) {
      toast.error(describeError(failure))
    }
  }

  return (
    <section id="autorizados" className="scroll-mt-6">
      <h3 className="mb-1 font-semibold text-body">Autorizados</h3>
      <p className="mb-2 text-detail text-fg-muted leading-relaxed">
        O relato destes endereços entra direto no Trabalho; o de fora da lista espera em “Aguardando
        liberação”.
      </p>

      {/* O que mais trava a primeira hora — o teste em localhost e o staging num
          subdominio — fica no "Como funciona" e, com a lista vazia, no proprio vazio. */}
      <HowItWorks>
        <p>
          Para testar no seu computador, adicione <code className="font-mono">localhost:3000</code>{' '}
          — com a porta, porque cada porta é um endereço. Para valer em todos os subdomínios,
          escreva <code className="font-mono">*.loja.com</code> ou marque a caixa abaixo do campo.
        </p>
        <p>
          O relato que não diz de onde veio também espera em “Aguardando liberação”. Remover um
          endereço não mexe no que já entrou: vale para o próximo relato.
        </p>
        <p>
          A conferência pega a chave pública colada no sistema errado, que é o caso comum. Quem
          chama a nossa API sem passar pela ferramenta declara o endereço que quiser — para isso
          existem os limites por IP e por projeto, na aba Proteção.
        </p>
      </HowItWorks>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
            Não deu para carregar os domínios deste projeto agora. A falha foi ao consultar: a lista
            continua exatamente como estava.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {['w-48', 'w-40'].map((width) => (
            <div
              key={width}
              className="flex h-11 items-center rounded-lg border border-border bg-surface-raised px-3.5"
            >
              <Skeleton className={`h-3 ${width}`} />
            </div>
          ))}
        </div>
      )}

      {/* O vazio e o estado de todo projeto novo, e diz o que acontece com ele: o
          relato chega e espera a decisao. E o atalho do teste local, que e o primeiro
          endereco de quase todo mundo. */}
      {origins !== null && origins.length === 0 && (
        <p className="mb-4 rounded-lg border border-border border-dashed px-3.5 py-3 text-detail text-fg-muted leading-relaxed">
          Nenhum endereço autorizado ainda: o primeiro relato de cada endereço pede a sua decisão,
          em “Aguardando liberação”. Para testar no seu computador, adicione{' '}
          <code className="font-mono">localhost:3000</code>.
        </p>
      )}

      {origins !== null && origins.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {origins.map((origin) => (
            <li
              key={origin.PublicId}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised py-2 pr-2 pl-3.5"
            >
              <code className="min-w-0 flex-1 truncate font-mono text-detail text-fg">
                {displayDomain(origin)}
              </code>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(origin)}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}

      {origins !== null && (
        <div>
          <div className="flex items-start gap-2">
            <TextField
              className="min-w-0 flex-1"
              ariaLabel="Endereço do seu sistema"
              value={domain}
              onChange={(value) => {
                setDomain(value)
                if (error) setError(null)
              }}
              placeholder="loja.exemplo.com"
              error={error}
              maxLength={MAX_ORIGIN_DOMAIN_LENGTH}
              disabled={adding}
              onSubmit={add}
            />
            <Button variant="primary" disabled={domain.trim().length === 0 || adding} onClick={add}>
              Adicionar domínio
            </Button>
          </div>

          <label htmlFor={subdomainsId} className="mt-3 flex items-start gap-2">
            <input
              id={subdomainsId}
              type="checkbox"
              checked={allowsSubdomains}
              onChange={(event) => setAllowsSubdomains(event.target.checked)}
              disabled={adding}
              className="mt-0.5 size-3.5 flex-none accent-accent"
            />
            <span className="text-detail text-fg-muted leading-normal">
              Incluir os subdomínios — vale também para <code className="font-mono">app.</code> e{' '}
              <code className="font-mono">loja.</code> na frente do endereço.
            </span>
          </label>
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="Remover domínio"
        description={
          'O próximo relato deste endereço fica em “Aguardando liberação”, até alguém permitir de novo. Os que já entraram continuam no Trabalho.'
        }
        confirmLabel="Remover domínio"
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />
    </section>
  )
}

/**
 * O curinga aparece so aqui. `AllowsSubdomains` e um sim/nao no banco, e `*.` e a
 * forma como essa resposta se escreve — e a mesma que o cliente ja conhece de
 * outros produtos.
 */
function displayDomain(origin: ProjectOriginViewModel): string {
  return origin.AllowsSubdomains ? `*.${origin.Domain}` : origin.Domain
}

function byDomain(a: ProjectOriginViewModel, b: ProjectOriginViewModel): number {
  return a.Domain.localeCompare(b.Domain)
}
