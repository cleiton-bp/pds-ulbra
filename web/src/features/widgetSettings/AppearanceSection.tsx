import { useId, useState } from 'react'
import type {
  WidgetLauncherIcon,
  WidgetLauncherShape,
  WidgetLauncherSize,
  WidgetMobileMode,
  WidgetPosition,
  WidgetSettingsViewModel,
} from '@/contracts'
import { WIDGET_APPEARANCE_LIMITS, WIDGET_TEXT_LIMITS } from '@/contracts'
import { contrastRatio } from '@/embed/appearance'
import { NARROW_VIEWPORT } from '@/embed/launcher'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { BUTTON_COLORS, paletteColor, TEXT_COLORS } from '@/features/widgetSettings/buttonPalette'
import { ColorChoice } from '@/features/widgetSettings/ColorChoice'
import { HiddenPagesEditor } from '@/features/widgetSettings/HiddenPagesEditor'
import { readProductAccent, readProductAccentInk } from '@/features/widgetSettings/productAccent'
import { Button } from '@/shared/components/Button'
import {
  LAUNCHER_ICON_NAMES,
  LAUNCHER_ICONS,
  LauncherIconSvg,
} from '@/shared/components/LauncherIcon'
import { NumberField } from '@/shared/components/NumberField'
import { Field, Hint, RadioGroup } from '@/shared/components/SettingsControls'
import { TextField } from '@/shared/components/TextField'
import { cn } from '@/shared/lib/cn'
import { changedFromDefaults, defaultsOf } from '@/shared/lib/factoryDefaults'

type Campos = ReadonlyArray<readonly [keyof WidgetSettingsViewModel, string]>

/**
 * Os grupos da tela, cada campo com o nome que o resumo mostra. **Cada campo mora num
 * grupo so**, e e com esta lista que o grupo diz o que mudou e que "Voltar ao padrão"
 * sabe o que trocar. A ordem e a da tela. O liga e desliga fica fora: ele mora no
 * cabecalho. O tema do formulario tambem: e do formulario, e mora em Formulário.
 */
export const BUTTON_GROUPS = {
  appearance: [
    ['LauncherIconOnly', 'Só o ícone'],
    ['LauncherLabel', 'Texto'],
    ['LauncherIcon', 'Ícone'],
    ['AccentColor', 'Cor'],
    ['LauncherTextColor', 'Cor do texto'],
    ['LauncherSize', 'Tamanho'],
    ['LauncherShape', 'Formato'],
    ['LauncherShadow', 'Sombra'],
  ],
  position: [
    ['Position', 'Canto'],
    ['OffsetX', 'Distância na horizontal'],
    ['OffsetY', 'Distância na vertical'],
  ],
  mobile: [['MobileMode', 'No celular']],
  hiddenPages: [['HiddenPaths', 'Páginas escondidas']],
} as const satisfies Record<string, Campos>

/** O que esta tela grava: o liga e desliga e os campos dos grupos. Ver `useWidgetSettingsDraft`. */
export const BUTTON_FIELDS = [
  'IsEnabled',
  ...Object.values(BUTTON_GROUPS).flatMap((campos) => campos.map(([campo]) => campo)),
] satisfies ReadonlyArray<keyof WidgetSettingsViewModel>

/** O minimo da WCAG para texto. Abaixo disto o painel avisa — e nao impede. */
const CONTRASTE_MINIMO = 4.5

const CANTOS: Record<WidgetPosition, string> = {
  BottomRight: 'Embaixo, à direita',
  BottomLeft: 'Embaixo, à esquerda',
  TopRight: 'Em cima, à direita',
  TopLeft: 'Em cima, à esquerda',
}

const NO_CELULAR: Record<WidgetMobileMode, string> = {
  Same: 'Igual ao computador',
  IconOnly: 'Só o ícone',
  Hidden: 'Escondido',
}

const TAMANHOS: Record<WidgetLauncherSize, string> = {
  Small: 'Pequeno',
  Medium: 'Médio',
  Large: 'Grande',
}

