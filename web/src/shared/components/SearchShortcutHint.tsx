/**
 * O "/" dentro do campo de busca: o atalho a vista, e nao so no `title`. Sai quando o
 * campo tem texto ou o foco (o campo e `peer`), porque ai ele ja nao ajuda, e no toque
 * (celular e tablet), que nao tem teclado com "/" a mao: so aparece com mouse.
 *
 * Mora aqui porque o Trabalho e o hub de projetos usam a mesma dica.
 */
export function SearchShortcutHint({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <kbd
      aria-hidden
      className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-2.5 hidden rounded border border-border bg-surface px-1.5 font-mono text-caption text-fg-muted peer-focus:hidden sm:pointer-fine:block"
    >
      /
    </kbd>
  )
}
