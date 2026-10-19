import { useId, useState } from 'react'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { TextField } from '@/shared/components/TextField'

/** A palavra que confirma, alem do proprio dominio. A API aceita as duas. */
const PALAVRA = 'apagar'

/**
 * A confirmacao forte do "Apagar de vez" dos cards de origem bloqueada.
 *
 * **Forte porque nao tem volta, e foi escolha do usuario contra arquivar.** O dominio
 * pode ter sido bloqueado por engano, e o que sai aqui sai do banco: o texto, as
 * respostas, os anexos, os comentarios, as subtarefas — e o link de quem relatou para
 * de abrir. Por isso o dialogo diz quantos, diz que nao ha volta, e so libera o botao
 * depois de a pessoa escrever o dominio (quando todos vieram de um so) ou a palavra
 * "apagar". O clique fora nao fecha: com o texto escrito, um clique errado nao pode
 * sumir com a decisao pela metade.
 *
 * A API confere a mesma confirmacao: a tela so evita o pedido que ela recusaria.
 */
export function DeleteBlockedOriginDialog({
  count,
  domain,
  onConfirm,
  onCancel,
}: {
  /** Quantos cards marcados vao sair (sem contar as subtarefas, que vao junto). */
  count: number
  /** O dominio de onde todos vieram; nulo quando vieram de mais de um. */
  domain: string | null
  /** Recebe o que a pessoa escreveu; a API confere de novo. */
  onConfirm: (confirmation: string) => Promise<void>
  onCancel: () => void
}) {
  const descricaoId = useId()
  const [escrito, setEscrito] = useState('')
  const [apagando, setApagando] = useState(false)

  const normalizado = escrito.trim().toLowerCase()
  const confere = normalizado === PALAVRA || (domain !== null && normalizado === domain)

  async function confirmar() {
    if (!confere || apagando) return
    setApagando(true)
    try {
      await onConfirm(normalizado)
    } finally {
      setApagando(false)
    }
  }

  const quantos = count === 1 ? '1 card' : `${count} cards`

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto && !apagando) onCancel()
      }}
      closeOnOutsideClick={false}
      describedBy={descricaoId}
      title={count === 1 ? 'Apagar de vez 1 card?' : `Apagar de vez ${count} cards?`}
      footer={
        <>
          <Button variant="quiet" disabled={apagando} onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="warn" disabled={!confere || apagando} onClick={() => void confirmar()}>
            {apagando ? 'Apagando…' : `Apagar ${quantos} de vez`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-detail leading-relaxed">
        <p id={descricaoId} className="text-fg">
          <strong className="font-semibold">Não tem volta.</strong>{' '}
          {count === 1 ? `Sai 1 card vindo de ` : `Saem ${count} cards vindos de `}
          {domain ? <code className="font-mono">{domain}</code> : 'domínios bloqueados'} — com o
          texto, as respostas, o nome de quem relatou, os comentários, os anexos e as subtarefas.
          Quem relatou perde o acompanhamento: o link passa a dizer que o relato não existe.
        </p>
        <p className="text-fg-muted">
          Se o domínio foi bloqueado por engano, use “Manter”: a marca sai e nada se perde.
        </p>
        <TextField
          label={
            domain
              ? `Para confirmar, escreva ${domain} ou apagar`
              : 'Para confirmar, escreva apagar'
          }
          value={escrito}
          onChange={setEscrito}
          placeholder={domain ?? PALAVRA}
          autoFocus
          disabled={apagando}
          onSubmit={() => void confirmar()}
        />
      </div>
    </Modal>
  )
}
