/**
 * O realce de sintaxe do editor de codigo do painel (`CodeEditor`).
 *
 * **Leve de proposito, e nao uma biblioteca.** Os trechos do painel sao curtos e fixos
 * (os exemplos de servidor, o script, um comando), e uma biblioteca de realce traria
 * dezenas de linguagens e um tamanho que o painel inteiro nao tem. Aqui cada linguagem e
 * uma expressao so, que separa comentario, texto entre aspas, numero e palavra, e a
 * palavra vira reservada, nome de funcao ou texto comum pela lista dela.
 *
 * **Devolve pedacos, e nunca HTML.** Quem desenha poe cada pedaco num `<span>`, e o
 * texto nunca passa por `innerHTML`: um exemplo com `<script>` dentro continua texto.
 */

export type CodeLanguage =
  | 'js'
  | 'php'
  | 'python'
  | 'csharp'
  | 'java'
  | 'go'
  | 'html'
  | 'json'
  | 'shell'

export type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'name'
  | 'variable'
  | 'tag'

export interface CodeToken {
  text: string
  kind: TokenKind
}

const ASPAS_SIMPLES = String.raw`'(?:\\.|[^'\\\n])*'`
const ASPAS_DUPLAS = String.raw`"(?:\\.|[^"\\\n])*"`
const CRASE = String.raw`\x60(?:\\.|[^\x60\\])*\x60`
const NUMERO = String.raw`\b\d+(?:\.\d+)?\b`
const BARRA_BARRA = String.raw`\/\/[^\n]*`
const BLOCO = String.raw`\/\*[\s\S]*?\*\/`
const CERQUILHA = String.raw`#[^\n]*`

/** As palavras reservadas de cada linguagem: so as que aparecem nos exemplos e vizinhas. */
const RESERVADAS: Record<CodeLanguage, readonly string[]> = {
  js: 'import from export function return const let var new await async if else for of in class extends this null undefined true false typeof'.split(
    ' ',
  ),
  php: 'function return use new array echo if else foreach as true false null string int public private static fn'.split(
    ' ',
  ),
  python:
    'def return import from as with if else elif for in None True False class lambda not and or'.split(
      ' ',
    ),
  csharp:
    'using static readonly var new return string long int bool if is not null public private class void true false out'.split(
      ' ',
    ),
  java: 'import public private static final class return new throws String long int void if null true false'.split(
    ' ',
  ),
  go: 'import func return var const if nil package type struct string int64 error defer for range'.split(
    ' ',
  ),
  html: [],
  json: 'true false null'.split(' '),
  shell: [],
}

/**
 * A expressao de cada linguagem, com um grupo por tipo, na ordem em que valem: o
 * comentario antes do texto entre aspas (um `'` dentro de comentario e comentario), e o
 * texto antes do numero.
 */
const EXPRESSOES: Record<CodeLanguage, RegExp> = {
  js: tokens(
    [BARRA_BARRA, BLOCO],
    [ASPAS_SIMPLES, ASPAS_DUPLAS, CRASE],
    String.raw`[A-Za-z_$][\w$]*`,
  ),
  php: tokens(
    [BARRA_BARRA, BLOCO, String.raw`#(?!\[)[^\n]*`],
    [ASPAS_SIMPLES, ASPAS_DUPLAS],
    String.raw`\$?[A-Za-z_]\w*`,
  ),
  python: tokens(
    [CERQUILHA],
    [`[fFrRbB]?${ASPAS_DUPLAS}`, `[fFrRbB]?${ASPAS_SIMPLES}`],
    String.raw`[A-Za-z_]\w*`,
  ),
  csharp: tokens(
    [BARRA_BARRA, BLOCO],
    [String.raw`\$?@?${ASPAS_DUPLAS}`],
    String.raw`[A-Za-z_]\w*`,
  ),
  java: tokens([BARRA_BARRA, BLOCO], [ASPAS_DUPLAS], String.raw`[A-Za-z_]\w*`),
  go: tokens([BARRA_BARRA, BLOCO], [ASPAS_DUPLAS, CRASE], String.raw`[A-Za-z_]\w*`),
  json: tokens([], [ASPAS_DUPLAS], String.raw`[A-Za-z_]\w*`),
  shell: tokens(
    [String.raw`(?<=^|\s)#[^\n]*`],
    [ASPAS_SIMPLES, ASPAS_DUPLAS],
    String.raw`-{1,2}[\w-]+|[A-Za-z_][\w.-]*`,
  ),
  // O HTML tem os dele: a etiqueta, o atributo antes do `=` e o valor entre aspas. E os
  // modelos de pagina dos servidores (EJS, PHP, Jinja, Razor, Go) por cima do HTML: o
  // comentario de cada um, e as marcas que abrem e fecham o codigo, como reservadas.
  html: new RegExp(
    [
      String.raw`(?<comment><!--[\s\S]*?-->|<%#[\s\S]*?%>|\{#[\s\S]*?#\}|@\*[\s\S]*?\*@|\{\{\/\*[\s\S]*?\*\/\}\}|\/\*[\s\S]*?\*\/)`,
      String.raw`(?<keyword><%[=-]?|-?%>|<\?(?:php|=)?|\?>|\{%-?|-?%\}|\{\{-?|-?\}\})`,
      `(?<string>${ASPAS_DUPLAS}|${ASPAS_SIMPLES})`,
      String.raw`(?<tag><\/?[A-Za-z][\w-]*|\/?>)`,
      String.raw`(?<word>[A-Za-z_][\w-]*)`,
    ].join('|'),
    'g',
  ),
}

