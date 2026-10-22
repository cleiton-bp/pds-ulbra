import { act } from '@testing-library/react'
import { vi } from 'vitest'
import { MESSAGE_SOURCE, type PreviewMessage } from '@/embed/protocol'

/**
 * O quadro da previa, do lado do teste.
 *
 * A previa so desenha o quadro quando o painel e a ferramenta tem a mesma origem — e no
 * jsdom o endereco da ferramenta e outro. O teste troca `environment.embedUrl` por
 * `${window.location.origin}/embed.html` (dentro do `vi.mock`, que sobe antes dos
 * imports) e, com o quadro na tela, faz o papel dele: avisa que esta pronto
 * (`preview-ready`) e le o que o painel mandou em resposta. E assim que se prova que a
 * previa recebe o **rascunho**, e nao o que esta salvo.
 *
 * Mora em `src/test/` porque e ferramenta de teste: nada de `src/` importa daqui.
 */
/** Avisa que o quadro esta pronto e devolve uma funcao que le as previas mandadas. */
export function actAsPreviewFrame(): () => PreviewMessage[] {
  const quadro = document.querySelector<HTMLIFrameElement>('iframe[title="Prévia da ferramenta"]')
  const janela = quadro?.contentWindow
  if (!janela) throw new Error('A previa nao desenhou o quadro: a origem e a mesma?')

  const enviado = vi.spyOn(janela, 'postMessage')
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { source: MESSAGE_SOURCE, type: 'preview-ready' },
        origin: window.location.origin,
        source: janela,
      }),
    )
  })

  return () =>
    enviado.mock.calls
      .map(([mensagem]) => mensagem as PreviewMessage)
      .filter((mensagem) => mensagem.type === 'preview')
}

/** A ultima previa mandada ao quadro. */
export function lastPreview(lidas: () => PreviewMessage[]): PreviewMessage | undefined {
  return lidas().at(-1)
}