const FORMATOS: Record<WidgetLauncherShape, string> = {
  Pill: 'Pílula',
  Rounded: 'Arredondado',
  Square: 'Quadrado',
}

/** O que o botao mostra: e um controle so na tela, e dois campos no registro. */
type Mostrar = 'text' | 'both' | 'icon'

/** O aviso quando a tela escolhe o icone pela pessoa: dito na hora, e nao em silencio. */
const USAMOS_O_BALAO = `Usamos o ${LAUNCHER_ICON_NAMES.Chat}; troque abaixo.`

type Change = (patch: Partial<WidgetSettingsViewModel>) => void

/** O que difere do padrao de fabrica num grupo, pelos nomes da tela. */
export function groupChanges(draft: WidgetSettingsViewModel, fields: Campos): string[] {
  return changedFromDefaults(draft, DEFAULT_WIDGET_SETTINGS, fields)
}

/**
 * O padrao de fabrica dos campos de um grupo — o "Voltar ao padrão" dele.
 *
 * O padrao nao tem icone: voltar a aparencia com o celular em "so o icone" deixaria um
 * botao so de icone sem icone, que a API recusa. O celular volta a "igual ao
 * computador" junto, a mesma regra de tirar o icone a mao.
 */
export function resetPatch(
  draft: WidgetSettingsViewModel,
  fields: Campos,
): Partial<WidgetSettingsViewModel> {
  const patch = defaultsOf(DEFAULT_WIDGET_SETTINGS, fields)
  const depois = { ...draft, ...patch }
  return depois.LauncherIcon === 'None' && depois.MobileMode === 'IconOnly'
    ? { ...patch, MobileMode: 'Same' }
    : patch
}

/** "azul", "cor padrão" ou "cor própria" — a cor do botao em palavras. */
export function describeColor(color: string | null): string {
  if (color === null) return 'cor padrão'
  return paletteColor(BUTTON_COLORS, color)?.name.toLowerCase() ?? 'cor própria'
}

/**
 * "azul · “Relatar” · balão de conversa · médio · pílula" — a aparencia de agora, numa
 * linha, na ordem em que o olho le o botao. A amostra da cor vai ao lado, na tela.
 */
export function describeAppearance(draft: WidgetSettingsViewModel): string {
  const texto = draft.LauncherIconOnly ? 'só o ícone' : `“${draft.LauncherLabel.trim()}”`
  const icone =
    draft.LauncherIcon === 'None'
      ? 'sem ícone'
      : LAUNCHER_ICON_NAMES[draft.LauncherIcon].toLowerCase()
  const formato = draft.LauncherIconOnly ? 'redondo' : FORMATOS[draft.LauncherShape].toLowerCase()
  return [
    describeColor(draft.AccentColor),
    texto,
    icone,
    TAMANHOS[draft.LauncherSize].toLowerCase(),
    formato,
  ].join(' · ')
}

/** "Embaixo, à direita · 20 px da borda" — o canto e a distancia, numa linha. */
export function describePosition(draft: WidgetSettingsViewModel): string {
  const distancia =
    draft.OffsetX === draft.OffsetY
      ? `${draft.OffsetX} px da borda`
      : `${draft.OffsetX} px na horizontal, ${draft.OffsetY} px na vertical`
  return `${CANTOS[draft.Position]} · ${distancia}`
}

export function describeMobile(draft: WidgetSettingsViewModel): string {
  return NO_CELULAR[draft.MobileMode]
}

/** "Aparece em todas as páginas", ou quais esconde — as linhas vazias nao contam. */
export function describeHiddenPages(draft: WidgetSettingsViewModel): string {
  const caminhos = draft.HiddenPaths.map((caminho) => caminho.trim()).filter(Boolean)
  if (caminhos.length === 0) return 'Aparece em todas as páginas'
  const nomes =
    caminhos.length <= 2
      ? caminhos.join(', ')
      : `${caminhos.slice(0, 2).join(', ')} e mais ${caminhos.length - 2}`
  return `Escondido em ${caminhos.length === 1 ? '1 página' : `${caminhos.length} páginas`}: ${nomes}`
}

