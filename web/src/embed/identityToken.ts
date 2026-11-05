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
 * O nome do cracha, para o campo "como podemos te chamar" ja vir preenchido. Nos dois
 * formatos: o `name` da carga do JWT, ou a quinta parte da assinatura simples
 * (`rfh1.{id}.{expira}.{assinatura}.{nome}`, que o carregador monta dos atributos).
 *
 * **E sugestao, e nao prova**: a pessoa apaga ou troca, e o que vai no relato e o que
 * ela deixou no campo. Por isso o cracha e lido sem conferir assinatura nenhuma: um
 * cracha forjado so consegue sugerir um nome a quem o forjou. Nulo para o que nao
 * se parece com um cracha, ou nao traz nome.
 */
export function nameFromIdentityToken(token: string | null): string | null {
  if (!token) return null

  const partes = token.split('.')
  try {
    let nome = ''
    if (partes[0] === 'rfh1') nome = partes.length === 5 ? textoDe(partes[4] ?? '') : ''
    else if (partes.length === 3) {
      const payload = JSON.parse(textoDe(partes[1] ?? '')) as { name?: unknown }
      nome = typeof payload.name === 'string' ? payload.name : ''
    }
    nome = nome.trim()
    return nome.length > 0 ? nome.slice(0, MAX_REPORTER_NAME_LENGTH) : null
  } catch {
    return null
  }
}

/** O texto UTF-8 de um pedaco em base64url, como o JWT e o carregador escrevem. */
function textoDe(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
