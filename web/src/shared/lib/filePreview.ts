/**
 * O que o visualizador desenha de um arquivo que nao e imagem.
 *
 * **Le os bytes e devolve so texto.** O endereco do arquivo continua assinado para
 * baixar (tipo generico e anexo, na API): o navegador nunca abre o arquivo como pagina.
 * Aqui os bytes viram linhas, celulas e paragrafos, que a tela desenha como texto puro.
 * Nada do que vem dentro roda: o XML e lido pelo `DOMParser` como dado, e nenhum
 * pedaco dele vira HTML.
 *
 * **Tudo tem teto.** Um arquivo de log de 10 MB, uma planilha com um milhao de linhas
 * vazias repetidas ou um zip que declara gigabytes descompactados travariam a aba. O
 * visualizador mostra o comeco e avisa; o arquivo inteiro vem no "Baixar".
 *
 * O PDF nao passa por aqui: ele vai inteiro para o pdf.js (`PdfPages`).
 */

export interface Trecho {
  texto: string
  negrito?: boolean
  italico?: boolean
}

export type BlocoDoDocumento =
  | { tipo: 'titulo'; nivel: 1 | 2 | 3; trechos: Trecho[] }
  | { tipo: 'paragrafo'; trechos: Trecho[]; item?: boolean }
  | { tipo: 'tabela'; linhas: string[][] }

export interface Aba {
  nome: string
  linhas: string[][]
  /** Havia mais linhas do que o teto. */
  cortada: boolean
}

export type Previa =
  | { tipo: 'pdf' }
  | { tipo: 'texto'; texto: string; cortado: boolean }
  | { tipo: 'planilha'; abas: Aba[] }
  | { tipo: 'documento'; blocos: BlocoDoDocumento[]; cortado: boolean }
  | { tipo: 'sem-previa' }

/** Caracteres de texto mostrados. O resto vem no "Baixar". */
export const TEXTO_MAXIMO = 300_000
/** Linhas por aba ou tabela. */
export const LINHAS_MAXIMAS = 1_000
/** Colunas por linha. */
export const COLUNAS_MAXIMAS = 50
/** Blocos de um documento: paragrafos, titulos e tabelas. */
export const BLOCOS_MAXIMOS = 3_000
/**
 * O maior arquivo de dentro do zip que se descompacta. **Conferido pelo tamanho que o
 * proprio zip declara**, antes de descompactar: um arquivo de poucos KB pode declarar
 * gigabytes, e descompactar tudo para so depois medir ja seria o travamento.
 */
const DESCOMPACTADO_MAXIMO = 30 * 1024 * 1024

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ODS = 'application/vnd.oasis.opendocument.spreadsheet'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ODT = 'application/vnd.oasis.opendocument.text'

/**
 * Os bytes de um arquivo, prontos para a tela. **Arquivo que nao se deixa ler vira
 * "sem previa"**, e nao erro: o zip corrompido ou a planilha de um formato que esta tela
 * nao conhece ainda podem ser baixados, e o visualizador diz isso.
 */
export async function lerPrevia(
  bytes: Uint8Array,
  contentType: string | undefined,
): Promise<Previa> {
  try {
    switch (contentType) {
      case 'application/pdf':
        return { tipo: 'pdf' }
      case 'text/plain':
        return texto(decodificar(bytes))
      case 'application/json':
        return texto(json(decodificar(bytes)))
      case 'text/csv':
        return { tipo: 'planilha', abas: [{ nome: 'CSV', ...lerCsv(decodificar(bytes)) }] }
      case XLSX:
        return planilhaOuNada(lerXlsx(await abrirZip(bytes, ehParteDoXlsx)))
      case ODS:
        return planilhaOuNada(lerOds(await conteudoOdf(bytes)))
      case DOCX:
        return documentoOuNada(lerDocx(await parteDoZip(bytes, 'word/document.xml')))
      case ODT:
        return documentoOuNada(lerOdt(await conteudoOdf(bytes)))
      default:
        return { tipo: 'sem-previa' }
    }
  } catch {
    return { tipo: 'sem-previa' }
  }
}

