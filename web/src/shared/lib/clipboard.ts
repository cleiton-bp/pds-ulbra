/**
 * O reserva roda **quando o moderno falha**, e nao so quando ele nao existe:
 * `navigator.clipboard` recusa com aba sem foco, permissao negada ou HTTP na rede
 * local — que e o caso de quem abre o painel pelo IP da maquina.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Segue para o caminho antigo.
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'

    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()

    return copied
  } catch {
    return false
  }
}