/**
 * **"So o icone" e o icone andam juntos.** Botao so de icone sem icone nao diz o que
 * faz, e a API recusa: pedir o icone sem icone escolhe o balao — e a tela diz que
 * escolheu —, e tirar o icone tira o "so o icone" (e o "so o icone" do celular) — a
 * tela nunca fica num estado que nao se publica.
 */
function comIcone(draft: WidgetSettingsViewModel, proximo: Partial<WidgetSettingsViewModel>) {
  return draft.LauncherIcon === 'None' ? { ...proximo, LauncherIcon: 'Chat' as const } : proximo
}

function modoDeMostrar(draft: WidgetSettingsViewModel): Mostrar {
  if (draft.LauncherIcon === 'None') return 'text'
  return draft.LauncherIconOnly ? 'icon' : 'both'
}

/**
 * A aparencia, toda a vista e em pecas que desenham o resultado: o que mostrar, o
 * texto, o icone, a cor e a do texto, o tamanho, o formato e a sombra. Cada um com a
 * dica dele numa linha — o "Mais da aparência" e o "Como funciona" escondiam o que
 * explicava o controle longe dele.
 */
export function AppearanceFields({
  draft,
  change,
}: {
  draft: WidgetSettingsViewModel
  change: Change
}) {
  /**
   * O que a tela mudou junto, dito na linha da escolha, com o icone que ficou: se o
   * icone mudar por outro caminho (Voltar ao padrão, Descartar), o aviso nao vale mais.
   */
  const [aviso, setAviso] = useState<{ texto: string; icone: WidgetLauncherIcon } | null>(null)
  const mostrar = modoDeMostrar(draft)
  const soIcone = mostrar === 'icon'
  const rotulo = draft.LauncherLabel.trim() || DEFAULT_WIDGET_SETTINGS.LauncherLabel
  const iconeDoDesenho = draft.LauncherIcon === 'None' ? 'Chat' : draft.LauncherIcon

  function escolherMostrar(modo: Mostrar) {
    if (modo === 'text') {
      const voltaOCelular = draft.MobileMode === 'IconOnly'
      change({
        LauncherIcon: 'None',
        LauncherIconOnly: false,
        MobileMode: voltaOCelular ? 'Same' : draft.MobileMode,
      })
      setAviso(
        voltaOCelular
          ? { texto: 'Sem ícone, o celular volta a mostrar o texto.', icone: 'None' }
          : null,
      )
      return
    }

    change(comIcone(draft, { LauncherIconOnly: modo === 'icon' }))
    setAviso(draft.LauncherIcon === 'None' ? { texto: USAMOS_O_BALAO, icone: 'Chat' } : null)
  }

  return (
    <div className="flex flex-col gap-5">
      <Field id="so-o-icone" label="Mostrar">
        <RadioGroup<Mostrar>
          label="Mostrar"
          value={mostrar}
          onChange={escolherMostrar}
          options={[
            { value: 'text', label: 'Só o texto', drawing: <MiniButton text={rotulo} /> },
            {
              value: 'both',
              label: 'Ícone e texto',
              drawing: <MiniButton icon={iconeDoDesenho} text={rotulo} />,
            },
            { value: 'icon', label: 'Só o ícone', drawing: <MiniButton icon={iconeDoDesenho} /> },
          ]}
        />
        {aviso && aviso.icone === draft.LauncherIcon && (
          <p role="status" className="mt-2 text-detail text-fg leading-relaxed">
            {aviso.texto}
          </p>
        )}
      </Field>

      {/* Com so o icone, o texto nao aparece no botao: vira a dica e o nome dele. */}
      <TextField
        id="texto-do-botao"
        label={soIcone ? 'Dica ao passar o mouse' : 'Texto do botão'}
        value={draft.LauncherLabel}
        onChange={(LauncherLabel) => change({ LauncherLabel })}
        maxLength={WIDGET_TEXT_LIMITS.LauncherLabel}
        hint={
          soIcone
            ? 'Aparece ao passar o mouse, e é o nome do botão para quem usa leitor de tela.'
            : undefined
        }
      />

      <Field id="icone" label="Ícone">
        <RadioGroup<Exclude<WidgetLauncherIcon, 'None'>>
          label="Ícone"
          value={draft.LauncherIcon === 'None' ? null : draft.LauncherIcon}
          onChange={(LauncherIcon) => {
            change({ LauncherIcon })
            setAviso(null)
          }}
          options={LAUNCHER_ICONS.map((icone) => ({
            value: icone,
            label: LAUNCHER_ICON_NAMES[icone],
            drawing: (
              <span aria-hidden className="flex size-10 items-center justify-center text-fg">
                <LauncherIconSvg icon={icone} size={22} />
              </span>
            ),
            className: 'w-22',
          }))}
        />
        {mostrar === 'text' && <Hint>Escolher um ícone põe ele ao lado do texto.</Hint>}
      </Field>

      <ColorChoice
        id="cor-do-botao"
        label="Cor do botão"
        value={draft.AccentColor}
        onChange={(AccentColor) => change({ AccentColor })}
        colors={BUTTON_COLORS}
        automatic={{
          label: 'Padrão',
          note: 'Padrão: a cor do produto, que acompanha o tema claro ou escuro de quem usa.',
        }}
        startOther={() => readProductAccent() ?? BUTTON_COLORS[0]?.value ?? ''}
      />

      <TextColorField draft={draft} change={change} />

      {/* `#mais-opcoes` era o "Mais da aparência", que recolhia o resto: o endereco
          antigo cai aqui, no resto da aparencia, agora a vista. */}
      <div id="mais-opcoes" className="flex scroll-mt-6 flex-col gap-5">
        <Field id="tamanho" label="Tamanho">
          <RadioGroup<WidgetLauncherSize>
            label="Tamanho"
            value={draft.LauncherSize}
            onChange={(LauncherSize) => change({ LauncherSize })}
            options={(Object.keys(TAMANHOS) as WidgetLauncherSize[]).map((tamanho) => ({
              value: tamanho,
              label: TAMANHOS[tamanho],
              drawing: (
                <MiniButton
                  icon={draft.LauncherIcon === 'None' ? undefined : draft.LauncherIcon}
                  text={soIcone ? undefined : rotulo}
                  size={tamanho}
                  shape={draft.LauncherShape}
                />
              ),
            }))}
          />
        </Field>

        <Field id="formato" label="Formato">
          <RadioGroup<WidgetLauncherShape>
            label="Formato"
            value={draft.LauncherShape}
            onChange={(LauncherShape) => change({ LauncherShape })}
            options={(Object.keys(FORMATOS) as WidgetLauncherShape[]).map((formato) => ({
              value: formato,
              label: FORMATOS[formato],
              drawing: <MiniButton text={rotulo} shape={formato} />,
              disabled: soIcone,
            }))}
          />
          {soIcone && <Hint>Só o ícone é sempre redondo.</Hint>}
        </Field>

        <Field id="sombra" label="Sombra">
          <RadioGroup<'sem' | 'com'>
            label="Sombra"
            value={draft.LauncherShadow ? 'com' : 'sem'}
            onChange={(escolha) => change({ LauncherShadow: escolha === 'com' })}
            options={[
              { value: 'sem', label: 'Sem', drawing: <MiniButton text={rotulo} /> },
              { value: 'com', label: 'Com', drawing: <MiniButton text={rotulo} shadow /> },
            ]}
          />
          <Hint>A sombra descola o botão de páginas com fundo da mesma cor.</Hint>
        </Field>
      </div>
    </div>
  )
}

