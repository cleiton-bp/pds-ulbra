import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import type { ScrollToHashState } from '@/shared/hooks/useScrollToHash'

/**
 * Os passos na mesma ordem e com os mesmos nomes dos primeiros passos da tela: quem fecha
 * o dialogo reconhece cada um na lista logo embaixo, que vai se marcando sozinha.
 */
const PARA_COMECAR = [
  {
    titulo: 'Colar o script no seu sistema',
    texto: 'Uma linha no seu site ou aplicação faz o botão de relato aparecer para quem usa.',
  },
  {
    titulo: 'Autorizar o endereço do seu sistema',
    texto:
      'Em Domínios, você diz de onde os relatos podem chegar, e o que vier de outro endereço fica retido até você liberar.',
  },
  {
    titulo: 'Enviar um relato de teste',
    texto: 'Relate algo pelo botão e veja o relato chegar no Trabalho.',
  },
  {
    titulo: 'Escolher a cor e o texto do botão',
    texto: 'Com a cara do seu sistema, as pessoas reconhecem o botão e clicam.',
  },
  {
    titulo: 'Convidar o time',
    texto: 'Chame quem vai tratar os relatos com você.',
  },
] as const

/** O que acontece depois de pronto: o caminho de um relato, do lado do time e do lado de quem relatou. */
const NO_DIA_A_DIA = [
  'Cada relato chega como um card no Trabalho, na coluna de entrada.',
  'Ao mover o card, quem relatou vê a etapa mudar pelo link de acompanhamento.',
  'Ao encerrar, a pessoa confirma que foi resolvido ou reabre o relato.',
] as const

/** Ao chegar no script, o campo acende, como nos links dos primeiros passos. */
const REALCE: ScrollToHashState = { realce: true }

/**
 * As boas-vindas do primeiro projeto da conta: o caminho ate o primeiro relato, numa
 * tela so, antes de a pessoa comecar a configurar.
 *
 * **So no primeiro projeto.** Quem ja criou um conhece o caminho, e os primeiros passos
 * continuam na tela para os outros. Por isso o pedido vem do dialogo de criar projeto, e
 * nao de uma marca guardada no navegador.
 *
 * **Duas partes, e nao um texto corrido.** O que se faz uma vez (os cinco passos, com os
 * nomes da lista da tela) e o que acontece todo dia (o relato andando). O botao principal
 * leva ao primeiro passo; fechar deixa a pessoa na configuracao, com a lista a vista.
 */
export function FirstProjectWelcome({
  open,
  onOpenChange,
  projectPublicId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectPublicId: string
}) {
  const navigate = useNavigate()

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Como começar"
      description="Cinco passos deixam o projeto pronto para receber relatos, e esta tela marca cada um sozinha."
      width="w-[min(32rem,calc(100vw-2rem))]"
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Ver depois
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onOpenChange(false)
              navigate(`/projects/${projectPublicId}/start#script`, { state: REALCE })
            }}
          >
            Começar pelo script
          </Button>
        </>
      }
    >
      <h3 className="mb-2 font-medium text-caption text-fg-muted">Para começar</h3>
      <ol className="flex flex-col gap-3">
        {PARA_COMECAR.map((passo, i) => (
          <li
            key={passo.titulo}
            // Os passos chegam um depois do outro, na ordem em que se fazem.
            style={{ animationDelay: `${120 + i * 60}ms` }}
            className="flex animate-pop items-start gap-3"
          >
            <span
              aria-hidden="true"
              className="mt-px flex size-6 flex-none items-center justify-center rounded-full border border-border bg-surface-raised text-caption text-fg-muted tabular-nums"
            >
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-body text-fg">{passo.titulo}</span>
              <span className="mt-0.5 block text-caption text-fg-muted leading-relaxed">
                {passo.texto}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <h3 className="mt-6 mb-2 font-medium text-caption text-fg-muted">Depois, no dia a dia</h3>
      <ul
        style={{ animationDelay: `${120 + PARA_COMECAR.length * 60}ms` }}
        className="flex animate-pop flex-col gap-2 rounded-lg bg-surface-sunken px-3 py-3"
      >
        {NO_DIA_A_DIA.map((linha) => (
          <li key={linha} className="flex items-start gap-2.5 text-caption text-fg leading-relaxed">
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 flex-none rounded-full bg-fg-muted"
            />
            {linha}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
