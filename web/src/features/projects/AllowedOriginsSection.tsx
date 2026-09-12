import { useCallback, useEffect, useId, useState } from 'react'
import { MAX_ORIGIN_DOMAIN_LENGTH, type ProjectOriginViewModel } from '@/contracts'
import { describeError, projectOriginService } from '@/data'
import { Button } from '@/shared/components/Button'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/**
 * De onde a ferramenta pode abrir.
 *
 * **A tela nao promete bloqueio, porque ainda nao existe bloqueio.** Quem barra e
 * o `frame-ancestors` montado desta lista, e ninguem o emite: nenhuma linha do
 * sistema le esta tabela hoje. O desenho (prancheta 13) escreve "o bloqueio passa
 * a valer no momento em que voce declara o primeiro", e essa frase e verdadeira
 * no produto pronto, nao agora. Escreve-la hoje faria a tela dizer que travou um
 * site que continua aberto.
 *
 * O pds-013 mudou **metade** da premissa e por pouco nao deixou a tela mentindo:
 * a ferramenta agora abre de verdade em qualquer site que cole o script. O que
 * nao mudou e a conferencia, que continua nao existindo — dai o texto ter saido
 * de "ainda nao esta no ar" para "a lista ainda nao e conferida".
 *
 * **A lista nasce aberta**, e isso continua valendo: lista vazia significa abrir em
 * qualquer endereco e so registrar de onde veio.
 *
 * **O curinga nao e uma linha propria.** O banco guarda o dominio e um sim/nao;
 * quem escreve `*.` e a tela, na hora de mostrar. Guardar as duas formas faria a
 * mesma autorizacao existir de dois jeitos, e um deles ficaria em desacordo com a
 * caixa marcada.
 */
export function AllowedOriginsSection({ projectPublicId }: { projectPublicId: string }) {
  const subdomainsId = useId()

  const {
    data: loaded,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(() => projectOriginService.listProjectOrigins(projectPublicId), [projectPublicId]),
  )

  // Copia local para adicionar e remover sem o esqueleto voltar: `useAsyncResource`
  // zera os dados a cada nova busca, e piscar a lista inteira a cada dominio
  // removido faria a tela parecer que recarregou sozinha.
  const [origins, setOrigins] = useState<ProjectOriginViewModel[] | null>(null)
  useEffect(() => setOrigins(loaded), [loaded])

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
    <section>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-semibold text-lead">Onde a ferramenta pode rodar</h2>
        <span className="rounded-full border border-border px-2 py-0.5 text-caption text-fg-muted">
          ainda não vale
        </span>
      </div>
      <p className="mb-4 text-detail text-fg-muted leading-relaxed">
        Registre aqui os endereços do seu site. A lista ainda não é conferida: hoje a ferramenta
        abre em qualquer endereço que tenha a sua chave, e só registra de onde veio. Quando a
        conferência entrar, é esta lista que vai decidir onde ela pode abrir.
      </p>

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

      {/* Lista vazia nao ganha tela de vazio: o convite ja e o campo logo abaixo, e
          o paragrafo acima ja explicou o que a ausencia significa. */}
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
              ariaLabel="Endereço do seu site"
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
          origins?.length === 1
            ? 'Era o último endereço da lista. Como a conferência ainda não existe, isso não muda nada hoje: a ferramenta já abre em qualquer endereço.'
            : 'O endereço sai da lista. Ele voltará a fazer diferença quando a conferência entrar — e você pode declará-lo de novo antes disso.'
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
