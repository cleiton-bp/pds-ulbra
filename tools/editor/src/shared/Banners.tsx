type BannersProps = {
  conflict: boolean
  parseError: string
  saveError: string
  /** O arquivo tem comentarios que a gravacao apagaria. */
  comments: boolean
  /** O arquivo aberto sumiu do disco — apagado ou renomeado por fora. */
  missing: boolean
  onReload: () => void
  onForceSave: () => void
  onDismissError: () => void
  onDropComments: () => void
  onRecreate: () => void
  onClose: () => void
}

/**
 * As coisas que precisam interromper a edicao.
 *
 * Conflito, comentarios e arquivo sumido exigem escolha: o editor nao decide
 * sozinho qual versao fica, se um comentario escrito por alguem pode sumir, nem
 * se um arquivo apagado por fora deve voltar a existir.
 */
export default function Banners({
  conflict, parseError, saveError, comments, missing,
  onReload, onForceSave, onDismissError, onDropComments, onRecreate, onClose,
}: BannersProps) {
  return (
    <>
      {missing && (
        <div className="banner banner--warn">
          <span>
            Este arquivo sumiu do disco — foi apagado ou renomeado fora do editor. O que está na
            tela ainda não se perdeu.
          </span>
          <button className="btn" onClick={onRecreate}>gravar de novo com o que está na tela</button>
          <button className="btn btn--danger" onClick={onClose}>fechar</button>
        </div>
      )}

      {conflict && !missing && (
        <div className="banner banner--warn">
          <span>O arquivo mudou no disco enquanto você editava. Escolha qual versão fica.</span>
          <button className="btn" onClick={onReload}>recarregar do disco</button>
          <button className="btn btn--danger" onClick={onForceSave}>manter o que está na tela</button>
        </div>
      )}

      {comments && !parseError && (
        <div className="banner banner--warn">
          <span>
            O arquivo tem comentários (<code>#</code>), e o editor não sabe guardá-los: a gravação
            está parada para não apagá-los. Passe o que eles dizem para uma nota ou uma descrição.
          </span>
          <button className="btn btn--danger" onClick={onDropComments}>gravar sem os comentários</button>
        </div>
      )}

      {parseError && (
        <div className="banner banner--error">
          <span>
            Erro de sintaxe no YAML: {parseError} — corrija no editor de texto. A edição
            está bloqueada para não gravar por cima do conteúdo.
          </span>
        </div>
      )}

      {saveError && (
        <div className="banner banner--error">
          <span>{saveError}</span>
          <button className="btn" onClick={onDismissError}>ok</button>
        </div>
      )}
    </>
  )
}
