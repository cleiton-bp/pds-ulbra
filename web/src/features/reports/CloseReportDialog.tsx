import { useState } from 'react'
import { MAX_CLOSURE_REASON_LENGTH, type PublicOutcome } from '@/contracts'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { Select } from '@/shared/components/Select'
import { PUBLIC_OUTCOMES, publicOutcomeLabel } from '@/shared/lib/publicOutcomes'

/**
 * O que se pergunta antes de encerrar um relato.
 *
 * **O motivo e obrigatorio, e o botao fica desligado sem ele.** Nao e cortesia: a
 * pessoa que escreveu o relato so vai descobrir o que aconteceu por este texto, e
 * sem ele o produto reproduz exatamente o que existe para resolver — ela fica
 * sabendo que acabou e nao o que aconteceu. A API recusa do mesmo jeito; o botao
 * desligado so poupa a viagem.
 *
 * **Ele abre antes do movimento, e nao depois da recusa.** A tela sabe qual coluna
 * encerra porque a API diz (`ClosesReport`), entao perguntar e mover cabem no mesmo
 * gesto. Mandar primeiro e perguntar depois deixaria o seletor mostrando a coluna
 * nova enquanto o relato ainda esta na antiga.
 *
 * **Serve aos dois gatilhos.** Quando o encerramento vem de um movimento, a frase
 * diz para qual coluna; quando vem do botao, nao ha coluna nenhuma — o relato fica
 * onde esta. O que se pergunta e o mesmo nos dois, e por isso o dialogo e um so.
 *
 * **O desfecho e o do produto, e nao do time.** Sao os mesmos quatro da jornada
 * publica, nas mesmas palavras que quem relatou vai ler — chamar o mesmo fim por
 * outro nome aqui dentro so criaria duas linguagens para a mesma coisa.
 *
 * **Cancelar nao move nada.** Quem desistiu no dialogo desistiu do movimento
 * inteiro: encerrar sem motivo nao existe, entao "mover sem encerrar" para a
 * coluna que encerra tambem nao.
 */
export function CloseReportDialog({
  coluna,
  encerrando,
  aoConfirmar,
  aoCancelar,
  arquivando = false,
  maisLeitores = 0,
  lote = 0,
}: {
  /**
   * O nome da coluna de destino, ou **nulo** quando o encerramento vem do botao e
   * o relato nao sai do lugar.
   */
  coluna: string | null
  encerrando: boolean
  aoConfirmar: (outcome: PublicOutcome, reason: string) => void
  aoCancelar: () => void
  /**
   * Arquivar um relato aberto: o mesmo encerramento — desfecho e motivo, que quem
   * relatou le e a partir do qual reabre ou finaliza —, e o relato sai da tela de
   * Trabalho junto.
   */
  arquivando?: boolean
  /**
   * Quantos relatos duplicados deste recebem o mesmo desfecho e motivo: as pessoas a
   * mais que vao ler o que se escreve aqui.
   */
  maisLeitores?: number
  /**
   * Quantos relatos abertos encerram juntos, no lote da lista: todos com o mesmo
   * desfecho e o mesmo motivo. Zero (ou um) e o relato de sempre.
   */
  lote?: number
}) {
  const [outcome, setOutcome] = useState<PublicOutcome>('Done')
  const [motivo, setMotivo] = useState('')

  const texto = motivo.trim()

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto && !encerrando) aoCancelar()
      }}
      title={
        arquivando
          ? 'Arquivar o relato'
          : lote > 1
            ? `Encerrar ${lote} relatos`
            : 'Encerrar o relato'
      }
      description={
        lote > 1
          ? `Mover para ${coluna ?? 'a coluna'} encerra os ${lote} relatos abertos da seleção, todos com este desfecho e este motivo. Cada pessoa que relatou vai ler o motivo na página de acompanhamento.`
          : arquivando
            ? 'Arquivar encerra este relato e o tira da tela de Trabalho. Quem escreveu lê o motivo na página de acompanhamento e pode reabrir — e reabrir traz o relato de volta — ou finalizar, dando a nota.'
            : coluna === null
              ? 'Este relato passa a constar como terminado, e continua na coluna em que está. Quem escreveu vai ler o motivo na página de acompanhamento.'
              : `Mover para ${coluna} encerra este relato. Quem escreveu vai ler o motivo na página de acompanhamento.`
      }
      width="w-[min(32rem,calc(100vw-2rem))]"
      // Com texto escrito, o clique fora nao fecha: errar a caixa nao pode levar o
      // texto junto. O Esc e o "Cancelar" continuam fechando.
      closeOnOutsideClick={texto.length === 0}
      footer={
        <>
          <Button variant="quiet" disabled={encerrando} onClick={aoCancelar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={texto.length === 0 || encerrando}
            onClick={() => aoConfirmar(outcome, texto)}
          >
            {encerrando
              ? arquivando
                ? 'Arquivando…'
                : 'Encerrando…'
              : arquivando
                ? 'Arquivar'
                : 'Encerrar'}
          </Button>
        </>
      }
    >
      <Select
        label="Como terminou"
        value={outcome}
        onChange={(valor) => setOutcome(valor as PublicOutcome)}
        options={PUBLIC_OUTCOMES.map((valor) => ({
          value: valor,
          label: publicOutcomeLabel(valor),
        }))}
        className="mb-4"
      />

      {maisLeitores > 0 && (
        <p className="mb-4 rounded-lg border border-border bg-surface-sunken px-3 py-2 text-detail text-fg leading-normal">
          {maisLeitores === 1
            ? 'Mais 1 pessoa vai ler este motivo: o relato duplicado deste recebe o mesmo desfecho.'
            : `Mais ${maisLeitores} pessoas vão ler este motivo: os relatos duplicados deste recebem o mesmo desfecho.`}
        </p>
      )}

      <label htmlFor="motivo-do-encerramento" className="mb-1.5 block text-detail text-fg-muted">
        Por que acabou
      </label>
      {/* Um `textarea`, e nao o `TextField`: o campo dele e de uma linha, e o
          motivo e a unica coisa que a pessoa de fora vai ler sobre o proprio
          problema — espremer isso numa linha convida ao "ok, resolvido". */}
      <textarea
        id="motivo-do-encerramento"
        value={motivo}
        onChange={(evento) => setMotivo(evento.target.value)}
        maxLength={MAX_CLOSURE_REASON_LENGTH}
        disabled={encerrando}
        rows={4}
        placeholder="O que foi feito, ou por que não será."
        className="block w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-body text-fg leading-relaxed placeholder:text-fg-placeholder disabled:opacity-60"
      />

      <p className="mt-1.5 text-caption text-fg-muted leading-normal">
        Este texto sai do painel. Não escreva aqui o que é da equipe — para isso existe o comentário
        interno.
      </p>
    </Modal>
  )
}
