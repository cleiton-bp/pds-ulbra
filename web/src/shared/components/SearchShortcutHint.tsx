/**
 * O "/" dentro do campo de busca: o atalho a vista, e nao so no `title`. Sai quando o
 * campo tem texto ou o foco (o campo e `peer`) — ai ele ja nao ajuda —, e no celular,
 * que nao tem teclado com "/" a mao.
 *
 * Mora aqui porque o Trabalho e o hub de projetos usam a mesma dica.
 */
export function SearchShortcutHint({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <kbd
      aria-hidden
      className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-2.5 hidden rounded border border-border bg-surface px-1.5 font-mono text-caption text-fg-muted peer-focus:hidden sm:block"
    >
      /
    </kbd>
  )
}
