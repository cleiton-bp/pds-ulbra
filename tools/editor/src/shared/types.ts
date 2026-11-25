/** O vocabulario que os dois editores dividem. O de cada um mora em `<editor>/types.ts`. */

export type FileEntry = {
  name: string
  mtime: number
  size: number
  /** O `meta.title` de dentro do arquivo; vazio quando ele nao tem. */
  title: string
  /** Quanto o arquivo desenha: as tabelas da modelagem ou os casos de uso. */
  count: number
}

/** Erro de sintaxe no arquivo: o editor mostra o aviso em vez de abrir vazio. */
export type ParseResult<Doc> = { ok: true; doc: Doc } | { ok: false; error: string }
