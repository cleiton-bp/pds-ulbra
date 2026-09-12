import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  type CreatedReportViewModel,
  MAX_REPORT_TEXT_LENGTH,
  type ReportType,
  type WidgetSettingsViewModel,
} from '@/contracts'
import { describeError, reportService } from '@/data/publicIndex'
import { accentStyle, resolveTheme, watchSystemTheme } from '@/embed/appearance'
import type { EmbedConfig } from '@/embed/config'
import { REPORT_TYPES } from '@/embed/reportTypes'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { cn } from '@/shared/lib/cn'

/**
 * O quadro do relato: o que a pessoa que visita o site do cliente enxerga.
 *
 * Ele nao sabe que esta dentro de um `iframe`, nao sabe quem e o cliente e nao
 * tem sessao. Tudo que muda a aparencia dele chega em `settings`, e tudo que diz
 * para onde o relato vai chega em `config`.
 */
interface EmbedAppProps {
  settings: WidgetSettingsViewModel
  config: EmbedConfig
}

export function EmbedApp({ settings, config }: EmbedAppProps) {
  const [type, setType] = useState<ReportType>(settings.DefaultReportType)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedReportViewModel | null>(null)

  // O tema fixado pelo cliente vale sempre; `Auto` acompanha o sistema de quem
  // visita, inclusive se ele mudar com o quadro ja aberto.
  useEffect(() => {
    const apply = (resolved: 'light' | 'dark') =>
      document.documentElement.setAttribute('data-theme', resolved)

    apply(resolveTheme(settings.Theme))
    return watchSystemTheme(settings.Theme, apply)
  }, [settings.Theme])

  const style = useMemo(() => accentStyle(settings), [settings])
  const trimmed = text.trim()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!trimmed || sending) return

    setSending(true)
    setError(null)

    try {
      setCreated(
        await reportService.createReport({
          Key: config.key,
          Type: type,
          Text: trimmed,
          Route: config.route,
          Origin: config.origin,
          Context: null,
        }),
      )
    } catch (failure) {
      setError(describeError(failure))
    } finally {
      setSending(false)
    }
  }

  if (created) {
    return (
      <section style={style} className="flex h-full flex-col gap-4 bg-surface p-5">
        <div>
          <p className="text-body text-fg leading-normal">{settings.SuccessMessage}</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <p className="mb-1.5 text-detail text-fg-muted">Protocolo</p>
          <p className="font-mono text-fg text-lead tracking-wide">{created.TrackingCode}</p>
        </div>

        <div className="mt-auto flex items-center gap-2">
          <CopyButton value={created.TrackingCode} label="Copiar protocolo" size="sm" />
        </div>
      </section>
    )
  }

  return (
    <form style={style} onSubmit={submit} className="flex h-full flex-col gap-4 bg-surface p-5">
      <h1 className="font-semibold text-fg text-lead tracking-tight">{settings.Title}</h1>

      {settings.ShowsTypeField && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1.5 text-detail text-fg-muted">O que é</legend>

          {REPORT_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={type === option.value}
              onClick={() => setType(option.value)}
              className={cn(
                'h-8 rounded-lg border px-3 text-detail transition-colors',
                type === option.value
                  ? 'border-transparent bg-[var(--widget-accent)] text-[var(--widget-ink)]'
                  : 'border-border bg-surface text-fg hover:bg-surface-sunken',
              )}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      )}

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={settings.Placeholder}
        maxLength={MAX_REPORT_TEXT_LENGTH}
        aria-label={settings.Title}
        aria-invalid={error ? true : undefined}
        className={cn(
          'min-h-28 flex-1 resize-none rounded-lg border bg-surface-raised px-3 py-2.5',
          'text-body text-fg leading-normal placeholder:text-fg-placeholder',
          error ? 'border-error-border' : 'border-border',
        )}
      />

      {error && (
        <p role="alert" className="text-detail text-error-fg leading-normal">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={!trimmed || sending}
        block
        className={cn(
          'border-transparent bg-[var(--widget-accent)] text-[var(--widget-ink)] font-medium',
          'disabled:bg-surface-sunken disabled:text-fg-disabled',
        )}
      >
        {sending ? 'Enviando…' : 'Enviar'}
      </Button>
    </form>
  )
}
