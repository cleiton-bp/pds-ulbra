import { useReactFlow, useViewport } from '@xyflow/react'
import { tourTarget } from '../tour/targets'
import Icon from './Icon'

/**
 * Os controles de zoom do canvas, no lugar dos do React Flow: os botoes do mesmo
 * tamanho e do mesmo desenho do resto da tela, e a porcentagem a vista; clicar
 * nela volta a 100%, o tamanho em que a tabela e lida sem esforco.
 *
 * `walk` aparece so quando o ambiente sabe o que mudou no arquivo: comeca o percurso,
 * que leva de mudanca em mudanca.
 */
export default function ZoomBar({
  walk, anchor,
}: {
  walk?: { count: number; onStart: () => void }
  /**
   * O ponto do desenho que fica parado no + e no −: a tabela escolhida, que cresce
   * no lugar em vez de fugir para o lado. Sem ele, o meio da tela.
   */
  anchor?: () => { x: number; y: number } | null
}) {
  const { zoomIn, zoomOut, zoomTo, fitView, getViewport, setViewport } = useReactFlow()
  const { zoom } = useViewport()

  const zoomBy = (factor: number): void => {
    const point = anchor?.()
    if (!point) {
      void (factor > 1 ? zoomIn({ duration: 220 }) : zoomOut({ duration: 220 }))
      return
    }
    const current = getViewport()
    const next = Math.min(2.5, Math.max(0.15, current.zoom * factor))
    // O ponto escolhido fica no mesmo lugar da tela: so o que esta em volta cresce.
    const screenX = point.x * current.zoom + current.x
    const screenY = point.y * current.zoom + current.y
    void setViewport({ x: screenX - point.x * next, y: screenY - point.y * next, zoom: next }, { duration: 220 })
  }

  return (
    <div className="zoombar" role="toolbar" aria-label="zoom do desenho">
      <button className="zoombar__btn" title="afastar (−)" aria-label="afastar" onClick={() => zoomBy(1 / 1.25)}>
        <Icon name="minus" />
      </button>
      <button
        className="zoombar__value"
        title="voltar a 100%"
        aria-label={`zoom em ${Math.round(zoom * 100)}%, voltar a 100%`}
        onClick={() => void zoomTo(1, { duration: 200 })}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button className="zoombar__btn" title="aproximar (+)" aria-label="aproximar" onClick={() => zoomBy(1.25)}>
        <Icon name="plus" />
      </button>
      <span className="zoombar__sep" aria-hidden="true" />
      <button className="zoombar__text" title="enquadrar o desenho inteiro" onClick={() => void fitView({ duration: 320, padding: 0.12 })}>
        <Icon name="fit" />
        <span>Tudo</span>
      </button>
      {walk && (
        <button {...tourTarget('walk')} className="zoombar__text" title="percorrer as tabelas novas e alteradas, uma a uma" onClick={walk.onStart}>
          <Icon name="target" />
          <span>Percorrer mudanças</span>
          <span className="zoombar__count">{walk.count}</span>
        </button>
      )}
    </div>
  )
}