/**
 * A cor do texto, logo abaixo da cor do botao: as duas se leem juntas. O contraste
 * baixo e dito numa linha, com o conserto ao lado.
 */
function TextColorField({ draft, change }: { draft: WidgetSettingsViewModel; change: Change }) {
  // O contraste entre o texto escolhido e a cor do botao. O acento do produto e lido
  // no tema do painel agora: no outro tema ele muda, e o aviso e uma aproximacao.
  const fundo = draft.AccentColor ?? readProductAccent()
  const contraste =
    draft.LauncherTextColor === null ? null : contrastRatio(draft.LauncherTextColor, fundo)

  return (
    <div>
      <ColorChoice
        id="cor-do-texto"
        label="Cor do texto"
        value={draft.LauncherTextColor}
        onChange={(LauncherTextColor) => change({ LauncherTextColor })}
        colors={TEXT_COLORS}
        automatic={{
          label: 'Automática',
          note: 'Automática: a mais legível sobre a cor do botão. Vale também no botão Enviar.',
        }}
        startOther={() => readProductAccentInk() ?? TEXT_COLORS[0]?.value ?? ''}
        otherNote="Vale também no botão Enviar do formulário."
      />
      {contraste !== null && contraste < CONTRASTE_MINIMO && (
        <p
          role="status"
          className="mt-2 flex flex-wrap items-center gap-x-2 text-detail text-warn-fg"
        >
          Difícil de ler sobre esta cor ·
          <Button size="sm" variant="quiet" onClick={() => change({ LauncherTextColor: null })}>
            Usar automático
          </Button>
        </p>
      )}
    </div>
  )
}

