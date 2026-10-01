import type { EditDoc } from '@/editor/doc'
import type { ImageEditorProps } from '@/editor/ImageEditor'

/**
 * Um editor da imagem de mentira, para os testes de quem o abre.
 *
 * O editor de verdade desenha num canvas, que o jsdom nao tem; quem o abre so precisa
 * saber o que entrou nele e o que saiu. Este mostra o que recebeu e oferece as saidas —
 * concluir sem marca, concluir com marca, concluir num formato que a lista recusa, e
 * sair.
 *
 * Uso: `vi.mock('@/editor/ImageEditor', () => import('@/test/fakeImageEditor'))`.
 */

/** Uma marca so, para conferir que ela volta ao reabrir. */
export const FAKE_DOC: EditDoc = {
  shapes: [{ type: 'hide', rect: { x: 1, y: 1, width: 10, height: 10 } }],
  crop: null,
}

/** O arquivo que o editor falso "desenha": com outro nome, para a lista dizer qual entrou. */
export function marked(source: File): File {
  return new File([new Uint8Array(80)], `marcada-${source.name}`, { type: 'image/webp' })
}

export function ImageEditor({
  source,
  initial,
  mode,
  maxBytes,
  onDone,
  onCancel,
}: ImageEditorProps) {
  return (
    <div role="dialog" aria-label="Editor falso">
      <p>{`editando ${source.name}`}</p>
      <p>{`modo ${mode}`}</p>
      <p>{`teto ${maxBytes}`}</p>
      <p>{`marcas ${initial?.shapes.length ?? 0}`}</p>
      <button type="button" onClick={() => onDone({ file: source, doc: null })}>
        Concluir sem marcas
      </button>
      <button type="button" onClick={() => onDone({ file: marked(source), doc: FAKE_DOC })}>
        Concluir com marcas
      </button>
      <button
        type="button"
        onClick={() =>
          onDone({
            file: new File([new Uint8Array(80)], `marcada-${source.name}`, { type: 'image/gif' }),
            doc: FAKE_DOC,
          })
        }
      >
        Concluir em formato recusado
      </button>
      <button type="button" onClick={onCancel}>
        Sair do editor
      </button>
    </div>
  )
}
