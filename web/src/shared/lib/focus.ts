/** O que recebe foco por si: link, controle de formulario, ou quem ja tem `tabindex`. */
const FOCAVEL = 'a[href], button, input, select, textarea, [tabindex]'

/**
 * Poe o foco num elemento que normalmente nao o recebe — a coluna do quadro, a tabela,
 * a area de Trabalho —, **so desta vez**.
 *
 * Um `tabIndex={-1}` fixo resolveria o foco e criaria outro problema: o clique do mouse
 * num canto vazio leva o foco para o ancestral focavel mais proximo, e o dialogo aberto
 * por esse clique o devolveria ali, e nao ao card. Aqui o `tabindex` entra so para
 * receber o foco, e sai quando ele vai embora.
 */
export function focusAnyway(el: HTMLElement): void {
  if (el.matches(FOCAVEL)) {
    el.focus()
    return
  }
  el.setAttribute('tabindex', '-1')
  el.addEventListener('blur', () => el.removeAttribute('tabindex'), { once: true })
  el.focus()
}
