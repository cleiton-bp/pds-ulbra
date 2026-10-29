import { useEffect, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { tourTarget } from '../tour/targets'
import Icon from './Icon'
import { boardRoom, fitSides, useResizable } from './useResizable'

/** A largura da lateral fechada: so a faixa com o botao de abrir e o nome. */
const RAIL = 44

/** O tempo da lateral deslizando: o mesmo `--medium` do CSS. */
const SLIDE_MS = 240

/**
 * Se o conteudo da lateral ainda vai para a tela. Ao fechar, ele fica durante o
 * deslize, esmaecendo, e so no fim da lugar a faixa, senao o que desliza e um vazio.
 */
function useStaysWhileClosing(open: boolean): { show: boolean; leaving: boolean } {
  const [leaving, setLeaving] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  useEffect(() => {
    if (open) { setLeaving(false); setWasOpen(true); return }
    if (!wasOpen) return
    setLeaving(true)
    const timer = setTimeout(() => { setLeaving(false); setWasOpen(false) }, SLIDE_MS)
    return () => clearTimeout(timer)
  }, [open])
  return { show: open || leaving, leaving }
}

/** A largura da janela, acompanhando quando ela muda. */
function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

/**
 * A lateral fechada. Nao some: vira uma faixa na borda, com o botao de abrir e o
 * nome escrito em pe; quem fechou sem querer ve onde ela foi parar, e a faixa
 * inteira e o botao, sem precisar mirar num icone pequeno.
 */
function Rail({ side, label, shortcut, onOpen }: { side: 'left' | 'right'; label: string; shortcut: string; onOpen: () => void }) {
  return (
    <button
      className={`rail rail--${side}`}
      title={`abrir ${label.toLowerCase()} (${shortcut})`}
      aria-label={`abrir ${label.toLowerCase()}`}
      aria-expanded={false}
      onClick={onOpen}
    >
      <span className="rail__icon"><Icon name={side === 'left' ? 'chevronsRight' : 'chevronsLeft'} /></span>
      <span className="rail__label">{label}</span>
    </button>
  )
}

/** O botao de recolher, no topo da propria lateral: perto do que ele fecha. */
export function CollapseButton({ side, label, shortcut, onClick }: { side: 'left' | 'right'; label: string; shortcut: string; onClick: () => void }) {
  return (
    <button
      className="collapse-btn"
      title={`recolher ${label.toLowerCase()} (${shortcut})`}
      aria-label={`recolher ${label.toLowerCase()}`}
      aria-expanded
      onClick={onClick}
    >
      <Icon name={side === 'left' ? 'chevronsLeft' : 'chevronsRight'} />
    </button>
  )
}

/**
 * A estrutura da tela de um editor: a lista de arquivos, o canvas e o painel; as
 * duas laterais com a largura ajustada arrastando a borda, e lembrada.
 *
 * Aberta, cada lateral tem o proprio botao de recolher no topo; fechada, vira a
 * faixa de abrir (ver `Rail`). As larguras vao como variavel de CSS para o grid
 * (ver `base.css`).
 *
 * As duas juntas nunca tomam o lugar do desenho (ver `boardRoom`): a borda arrastada
 * para no limite, e a janela que estreita encolhe as laterais ate o minimo de cada
 * uma, sem rolagem para o lado.
 */
export default function EditorLayout({
  envClass, showFiles, showPanel, hasDoc, onToggleFiles, onTogglePanel, files, board, panel,
}: {
  /** `app--modeling` ou `app--use-cases`: o que so um ambiente desenha. */
  envClass: string
  showFiles: boolean
  showPanel: boolean
  hasDoc: boolean
  onToggleFiles: () => void
  onTogglePanel: () => void
  files: ReactNode
  board: ReactNode
  panel: ReactNode
}) {
  const filesSize = useResizable('editor:files-width', { initial: 264, min: 200, max: 440, edge: 'right' })
  const panelSize = useResizable('editor:panel-width', { initial: 380, min: 300, max: 640, edge: 'left' })

  // Sem arquivo aberto nao ha painel, nem a faixa dele.
  const panelOpen = showPanel && hasDoc

  // O que sobra da janela depois do desenho, dividido entre as duas laterais.
  const viewport = useWindowWidth()
  const room = viewport - boardRoom(viewport)
  const rail = { width: RAIL, min: RAIL }
  const filesSide = { width: filesSize.width, min: filesSize.min }
  const panelSide = { width: panelSize.width, min: panelSize.min }
  const panelNow = !hasDoc ? { width: 0, min: 0 } : panelOpen ? panelSide : rail
  // A largura que cada uma tem aberta, com a outra como esta agora.
  const filesOpenW = fitSides([filesSide, panelNow], room)[0]
  const panelOpenW = fitSides([showFiles ? filesSide : rail, panelSide], room)[1]
  const filesW = showFiles ? filesOpenW : RAIL
  const panelW = !hasDoc ? 0 : panelOpen ? panelOpenW : RAIL

  const style = {
    '--files-w': `${filesW}px`,
    '--panel-w': `${panelW}px`,
    // A largura aberta, para o conteudo nao se espremer enquanto a coluna desliza.
    '--files-open': `${filesOpenW}px`,
    '--panel-open': `${panelOpenW}px`,
  } as CSSProperties

  // Arrastar uma borda parte da largura que esta na tela e para onde o desenho
  // comeca a perder o lugar dele. A outra lateral fica onde esta: a escolhida dela
  // vira a da tela, para nao crescer de volta enquanto esta aqui encolhe.
  const dragFiles = (event: PointerEvent): void => {
    if (panelOpen) panelSize.set(panelW)
    filesSize.startDrag(event, filesW, room - panelW)
  }
  const dragPanel = (event: PointerEvent): void => {
    if (showFiles) filesSize.set(filesW)
    panelSize.startDrag(event, panelW, room - filesW)
  }

  const resizing = filesSize.dragging || panelSize.dragging
  const filesStay = useStaysWhileClosing(showFiles)
  const panelStay = useStaysWhileClosing(panelOpen)

  return (
    <div className={`app ${envClass}${resizing ? ' is-resizing' : ''}`} style={style}>
      <div className={`slot slot--files${filesStay.leaving ? ' is-leaving' : ''}`}>
        {filesStay.show ? (
          <>
            {files}
            <div
              className="resize resize--right"
              role="separator"
              aria-orientation="vertical"
              aria-label="largura da lista de arquivos: arraste para mudar, ou clique duplo para voltar ao padrão"
              title="arraste para alargar, ou clique duplo para voltar ao padrão"
              onPointerDown={dragFiles}
              onDoubleClick={filesSize.reset}
            />
          </>
        ) : (
          <Rail side="left" label="Arquivos" shortcut="Alt+1" onOpen={onToggleFiles} />
        )}
      </div>

      {board}

      {hasDoc && (
        <div className={`slot slot--panel${panelStay.leaving ? ' is-leaving' : ''}`}>
          {panelStay.show ? (
            <>
              <div
                className="resize resize--left"
                role="separator"
                aria-orientation="vertical"
                aria-label="largura do painel: arraste para mudar, ou clique duplo para voltar ao padrão"
                title="arraste para alargar, ou clique duplo para voltar ao padrão"
                onPointerDown={dragPanel}
                onDoubleClick={panelSize.reset}
              />
              <div {...tourTarget('panel')} className="panel-frame">
                <div className="panel-bar">
                  <CollapseButton side="right" label="Detalhes" shortcut="Alt+2" onClick={onTogglePanel} />
                  <span className="panel-bar__title">Detalhes</span>
                </div>
                {panel}
              </div>
            </>
          ) : (
            <Rail side="right" label="Detalhes" shortcut="Alt+2" onOpen={onTogglePanel} />
          )}
        </div>
      )}
    </div>
  )
}
