/**
 * O selo "Cada mudança vale na hora": diz, ao lado do titulo, como a tela grava — sem
 * Publicar, cada Salvar, seta e Apagar ja chega a quem usa. Mora em `shared` porque as
 * telas que gravam assim (Andamento público, Colunas, Prioridades) o usam igual.
 */
export function LiveBadge() {
  return (
    <span className="flex flex-none items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 text-detail text-fg-muted">
      <span aria-hidden className="size-2 flex-none rounded-full bg-chip-green-glyph" />
      Cada mudança vale na hora
    </span>
  )
}
