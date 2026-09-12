import { useCallback, useEffect, useState } from 'react'
import type { ReportType, WidgetPosition, WidgetSettingsViewModel, WidgetTheme } from '@/contracts'
import { WIDGET_TEXT_LIMITS } from '@/contracts'
import { describeError, projectKeyService, projectWidgetSettingsService } from '@/data'
import { readProductAccent } from '@/features/widgetSettings/productAccent'
import { WidgetPreview } from '@/features/widgetSettings/WidgetPreview'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'

/**
 * A tela que decide como a ferramenta aparece no site do cliente.
 *
 * **Dez campos que ja existiam e ninguem editava.** Ate aqui eles viviam nos
 * padroes do codigo; esta tela e o que os torna escolha de quem usa o painel.
 *
 * Tres decisoes de desenho, e as tres sao sobre nao mentir:
 *
 * 1. **A previa e a ferramenta de verdade**, e mostra o que esta **salvo**. Ela
 *    nao acompanha o que esta sendo digitado, e a etiqueta dela diz isso enquanto
 *    houver mudanca por publicar.
 * 2. **"Padrao" e "cor escolhida" sao dois estados**, e nao um campo de cor com um
 *    valor inicial. O padrao acompanha o tema de quem visita; uma cor escolhida
 *    vale sempre. Se o seletor abrisse ja preenchido com a cor de hoje, escolher
 *    "a mesma cor" trocaria o comportamento sem ninguem perceber.
 * 3. **O tipo pre-marcado muda de nome** quando o seletor de tipo esta escondido:
 *    ali ele deixa de ser o que vem marcado e passa a ser o unico que vai existir.
 */