function texto(conteudo: string): Previa {
  return conteudo.length > TEXTO_MAXIMO
    ? { tipo: 'texto', texto: conteudo.slice(0, TEXTO_MAXIMO), cortado: true }
    : { tipo: 'texto', texto: conteudo, cortado: false }
}

function planilhaOuNada(abas: Aba[]): Previa {
  return abas.length > 0 ? { tipo: 'planilha', abas } : { tipo: 'sem-previa' }
}

function documentoOuNada(lido: { blocos: BlocoDoDocumento[]; cortado: boolean }): Previa {
  return { tipo: 'documento', ...lido }
}

/**
 * UTF-8, que e o que quase todo arquivo de hoje usa. **O log salvo no Windows costuma
 * vir em Windows-1252**: lido como UTF-8, cada acento viraria um losango. Byte que nao
 * fecha em UTF-8 e o sinal, e ai le no outro. O BOM do comeco sai nos dois.
 */
export function decodificar(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** O JSON arrumado, com recuo. O que nao e JSON valido aparece como veio. */
function json(conteudo: string): string {
  try {
    return JSON.stringify(JSON.parse(conteudo), null, 2)
  } catch {
    return conteudo
  }
}

/**
 * O separador da primeira linha. **O Excel em portugues salva CSV com ponto e
 * virgula**, porque a virgula e a casa decimal; lido so pela virgula, cada linha viraria
 * uma celula so.
 */
function separadorDe(conteudo: string): string {
  const fim = conteudo.indexOf('\n')
  const primeira = (fim === -1 ? conteudo : conteudo.slice(0, fim)).replace(/"[^"]*"/g, '')
  let melhor = ','
  let vezes = 0
  for (const candidato of [',', ';', '\t']) {
    const contagem = primeira.split(candidato).length - 1
    if (contagem > vezes) {
      melhor = candidato
      vezes = contagem
    }
  }
  return melhor
}

/** As linhas de um CSV, com aspas, aspas dobradas e quebra de linha dentro do campo. */
export function lerCsv(conteudo: string): { linhas: string[][]; cortada: boolean } {
  const separador = separadorDe(conteudo)
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false

  const fecharLinha = () => {
    linha.push(campo)
    linhas.push(linha.slice(0, COLUNAS_MAXIMAS))
    linha = []
    campo = ''
  }

  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i]
    if (aspas) {
      if (c === '"' && conteudo[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"' && campo === '') aspas = true
    else if (c === separador) {
      linha.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && conteudo[i + 1] === '\n') i++
      fecharLinha()
      if (linhas.length >= LINHAS_MAXIMAS) {
        return { linhas, cortada: conteudo.slice(i + 1).trim() !== '' }
      }
    } else campo += c
  }
  if (campo !== '' || linha.length > 0) fecharLinha()
  return { linhas, cortada: false }
}

// ---------------------------------------------------------------- zip e XML

/** Descompacta so as partes pedidas, e so as que declaram caber no teto. */
async function abrirZip(
  bytes: Uint8Array,
  quer: (nome: string) => boolean,
): Promise<Map<string, string>> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const partes = unzipSync(bytes, {
    filter: (parte) => quer(parte.name) && parte.originalSize <= DESCOMPACTADO_MAXIMO,
  })
  return new Map(Object.entries(partes).map(([nome, conteudo]) => [nome, strFromU8(conteudo)]))
}

async function parteDoZip(bytes: Uint8Array, nome: string): Promise<string> {
  const parte = (await abrirZip(bytes, (n) => n === nome)).get(nome)
  if (parte === undefined) throw new Error(`sem ${nome}`)
  return parte
}

/** O conteudo de um arquivo do LibreOffice: planilha e texto guardam tudo num XML so. */
function conteudoOdf(bytes: Uint8Array): Promise<string> {
  return parteDoZip(bytes, 'content.xml')
}

function ehParteDoXlsx(nome: string): boolean {
  return (
    nome === 'xl/workbook.xml' ||
    nome === 'xl/_rels/workbook.xml.rels' ||
    nome === 'xl/sharedStrings.xml' ||
    nome === 'xl/styles.xml' ||
    nome.startsWith('xl/worksheets/')
  )
}

/** O XML lido como dado. O navegador nao segue entidade externa nem roda nada dele. */
function xml(conteudo: string): Document {
  const documento = new DOMParser().parseFromString(conteudo, 'application/xml')
  if (documento.getElementsByTagName('parsererror').length > 0) throw new Error('XML quebrado')
  return documento
}