function tokens(comentarios: string[], textos: string[], palavra: string): RegExp {
  const partes = [
    comentarios.length > 0 ? `(?<comment>${comentarios.join('|')})` : null,
    `(?<string>${textos.join('|')})`,
    `(?<number>${NUMERO})`,
    `(?<word>${palavra})`,
  ].filter(Boolean)
  return new RegExp(partes.join('|'), 'g')
}

/** O codigo em pedacos, cada um com o seu tipo. Juntos, os pedacos sao o codigo inteiro. */
export function highlight(code: string, language: CodeLanguage): CodeToken[] {
  const saida: CodeToken[] = []
  const expressao = new RegExp(EXPRESSOES[language].source, 'g')
  const reservadas = new Set(RESERVADAS[language])
  let fim = 0

  for (const achado of code.matchAll(expressao)) {
    const inicio = achado.index ?? 0
    if (inicio > fim) saida.push({ text: code.slice(fim, inicio), kind: 'plain' })
    const texto = achado[0]
    fim = inicio + texto.length

    const grupos = achado.groups ?? {}
    if (grupos.comment !== undefined) saida.push({ text: texto, kind: 'comment' })
    else if (grupos.string !== undefined)
      saida.push({ text: texto, kind: tipoDoTexto(code, fim, language) })
    else if (grupos.number !== undefined) saida.push({ text: texto, kind: 'number' })
    else if (grupos.keyword !== undefined) saida.push({ text: texto, kind: 'keyword' })
    else if (grupos.tag !== undefined) saida.push({ text: texto, kind: 'tag' })
    else saida.push({ text: texto, kind: tipoDaPalavra(texto, code, fim, language, reservadas) })
  }

  if (fim < code.length) saida.push({ text: code.slice(fim), kind: 'plain' })
  return saida
}

/** No JSON, o texto antes de `:` e a chave, que sai como nome; o resto e valor. */
function tipoDoTexto(code: string, fim: number, language: CodeLanguage): TokenKind {
  if (language !== 'json') return 'string'
  return /^\s*:/.test(code.slice(fim)) ? 'name' : 'string'
}

function tipoDaPalavra(
  palavra: string,
  code: string,
  fim: number,
  language: CodeLanguage,
  reservadas: ReadonlySet<string>,
): TokenKind {
  if (reservadas.has(palavra)) return 'keyword'
  // A variavel do PHP, com o cifrao.
  if (language === 'php' && palavra.startsWith('$')) return 'variable'
  // A opcao do comando (`-out`, `--help`).
  if (language === 'shell' && palavra.startsWith('-')) return 'keyword'
  // O atributo do HTML, antes do `=`.
  if (language === 'html') return /^=/.test(code.slice(fim)) ? 'name' : 'plain'
  // O comando no comeco da linha do terminal.
  if (language === 'shell') {
    const antes = code.slice(0, fim - palavra.length)
    return /(^|\n|\|\s*)\s*$/.test(antes) ? 'name' : 'plain'
  }
  // A funcao ou o metodo chamado, ou declarado: a palavra logo antes do `(`.
  return /^\s*\(/.test(code.slice(fim)) ? 'name' : 'plain'
}