/**
 * O botao em miniatura, nas pecas: o que cada escolha faz, desenhado. Na cor do
 * produto, e nao na do cliente — o desenho mostra a forma; a cor, a previa mostra.
 */
function MiniButton({
  icon,
  text,
  size = 'Medium',
  shape = 'Pill',
  shadow = false,
}: {
  icon?: WidgetLauncherIcon
  text?: string
  size?: WidgetLauncherSize
  shape?: WidgetLauncherShape
  shadow?: boolean
}) {
  const soIcone = !text
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center justify-center gap-1 bg-accent text-accent-fg text-caption',
        { Small: 'h-5', Medium: 'h-6', Large: 'h-7' }[size],
        soIcone
          ? cn('rounded-full', { Small: 'w-5', Medium: 'w-6', Large: 'w-7' }[size])
          : cn(
              'px-2',
              { Pill: 'rounded-full', Rounded: 'rounded-md', Square: 'rounded-none' }[shape],
            ),
        shadow && 'shadow-md',
      )}
    >
      {icon && icon !== 'None' && <LauncherIconSvg icon={icon} size={12} />}
      {text && <span className="max-w-16 truncate">{text}</span>}
    </span>
  )
}

/** De onde a seta leva no desenho da tela: para cima e para baixo, e para os lados. */
function moverCanto(de: WidgetPosition, tecla: string): WidgetPosition | undefined {
  const emCima = de === 'TopLeft' || de === 'TopRight'
  const esquerda = de === 'TopLeft' || de === 'BottomLeft'
  const canto = (cima: boolean, esq: boolean): WidgetPosition =>
    cima ? (esq ? 'TopLeft' : 'TopRight') : esq ? 'BottomLeft' : 'BottomRight'

  switch (tecla) {
    case 'ArrowUp':
      return canto(true, esquerda)
    case 'ArrowDown':
      return canto(false, esquerda)
    case 'ArrowLeft':
      return canto(emCima, true)
    case 'ArrowRight':
      return canto(emCima, false)
    default:
      return undefined
  }
}

/** Os cantos na ordem do desenho: em cima e depois embaixo, da esquerda para a direita. */
const CANTOS_NA_TELA: ReadonlyArray<{ value: WidgetPosition; lugar: string }> = [
  { value: 'TopLeft', lugar: 'self-start justify-self-start' },
  { value: 'TopRight', lugar: 'self-start justify-self-end' },
  { value: 'BottomLeft', lugar: 'self-end justify-self-start' },
  { value: 'BottomRight', lugar: 'self-end justify-self-end' },
]

