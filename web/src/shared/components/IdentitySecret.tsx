import { type ReactNode, useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import type { IdentitySecretHistoryItemViewModel } from '@/contracts'
import { describeError, projectIdentitySettingsService } from '@/data'
import { Button } from '@/shared/components/Button'
import { MaskedValue } from '@/shared/components/MaskedValue'
import { Modal } from '@/shared/components/Modal'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { formatDateTime } from '@/shared/lib/datetime'
import { guideTarget } from '@/shared/tour/guideStore'

/**
 * A chave secreta da identidade: a que o servidor do cliente usa para assinar quem esta
 * na conta, na assinatura simples da Identidade do seu sistema (Privacidade).
 *
 * **Mora em Chaves porque e uma chave**, como a publica e a secreta da API, e **abre
 * tambem num dialogo na Privacidade** (`IdentitySecretDialog`): quem esta no meio do passo
 * a passo, com mudancas por salvar, ve e copia a chave sem sair da tela, e sem a pergunta
 * de salvar ou descartar que sair dela faria. O miolo e um so (`ChaveDaIdentidade`).
 *
 * **Escondida ate a pessoa pedir.** A tela nao a busca sozinha: ela sai por uma rota
 * propria, so para administrador, e so quando alguem clica. Trocar pede confirmacao na
 * propria linha, porque todo cracha assinado com a anterior para de valer na hora.
 *
 * Sem a chave mestra na instalacao (`IDENTITY_HMAC_KEY`), so diz por que nao ha chave, e
 * que o JWT continua disponivel.
 *
 * Em `shared` porque duas telas a usam (Chaves e Privacidade): uma tela importando da
 * outra inverteria a direcao das camadas.
 */
export function IdentitySecretCard({ projectPublicId }: { projectPublicId: string }) {
  return (
    <article
      id="chave-da-identidade"
      className="mt-4 scroll-mt-6 rounded-xl border border-border bg-surface-raised p-5"
    >
      <header className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-fg text-lead" {...guideTarget('chave-da-identidade')}>
          Chave da identidade
        </h2>
        <span className="flex-none text-detail text-fg-muted">fica só no seu servidor</span>
      </header>

      <ChaveDaIdentidade
        projectPublicId={projectPublicId}
        atalho={
          <Link
            to="../identity#reconhecimento"
            className="inline-flex items-center gap-1.5 font-medium text-detail text-fg underline-offset-4 hover:underline"
          >
            Ver o passo a passo em Privacidade
          </Link>
        }
      />
    </article>
  )
}

/**
 * A mesma chave, num dialogo: o passo a passo da Privacidade abre por aqui. O rodape leva
 * a tela de Chaves para quem quer ir ate ela, e so entao a tela pergunta pelas mudancas.
 */
export function IdentitySecretDialog({
  projectPublicId,
  open,
  onOpenChange,
}: {
  projectPublicId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Chave da identidade"
      description="Copie e guarde no servidor do seu sistema, numa variável de ambiente como RELATOFACIL_SECRET."
      width="w-[min(34rem,calc(100vw-2rem))]"
      footer={
        <>
          <Link
            to="../keys#chave-da-identidade"
            className="mr-auto inline-flex h-9 items-center font-medium text-detail text-fg underline-offset-4 hover:underline"
          >
            Abrir a tela de Chaves
          </Link>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </>
      }
    >
      {/* Montado so aberto: a leitura da disponibilidade e o segredo nao saem por nada. */}
      {open && <ChaveDaIdentidade projectPublicId={projectPublicId} />}
    </Modal>
  )
}

/** O miolo da chave: o campo, a frase de para que serve, a troca e o atalho de baixo. */
function ChaveDaIdentidade({
  projectPublicId,
  atalho,
}: {
  projectPublicId: string
  /** O link do pe, a esquerda do "Trocar a chave": em Chaves, leva a Privacidade. */
  atalho?: ReactNode
}) {
  const { data: identidade } = useAsyncResource(
    useCallback(
      () => projectIdentitySettingsService.getIdentitySettings(projectPublicId),
      [projectPublicId],
    ),
  )
  const { data: historico, revalidate: releHistorico } = useAsyncResource(
    useCallback(
      () => projectIdentitySettingsService.getIdentitySecretHistory(projectPublicId),
      [projectPublicId],
    ),
  )
  const [segredo, setSegredo] = useState<string | null>(null)
  /** A chave na tela acabou de ser trocada: ela aparece revelada, com o aviso de nova. */
  const [trocadaAgora, setTrocadaAgora] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [confirmarTroca, setConfirmarTroca] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  // Enquanto a leitura nao chega, aparece pronto para pedir: sem a chave mestra, a propria
  // rota recusa, e a recusa diz por que.
  const disponivel = identidade?.IsHmacAvailable ?? true

  async function pedir(acao: 'ver' | 'trocar') {
    setOcupado(true)
    setFalha(null)
    try {
      const resposta =
        acao === 'ver'
          ? await projectIdentitySettingsService.getIdentitySecret(projectPublicId)
          : await projectIdentitySettingsService.rotateIdentitySecret(projectPublicId)
      setSegredo(resposta.Secret)
      setTrocadaAgora(acao === 'trocar')
      if (acao === 'trocar') {
        // A anterior acabou de entrar no historico.
        releHistorico()
        toast.done('Chave trocada. Atualize o servidor do seu sistema.')
      }
    } catch (erro) {
      setFalha(describeError(erro))
    } finally {
      setOcupado(false)
      setConfirmarTroca(false)
    }
  }

  return (
    <>
      {!disponivel ? (
        <p className="mb-3.5 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-detail text-fg-muted leading-relaxed">
          Esta instalação não tem a chave mestra (IDENTITY_HMAC_KEY), então a identidade do seu
          sistema usa só o JWT.
        </p>
      ) : segredo ? (
        // A chave nova monta de novo, e revelada: escondida pelo olho, os pontos da nova eram
        // iguais aos da anterior, e a troca parecia nao ter feito nada.
        <div key={segredo} className="mb-3.5 animate-fade-in">
          <MaskedValue value={segredo} revealed />
          {trocadaAgora && (
            <p role="status" className="mt-2 text-detail text-active-fg">
              <span className="rounded-full bg-active px-2 py-0.5 font-medium text-caption">
                Chave nova
              </span>{' '}
              <span className="text-fg">
                Trocada agora, então atualize o servidor do seu sistema com ela.
              </span>
            </p>
          )}
        </div>
      ) : (
        <div className="mb-3.5 flex items-center gap-2">
          <code className="flex h-10 min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-border bg-surface px-3.5 font-mono text-body text-fg-muted">
            {'•'.repeat(24)}
          </code>
          <Button disabled={ocupado} onClick={() => void pedir('ver')}>
            {ocupado ? 'Buscando…' : 'Mostrar a chave'}
          </Button>
        </div>
      )}

      <p className="text-detail text-fg-muted leading-relaxed">
        É com ela que o servidor do seu sistema assina quem está na conta, na Identidade do seu
        sistema com a assinatura simples, e por isso ela nunca vai no código da página.
      </p>

      {confirmarTroca && (
        <div className="mt-3.5 flex animate-fade-in flex-wrap items-center gap-2 rounded-lg border border-warn-border bg-warn-surface px-3.5 py-2.5">
          <span className="min-w-0 flex-1 text-detail text-warn-fg">
            A chave atual para de valer na hora, até o seu servidor usar a nova.
          </span>
          <Button size="sm" variant="ghost" onClick={() => setConfirmarTroca(false)}>
            Cancelar
          </Button>
          <Button size="sm" disabled={ocupado} onClick={() => void pedir('trocar')}>
            Trocar agora
          </Button>
        </div>
      )}

      {falha && <p className="mt-3 text-detail text-error-fg">{falha}</p>}

      {disponivel && historico && <ChavesAnteriores itens={historico} />}

      {(atalho || (disponivel && !confirmarTroca)) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {atalho ?? <span />}
          {disponivel && !confirmarTroca && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmarTroca(true)}>
              Trocar a chave
            </Button>
          )}
        </div>
      )}
    </>
  )
}

