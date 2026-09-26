type BannersProps = {
  conflict: boolean
  parseError: string
  saveError: string
  onReload: () => void
  onForceSave: () => void
  onDismissError: () => void
}

/**
 * As tres coisas que precisam interromper a edicao.
 *
 * O conflito e o unico que exige escolha: o editor nao decide sozinho qual versao
 * fica, porque qualquer um dos lados pode ser o trabalho que importa.
 */
export default function Banners({
  conflict, parseError, saveError, onReload, onForceSave, onDismissError,
}: BannersProps) {
  return (
    <>
      {conflict && (
        <div className="banner banner--warn">
          <span>O arquivo mudou no disco enquanto você editava. Escolha qual versão fica.</span>
          <button className="btn" onClick={onReload}>recarregar do disco</button>
          <button className="btn btn--danger" onClick={onForceSave}>manter o que está na tela</button>
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
