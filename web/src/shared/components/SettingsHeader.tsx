import type { ReactNode } from 'react'
import { Button } from '@/shared/components/Button'
import { LeaveGuard } from '@/shared/components/LeaveGuard'
import { cn } from '@/shared/lib/cn'

/**
 * O titulo das telas de configuracao que salvam num botao, com o salvar ao lado, e a
 * trava de saida.
 *
 * **O salvar mora no titulo, parado no alto da tela.** Era uma barra presa no pe, e
 * depois um cabecalho preso no topo: nos dois, o conteudo passava por baixo de um
 * componente por cima da tela — "fica muito ruim". Agora ele rola junto com a tela e
 * nao cobre nada; quem sai com mudanca sem publicar e avisado (`LeaveGuard`), e e isso
 * que protege o rascunho, e nao o botao sempre a vista.
 *
 * **Sempre a vista, e desligado sem mudanca.** "Tudo publicado" (ou "Tudo salvo") diz
 * que nao ha o que fazer; com mudanca, quantas sao, e Descartar e Publicar ligam. O
 * rotulo de cada tela e o de antes: "Publicar" no que aparece no sistema do cliente,
 * "Salvar" no resto.
 *
 * **Sair com rascunho pergunta antes** (`LeaveGuard`), como antes.
 *
 * A frase do que se resolve na tela fica embaixo do titulo, fora da parte presa: ela
 * e lida uma vez, e presa so roubaria altura de quem rola.
 */
export function SettingsHeader({
  title,
  description,
  status,
  ready = true,
  dirty,
  changeCount,
  saving,
  canSave = true,
  onSave,
  onDiscard,
  publishes = false,
  note,
}: {
  title: string
  /** A frase do que se resolve na tela, embaixo do titulo. */
  description?: ReactNode
  /** O que vai ao lado do titulo: a pilula de ligado e desligado de O botão. */
  status?: ReactNode
  /**
   * Falso enquanto a tela le a API, ou quando ela falhou: sem rascunho nao ha o que
   * salvar, e "Tudo salvo" diria uma coisa que a tela nao sabe.
   */
  ready?: boolean
  dirty: boolean
  /** Quantas mudancas ha. Sem ela (a tela nao conta), "Mudanças não salvas". */
  changeCount?: number
  saving: boolean
  /** Falso quando ha mudanca, mas ela nao pode ser salva assim (campo a corrigir). */
  canSave?: boolean
  onSave: () => void
  onDiscard: () => void
  /** "Publicar" no que aparece no sistema do cliente; "Salvar" no resto. */
  publishes?: boolean
  /** O que vai no lugar da contagem, com mudanca: o motivo de nao dar para salvar. */
  note?: ReactNode
}) {
  return (
    <>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-semibold text-screen tracking-tight">{title}</h1>
          {status}
        </div>

        {ready && (
          <SaveActions
            dirty={dirty}
            changeCount={changeCount}
            saving={saving}
            canSave={canSave}
            onSave={onSave}
            onDiscard={onDiscard}
            publishes={publishes}
            note={note}
          />
        )}
      </header>

      {description && (
        <p className="mb-6 max-w-170 text-body text-fg-muted leading-relaxed">{description}</p>
      )}

      {ready && <LeaveGuard when={dirty && !saving} onSave={canSave ? onSave : undefined} />}
    </>
  )
}

/**
 * O estado e os botoes. **Abaixo de `sm` eles descem para baixo do titulo** numa linha
 * so, com o estado a esquerda e os botoes menores: presos, ocupam pouco da tela
 * pequena.
 */
function SaveActions({
  dirty,
  changeCount,
  saving,
  canSave,
  onSave,
  onDiscard,
  publishes,
  note,
}: {
  dirty: boolean
  changeCount?: number
  saving: boolean
  canSave: boolean
  onSave: () => void
  onDiscard: () => void
  publishes: boolean
  note?: ReactNode
}) {
  const compacto = 'h-8 px-3 text-detail sm:h-9 sm:px-3.5 sm:text-body'

  return (
    <div
      aria-busy={saving}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 sm:ml-auto sm:w-auto"
    >
      {/* `aria-live`: quem usa leitor de tela ouve a mudanca virar "Tudo salvo" depois
          de salvar, sem ter de voltar ao topo para conferir. */}
      <p
        aria-live="polite"
        className={cn(
          'mr-auto flex min-w-0 items-center gap-2 text-detail sm:mr-0',
          dirty ? 'text-fg' : 'text-fg-muted',
        )}
      >
        {dirty && <span aria-hidden className="size-2 flex-none rounded-full bg-accent" />}
        <span className="min-w-0">
          {dirty ? (note ?? describePending(changeCount, publishes)) : describeIdle(publishes)}
        </span>
      </p>

      <Button variant="ghost" className={compacto} disabled={!dirty || saving} onClick={onDiscard}>
        Descartar
      </Button>
      <Button
        variant="primary"
        className={compacto}
        disabled={!dirty || saving || !canSave}
        onClick={onSave}
      >
        {saving ? (publishes ? 'Publicando…' : 'Salvando…') : publishes ? 'Publicar' : 'Salvar'}
      </Button>
    </div>
  )
}

/** "Tudo publicado" ou "Tudo salvo": sem mudanca, a tela e o que esta valendo. */
function describeIdle(publishes: boolean): string {
  return publishes ? 'Tudo publicado' : 'Tudo salvo'
}

/** "1 mudança não publicada", "3 mudanças não salvas" — ou so "Mudanças não salvas". */
function describePending(count: number | undefined, publishes: boolean): string {
  const feito = publishes ? 'publicada' : 'salva'
  if (count === undefined || count < 1) return `Mudanças não ${feito}s`
  return count === 1 ? `1 mudança não ${feito}` : `${count} mudanças não ${feito}s`
}