export function WidgetSettingsScreen() {
  const project = useCurrentProject()

  const {
    data: saved,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(
      () => projectWidgetSettingsService.getWidgetSettings(project.PublicId),
      [project.PublicId],
    ),
  )

  // A previa precisa da chave publica, que mora noutra rota. Falhar aqui nao
  // impede configurar: so a previa fica de fora.
  const { data: keys } = useAsyncResource(
    useCallback(() => projectKeyService.listProjectKeys(project.PublicId), [project.PublicId]),
  )
  const publicKey = keys?.find((key) => key.Type === 'Public' && key.IsActive)?.Value ?? ''

  const [draft, setDraft] = useState<WidgetSettingsViewModel | null>(null)
  const [saving, setSaving] = useState(false)
  const [version, setVersion] = useState(0)

  /**
   * O que esta **publicado**, que nao e o mesmo que o que foi lido no inicio.
   *
   * Comparar o rascunho direto com a leitura da API parecia bastar e nao bastava:
   * depois de publicar, a leitura continuava sendo a antiga, a barra nunca sumia e
   * a previa seguia dizendo "mostrando o que esta publicado" sobre algo que ja
   * estava publicado. Publicar move esta base; a leitura so a define no inicio e
   * ao trocar de projeto.
   */
  const [published, setPublished] = useState<WidgetSettingsViewModel | null>(null)

  useEffect(() => {
    setPublished(saved)
    setDraft(saved)
  }, [saved])

  const dirty = draft !== null && published !== null && !same(draft, published)

  function change(patch: Partial<WidgetSettingsViewModel>) {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  async function publish() {
    if (!draft || saving) return

    setSaving(true)
    try {
      const stored = await projectWidgetSettingsService.saveWidgetSettings(project.PublicId, draft)
      setPublished(stored)
      setDraft(stored)
      // A previa so recarrega depois de publicar, porque e isso que ela mostra.
      setVersion((current) => current + 1)
      toast.done('Publicado. Quem abrir o seu site agora já vê assim.')
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Ferramenta</h1>
      <p className="mb-6 text-fg-muted text-body">
        Como a ferramenta de relato aparece no seu site. O que você publicar aqui vale na próxima
        visita, sem ninguém mexer no código.
      </p>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
            Não deu para carregar a configuração agora. A ferramenta no seu site não foi afetada:
            ela continua com o que já estava publicado.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && <LoadingForm />}

      {draft && (
        <div className="flex flex-col gap-4">
          <Section title="No seu site">
            <Check
              checked={draft.IsEnabled}
              onChange={(IsEnabled) => change({ IsEnabled })}
              label="Mostrar a ferramenta no meu site"
            />
            <p className="mt-2 text-detail text-fg-muted leading-relaxed">
              Desligar tira a ferramenta do site na próxima visita de cada pessoa, sem ninguém
              editar o código. Os relatos que já chegaram continuam onde estão.
            </p>

            {!draft.IsEnabled && (
              <p className="mt-3 rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-detail text-warn-fg leading-relaxed">
                Enquanto estiver desligada, ninguém no seu site consegue relatar nada — nem quem já
                estava com o formulário aberto.
              </p>
            )}
          </Section>

          <Section title="Aparência">
            <Field label="Cor do botão">
              <div className="flex flex-wrap items-center gap-2">
                <Choice
                  selected={draft.AccentColor === null}
                  onSelect={() => change({ AccentColor: null })}
                >
                  Padrão
                </Choice>
                <Choice
                  selected={draft.AccentColor !== null}
                  disabled={draft.AccentColor === null && readProductAccent() === null}
                  onSelect={() => change({ AccentColor: draft.AccentColor ?? readProductAccent() })}
                >
                  Escolher uma cor
                </Choice>

                {draft.AccentColor !== null && (
                  <input
                    type="color"
                    aria-label="Cor do botão"
                    value={draft.AccentColor}
                    onChange={(event) => change({ AccentColor: event.target.value })}
                    className="h-8 w-14 cursor-pointer rounded-lg border border-border bg-surface-raised p-1"
                  />
                )}
              </div>
            </Field>
            <p className="mt-2 text-detail text-fg-muted leading-relaxed">
              O padrão acompanha o tema de quem visita o seu site — escuro no claro, claro no
              escuro. Uma cor escolhida vale nos dois. A cor do texto por cima não se escolhe: ela é
              calculada para continuar legível sobre a que você escolher.
            </p>

            <Field label="Canto" className="mt-4">
              <Options
                value={draft.Position}
                onChange={(Position) => change({ Position })}
                options={[
                  { value: 'BottomRight', label: 'Direita' },
                  { value: 'BottomLeft', label: 'Esquerda' },
                ]}
              />
            </Field>

            <Field label="Tema" className="mt-4">
              <Options
                value={draft.Theme}
                onChange={(Theme) => change({ Theme })}
                options={[
                  { value: 'Auto', label: 'Acompanha quem visita' },
                  { value: 'Light', label: 'Claro' },
                  { value: 'Dark', label: 'Escuro' },
                ]}
              />
            </Field>
          </Section>

          <Section title="Textos">
            <TextField
              label="Botão parado na página"
              value={draft.LauncherLabel}
              onChange={(LauncherLabel) => change({ LauncherLabel })}
              maxLength={WIDGET_TEXT_LIMITS.LauncherLabel}
            />
            <TextField
              label="Título do formulário"
              className="mt-4"
              value={draft.Title}
              onChange={(Title) => change({ Title })}
              maxLength={WIDGET_TEXT_LIMITS.Title}
            />
            <TextField
              label="Texto da caixa vazia"
              className="mt-4"
              value={draft.Placeholder}
              onChange={(Placeholder) => change({ Placeholder })}
              maxLength={WIDGET_TEXT_LIMITS.Placeholder}
              hint="É esta frase que decide a qualidade do que chega: pedir o que a pessoa viu, onde, e o que esperava rende relato que dá para reproduzir."
            />
            <TextField
              label="Confirmação, acima do protocolo"
              className="mt-4"
              value={draft.SuccessMessage}
              onChange={(SuccessMessage) => change({ SuccessMessage })}
              maxLength={WIDGET_TEXT_LIMITS.SuccessMessage}
            />
          </Section>

          <Section title="O que a pessoa escolhe">
            <Check
              checked={draft.ShowsTypeField}
              onChange={(ShowsTypeField) => change({ ShowsTypeField })}
              label="Deixar a pessoa escolher o tipo do relato"
            />

            <Field
              label={draft.ShowsTypeField ? 'Tipo pré-marcado' : 'Tipo de todos os relatos'}
              className="mt-4"
            >
              <Options
                value={draft.DefaultReportType}
                onChange={(DefaultReportType) => change({ DefaultReportType })}
                options={[
                  { value: 'Bug', label: 'Defeito' },
                  { value: 'Improvement', label: 'Melhoria' },
                  { value: 'Question', label: 'Dúvida' },
                ]}
              />
            </Field>

            {!draft.ShowsTypeField && (
              <p className="mt-2 text-detail text-fg-muted leading-relaxed">
                Com o seletor escondido, tudo que chegar entra com este tipo — inclusive o que for
                outra coisa.
              </p>
            )}
          </Section>

          {/* A barra so existe quando ha o que publicar: um botao "Publicar"
              sempre aceso convida a clicar sem nada para salvar, e ensina que o
              clique nao faz diferenca. */}
          {dirty && (
            <div className="sticky bottom-0 flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-3.5">
              <Button variant="primary" disabled={saving} onClick={() => void publish()}>
                {saving ? 'Publicando…' : 'Publicar'}
              </Button>
              <Button variant="ghost" disabled={saving} onClick={() => setDraft(published)}>
                Descartar
              </Button>
              <span className="text-detail text-fg-muted">
                Ainda não está no seu site — publique para valer.
              </span>
            </div>
          )}

          <section className="rounded-xl border border-border bg-surface-raised p-5">
            <header className="mb-1 flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-fg text-lead">Prévia</h2>
              <span className="flex-none text-caption text-fg-muted">
                {dirty ? 'mostrando o que está publicado' : 'igual ao seu site'}
              </span>
            </header>

            <p className="mb-4 text-detail text-fg-muted leading-relaxed">
              É a ferramenta de verdade, aberta pela mesma chave que o seu site usa — e não um
              desenho dela.{' '}
              {dirty
                ? 'Ela mostra o que está publicado, então as mudanças acima só aparecem aqui depois de publicar.'
                : 'Enviar um relato por aqui grava de verdade.'}
            </p>

            <WidgetPreview publicKey={publicKey} version={version} />
          </section>
        </div>
      )}
    </div>
  )
}

/** Compara campo a campo: o objeto vem novo da API a cada leitura. */
function same(a: WidgetSettingsViewModel, b: WidgetSettingsViewModel): boolean {
  return (
    a.IsEnabled === b.IsEnabled &&
    a.AccentColor === b.AccentColor &&
    a.Position === b.Position &&
    a.Theme === b.Theme &&
    a.LauncherLabel === b.LauncherLabel &&
    a.Title === b.Title &&
    a.Placeholder === b.Placeholder &&
    a.SuccessMessage === b.SuccessMessage &&
    a.ShowsTypeField === b.ShowsTypeField &&
    a.DefaultReportType === b.DefaultReportType
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface-raised p-5">
      <h2 className="mb-3.5 font-semibold text-fg text-lead">{title}</h2>
      {children}
    </section>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      {/* `div` e nao `label`: o controle aqui dentro e um grupo de botoes, e
          rotulo que aponta para nada confunde leitor de tela. O nome do grupo vai
          no `aria-label` dele. */}
      <div className="mb-1.5 text-detail text-fg-muted">{label}</div>
      {children}
    </div>
  )
}

/**
 * Um grupo de escolhas exclusivas. `aria-pressed` e nao `radio` porque sao botoes
 * de verdade, com a aparencia do resto do painel; o leitor de tela anuncia
 * "pressionado", que e o estado real.
 */
function Options<T extends WidgetPosition | WidgetTheme | ReportType>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string }>
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Choice
          key={option.value}
          selected={value === option.value}
          onSelect={() => onChange(option.value)}
        >
          {option.label}
        </Choice>
      ))}
    </div>
  )
}

function Choice({
  selected,
  disabled,
  onSelect,
  children,
}: {
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'h-8 rounded-lg border px-3 text-detail transition-colors',
        'disabled:cursor-not-allowed disabled:text-fg-disabled',
        selected
          ? 'border-transparent bg-accent font-medium text-accent-fg'
          : 'border-border bg-surface text-fg enabled:hover:bg-surface-sunken',
      )}
    >
      {children}
    </button>
  )
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 flex-none accent-accent"
      />
      <span className="text-body text-fg">{label}</span>
    </label>
  )
}

function LoadingForm() {
  return (
    <div className="flex flex-col gap-4">
      {['h-28', 'h-44', 'h-56'].map((height) => (
        <Skeleton key={height} className={cn('w-full rounded-xl', height)} />
      ))}
    </div>
  )
}
