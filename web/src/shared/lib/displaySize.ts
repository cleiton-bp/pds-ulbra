import type { AttachmentDisplaySize } from '@/contracts'

/**
 * O tamanho em que a imagem aparece logo abaixo do texto — o mesmo no quadro, onde a
 * pessoa monta o relato, e no acompanhamento e no painel, onde ele e lido.
 *
 * **Uma grade de doze colunas, e nao porcentagens.** A largura e uma fracao da linha
 * do texto: um terco, meia, tres quartos, a linha inteira. Em porcentagem, tres
 * "um terco" com o espaco entre elas somariam, pelo arredondamento, um fio a mais que
 * a linha — e a terceira desceria. Na grade, cada imagem ocupa colunas inteiras: tres
 * pequenas, ou duas medias, fecham a linha exatas, e a que nao cabe no resto da linha
 * comeca a proxima, sem trocar de lugar com ninguem.
 */
export const DISPLAY_GRID_CLASS = 'grid grid-cols-12 items-start gap-2'

const COLUNAS: Record<AttachmentDisplaySize, string> = {
  Small: 'col-span-4',
  Medium: 'col-span-6',
  Large: 'col-span-9',
  Full: 'col-span-12',
}

/**
 * As colunas de um tamanho. **O que nao se conhece ocupa a linha inteira** — a API
 * de antes deste campo, que nao o manda, ou um tamanho novo que esta tela ainda nao
 * sabe desenhar. Sem isto, a imagem ficaria com uma coluna so.
 */
export function displaySizeClass(size: string | null | undefined): string {
  return size && Object.hasOwn(COLUNAS, size)
    ? COLUNAS[size as AttachmentDisplaySize]
    : COLUNAS.Full
}

/** O nome de cada tamanho, como a pessoa le no botao. */
export const DISPLAY_SIZE_LABEL: Record<AttachmentDisplaySize, string> = {
  Small: 'Pequeno',
  Medium: 'Médio',
  Large: 'Grande',
  Full: 'Largura toda',
}

/**
 * Quanto da linha cada tamanho ocupa — para o desenho do botao, que mostra a imagem
 * dentro da linha.
 */
export const DISPLAY_SIZE_FRACTION: Record<AttachmentDisplaySize, number> = {
  Small: 4 / 12,
  Medium: 6 / 12,
  Large: 9 / 12,
  Full: 1,
}

/**
 * A imagem na linha.
 *
 * **O lugar dela e reservado antes de ela chegar** (`aspect-ratio: auto 16/10`): o
 * 16:10 vale so ate a imagem carregar, e dai em diante vale a proporcao dela. Sem
 * isso, toda imagem comecaria com altura zero — todas caberiam na primeira tela, e a
 * carga preguicosa baixaria tudo de uma vez; e a pagina pularia a cada uma que
 * chegasse.
 *
 * **A altura maxima** e para a captura de rolagem longa — 1080 por 10000 —, que na
 * linha inteira passaria de dez telas; ela aparece ate aqui, alinhada a esquerda, e
 * abre inteira num clique. **A minima**, para a faixa: um aviso capturado de 900 por
 * 120, pequeno, teria 14 pixels de altura — nem da para clicar, nem cabem nele o lapis
 * e o "remover" de quem monta.
 */
export const DISPLAY_IMAGE_CLASS =
  'block aspect-[auto_16/10] h-auto min-h-10 max-h-[70vh] w-full object-contain object-left-top'
