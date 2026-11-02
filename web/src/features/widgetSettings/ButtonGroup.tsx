import { Button } from '@/shared/components/Button'
import { cn } from '@/shared/lib/cn'

/**
 * A peca da tela O botão que so ela usa: a pilula de ligado e desligado. O grupo do
 * acordeao mudou para `shared/components/SettingsGroup`, porque as telas vizinhas
 * organizam os assuntos do mesmo jeito.
 */

/**
 * Ligado ou desligado, no cabecalho: **o estado em palavras, e o que fazer com ele**.
 * Uma caixa de marcar no meio da tela nao dizia se o botao estava no ar.
 *
 * O nome do botao repete o que ele faz por inteiro ("Desligar o botão no seu sistema"):
 * "Desligar" sozinho, para quem ouve, nao diz o que desliga.
 */
export function VisibilityPill({
  id,
  enabled,
  waitingScript = false,
  onChange,
}: {
  /** A ancora do controle: a busca leva ate ele, e o foco cai nele. */
  id: string
  enabled: boolean
  /**
   * Ligado, mas o sistema ainda nao mandou relato: o botao so aparece depois que o script
   * for colado. Dizer "Visível no seu sistema" aqui afirmava uma instalacao que nao existe.
   */
  waitingScript?: boolean
  onChange: (enabled: boolean) => void
}) {
  const esperando = enabled && waitingScript
  return (
    <div
      title={
        esperando ? 'O botão aparece no seu sistema depois que o script for colado.' : undefined
      }
      className={cn(
        'flex flex-none items-center gap-2 rounded-full border py-1 pr-1 pl-3 text-detail transition-colors',
        esperando
          ? 'border-border bg-surface text-fg'
          : enabled
            ? 'border-chip-green-border bg-chip-green-surface text-chip-green-fg'
            : 'border-warn-border bg-warn-surface text-warn-fg',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-2 flex-none rounded-full',
          esperando
            ? 'border border-fg-muted border-dashed'
            : enabled
              ? 'bg-chip-green-glyph'
              : 'border border-warn-fg',
        )}
      />
      <span role="status" className="font-medium">
        {esperando
          ? 'Ligado, esperando o script'
          : enabled
            ? 'Visível no seu sistema'
            : 'Desligado'}
      </span>
      <Button
        id={id}
        size="sm"
        variant="ghost"
        className="scroll-mt-6 rounded-full"
        aria-label={enabled ? 'Desligar o botão no seu sistema' : 'Ligar o botão no seu sistema'}
        onClick={() => onChange(!enabled)}
      >
        {enabled ? 'Desligar' : 'Ligar'}
      </Button>
    </div>
  )
}
