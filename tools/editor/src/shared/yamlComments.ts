import YAML from 'yaml'

/**
 * Se o texto tem algum `# comentario`.
 *
 * Nenhum dos dois editores sabe guardar comentario: a gravacao reescreve o arquivo
 * a partir do que esta na tela. Saber que ele existe e o que permite parar antes de
 * apaga-lo — ver `useWorkspace`. Yaml quebrado responde `false`: esse caso ja e
 * barrado por outro caminho, o do erro de sintaxe.
 */
export function hasYamlComments(text: string): boolean {
  const document = YAML.parseDocument(text ?? '')
  if (document.errors.length > 0) return false
  if (document.commentBefore || document.comment) return true

  let found = false
  YAML.visit(document, {
    Node(_, node) {
      if (node.comment || node.commentBefore) {
        found = true
        return YAML.visit.BREAK
      }
      return undefined
    },
  })
  return found
}
