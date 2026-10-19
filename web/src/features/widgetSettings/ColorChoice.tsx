import { type CSSProperties, type ReactNode, useId, useState } from 'react'
import { isUsableAccent } from '@/embed/appearance'
import {
  type PaletteColor,
  paletteColor,
  parseHexColor,
} from '@/features/widgetSettings/buttonPalette'
import { Field, Hint, RadioGroup, type RadioOption } from '@/shared/components/SettingsControls'
import { cn } from '@/shared/lib/cn'

/**
 * A escolha de uma cor da configuracao, nas telas de O botão e de Formulário: a
 * automatica, as amostras e "Outra…", com o seletor do navegador e o campo do codigo.
 * **Uma so**, para a cor do botao e o fundo do formulario se escolherem do mesmo jeito.
 */

/**
 * A amostra de uma cor: a do cliente pela variavel `--amostra`, e a padrao pelo acento
 * do produto, que acompanha o tema. **Variavel, e nao cor em estilo embutido**: a cor do
 * cliente e dado, e a folha de estilo continua mandando no resto.
 */
export function ColorSwatch({ color, className }: { color: string | null; className?: string }) {
  const usavel = isUsableAccent(color)
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block flex-none rounded-full border border-border',
        usavel ? 'bg-[var(--amostra)]' : 'bg-accent',
        className,
      )}
      style={usavel ? ({ '--amostra': color.trim() } as CSSProperties) : undefined}
    />
  )
}

const PADRAO = 'padrao'
const OUTRA = 'outra'

/**
 * Uma cor num clique: a automatica, as amostras da paleta e "Outra…", que abre o
 * seletor do navegador e o campo do codigo. **Nada desligado sem motivo**: "Outra…"
 * comeca na cor que esta valendo, ou na primeira amostra quando nao da para ler.
 *
 * A linha embaixo diz o que esta escolhido, pelo nome — a amostra sozinha nao diz.
 */
export function ColorChoice({
  id,
  label,
  value,
  onChange,
  colors,
  automatic,
  startOther,
  otherNote,
}: {
  /** A ancora do campo: a busca leva ate ele. */
  id: string
  label: string
  value: string | null
  onChange: (value: string | null) => void
  colors: readonly PaletteColor[]
  /**
   * A opcao sem cor escolhida. O desenho dela e o acento do produto, a menos que
   * venha outro — o fundo do tema, por exemplo, nao e o acento.
   */
  automatic: { label: string; note: string; swatch?: ReactNode }
  /** De onde "Outra…" comeca sem cor escolhida: a que esta valendo agora. */
  startOther: () => string
  /** A dica com uma cor escolhida. */
  otherNote?: string
}) {
  /** A pessoa pediu "Outra…": fica marcada, mesmo que a cor caia numa amostra. */
  const [querOutra, setQuerOutra] = useState(false)
  const naLista = paletteColor(colors, value)
  const marcada = value === null ? PADRAO : querOutra || !naLista ? OUTRA : naLista.value
  const nomeMinusculo = label.toLowerCase()

  const options: RadioOption<string>[] = [
    {
      value: PADRAO,
      label: automatic.label,
      hideLabel: true,
      drawing: (
        <span className="flex h-6 items-center gap-1.5 px-1 text-detail">
          {automatic.swatch ?? <ColorSwatch color={null} className="size-4" />}
          {automatic.label}
        </span>
      ),
      className: 'min-w-0 p-1',
    },
    ...colors.map((cor) => ({
      value: cor.value,
      label: cor.name,
      hideLabel: true,
      drawing: <ColorSwatch color={cor.value} className="size-6" />,
      className: 'min-w-0 p-1',
    })),
    {
      value: OUTRA,
      label: 'Outra…',
      hideLabel: true,
      drawing: (
        <span className="flex h-6 items-center gap-1.5 px-1 text-detail">
          <span
            aria-hidden
            className="flex size-4 items-center justify-center rounded-full border border-fg-muted border-dashed text-fg-muted"
          >
            +
          </span>
          Outra…
        </span>
      ),
      className: 'min-w-0 p-1',
    },
  ]

  function escolher(escolha: string) {
    if (escolha === PADRAO) {
      setQuerOutra(false)
      onChange(null)
      return
    }
    if (escolha === OUTRA) {
      setQuerOutra(true)
      if (value === null) onChange(startOther())
      return
    }
    setQuerOutra(false)
    onChange(escolha)
  }

  const nota =
    value === null
      ? automatic.note
      : marcada === OUTRA
        ? otherNote
        : [naLista?.name, otherNote].filter(Boolean).join('. ')

  return (
    <Field id={id} label={label}>
      <RadioGroup<string>
        label={label}
        value={marcada}
        onChange={escolher}
        options={options}
        className="items-center"
      />

      {marcada === OUTRA && value !== null && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <input
            type="color"
            aria-label={`Outra ${nomeMinusculo}`}
            value={parseHexColor(value) ?? value}
            onChange={(event) => onChange(event.target.value)}
            className="h-8 w-14 cursor-pointer rounded-lg border border-border bg-surface-raised p-1"
          />
          <HexField
            label={`Código da ${nomeMinusculo}`}
            value={value}
            onChange={(cor) => onChange(cor)}
          />
        </div>
      )}

      {nota && <Hint>{nota}</Hint>}
    </Field>
  )
}

/**
 * O codigo da cor, para quem tem o da marca anotado. A cerquilha fica fora do campo; a
 * cor muda quando os seis digitos estao certos, e o erro so aparece ao sair do campo —
 * quem esta no meio da digitacao nao precisa ouvir que ainda nao terminou.
 */
function HexField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const digitos = (cor: string) => (parseHexColor(cor) ?? '').replace(/^#/, '')
  const [texto, setTexto] = useState(() => digitos(value))
  const [visto, setVisto] = useState(value)
  const [saiu, setSaiu] = useState(false)
  const erroId = useId()

  // A cor mudou por fora (o seletor do navegador, uma amostra): o campo acompanha.
  if (visto !== value) {
    setVisto(value)
    setTexto(digitos(value))
  }

  const erro = saiu && parseHexColor(texto) === null ? 'Use 6 dígitos, de 0 a 9 e de A a F.' : null

  return (
    <div>
      <div
        className={cn(
          'flex h-8 items-center rounded-lg border bg-surface-raised pl-2',
          erro ? 'border-error-border' : 'border-border',
        )}
      >
        <span aria-hidden className="text-body text-fg-muted">
          #
        </span>
        <input
          type="text"
          aria-label={label}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? erroId : undefined}
          value={texto}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            const novo = event.target.value.replace(/^#/, '')
            setTexto(novo)
            setSaiu(false)
            const cor = parseHexColor(novo)
            if (cor && novo.length === 6) {
              setVisto(cor)
              onChange(cor)
            }
          }}
          onBlur={() => {
            setSaiu(true)
            const cor = parseHexColor(texto)
            if (cor && cor !== value) {
              setVisto(cor)
              onChange(cor)
            }
          }}
          className="h-full w-20 rounded-r-lg bg-transparent px-1 font-mono text-body text-fg"
        />
      </div>
      {erro && (
        <p id={erroId} className="mt-1 text-detail text-error-fg">
          {erro}
        </p>
      )}
    </div>
  )
}
