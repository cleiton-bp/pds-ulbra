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
 * **Agora a lista e conferida**, e a frase do desenho (prancheta 13) — "o bloqueio
 * passa a valer no momento em que voce declara o primeiro" — finalmente pode ser
 * escrita na tela. Ela esperou tres etapas: a pds-011 criou a lista, a pds-013 fez
 * a ferramenta abrir de verdade, e ate a pds-015 nenhuma linha do sistema lia esta
 * tabela. Dai a etiqueta "ainda nao vale" ter saido daqui, e nao a frase.
 *
 * **A lista nasce aberta**, e isso continua valendo — lista vazia abre em qualquer
 * endereco. Nao e brecha esquecida: a leitura contraria teria apagado a ferramenta
 * de toda instalacao no ar no dia em que a conferencia entrou, sem erro em tela
 * nenhuma, porque o quadro que nao pode abrir simplesmente nao aparece.
 *
 * **E o texto nao promete muro.** Quem declara o endereco e o carregador, que e
 * codigo nosso — entao a lista pega a chave colada no site errado, que e o caso
 * comum, e nao pega quem falar direto com a API. Dizer "so estes enderecos
 * conseguem" seria mentira; o que a tela diz e o que de fato acontece, e a frase
 * inteira chega com o `frame-ancestors`, que precisa de dominio proprio.
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

  /**
   * A lista esta restringindo, ou so registrando? Enquanto ela carrega a resposta
   * e "nao sei", e `origins` nulo cai no mesmo lado de vazia — o texto de quem
   * ainda nao restringiu e o que nao promete nada.
   */
  const restricted = (origins?.length ?? 0) > 0

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
      <h2 className="mb-1 font-semibold text-lead">Onde a ferramenta pode rodar</h2>

      {/* O paragrafo muda com a lista porque a lista muda a regra: vazia, ela nao
          restringe nada, e dizer "so estes enderecos" na frente de uma lista vazia
          descreveria o contrario do que acontece. */}
      {restricted ? (
        <>
          <p className="mb-2 text-detail text-fg-muted leading-relaxed">
            A ferramenta só abre nos endereços desta lista, e um relato aberto fora dela é recusado.
            Remover todos volta a aceitar qualquer endereço.
          </p>
          {/* Aparece so quando alguem passa a depender da lista. Antes disso seria
              ressalva sobre uma conferencia que nem esta ligada. */}
          <p className="mb-4 text-caption text-fg-muted leading-normal">
            A conferência pega a chave pública colada no site errado, que é o caso comum. Quem chama
            a nossa API sem passar pela ferramenta declara o endereço que quiser — essa barreira
            chega junto com o nosso domínio próprio.
          </p>
        </>
      ) : (
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">
          Hoje a ferramenta abre em qualquer endereço que tenha a sua chave pública, e o painel só
          registra de onde cada relato veio.{' '}
          <strong className="font-medium text-fg">
            O primeiro endereço declarado aqui liga a conferência
          </strong>
          : a partir dele, a ferramenta só abre nos endereços desta lista.
        </p>
      )}

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
            ? 'Era o último endereço da lista. Sem nenhum, a conferência desliga e o projeto volta a aceitar a ferramenta em qualquer endereço.'
            : 'A ferramenta para de abrir neste endereço, e um relato aberto lá passa a ser recusado. Vale na próxima carga da página.'
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
