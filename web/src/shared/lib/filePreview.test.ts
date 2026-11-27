// @vitest-environment jsdom

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { LINHAS_MAXIMAS, lerCsv, lerPrevia, nomeParaBaixar } from '@/shared/lib/filePreview'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * O visualizador mostra o que ha dentro do arquivo **como texto**, lido dos bytes, e com
 * teto. O CSV do Excel em portugues (ponto e virgula), a data do Excel (que e numero), a
 * linha vazia repetida um milhao de vezes do LibreOffice e o log salvo no Windows sao os
 * casos que, errados, mostrariam lixo ou travariam a aba. Arquivo que nao se le vira
 * "sem previa", e nunca erro.
 */

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ODS = 'application/vnd.oasis.opendocument.spreadsheet'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ODT = 'application/vnd.oasis.opendocument.text'

const zip = (partes: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(partes).map(([n, c]) => [n, strToU8(c)])))

describe('texto', () => {
  it('le UTF-8, e o log do Windows (1252) sem virar losango', async () => {
    expect(await lerPrevia(strToU8('ação concluída'), 'text/plain')).toEqual({
      tipo: 'texto',
      texto: 'ação concluída',
      cortado: false,
    })
    // "ação" em Windows-1252: o ç e o ã sao um byte cada, que nao fecham em UTF-8.
    const windows = new Uint8Array([0x61, 0xe7, 0xe3, 0x6f])
    expect(await lerPrevia(windows, 'text/plain')).toMatchObject({ texto: 'ação' })
  })

  it('o JSON vem arrumado, e o que nao e JSON valido vem como veio', async () => {
    expect(await lerPrevia(strToU8('{"a":[1,2]}'), 'application/json')).toMatchObject({
      texto: '{\n  "a": [\n    1,\n    2\n  ]\n}',
    })
    expect(await lerPrevia(strToU8('{quebrado'), 'application/json')).toMatchObject({
      texto: '{quebrado',
    })
  })
})

describe('CSV', () => {
  it('o do Excel em portugues separa por ponto e virgula, com aspas e quebra dentro do campo', () => {
    const { linhas } = lerCsv('nome;valor;obs\r\n"Silva; Ana";1,5;"disse ""oi""\nde novo"\r\n')
    expect(linhas).toEqual([
      ['nome', 'valor', 'obs'],
      ['Silva; Ana', '1,5', 'disse "oi"\nde novo'],
    ])
  })

  it('para no teto de linhas, e diz que cortou', () => {
    const conteudo = Array.from({ length: LINHAS_MAXIMAS + 5 }, (_, i) => `${i},x`).join('\n')
    const { linhas, cortada } = lerCsv(conteudo)
    expect(linhas).toHaveLength(LINHAS_MAXIMAS)
    expect(cortada).toBe(true)
  })
})

describe('Excel', () => {
  it('le as abas, o texto compartilhado, o numero e a data', async () => {
    const bytes = zip({
      'xl/workbook.xml':
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Erros" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml':
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Tela</t></si><si><r><t>Ca</t></r><r><t>tálogo</t></r></si></sst>',
      'xl/styles.xml':
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
      'xl/worksheets/sheet1.xml':
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>0.30000000000000004</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" s="1"><v>46096</v></c></row></sheetData></worksheet>',
    })

    expect(await lerPrevia(bytes, XLSX)).toEqual({
      tipo: 'planilha',
      abas: [
        {
          nome: 'Erros',
          linhas: [['Tela', '', '0.3'], [], ['Catálogo', '15/03/2026']],
          cortada: false,
        },
      ],
    })
  })
})

