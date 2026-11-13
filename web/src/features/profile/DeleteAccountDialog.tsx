import { type ReactNode, useCallback, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authService, describeError } from '@/data'
import { useSessionStore } from '@/features/auth/sessionStore'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { formatDateTime } from '@/shared/lib/datetime'
import { useProfileDialogStore } from '@/shared/lib/profileDialogStore'

/** "1 hora" ou "24 horas": o numero sempre escrito, e a palavra no numero certo. */
function contar(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`
}

/**
 * A confirmacao da exclusao da conta, aberta pelo Perfil.
 *
 * **Explica tudo antes do botao**, nesta ordem: o que acontece assim que a pessoa confirma
 * (sai do painel, os projetos saem do ar e o botao some dos sites, quem relatou deixa de
 * abrir o acompanhamento, o time perde o acesso), o que acontece no fim das 24 horas (a
 * exclusao de verdade e o que fica sem identificacao) e, por ultimo, em destaque, como
 * desfazer. Os numeros vem do banco, para a pessoa decidir sabendo o tamanho do que apaga.
 *
 * **O botao confirma, e nada mais se pede.** Ja teve palavra e depois frase para digitar;
 * a explicacao e o prazo de 24 horas para desistir sao a protecao, e a digitacao so
 * atrapalhava quem ja tinha decidido. Clicar fora nao fecha, para o texto lido nao sumir
 * por um clique que errou a caixa.
 *
 * **Largo, para caber sem rolar**: o que acontece agora e o que acontece em 24 horas ficam
 * lado a lado na tela larga, e um embaixo do outro no celular.
 *
 * Confirmado, a API encerra todas as sessoes da pessoa; o painel fecha o Perfil e volta para
 * a entrada, que repete o prazo e o caminho de desfazer.
 */
export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const descricaoId = useId()
  const navigate = useNavigate()
  const closeProfile = useProfileDialogStore((state) => state.closeProfile)
  const endAfterDeletion = useSessionStore((state) => state.endAfterDeletion)
  const { data, failed, reload } = useAsyncResource(
    useCallback(() => authService.getDeletionPreview(), []),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  const horas = data ? contar(data.GraceHours, 'hora', 'horas') : '24 horas'
  // O prazo como a pessoa vai ver depois na entrada: a partir de agora, e nao do momento
  // em que o dialogo abriu, porque e o clique que conta.
  const ate = data
    ? formatDateTime(new Date(Date.now() + data.GraceHours * 3_600_000).toISOString())
    : null

  async function confirmar() {
    if (!data || excluindo) return
    setExcluindo(true)
    setErro(null)
    try {
      const pedido = await authService.requestDeletion()
      onClose()
      closeProfile()
      endAfterDeletion(pedido.PurgeAt)
      navigate('/', { replace: true })
    } catch (falha) {
      setErro(describeError(falha))
      setExcluindo(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto && !excluindo) onClose()
      }}
      closeOnOutsideClick={false}
      describedBy={descricaoId}
      title="Excluir a sua conta?"
      width="w-[min(46rem,calc(100vw-2rem))]"
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      footer={
        <>
          {erro && (
            <p
              role="alert"
              className="basis-full text-detail text-error-fg sm:mr-auto sm:basis-auto"
            >
              {erro}
            </p>
          )}
          <Button variant="quiet" disabled={excluindo} onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="warn" disabled={!data || excluindo} onClick={() => void confirmar()}>
            {excluindo ? 'Excluindo…' : 'Excluir a conta'}
          </Button>
        </>
      }
    >
      <p id={descricaoId} className="text-body text-fg leading-relaxed">
        Você tem {horas} para desistir, e depois disso a conta é apagada de vez.
      </p>

      {data ? (
        <div className="mt-4 flex animate-panel-in flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
            <Bloco titulo="Assim que você confirmar">
              <Item>Você sai do painel em todos os aparelhos.</Item>
              {data.Projects > 0 ? (
                <>
                  <Item>
                    {data.Projects === 1
                      ? 'O seu projeto sai do ar, e o botão de relato some dos sites em que foi instalado.'
                      : `Os seus ${data.Projects} projetos saem do ar, e o botão de relato some dos sites em que foi instalado.`}
                  </Item>
                  <Item>Quem relatou deixa de conseguir abrir a página de acompanhamento.</Item>
                </>
              ) : (
                <Item>A sua conta não tem projetos no ar.</Item>
              )}
              {data.TeamMembers > 0 && (
                <Item>
                  {data.TeamMembers === 1
                    ? '1 pessoa do seu time perde o acesso aos projetos.'
                    : `${data.TeamMembers} pessoas do seu time perdem o acesso aos projetos.`}
                </Item>
              )}
            </Bloco>

            <Bloco titulo={`Depois de ${horas}`}>
              <Item>
                {data.Reports > 0
                  ? `A conta, os projetos e ${contar(data.Reports, 'relato ou card', 'relatos e cards')} são apagados de vez, com os anexos.`
                  : 'A conta e os projetos são apagados de vez.'}
              </Item>
              <Item>O seu nome, o seu e-mail e a sua foto saem do sistema.</Item>
              {data.OtherProjects > 0 && (
                <Item>
                  {data.OtherProjects === 1
                    ? 'Você sai do time do projeto de outra pessoa em que trabalha, e o que escreveu lá fica sem o seu nome.'
                    : `Você sai do time dos ${data.OtherProjects} projetos de outras pessoas em que trabalha, e o que escreveu lá fica sem o seu nome.`}
                </Item>
              )}
              <Item>Ficam só contagens sem identificação, para medir o uso da plataforma.</Item>
            </Bloco>
          </div>

          <div className="rounded-lg border border-border bg-surface-sunken px-4 py-3">
            <p className="font-medium text-body text-fg">Mudou de ideia?</p>
            <p className="mt-0.5 text-detail text-fg leading-relaxed">
              Entre de novo com o mesmo Google até {ate}, e tudo volta como estava, inclusive o
              botão nos sites.
            </p>
          </div>
        </div>
      ) : failed ? (
        <div className="mt-4 rounded-xl border border-border p-5">
          <p className="mb-3.5 text-body text-fg-muted">
            Não deu para carregar o que a exclusão leva agora.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      ) : (
        <Skeleton className="mt-4 h-56 w-full" />
      )}
    </Modal>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 font-medium text-caption text-fg-muted">{titulo}</h4>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </section>
  )
}

function Item({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-detail text-fg leading-relaxed">
      <span aria-hidden="true" className="mt-2 size-1.5 flex-none rounded-full bg-fg-muted" />
      <span>{children}</span>
    </li>
  )
}