/**
 * O canto e a distancia dele, juntos: os dois decidem onde o botao fica. **O canto e
 * escolhido numa tela desenhada**, e nao numa lista de frases: as setas andam pelo
 * desenho. A distancia diz de qual borda conta, pelo canto escolhido.
 */
export function PositionFields({
  draft,
  change,
}: {
  draft: WidgetSettingsViewModel
  change: Change
}) {
  const emCima = draft.Position === 'TopRight' || draft.Position === 'TopLeft'
  const esquerda = draft.Position === 'TopLeft' || draft.Position === 'BottomLeft'
  const { MinOffset, MaxOffset } = WIDGET_APPEARANCE_LIMITS

  return (
    <div>
      <Field id="canto" label="Canto">
        <RadioGroup<WidgetPosition>
          label="Canto"
          value={draft.Position}
          onChange={(Position) => change({ Position })}
          move={moverCanto}
          className="grid aspect-[16/10] w-full max-w-72 grid-cols-2 grid-rows-2 gap-0 rounded-lg border border-border bg-surface-sunken p-2"
          options={CANTOS_NA_TELA.map(({ value, lugar }) => ({
            value,
            label: CANTOS[value],
            hideLabel: true,
            drawing:
              draft.Position === value ? (
                <MiniButton text="···" size="Small" />
              ) : (
                <span
                  aria-hidden
                  className="block h-5 w-9 rounded-full border border-fg-muted border-dashed"
                />
              ),
            className: cn('min-w-0 p-1.5', lugar),
          }))}
        />
        <p className="mt-2 font-medium text-detail text-fg">{CANTOS[draft.Position]}</p>
      </Field>
      {/* A linha fica sempre: o aviso de "em cima" entra no lugar dela, sem a tela pular. */}
      <p aria-live="polite" className="min-h-[1lh] text-detail text-fg-muted leading-relaxed">
        {emCima ? 'Em cima, confira na prévia se o botão não cobre o menu do seu sistema.' : ''}
      </p>

      <Field
        id="distancia"
        label={`Distância do canto, de ${MinOffset} a ${MaxOffset} px`}
        className="mt-4"
      >
        <div className="flex flex-col gap-3">
          <Distance
            label={esquerda ? 'Da borda esquerda' : 'Da borda direita'}
            value={draft.OffsetX}
            onChange={(OffsetX) => change({ OffsetX })}
          />
          <Distance
            label={emCima ? 'Da borda de cima' : 'Da borda de baixo'}
            value={draft.OffsetY}
            onChange={(OffsetY) => change({ OffsetY })}
          />
        </div>
        <Hint>Afaste o botão quando ele cobrir algo do seu sistema.</Hint>
      </Field>
    </div>
  )
}

/**
 * Como o botao aparece em tela pequena, em celulares desenhados. **A consequencia de
 * cada escolha fica escrita**: escondido, ninguem relata pelo celular; e "igual ao
 * computador" diz quando o computador ja e so o icone. O nome do grupo nao se repete:
 * o titulo dele ja diz "No celular".
 */
