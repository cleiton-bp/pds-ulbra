/**
 * Onde o codigo pessoal fica entre uma visita e outra.
 *
 * **Por chave publica, e nao um valor so.** Duas ferramentas de projetos
 * diferentes podem viver na mesma pagina, ou a pessoa pode visitar dois sites que
 * nos usam. Um valor unico faria o codigo de um projeto ser mandado ao outro — que
 * responderia com uma lista vazia e trocaria o codigo dela por um novo.
 *
 * **Toda leitura e escrita pode estourar, e nenhuma pode derrubar a ferramenta.**
 * `localStorage` nao existe em janela anonima de alguns navegadores, e lanca
 * quando o site esta com dados bloqueados. O quadro tem de abrir do mesmo jeito:
 * sem o codigo guardado, a pessoa simplesmente recebe um novo — que e o que
 * aconteceria se ela nunca tivesse relatado ali.
 *
 * **Nao e sincronizado, nem compartilhado, nem nosso.** O que mora aqui e do
 * navegador daquela pessoa, e some com a limpeza dele. E exatamente por isso que o
 * codigo tambem e mostrado na confirmacao, para ela guardar onde quiser.
 */
const PREFIXO = 'pds.reporter-code.'

function chave(publicKey: string): string {
  return PREFIXO + publicKey
}

/** O codigo guardado para este projeto, ou nulo. */
export function readReporterCode(publicKey: string): string | null {
  try {
    const guardado = window.localStorage.getItem(chave(publicKey))

    return guardado && guardado.trim().length > 0 ? guardado.trim() : null
  } catch {
    // Sem armazenamento, a pessoa recebe um codigo novo. Ver o comentario do topo.
    return null
  }
}

/**
 * Guarda o codigo que a API confirmou.
 *
 * **Guarda o que veio da resposta, e nao o que foi mandado.** Codigo desconhecido
 * vira um codigo novo do lado de la — e regravar o antigo deixaria o navegador
 * insistindo para sempre num valor que nao existe.
 */
export function writeReporterCode(publicKey: string, code: string | null): void {
  try {
    if (code === null) {
      window.localStorage.removeItem(chave(publicKey))
      return
    }

    window.localStorage.setItem(chave(publicKey), code)
  } catch {
    // Silencio de proposito: nao ter onde guardar nao pode impedir o relato de ter
    // sido enviado, que e o que acabou de acontecer.
  }
}