/**
 * As ultimas chaves que ja nao valem, da troca mais recente para a mais antiga: **so o
 * comeco de cada uma**, o bastante para reconhecer qual chave um servidor ainda usa, e
 * quando ela foi trocada. O mesmo desenho das chaves revogadas da API, nesta tela.
 */
function ChavesAnteriores({ itens }: { itens: IdentitySecretHistoryItemViewModel[] }) {
  return (
    <div className="mt-5">
      <h3 className="mb-1 font-semibold text-body text-fg">Chaves anteriores</h3>
      {itens.length === 0 ? (
        <p className="text-detail text-fg-muted">
          Nenhuma troca ainda, e as três últimas chaves trocadas aparecem aqui.
        </p>
      ) : (
        <>
          <p className="mb-2 text-detail text-fg-muted">
            As últimas chaves trocadas, que já não valem e ficam aqui só como registro.
          </p>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {['chave', 'trocada em'].map((rotulo) => (
                  <th
                    key={rotulo}
                    className="border-border border-b py-2 pr-3 text-left font-normal text-caption text-fg-muted"
                  >
                    {rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.ReplacedAt} className="animate-fade-in">
                  <td className="border-border border-b py-2.5 pr-3 font-mono text-detail text-fg-muted">
                    {item.Prefix ? `${item.Prefix}•••` : 'chave antiga'}
                  </td>
                  <td className="border-border border-b py-2.5 text-caption text-fg-muted tabular-nums">
                    {formatDateTime(item.ReplacedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