export function MobileFields({
  draft,
  change,
}: {
  draft: WidgetSettingsViewModel
  change: Change
}) {
  const [aviso, setAviso] = useState<string | null>(null)
  const jaSoIcone = draft.LauncherIconOnly && draft.LauncherIcon !== 'None'

  return (
    <div id="no-celular" className="scroll-mt-6">
      <RadioGroup<WidgetMobileMode>
        label="No celular"
        value={draft.MobileMode}
        onChange={(MobileMode) => {
          if (MobileMode === 'IconOnly') {
            change(comIcone(draft, { MobileMode }))
            setAviso(
              draft.LauncherIcon === 'None'
                ? `Usamos o ${LAUNCHER_ICON_NAMES.Chat}; troque em Aparência.`
                : null,
            )
            return
          }
          change({ MobileMode })
          setAviso(null)
        }}
        options={[
          {
            value: 'Same',
            label: NO_CELULAR.Same,
            note: jaSoIcone ? '(já é só o ícone)' : undefined,
            drawing: <MiniPhone mode={jaSoIcone ? 'icon' : 'text'} />,
          },
          { value: 'IconOnly', label: NO_CELULAR.IconOnly, drawing: <MiniPhone mode="icon" /> },
          { value: 'Hidden', label: NO_CELULAR.Hidden, drawing: <MiniPhone mode="none" /> },
        ]}
      />
      {draft.MobileMode === 'Hidden' && (
        <p className="mt-2 text-detail text-warn-fg">No celular, ninguém consegue relatar.</p>
      )}
      {/* So enquanto vale: o celular ainda e so o icone, com o balao que a tela escolheu. */}
      {aviso && draft.MobileMode === 'IconOnly' && draft.LauncherIcon === 'Chat' && (
        <p role="status" className="mt-2 text-detail text-fg">
          {aviso}
        </p>
      )}
      <Hint>Vale para telas com menos de {NARROW_VIEWPORT} px de largura.</Hint>
    </div>
  )
}

/** Um celular em miniatura, com o botao no canto — ou sem ele. */
function MiniPhone({ mode }: { mode: 'text' | 'icon' | 'none' }) {
  return (
    <span
      aria-hidden
      className="relative block h-14 w-8 rounded-md border-2 border-fg-muted bg-surface-sunken"
    >
      {mode === 'text' && (
        <span className="absolute right-0.5 bottom-0.5 h-2 w-4 rounded-full bg-accent" />
      )}
      {mode === 'icon' && (
        <span className="absolute right-0.5 bottom-0.5 size-2.5 rounded-full bg-accent" />
      )}
    </span>
  )
}

/** As paginas onde o botao nao aparece — o editor da lista, com a ancora da busca. */
export function HiddenPagesFields({
  draft,
  change,
}: {
  draft: WidgetSettingsViewModel
  change: Change
}) {
  return (
    <Field id="paginas-escondidas" label="Páginas onde o botão não aparece">
      <HiddenPagesEditor
        value={draft.HiddenPaths}
        onChange={(HiddenPaths) => change({ HiddenPaths })}
      />
    </Field>
  )
}

/**
 * A distancia de um eixo: o deslizante e o numero ao lado, os dois no mesmo valor.
 * **Fora do intervalo, o numero para no limite e diz qual e** — cortar em silencio
 * fazia parecer que o campo nao obedecia.
 */
function Distance({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  const { MinOffset, MaxOffset } = WIDGET_APPEARANCE_LIMITS
  const [limite, setLimite] = useState<string | null>(null)
  const id = useId()

  function aplicar(numero: number) {
    if (numero > MaxOffset) {
      onChange(MaxOffset)
      setLimite(`O máximo é ${MaxOffset} px.`)
      return
    }
    if (numero < MinOffset) {
      onChange(MinOffset)
      setLimite(`O mínimo é ${MinOffset} px.`)
      return
    }
    onChange(numero)
    setLimite(null)
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-detail text-fg">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          id={id}
          type="range"
          min={MinOffset}
          max={MaxOffset}
          step={1}
          value={value}
          onChange={(event) => aplicar(Number(event.target.value))}
          className="min-w-32 flex-1 accent-accent"
        />
        <span className="flex items-center gap-1.5 text-detail text-fg-muted">
          <NumberField
            size="sm"
            width="w-11"
            inputMode="numeric"
            ariaLabel={`${label}, em pixels`}
            min={MinOffset}
            max={MaxOffset}
            step={1}
            value={value}
            onChange={(texto) => {
              // O campo apagado vale zero: a distancia nunca fica sem numero, e a gravacao
              // nunca recebe um que a API recusaria.
              const numero = Number.parseFloat(texto)
              aplicar(Number.isFinite(numero) ? Math.round(numero) : MinOffset)
            }}
          />
          px
        </span>
        {limite && (
          <span role="status" className="text-detail text-warn-fg">
            {limite}
          </span>
        )}
      </div>
    </div>
  )
}
