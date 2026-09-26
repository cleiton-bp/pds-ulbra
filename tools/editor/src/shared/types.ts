/** O vocabulario que os editores dividem. O de cada um mora em `<editor>/types.ts`. */

export type FileEntry = {
  name: string
  mtime: number
  size: number
  /** O `meta.title` de dentro do arquivo; vazio quando ele nao tem. */
  title: string
}