describe('LibreOffice', () => {
  const ods = (linhas: string) =>
    zip({
      'content.xml': `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Plan1">${linhas}</table:table></office:spreadsheet></office:body></office:document-content>`,
    })

  it('a linha vazia repetida um milhao de vezes no fim nao entra, nem corta', async () => {
    const previa = await lerPrevia(
      ods(
        '<table:table-row><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell table:number-columns-repeated="3"><text:p>b</text:p></table:table-cell><table:table-cell table:number-columns-repeated="16380"/></table:table-row><table:table-row table:number-rows-repeated="1048575"><table:table-cell table:number-columns-repeated="16384"/></table:table-row>',
      ),
      ODS,
    )
    expect(previa).toEqual({
      tipo: 'planilha',
      abas: [{ nome: 'Plan1', linhas: [['A', 'b', 'b', 'b']], cortada: false }],
    })
  })

  it('o texto do .odt vem com titulos, listas e os espacos que ele codifica', async () => {
    const bytes = zip({
      'content.xml':
        '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h text:outline-level="1">Passos</text:h><text:list><text:list-item><text:p>Abrir<text:s text:c="2"/>o app</text:p></text:list-item></text:list><text:p>Fim</text:p></office:text></office:body></office:document-content>',
    })
    expect(await lerPrevia(bytes, ODT)).toEqual({
      tipo: 'documento',
      cortado: false,
      blocos: [
        { tipo: 'titulo', nivel: 1, trechos: [{ texto: 'Passos' }] },
        { tipo: 'paragrafo', item: true, trechos: [{ texto: 'Abrir  o app' }] },
        { tipo: 'paragrafo', item: false, trechos: [{ texto: 'Fim' }] },
      ],
    })
  })
})

describe('Word', () => {
  it('le titulo, negrito, lista e tabela, com o estilo do Word em portugues', async () => {
    const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    const bytes = zip({
      'word/document.xml': `<w:document ${w}><w:body><w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>Erro</w:t></w:r></w:p><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t xml:space="preserve">Clique em </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Pagar</w:t></w:r><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`,
    })
    expect(await lerPrevia(bytes, DOCX)).toEqual({
      tipo: 'documento',
      cortado: false,
      blocos: [
        { tipo: 'titulo', nivel: 1, trechos: [{ texto: 'Erro', negrito: false, italico: false }] },
        {
          tipo: 'paragrafo',
          item: true,
          trechos: [
            { texto: 'Clique em ', negrito: false, italico: false },
            { texto: 'Pagar', negrito: true, italico: false },
            { texto: '.', negrito: false, italico: false },
          ],
        },
        { tipo: 'tabela', linhas: [['A', 'B']] },
      ],
    })
  })
})

describe('o que nao se le', () => {
  it('zip quebrado, formato sem previa e tipo desconhecido viram "sem previa", e nunca erro', async () => {
    expect(await lerPrevia(strToU8('nao e zip'), DOCX)).toEqual({ tipo: 'sem-previa' })
    expect(await lerPrevia(zip({ 'a.txt': 'x' }), 'application/zip')).toEqual({
      tipo: 'sem-previa',
    })
    expect(await lerPrevia(strToU8('x'), undefined)).toEqual({ tipo: 'sem-previa' })
  })

  it('o PDF vai inteiro para o leitor de PDF', async () => {
    expect(await lerPrevia(strToU8('%PDF-1.7'), 'application/pdf')).toEqual({ tipo: 'pdf' })
  })
})

describe('o nome da imagem baixada', () => {
  it('no painel, o nome original; do lado de fora, "anexo" com a extensao do tipo', () => {
    expect(nomeParaBaixar('tela do erro.png', 'image/png')).toBe('tela do erro.png')
    expect(nomeParaBaixar(undefined, 'image/webp')).toBe('anexo.webp')
    expect(nomeParaBaixar(undefined, 'audio/ogg')).toBe('anexo')
  })

  // As mesmas regras da API para o arquivo: o nome que engana nao chega a janela de salvar.
  it('tira os invisiveis de direcao, a pasta, e termina sempre na extensao do tipo', () => {
    expect(nomeParaBaixar('fatura\u202Egnp.exe', 'image/png')).toBe('faturagnp.exe.png')
    expect(nomeParaBaixar('C:\\Users\\ana\\print.png', 'image/png')).toBe('print.png')
    expect(nomeParaBaixar('foto.jpeg', 'image/jpeg')).toBe('foto.jpeg')
    expect(nomeParaBaixar('foto', 'image/jpeg')).toBe('foto.jpg')
    const longo = nomeParaBaixar(`${'a'.repeat(200)}.png`, 'image/png')
    expect(longo).toHaveLength(120)
    expect(longo.endsWith('.png')).toBe(true)
  })
})
