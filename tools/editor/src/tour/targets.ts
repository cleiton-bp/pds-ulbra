/**
 * As partes da tela que o tour sabe acender. Cada uma ganha a marca no proprio
 * componente (`{...tourTarget('files')}`), e o roteiro (`steps.ts`) aponta pelo
 * mesmo nome: um nome escrito errado de qualquer um dos lados nao compila.
 */
export type TourTarget =
  | 'files' // a lateral dos arquivos, com as abas dos ambientes
  | 'canvas' // o desenho
  | 'view' // Mudanças e Tudo (modelagem)
  | 'walk' // Percorrer mudanças (modelagem)
  | 'see' // o menu Ver (casos de uso)
  | 'panel' // o painel da direita
  | 'search' // Buscar
  | 'edit' // Leitura e Editando
  | 'help' // o botao que abre o tour

/** A marca que o tour procura na tela. */
export function tourTarget(name: TourTarget): { 'data-tour': TourTarget } {
  return { 'data-tour': name }
}