/** Os elementos com este nome, em qualquer namespace: cada formato usa o seu prefixo. */
function todos(raiz: Document | Element, nome: string): Element[] {
  return Array.from(raiz.getElementsByTagNameNS('*', nome))
}

function filhos(elemento: Element | undefined, nome: string): Element[] {
  return elemento ? Array.from(elemento.children).filter((c) => c.localName === nome) : []
}

/** O atributo pelo nome local: `r:id`, `table:name`, `w:val`, sem depender do prefixo. */
function atributo(elemento: Element | undefined, nome: string): string | null {
  if (!elemento) return null
  for (const a of Array.from(elemento.attributes)) if (a.localName === nome) return a.value
  return null
}

/** Tira as linhas vazias do fim e as celulas vazias do fim de cada linha. */
function aparar(linhas: string[][]): string[][] {
  const aparadas = linhas.map((linha) => {
    let fim = linha.length
    while (fim > 0 && linha[fim - 1] === '') fim--
    return linha.slice(0, fim)
  })
  let fim = aparadas.length
  while (fim > 0 && aparadas[fim - 1]?.length === 0) fim--
  return aparadas.slice(0, fim)
}

// ---------------------------------------------------------------- Excel (.xlsx)

const ESTILOS_DE_DATA_DO_EXCEL = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function lerXlsx(partes: Map<string, string>): Aba[] {
  const livro = xml(partes.get('xl/workbook.xml') ?? '')
  const relacoes = partes.get('xl/_rels/workbook.xml.rels')
  const caminhos = new Map<string, string>()
  for (const r of relacoes ? todos(xml(relacoes), 'Relationship') : []) {
    const alvo = r.getAttribute('Target') ?? ''
    caminhos.set(r.getAttribute('Id') ?? '', alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`)
  }
  const compartilhados = partes.get('xl/sharedStrings.xml')
  const textos = compartilhados
    ? todos(xml(compartilhados), 'si').map((si) =>
        todos(si, 't')
          // O `rPh` e a leitura fonetica do japones, e nao parte do texto.
          .filter((t) => t.parentElement?.localName !== 'rPh')
          .map((t) => t.textContent ?? '')
          .join(''),
      )
    : []
  const datas = estilosDeData(partes.get('xl/styles.xml'))

  return todos(livro, 'sheet').flatMap((aba) => {
    const caminho = caminhos.get(atributo(aba, 'id') ?? '')
    const conteudo = caminho ? partes.get(caminho) : undefined
    if (conteudo === undefined) return []
    return [
      { nome: aba.getAttribute('name') ?? 'Planilha', ...lerAbaXlsx(conteudo, textos, datas) },
    ]
  })
}

/**
 * Os estilos que guardam data. **A data no Excel e um numero** (dias desde 1900), e so
 * o estilo da celula diz que e data: sem isto, "15/03/2026" apareceria como 46096.
 */
function estilosDeData(conteudo: string | undefined): Set<number> {
  const datas = new Set<number>()
  if (!conteudo) return datas
  const estilos = xml(conteudo)
  const proprios = new Map(
    todos(estilos, 'numFmt').map((f) => [
      Number(f.getAttribute('numFmtId')),
      f.getAttribute('formatCode') ?? '',
    ]),
  )
  filhos(todos(estilos, 'cellXfs')[0], 'xf').forEach((xf, indice) => {
    const id = Number(xf.getAttribute('numFmtId') ?? 0)
    const codigo = proprios.get(id)
    const limpo = (codigo ?? '')
      .replace(/"[^"]*"/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\\./g, '')
    if (ESTILOS_DE_DATA_DO_EXCEL.has(id) || /[dmyh]/i.test(limpo)) datas.add(indice)
  })
  return datas
}

function lerAbaXlsx(
  conteudo: string,
  textos: string[],
  datas: Set<number>,
): { linhas: string[][]; cortada: boolean } {
  const linhas: string[][] = []
  let cortada = false
  for (const linha of todos(xml(conteudo), 'row')) {
    const numero = Number(linha.getAttribute('r')) || linhas.length + 1
    if (numero > LINHAS_MAXIMAS) {
      cortada = filhos(linha, 'c').some((c) => valorDaCelula(c, textos, datas) !== '')
      if (cortada) break
      continue
    }
    const valores: string[] = []
    for (const celula of filhos(linha, 'c')) {
      const ref = celula.getAttribute('r')
      const coluna = ref ? colunaDe(ref) : valores.length
      if (coluna < COLUNAS_MAXIMAS) valores[coluna] = valorDaCelula(celula, textos, datas)
    }
    linhas[numero - 1] = Array.from(valores, (v) => v ?? '')
  }
  return { linhas: aparar(Array.from(linhas, (l) => l ?? [])), cortada }
}

/** "AB12" vira 27: a coluna, contada do zero. */
function colunaDe(referencia: string): number {
  let coluna = 0
  for (const letra of referencia) {
    const codigo = letra.charCodeAt(0)
    if (codigo < 65 || codigo > 90) break
    coluna = coluna * 26 + (codigo - 64)
  }
  return coluna - 1
}

function valorDaCelula(celula: Element, textos: string[], datas: Set<number>): string {
  const valor = filhos(celula, 'v')[0]?.textContent ?? ''
  switch (celula.getAttribute('t')) {
    case 's':
      return textos[Number(valor)] ?? ''
    case 'inlineStr':
      return todos(celula, 't')
        .map((t) => t.textContent ?? '')
        .join('')
    case 'b':
      return valor === '1' ? 'VERDADEIRO' : 'FALSO'
    case 'str':
    case 'e':
      return valor
    default: {
      if (valor === '') return ''
      const numero = Number(valor)
      if (Number.isNaN(numero)) return valor
      if (datas.has(Number(celula.getAttribute('s') ?? 0))) return dataDoExcel(numero)
      // Sem o ruido do ponto flutuante: 0.1 + 0.2 guardado como 0.30000000000000004.
      return String(Number(numero.toPrecision(15)))
    }
  }
}

function dataDoExcel(serial: number): string {
  const data = new Date(Math.round((serial - 25569) * 86_400_000))
  const dois = (n: number) => String(n).padStart(2, '0')
  const hora = `${dois(data.getUTCHours())}:${dois(data.getUTCMinutes())}`
  if (serial < 1) return hora
  const dia = `${dois(data.getUTCDate())}/${dois(data.getUTCMonth() + 1)}/${data.getUTCFullYear()}`
  return serial % 1 === 0 ? dia : `${dia} ${hora}`
}

// ---------------------------------------------------------------- LibreOffice (.ods, .odt)

/** O texto de um elemento do LibreOffice, com os espacos, tabs e quebras que ele codifica. */
function textoOdf(elemento: Element): string {
  let texto = ''
  for (const no of Array.from(elemento.childNodes)) {
    if (no.nodeType === 3) texto += no.textContent ?? ''
    else if (no.nodeType === 1) {
      const filho = no as Element
      if (filho.localName === 's') texto += ' '.repeat(Number(atributo(filho, 'c') ?? 1) || 1)
      else if (filho.localName === 'tab') texto += '\t'
      else if (filho.localName === 'line-break') texto += '\n'
      // Comentario e nota de rodape nao sao o texto da celula ou do paragrafo.
      else if (filho.localName !== 'annotation' && filho.localName !== 'note')
        texto += textoOdf(filho)
    }
  }
  return texto
}

/**
 * As abas de um .ods. **A linha vazia repetida um milhao de vezes e normal**: e assim que
 * o LibreOffice guarda o resto da planilha. Ela so entra se vier conteudo depois.
 */
function lerOds(conteudo: string): Aba[] {
  return todos(xml(conteudo), 'table').map((tabela) => {
    const linhas: string[][] = []
    let vazias = 0
    let cortada = false
    for (const linha of todos(tabela, 'table-row')) {
      const repete = Number(atributo(linha, 'number-rows-repeated') ?? 1) || 1
      const valores = celulasOds(linha)
      if (valores.every((v) => v === '')) {
        vazias += repete
        continue
      }
      for (let k = 0; k < vazias + repete; k++) {
        if (linhas.length >= LINHAS_MAXIMAS) {
          cortada = true
          break
        }
        linhas.push(k < vazias ? [] : valores)
      }
      vazias = 0
      if (cortada) break
    }
    return { nome: atributo(tabela, 'name') ?? 'Planilha', linhas: aparar(linhas), cortada }
  })
}

function celulasOds(linha: Element): string[] {
  const valores: string[] = []
  for (const celula of Array.from(linha.children)) {
    if (celula.localName !== 'table-cell' && celula.localName !== 'covered-table-cell') continue
    const repete = Number(atributo(celula, 'number-columns-repeated') ?? 1) || 1
    const texto = filhos(celula, 'p').map(textoOdf).join('\n')
    for (let k = 0; k < repete && valores.length < COLUNAS_MAXIMAS; k++) valores.push(texto)
    if (valores.length >= COLUNAS_MAXIMAS) break
  }
  return valores
}

function lerOdt(conteudo: string): { blocos: BlocoDoDocumento[]; cortado: boolean } {
  const corpo = todos(xml(conteudo), 'text').find((t) => t.parentElement?.localName === 'body')
  const blocos: BlocoDoDocumento[] = []
  let cortado = false

  const ler = (elemento: Element, emLista: boolean) => {
    for (const filho of Array.from(elemento.children)) {
      if (blocos.length >= BLOCOS_MAXIMOS) {
        cortado = true
        return
      }
      const nome = filho.localName
      if (nome === 'h') {
        const nivel = Math.min(Math.max(Number(atributo(filho, 'outline-level') ?? 1) || 1, 1), 3)
        blocos.push({
          tipo: 'titulo',
          nivel: nivel as 1 | 2 | 3,
          trechos: [{ texto: textoOdf(filho) }],
        })
      } else if (nome === 'p') {
        blocos.push({ tipo: 'paragrafo', trechos: [{ texto: textoOdf(filho) }], item: emLista })
      } else if (nome === 'list' || nome === 'list-item') ler(filho, true)
      else if (nome === 'section') ler(filho, emLista)
      else if (nome === 'table') {
        blocos.push({
          tipo: 'tabela',
          linhas: todos(filho, 'table-row')
            .slice(0, LINHAS_MAXIMAS)
            .map((tr) =>
              filhos(tr, 'table-cell')
                .slice(0, COLUNAS_MAXIMAS)
                .map((tc) => filhos(tc, 'p').map(textoOdf).join('\n')),
            ),
        })
      }
    }
  }

  if (corpo) ler(corpo, false)
  return { blocos, cortado }
}

// ---------------------------------------------------------------- Word (.docx)

/**
 * O nivel do titulo pelo estilo do paragrafo. **O id do estilo muda com o idioma do
 * Word**: "Heading1" no ingles, "Ttulo1" no portugues (o acento some do id).
 */
function nivelDoTitulo(estilo: string | null): 1 | 2 | 3 | null {
  const achado = estilo?.match(/^(heading|ttulo|titulo|title|cabealho)\s*(\d)?$/i)
  if (!achado) return null
  return Math.min(Number(achado[2] ?? 1) || 1, 3) as 1 | 2 | 3
}

/** Ligado, a menos que diga o contrario: `<w:b/>` e negrito, `<w:b w:val="0"/>` nao. */
function ligado(propriedades: Element | undefined, nome: string): boolean {
  const marca = filhos(propriedades, nome)[0]
  if (!marca) return false
  const valor = atributo(marca, 'val')
  return valor !== '0' && valor !== 'false'
}

function trechosDocx(paragrafo: Element): Trecho[] {
  const trechos: Trecho[] = []
  for (const run of todos(paragrafo, 'r')) {
    const propriedades = filhos(run, 'rPr')[0]
    let texto = ''
    for (const parte of Array.from(run.children)) {
      if (parte.localName === 't') texto += parte.textContent ?? ''
      else if (parte.localName === 'tab') texto += '\t'
      else if (parte.localName === 'br' || parte.localName === 'cr') texto += '\n'
      else if (parte.localName === 'noBreakHyphen') texto += '-'
    }
    if (texto === '') continue
    const negrito = ligado(propriedades, 'b')
    const italico = ligado(propriedades, 'i')
    const anterior = trechos.at(-1)
    // Juntar os pedacos com o mesmo jeito: o Word quebra uma palavra em varios runs.
    if (anterior && !!anterior.negrito === negrito && !!anterior.italico === italico)
      anterior.texto += texto
    else trechos.push({ texto, negrito, italico })
  }
  return trechos
}

function lerDocx(conteudo: string): { blocos: BlocoDoDocumento[]; cortado: boolean } {
  const corpo = todos(xml(conteudo), 'body')[0]
  const blocos: BlocoDoDocumento[] = []
  let cortado = false

  const ler = (elemento: Element) => {
    for (const filho of Array.from(elemento.children)) {
      if (blocos.length >= BLOCOS_MAXIMOS) {
        cortado = true
        return
      }
      if (filho.localName === 'p') {
        const formato = filhos(filho, 'pPr')[0]
        const nivel = nivelDoTitulo(atributo(filhos(formato, 'pStyle')[0], 'val'))
        const trechos = trechosDocx(filho)
        if (nivel) blocos.push({ tipo: 'titulo', nivel, trechos })
        else blocos.push({ tipo: 'paragrafo', trechos, item: filhos(formato, 'numPr').length > 0 })
      } else if (filho.localName === 'tbl') {
        blocos.push({
          tipo: 'tabela',
          linhas: filhos(filho, 'tr')
            .slice(0, LINHAS_MAXIMAS)
            .map((tr) =>
              filhos(tr, 'tc')
                .slice(0, COLUNAS_MAXIMAS)
                .map((tc) =>
                  filhos(tc, 'p')
                    .map((p) =>
                      trechosDocx(p)
                        .map((t) => t.texto)
                        .join(''),
                    )
                    .join('\n'),
                ),
            ),
        })
      } else if (filho.localName === 'sdt') {
        // Bloco com controle (o sumario, um campo de formulario): o texto mora no sdtContent.
        for (const dentro of filhos(filho, 'sdtContent')) ler(dentro)
      }
    }
  }

  if (corpo) ler(corpo)
  return { blocos, cortado }
}

// ---------------------------------------------------------------- baixar

const EXTENSOES: Record<string, string> = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/json': '.json',
  'application/zip': '.zip',
  [XLSX]: '.xlsx',
  [ODS]: '.ods',
  [DOCX]: '.docx',
  [ODT]: '.odt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

/** O tamanho maximo do nome salvo, o mesmo da API. */
const NOME_MAXIMO = 120

/**
 * O nome com que a imagem e salva. **As mesmas regras da API para o arquivo**
 * (`DownloadDisposition`): sem caractere de controle nem os invisiveis de direcao (que
 * fazem `fatura` + U+202E + `gnp.exe` parecer `fatura.exe.png`), sem pasta, com no maximo
 * 120 caracteres, e sempre terminando na extensao do tipo conferido. Do lado de fora, que
 * nunca recebe o nome, sai "anexo" com a extensao.
 *
 * O arquivo que nao e imagem nao passa por aqui: ele baixa pelo endereco assinado, com o
 * nome que a propria API limpou.
 */
export function nomeParaBaixar(nome: string | undefined, contentType: string | undefined): string {
  const extensao =
    contentType && Object.hasOwn(EXTENSOES, contentType) ? (EXTENSOES[contentType] ?? '') : ''
  const semPasta = (nome ?? '').replace(/\\/g, '/').split('/').pop() ?? ''
  let limpo = semPasta.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()
  if (limpo === '') limpo = 'anexo'
  // O JPEG vale com as duas grafias: "foto.jpeg" nao vira "foto.jpeg.jpg".
  const aceitas = contentType === 'image/jpeg' ? ['.jpg', '.jpeg'] : [extensao]
  const final = aceitas.find((e) => limpo.toLowerCase().endsWith(e))
  if (extensao && !final) limpo += extensao
  const fim = final ?? extensao
  if (limpo.length > NOME_MAXIMO) {
    limpo = limpo.slice(0, limpo.length - fim.length).slice(0, NOME_MAXIMO - fim.length)
    // Um emoji sao dois caracteres: cortado no meio, a metade que sobra nao e texto.
    if (/[\uD800-\uDBFF]$/.test(limpo)) limpo = limpo.slice(0, -1)
    limpo += fim
  }
  return limpo
}
