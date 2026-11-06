/**
 * A previa do formulario comeca em "Celular": no celular, e entre 1024 e 1279, onde a
 * previa vira a coluna estreita ao lado das opcoes. Em "Computador" nessas larguras a
 * pagina de mentira ficava espremida numa largura que nenhum computador tem, e o titulo
 * do formulario quebrava em tres linhas. A pessoa troca quando quiser.
 *
 * O `?.` existe porque o ambiente de teste nao tem `matchMedia`, e la a resposta e "nao".
 */
export function previewStartsOnPhone(): boolean {
  return (
    window.matchMedia?.('(max-width: 639px), (min-width: 1024px) and (max-width: 1279px)')
      .matches ?? false
  )
}

/** A janela tem largura de celular (abaixo do `sm` do Tailwind, 640px). */
export function isPhoneScreen(): boolean {
  return window.matchMedia?.('(max-width: 639px)').matches ?? false
}
