import { useState } from 'react'
import { environment } from '@/data'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'

/**
 * O relato de teste, feito **pela propria ferramenta**.
 *
 * A tentacao aqui era o painel mandar um relato direto para a API e chamar isso
 * de teste. Seria mentira em dois lugares: o evento nasceria marcado como vindo
 * do quadro sem ter vindo, e o teste passaria mesmo com o carregador quebrado —
 * que e exatamente o que este passo existe para conferir.
 *
 * Entao o que abre aqui e o quadro de verdade, no mesmo `iframe` e pela mesma
 * chave publica que o site do cliente usa. Se o relato chegar, chegou pelo
 * caminho inteiro.
 */
interface TestReportDialogProps {
  publicKey: string
}

export function TestReportDialog({ publicKey }: TestReportDialogProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir relato de teste</Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Relato de teste"
        description="É a mesma ferramenta que abre no seu site, com a mesma chave. O relato entra de verdade."
        width="w-[min(24rem,calc(100vw-2rem))]"
        footer={
          <Button variant="quiet" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        }
      >
        {/* `key` remonta o quadro a cada abertura: reaproveitar o anterior
            mostraria a confirmacao do relato passado. */}
        {open && (
          <iframe
            key={publicKey}
            title="Ferramenta de relato"
            src={`${environment.embedUrl}?k=${encodeURIComponent(publicKey)}&route=/painel/instalacao`}
            className="h-[28rem] w-full rounded-lg border border-border"
          />
        )}
      </Modal>
    </>
  )
}
