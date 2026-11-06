import { useState } from 'react'
import { MAX_COMMENT_LENGTH } from '@/contracts'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'

/**
 * O que se pergunta antes de devolver o relato.
 *
 * **Devolver não é recusar, e a tela precisa deixar isso óbvio para quem escreve.**
 * "Não reproduzi" e "não vamos fazer" são decisões opostas, e chegando iguais do
 * outro lado a pessoa entende que acabou e para de responder — o relato morre por
 * ruído. Por isso este diálogo é separado do de encerrar, com outro verbo e outro
 * texto de apoio.
 *
 * **O campo pede *o que* falta, e não *que* falta.** "Preciso de mais detalhes"
 * devolve o problema para quem já não sabia o que dizer; "em qual navegador, e o
 * que aparecia na tela" é uma pergunta que dá para responder. O texto de apoio
 * cobra isso porque é o erro que se comete sem perceber.
 *
 * **E avisa que o relógio começa a correr.** Quem pergunta precisa saber que o
 * relato encerra sozinho se ninguém responder — senão a devolução vira uma forma
 * silenciosa de arquivar.
 */
export function AskInfoDialog({
  enviando,
  aoConfirmar,
  aoCancelar,
}: {
  enviando: boolean
  aoConfirmar: (body: string) => void
  aoCancelar: () => void
}) {
  const [texto, setTexto] = useState('')
  const escrito = texto.trim()

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto && !enviando) aoCancelar()
      }}
      title="Pedir informação"
      description="Quem relatou responde pela página de acompanhamento, e o relato não encerra."
      width="w-[min(32rem,calc(100vw-2rem))]"
      // Com texto escrito, o clique fora nao fecha: errar a caixa nao pode levar o
      // texto junto. O Esc e o "Cancelar" continuam fechando.
      closeOnOutsideClick={escrito.length === 0}
      footer={
        <>
          <Button variant="quiet" disabled={enviando} onClick={aoCancelar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={escrito.length === 0 || enviando}
            onClick={() => aoConfirmar(escrito)}
          >
            {enviando ? 'Enviando…' : 'Pedir'}
          </Button>
        </>
      }
    >
      <label htmlFor="o-que-falta" className="mb-1.5 block text-detail text-fg-muted">
        O que você precisa saber
      </label>
      <textarea
        id="o-que-falta"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        disabled={enviando}
        rows={4}
        placeholder="Em qual navegador isso aconteceu, e o que aparecia na tela?"
        className="block w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-body text-fg leading-relaxed placeholder:text-fg-placeholder disabled:opacity-60"
      />

      {/* Uma frase so: o exemplo do campo ja mostra como perguntar, e o resto do prazo
          (avisar, encerrar, reabrir) mora no Encerramento. */}
      <p className="mt-1.5 text-caption text-fg-muted leading-normal">
        Sem resposta no prazo do projeto, o relato encerra sozinho como “sem retorno”.
      </p>
    </Modal>
  )
}
