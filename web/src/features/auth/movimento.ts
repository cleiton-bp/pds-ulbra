/**
 * As curvas do movimento da pagina de entrada, para o `element.animate`, que nao le
 * variavel de CSS. Sao as mesmas do `:root` do `index.css`: mexeu aqui, mexa la.
 *
 * Curva forte e nao a de fabrica do CSS: a saida rapida para o que entra e sai, a de ida e
 * volta para o que anda na tela, a de gaveta para o que cresce de um botao, e a mola para
 * o que e solto pela mao (o card que cai no quadro), que assenta com um quique leve.
 */
export const SAIDA = 'cubic-bezier(0.23, 1, 0.32, 1)'
export const IDA_E_VOLTA = 'cubic-bezier(0.77, 0, 0.175, 1)'
export const GAVETA = 'cubic-bezier(0.32, 0.72, 0, 1)'
export const MOLA =
  'linear(0, 0.016, 0.059, 0.121, 0.195, 0.276, 0.361, 0.445, 0.527, 0.603, 0.674, 0.738, 0.795, 0.845, 0.888, 0.924, 0.954, 0.978, 0.997, 1.012, 1.023, 1.03, 1.035, 1.038, 1.038, 1.038, 1.036, 1.034, 1.031, 1.028, 1.025, 1.022, 1.018, 1.015, 1.013, 1.01, 1.008, 1.006, 1.004, 1.003, 1)'
export const MOLA_MS = 540

/** Lido na hora: quem liga a preferencia no meio da visita ja e atendido no proximo gesto. */
export function semMovimento(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Para o que estiver animando no elemento, sem pular para o fim. */
export function pararAnimacoes(elemento: Element): void {
  for (const animacao of elemento.getAnimations?.() ?? []) animacao.cancel()
}

/**
 * Onde o elemento esta no layout, na tela, sem as transformacoes que ele tenha agora: e a
 * conta de quem faz um card voar do lugar velho para o novo sem pular.
 */
export function noLayout(elemento: HTMLElement): { x: number; y: number } {
  const pai = elemento.offsetParent as HTMLElement | null
  const base = pai?.getBoundingClientRect() ?? { left: 0, top: 0 }
  return { x: base.left + elemento.offsetLeft, y: base.top + elemento.offsetTop }
}
