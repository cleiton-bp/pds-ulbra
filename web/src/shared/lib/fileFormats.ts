/**
 * Como o arquivo que nao e imagem aparece para quem le: o nome de cada formato, em
 * portugues. **A lista dos formatos, e a conferencia dos bytes, sao da API**
 * (`FileFormats`); aqui so mora o nome de cada um.
 */

/** O nome de cada formato do catalogo, na tela de Midia. */
export const FILE_FORMAT_LABEL: Record<string, string> = {
  pdf: 'PDF',
  text: 'Texto e log',
  spreadsheet: 'Planilha',
  document: 'Documento',
  json: 'JSON',
  zip: 'ZIP',
}

/** O nome de um formato, ou o proprio nome do catalogo quando esta tela ainda nao o conhece. */
export function fileFormatLabel(key: string): string {
  return Object.hasOwn(FILE_FORMAT_LABEL, key) ? (FILE_FORMAT_LABEL[key] ?? key) : key
}

const TIPOS: Record<string, string> = {
  'application/pdf': 'PDF',
  'text/plain': 'Texto',
  'text/csv': 'Planilha CSV',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Planilha do Excel',
  'application/vnd.oasis.opendocument.spreadsheet': 'Planilha ODS',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Documento do Word',
  'application/vnd.oasis.opendocument.text': 'Documento ODT',
  'application/json': 'JSON',
  'application/zip': 'ZIP',
}

/** "PDF", "Planilha do Excel" — pelo tipo gravado. O que esta tela nao conhece e "Arquivo". */
export function fileTypeLabel(contentType: string | undefined): string {
  return contentType && Object.hasOwn(TIPOS, contentType)
    ? (TIPOS[contentType] ?? 'Arquivo')
    : 'Arquivo'
}

const SIGLAS: Record<string, string> = {
  'application/pdf': 'PDF',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.oasis.opendocument.spreadsheet': 'ODS',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.oasis.opendocument.text': 'ODT',
  'application/json': 'JSON',
  'application/zip': 'ZIP',
}

/** A sigla do selo pelo tipo gravado — do lado de fora nao ha nome, e so o tipo diz. */
export function fileTypeBadge(contentType: string | undefined): string {
  return contentType && Object.hasOwn(SIGLAS, contentType) ? (SIGLAS[contentType] ?? 'ARQ') : 'ARQ'
}

/** A sigla curta para o selo do arquivo: a extensao, sem o ponto, ou "ARQ". */
export function fileBadge(extension: string | null): string {
  return extension ? extension.slice(1, 5).toUpperCase() : 'ARQ'
}
