import { MAX_REPORTER_NAME_LENGTH } from '@/contracts'

/**
 * O cracha que o site entrega ao quadro, no projeto que herda a identidade.
 *
 * **O quadro nao confere nada dele.** Quem confere a assinatura e a API, com a chave
 * publica do projeto; aqui ele so e carregado de um lado para o outro — e lido, sem
 * confiar, para sugerir o nome no formulario.
 */

/** O teto do cracha, o mesmo da API (`InheritedIdentity.MaxTokenLength`). */
export const MAX_IDENTITY_TOKEN_LENGTH = 4096

/** O cracha como chegou pela mensagem, aparado; nulo para o vazio e para o grande demais. */
export function sanitizeIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const aparado = value.trim()
  return aparado.length > 0 && aparado.length <= MAX_IDENTITY_TOKEN_LENGTH ? aparado : null
}

/**
 * O `name` do cracha, para o campo "como podemos te chamar" ja vir preenchido.
 *
 * **E sugestao, e nao prova**: a pessoa apaga ou troca, e o que vai no relato e o que
 * ela deixou no campo. Por isso a carga e lida sem conferir assinatura nenhuma — um
 * cracha forjado so consegue sugerir um nome a quem o forjou. Nulo para o que nao
 * se parece com um cracha, ou nao traz nome.
 */
export function nameFromIdentityToken(token: string | null): string | null {
  if (!token) return null

  const partes = token.split('.')
  const carga = partes.length === 3 ? partes[1] : undefined
  if (!carga) return null

  try {
    const base64 = carga.replace(/-/g, '+').replace(/_/g, '/')
    const binario = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { name?: unknown }
    const nome = typeof payload.name === 'string' ? payload.name.trim() : ''

    return nome.length > 0 ? nome.slice(0, MAX_REPORTER_NAME_LENGTH) : null
  } catch {
    return null
  }
}
