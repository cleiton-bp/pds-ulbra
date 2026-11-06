import { useState } from 'react'
import { environment } from '@/data'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { Choice } from '@/shared/components/SettingsControls'
import { isPhoneScreen } from '@/shared/lib/screen'

/**
 * O relato de teste, feito **pela propria ferramenta**.
 *
 * A tentacao aqui era o painel mandar um relato direto para a API e chamar isso
 * de teste. Seria mentira em dois lugares: o evento nasceria marcado como vindo
 * do quadro sem ter vindo, e o teste passaria mesmo com o carregador quebrado —
 * que e exatamente o que este passo existe para conferir.
 *
 * Entao o que abre aqui e **uma pagina de mentira do sistema do cliente**
 * (`public/teste-do-botao.html`), com o mesmo carregador e a mesma chave publica que
 * ele cola: o botao aparece no canto e com a aparencia publicada, abre com o
 * "Abrindo…", e o formulario e o de verdade. Se o relato chegar, chegou pelo caminho
 * inteiro. Antes, o formulario abria direto numa janela estreita, sem o botao — nao
 * era como a pessoa ve no sistema dela.
 *
 * A pagina mora na origem do quadro, ao lado do carregador (`environment.testPageUrl`).
 * O relato do teste continua entrando direto no Trabalho, sem esperar liberacao: a origem
 * do quadro esta entre os enderecos do proprio sistema, que a retencao nao segura.
 *
 * **Quem abre e quem chama**: o botao mora no titulo do passo, que e um `<summary>`, e
 * o dialogo fica fora dele — e quem chama tambem sabe quando ele fecha, para conferir
 * se o relato chegou.
 */
interface TestReportDialogProps {
  publicKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Aparelho = 'computer' | 'phone'

export function TestReportDialog({ publicKey, open, onOpenChange }: TestReportDialogProps) {
  // No celular a pagina de teste ja abre com a largura de um celular: "Computador"
  // marcado numa tela de 320 prometia o que nao cabia, e a escolha some.
  const [aparelho, setAparelho] = useState<Aparelho>(() => (isPhoneScreen() ? 'phone' : 'computer'))

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Relato de teste"
      description="Uma página de exemplo do seu sistema, com o seu botão como ele está publicado. Clique no botão e mande um relato: ele entra de verdade no Trabalho."
      width="w-[min(72rem,calc(100vw-2rem))]"
      footer={
        <Button variant="quiet" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      }
    >
      <fieldset className="mb-3 flex flex-wrap items-center gap-2 max-sm:hidden">
        <legend className="sr-only">Aparelho</legend>
        <Choice selected={aparelho === 'computer'} onSelect={() => setAparelho('computer')}>
          Computador
        </Choice>
        <Choice selected={aparelho === 'phone'} onSelect={() => setAparelho('phone')}>
          Celular
        </Choice>
      </fieldset>

      {/* `key` remonta a pagina a cada abertura e a cada troca de aparelho: o
          carregador le a largura ao comecar, e reaproveitar a pagina anterior mostraria
          a confirmacao do relato passado. No celular, a pagina tem a largura de um.
          A altura deixa 21rem para o resto do dialogo: com 16, no celular (a descricao em
          cinco linhas) e no 1024 deitado, o corpo rolava e o botao da pagina ficava cortado
          embaixo. Em tela baixa ela para em 12rem, e o dialogo inteiro rola. */}
      {open && (
        <div className="flex justify-center rounded-lg border border-border bg-surface-sunken p-2">
          <iframe
            key={`${publicKey}-${aparelho}`}
            title="Ferramenta de relato"
            src={`${environment.testPageUrl}?k=${encodeURIComponent(publicKey)}`}
            className={
              aparelho === 'phone'
                ? 'h-[clamp(12rem,calc(100dvh-21rem),42rem)] w-[375px] max-w-full rounded-2xl border border-border bg-surface'
                : 'h-[clamp(12rem,calc(100dvh-21rem),40rem)] w-full rounded-md bg-surface'
            }
          />
        </div>
      )}
    </Modal>
  )
}
