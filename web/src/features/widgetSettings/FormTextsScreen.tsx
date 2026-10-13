import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ReportTitleMode, WidgetSettingsViewModel, WidgetTheme } from '@/contracts'
import { WIDGET_TEXT_LIMITS } from '@/contracts'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { Button } from '@/shared/components/Button'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { PreviewSection } from '@/shared/components/PreviewSection'
import { Select } from '@/shared/components/Select'
import { Check, Field, Hint, RadioGroup } from '@/shared/components/SettingsControls'
import { SettingsGroup } from '@/shared/components/SettingsGroup'
import { SettingsHeader } from '@/shared/components/SettingsHeader'
import { Skeleton } from '@/shared/components/Skeleton'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'
import type { PreviewHighlight } from '@/shared/components/WidgetPreview'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { useIdentitySettingsDraft, useWidgetSettingsDraft } from '@/shared/hooks/useSettingsDraft'
import { cn } from '@/shared/lib/cn'
import { changedFromDefaults, defaultsOf } from '@/shared/lib/factoryDefaults'

type Campos = ReadonlyArray<readonly [keyof WidgetSettingsViewModel, string]>

/**
 * Os grupos da tela, **na ordem em que o formulario os mostra**, cada campo com o nome
 * do "Mudou". Cada campo mora num grupo so: e com esta lista que o grupo diz o que mudou
 * e que o "Voltar ao padrão" dele sabe o que trocar. O "perguntar o nome" nao esta aqui:
 * ele e de Quem relata (`CAMPOS_DE_QUEM_RELATA`), e o grupo do nome o soma a mao.
 */
const GRUPOS = {
  top: [
    ['Title', 'Título'],
    ['Theme', 'Tema'],
  ],
  type: [
    ['ShowsTypeField', 'Deixar escolher'],
    ['TypeFieldLabel', 'Nome do seletor'],
    ['DefaultReportType', 'Tipo marcado'],
  ],
  title: [
    ['ReportTitleMode', 'O título é'],
    ['ReportTitleQuestion', 'Texto da pergunta'],
    ['ReportTitlePlaceholder', 'Exemplo'],
  ],
  box: [['MoreDetailsLabel', 'Nome da caixa']],
  name: [['NameQuestion', 'Texto da pergunta']],
  submit: [['SubmitLabel', 'Texto do botão']],
} as const satisfies Record<string, Campos>

type Grupo = keyof typeof GRUPOS

/**
 * O que esta tela grava na configuracao da ferramenta: os campos de todos os grupos. O
 * registro vai inteiro, com so estes mudados (`useWidgetSettingsDraft`).
 */
const CAMPOS_DA_FERRAMENTA = Object.values(GRUPOS).flatMap((campos) =>
  campos.map(([campo]) => campo),
) satisfies ReadonlyArray<keyof WidgetSettingsViewModel>

/** E o que ela grava em Quem relata: so o interruptor da pergunta do nome. */
const CAMPOS_DE_QUEM_RELATA = ['AsksForName'] as const

/** O nome do acordeao desta tela: abrir um grupo fecha o outro. Ver `SettingsGroup`. */
const ACORDEAO = 'formulario'

/** A parte do formulario que a previa contorna, por grupo. */
const PARTE_NA_PREVIA: Record<Grupo, PreviewHighlight> = {
  top: 'form-top',
  type: 'form-type',
  title: 'form-title',
  box: 'form-box',
  name: 'form-name',
  submit: 'form-submit',
}

const TEMAS: Record<WidgetTheme, string> = {
  Auto: 'Automático',
  Light: 'Claro',
  Dark: 'Escuro',
}

/** O que acontece com o titulo do relato: o nome fala do titulo, e nao da pergunta. */
const MODOS: Record<ReportTitleMode, string> = {
  Optional: 'Opcional',
  Required: 'Obrigatório',
  Hidden: 'Escondido',
}

type Change = (patch: Partial<WidgetSettingsViewModel>) => void

/**
 * Formulário: **o que o formulario diz e pergunta para todo tipo de relato, e como ele
 * e** — parte por parte, na ordem em que quem relata ve: o topo (titulo e tema), o tipo,
 * o titulo do relato, a caixa depois das perguntas, o nome de quem relata e o enviar. O
 * que cada tipo pergunta fica em Tipos de relato, logo ao lado.
 *
 * **A ordem e a do formulario, e nao a de quanto se mexe**: quem olha para a previa e
 * quer mudar o que esta vendo acha o grupo no mesmo lugar. O "Mais opções" de antes
 * separava o modo do titulo do texto dele, e o nome do seletor do proprio seletor.
 *
 * **Cada grupo, fechado, diz o que esta escolhido e o que mudou**, com o proprio "Voltar
 * ao padrão" (`SettingsGroup`), e **a previa, presa a direita, contorna a parte do grupo
 * aberto ou em foco** (`EditorWithPreview`, `PreviewHighlight`). Ela ja abre com o
 * formulario aberto: e ele que se muda aqui, e nao o botao.
 *
 * **Duas configuracoes, um Publicar.** Os textos sao da ferramenta, e "perguntar o nome"
 * e de Quem relata — a API guarda em lugares diferentes, mas quem configura ve uma
 * pergunta so. Cada uma grava o registro inteiro dela com so os campos desta tela
 * mudados (`useSettingsDraft`), e o Publicar do titulo salva as duas, com a conta das
 * duas somada. O "Voltar ao padrão" do grupo do nome mexe nos dois rascunhos.
 *
 * **O tipo pre-marcado muda de nome** quando o seletor esta escondido: ai ele deixa de
 * ser o que vem marcado e passa a ser o unico que vai existir.
 */
export function FormTextsScreen() {
  const project = useCurrentProject()
  const ferramenta = useWidgetSettingsDraft(project.PublicId, CAMPOS_DA_FERRAMENTA)
  const quemRelata = useIdentitySettingsDraft(project.PublicId, CAMPOS_DE_QUEM_RELATA)

  const draft = ferramenta.draft
  const nome = quemRelata.draft
  const dirty = ferramenta.dirty || quemRelata.dirty
  const saving = ferramenta.saving || quemRelata.saving

  /** O grupo aberto e o grupo em que a pessoa esta: o segundo vence, na previa. */
  const [aberto, setAberto] = useState<Grupo | null>(null)
  const [emFoco, setEmFoco] = useState<Grupo | null>(null)
  const grupoRealcado = emFoco ?? aberto
  const realce = grupoRealcado ? PARTE_NA_PREVIA[grupoRealcado] : null

  // Um objeto novo so quando o rascunho muda: passar o mouse nos grupos troca o realce,
  // e nao deve mandar a configuracao inteira ao quadro de novo por nada.
  const naPrevia = useMemo(
    () => (draft && nome ? { ...draft, AsksForName: nome.AsksForName } : null),
    [draft, nome],
  )

  async function salvar() {
    // Uma de cada vez: se a primeira falhar, a segunda nao vai, e o aviso de erro e um so.
    if (ferramenta.dirty && !(await ferramenta.save())) return
    if (quemRelata.dirty && !(await quemRelata.save())) return
    toast.done('Publicado. Quem abrir o formulário agora já vê assim.')
  }

  /** Liga o grupo a previa: aberto e em foco realcam a parte dele. */
  function acompanhar(grupo: Grupo) {
    return {
      onToggle: (abriu: boolean) =>
        setAberto((atual) => (abriu ? grupo : atual === grupo ? null : atual)),
      onFocusWithin: (dentro: boolean) =>
        setEmFoco((atual) => (dentro ? grupo : atual === grupo ? null : atual)),
    }
  }

  const falhou = ferramenta.failed || quemRelata.failed

  return (
    <div className="max-w-6xl">
      <SettingsHeader
        title="Formulário"
        description={
          <>
            O que o formulário diz e pergunta para todo tipo de relato, parte por parte, na ordem em
            que aparece. As perguntas de cada tipo ficam em{' '}
            <Link to="../report-types" className="text-fg underline underline-offset-4">
              Tipos de relato
            </Link>
            .
          </>
        }
        ready={draft !== null && nome !== null}
        dirty={dirty}
        changeCount={ferramenta.changeCount + quemRelata.changeCount}
        saving={saving}
        onSave={() => void salvar()}
        onDiscard={() => {
          ferramenta.discard()
          quemRelata.discard()
        }}
        publishes
      />

      {falhou && (
        <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
            Não deu para carregar o formulário agora. O seu sistema não foi afetado: ele continua
            com o que já estava publicado.
          </p>
          <Button
            onClick={() => {
              if (ferramenta.failed) ferramenta.reload()
              if (quemRelata.failed) quemRelata.reload()
            }}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {!falhou && (!draft || !nome) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      )}

      {draft && nome && naPrevia && (
        <EditorWithPreview
          preview={
            <PreviewSection
              id="previa"
              settings={naPrevia}
              dirty={dirty}
              startOpen
              highlight={realce}
              hint="O formulário com estes textos, este tema e os tipos de relato de agora. A parte que você está mudando aparece contornada."
            />
          }
        >
          <SettingsGroup
            name={ACORDEAO}
            id="topo-do-formulario"
            title="Topo"
            value={`${TEMAS[draft.Theme]} · “${draft.Title.trim()}”`}
            changes={changedFromDefaults(draft, DEFAULT_WIDGET_SETTINGS, GRUPOS.top)}
            onReset={() => ferramenta.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, GRUPOS.top))}
            defaultOpen
            {...acompanhar('top')}
          >
            <TopFields draft={draft} change={ferramenta.change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="tipo-do-relato"
            title="Tipo"
            value={describeType(draft)}
            changes={changedFromDefaults(draft, DEFAULT_WIDGET_SETTINGS, GRUPOS.type)}
            onReset={() => ferramenta.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, GRUPOS.type))}
            {...acompanhar('type')}
          >
            <TypeFields draft={draft} change={ferramenta.change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="titulo-do-relato"
            title="Título do relato"
            value={describeTitle(draft)}
            changes={changedFromDefaults(draft, DEFAULT_WIDGET_SETTINGS, GRUPOS.title)}
            onReset={() => ferramenta.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, GRUPOS.title))}
            {...acompanhar('title')}
          >
            <TitleFields draft={draft} change={ferramenta.change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="caixa-depois-das-perguntas"
            title="Caixa depois das perguntas"
            value={`“${draft.MoreDetailsLabel.trim()}”`}
            changes={changedFromDefaults(draft, DEFAULT_WIDGET_SETTINGS, GRUPOS.box)}
            onReset={() => ferramenta.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, GRUPOS.box))}
            {...acompanhar('box')}
          >
            <BoxFields draft={draft} change={ferramenta.change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="nome-de-quem-relata"
            title="Nome de quem relata"
            value={nome.AsksForName ? `Pergunta: “${draft.NameQuestion.trim()}”` : 'Não pergunta'}
            changes={[
              ...(nome.AsksForName !== DEFAULT_WIDGET_SETTINGS.AsksForName
                ? ['Perguntar o nome']
                : []),
              ...changedFromDefaults(draft, DEFAULT_WIDGET_SETTINGS, GRUPOS.name),
            ]}
            onReset={() => {
              // Cada campo no rascunho dele: o interruptor e de Quem relata, o texto e da
              // ferramenta.
              quemRelata.change({ AsksForName: DEFAULT_WIDGET_SETTINGS.AsksForName })
              ferramenta.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, GRUPOS.name))
            }}
            {...acompanhar('name')}
          >
            <Check
              id="perguntar-nome"
              checked={nome.AsksForName}
              onChange={(AsksForName) => quemRelata.change({ AsksForName })}
              label="Perguntar o nome de quem relata"
            />
            <Hint>
              Sempre opcional para a pessoa. O nome fica com o time e só aparece para fora se o
              projeto publicar identificado e ela quiser assinar.
            </Hint>
            {/* O texto fica mesmo sem a pergunta, so desligado: a busca leva ate ele, e o
                texto salvo volta a valer quando ela voltar. */}
            <TextField
              id="pergunta-do-nome"
              label="Texto da pergunta do nome"
              className="mt-4"
              value={draft.NameQuestion}
              onChange={(NameQuestion) => ferramenta.change({ NameQuestion })}
              maxLength={WIDGET_TEXT_LIMITS.NameQuestion}
              disabled={!nome.AsksForName}
            />
            <Hint>Em cima do campo do nome, perto do fim do formulário.</Hint>
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="enviar-o-relato"
            title="Enviar"
            value={`“${draft.SubmitLabel.trim()}”`}
            changes={changedFromDefaults(draft, DEFAULT_WIDGET_SETTINGS, GRUPOS.submit)}
            onReset={() => ferramenta.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, GRUPOS.submit))}
            {...acompanhar('submit')}
          >
            <TextField
              id="botao-enviar"
              label="Texto do botão de enviar"
              value={draft.SubmitLabel}
              onChange={(SubmitLabel) => ferramenta.change({ SubmitLabel })}
              maxLength={WIDGET_TEXT_LIMITS.SubmitLabel}
            />
            <Hint>
              O botão no fim do formulário. A cor dele é a do botão, em{' '}
              <Link to="../tool" className="text-fg underline underline-offset-4">
                O botão
              </Link>
              .
            </Hint>
          </SettingsGroup>
        </EditorWithPreview>
      )}
    </div>
  )
}

/** "A pessoa escolhe · marcado: Defeito", ou o tipo unico quando o seletor some. */
function describeType(draft: WidgetSettingsViewModel): string {
  const marcado =
    draft.Types.find((tipo) => tipo.PublicId === draft.DefaultReportType) ?? draft.Types[0]
  if (draft.ShowsTypeField) {
    return marcado ? `A pessoa escolhe · marcado: ${marcado.Name}` : 'A pessoa escolhe'
  }
  return marcado ? `Sem seletor · tudo entra como ${marcado.Name}` : 'Sem seletor'
}

/** "Opcional · “Em poucas palavras…”", ou so "Escondido", que nao tem pergunta. */
function describeTitle(draft: WidgetSettingsViewModel): string {
  if (draft.ReportTitleMode === 'Hidden') return MODOS.Hidden
  return `${MODOS[draft.ReportTitleMode]} · “${draft.ReportTitleQuestion.trim()}”`
}

/** O topo: o titulo grande e o tema claro ou escuro. */
function TopFields({ draft, change }: { draft: WidgetSettingsViewModel; change: Change }) {
  return (
    <div className="flex flex-col gap-5">
      {/* `#textos` era a secao do titulo e do enviar: o endereco antigo cai no titulo,
          que e o comeco dela. */}
      <div id="textos" className="scroll-mt-6">
        <TextField
          id="titulo-do-formulario"
          label="Título do formulário"
          value={draft.Title}
          onChange={(Title) => change({ Title })}
          maxLength={WIDGET_TEXT_LIMITS.Title}
        />
        <Hint>O texto grande no alto do formulário, acima de tudo.</Hint>
      </div>

      {/* `#aparencia-do-formulario` era a secao do tema: o endereco antigo cai aqui. */}
      <div id="aparencia-do-formulario" className="scroll-mt-6">
        <Field id="tema" label="Tema do formulário">
          <RadioGroup<WidgetTheme>
            label="Tema do formulário"
            value={draft.Theme}
            onChange={(Theme) => change({ Theme })}
            options={(Object.keys(TEMAS) as WidgetTheme[]).map((tema) => ({
              value: tema,
              label: TEMAS[tema],
              drawing: <MiniFormulario tema={tema} />,
            }))}
          />
        </Field>
        <Hint>
          {draft.Theme === 'Auto'
            ? 'Segue o claro ou escuro do aparelho de quem relata.'
            : 'Fica assim para todo mundo, qualquer que seja o aparelho.'}
        </Hint>
      </div>
    </div>
  )
}

/** O tipo: se a pessoa escolhe, o nome do seletor e qual vem marcado. */
function TypeFields({ draft, change }: { draft: WidgetSettingsViewModel; change: Change }) {
  return (
    <div className="flex flex-col gap-4">
      <Check
        id="escolher-tipo"
        checked={draft.ShowsTypeField}
        onChange={(ShowsTypeField) => change({ ShowsTypeField })}
        label="Deixar a pessoa escolher o tipo do relato"
      />

      {/* O nome fica mesmo com o seletor escondido, so desligado: a busca leva ate ele,
          e o texto salvo volta a valer quando o seletor voltar. */}
      <div>
        <TextField
          id="nome-do-seletor-de-tipo"
          label="Nome do seletor de tipo"
          value={draft.TypeFieldLabel}
          onChange={(TypeFieldLabel) => change({ TypeFieldLabel })}
          maxLength={WIDGET_TEXT_LIMITS.TypeFieldLabel}
          disabled={!draft.ShowsTypeField}
        />
        <Hint>Em cima dos botões dos tipos, logo abaixo do título do formulário.</Hint>
      </div>

      {draft.Types.length > 0 && (
        <div>
          <Select
            id="tipo-pre-marcado"
            label={draft.ShowsTypeField ? 'Tipo pré-marcado' : 'Tipo de todos os relatos'}
            className="max-w-80"
            value={draft.DefaultReportType ?? ''}
            onChange={(valor) => change({ DefaultReportType: valor || null })}
            options={[
              // "O primeiro da lista" e uma escolha de verdade, e nao a falta de uma:
              // grava nulo, e o pre-marcado acompanha a ordem de Tipos de relato.
              {
                value: '',
                label: `O primeiro da lista (hoje: ${draft.Types[0]?.Name ?? ''})`,
              },
              ...draft.Types.map((tipo) => ({ value: tipo.PublicId, label: tipo.Name })),
            ]}
          />
          <Hint>
            {draft.ShowsTypeField
              ? 'O tipo que já vem marcado quando o formulário abre.'
              : 'Com o seletor escondido, tudo que chegar entra com este tipo.'}
          </Hint>
        </div>
      )}
    </div>
  )
}

/** O titulo do relato: se o formulario pergunta, o texto da pergunta e o exemplo. */
function TitleFields({ draft, change }: { draft: WidgetSettingsViewModel; change: Change }) {
  const escondido = draft.ReportTitleMode === 'Hidden'

  return (
    <div className="flex flex-col gap-4">
      {/* `#mais-opcoes` era o "Mais opções", que comecava pelo modo do titulo: o
          endereco antigo cai aqui. */}
      <div id="mais-opcoes" className="scroll-mt-6">
        <Field id="modo-do-titulo" label="O título do relato é">
          <RadioGroup<ReportTitleMode>
            label="O título do relato é"
            value={draft.ReportTitleMode}
            onChange={(ReportTitleMode) => change({ ReportTitleMode })}
            options={(Object.keys(MODOS) as ReportTitleMode[]).map((modo) => ({
              value: modo,
              label: MODOS[modo],
              drawing: <MiniCampo modo={modo} />,
            }))}
          />
        </Field>
        <Hint>{tituloPorModo(draft.ReportTitleMode)}</Hint>
      </div>

      {/* Os textos ficam mesmo com a pergunta escondida, so desligados: a busca leva ate
          eles, e o texto salvo volta a valer quando ela voltar. */}
      <div>
        <TextField
          id="texto-pergunta-titulo"
          label="Texto da pergunta do título"
          value={draft.ReportTitleQuestion}
          onChange={(ReportTitleQuestion) => change({ ReportTitleQuestion })}
          maxLength={WIDGET_TEXT_LIMITS.ReportTitleQuestion}
          disabled={escondido}
        />
        <Hint>Em cima do campo do título, logo depois dos tipos.</Hint>
      </div>
      <div>
        <TextField
          id="exemplo-do-titulo"
          label="Exemplo dentro da pergunta do título"
          value={draft.ReportTitlePlaceholder}
          onChange={(ReportTitlePlaceholder) => change({ ReportTitlePlaceholder })}
          maxLength={WIDGET_TEXT_LIMITS.ReportTitlePlaceholder}
          disabled={escondido}
        />
        <Hint>Em cinza dentro do campo, até a pessoa começar a escrever.</Hint>
      </div>
    </div>
  )
}

/**
 * A caixa depois das perguntas: o nome dela. **A dica diz em que tipos ele aparece**,
 * pelos tipos de agora — so no tipo com perguntas e a caixa juntos; no tipo so com a
 * caixa, o texto cinza dentro dela ja e a pergunta, e nome nenhum aparece.
 */
function BoxFields({ draft, change }: { draft: WidgetSettingsViewModel; change: Change }) {
  const comNome = draft.Types.filter((tipo) => tipo.Questions.length > 0 && tipo.ShowsTextBox)

  return (
    <div>
      <TextField
        id="nome-da-caixa"
        label="Nome da caixa depois das perguntas"
        value={draft.MoreDetailsLabel}
        onChange={(MoreDetailsLabel) => change({ MoreDetailsLabel })}
        maxLength={WIDGET_TEXT_LIMITS.MoreDetailsLabel}
      />
      <Hint>
        Em cima da caixa de texto livre, só nos tipos que têm perguntas e também a caixa.{' '}
        {comNome.length > 0 ? (
          `Hoje aparece em: ${comNome.map((tipo) => tipo.Name).join(', ')}.`
        ) : (
          <>
            Hoje nenhum tipo tem os dois, e o nome não aparece. Para usar, ligue a caixa num tipo
            com perguntas, em{' '}
            <Link to="../report-types" className="text-fg underline underline-offset-4">
              Tipos de relato
            </Link>
            .
          </>
        )}
      </Hint>
    </div>
  )
}

/**
 * O que cada modo do titulo faz, dito para quem escolhe. A resposta vira o titulo do
 * card: o time pode reescrever, e quem relatou continua vendo o que escreveu.
 */
function tituloPorModo(modo: ReportTitleMode): string {
  switch (modo) {
    case 'Optional':
      return 'Quem não responder envia assim mesmo. A resposta vira o título do card.'
    case 'Required':
      return 'Ninguém envia sem responder. O card fica fácil de reconhecer, mas a pergunta a mais pode fazer alguém desistir.'
    case 'Hidden':
      return 'O formulário não pergunta. O card mostra o começo do texto no lugar do título.'
  }
}

/**
 * Um formulario em miniatura, claro, escuro ou os dois (o automatico). **As cores sao o
 * par fixo de `tokens.css`** (`--widget-ink-on-light` e `--widget-ink-on-dark`), e nao a
 * superficie do painel: o desenho do "Escuro" tem de ser escuro no painel claro e no
 * escuro — com a superficie do tema, no painel escuro os dois desenhos se inverteriam.
 */
function MiniFormulario({ tema }: { tema: WidgetTheme }) {
  return (
    <span aria-hidden className="flex h-12 w-16 overflow-hidden rounded-md border border-border">
      {tema !== 'Dark' && <Folha escura={false} />}
      {tema !== 'Light' && <Folha escura />}
    </span>
  )
}

/** Uma folha do formulario: o titulo, um campo e o enviar, na cor do tema dela. */
function Folha({ escura }: { escura: boolean }) {
  const tinta = escura ? 'bg-[var(--widget-ink-on-dark)]' : 'bg-[var(--widget-ink-on-light)]'
  return (
    <span
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-1 p-1.5',
        escura ? 'bg-[var(--widget-ink-on-light)]' : 'bg-[var(--widget-ink-on-dark)]',
      )}
    >
      <span className={cn('h-1 w-3/4 rounded-full opacity-80', tinta)} />
      <span className={cn('h-3 w-full rounded-sm opacity-20', tinta)} />
      <span className="mt-auto h-1.5 w-full rounded-sm bg-accent" />
    </span>
  )
}

/**
 * O campo do titulo em miniatura: com o "(opcional)" apagado ao lado do nome, com o
 * asterisco do obrigatorio, ou so o contorno tracejado de um campo que nao aparece.
 */
function MiniCampo({ modo }: { modo: ReportTitleMode }) {
  const escondido = modo === 'Hidden'
  return (
    <span aria-hidden className="flex h-12 w-16 flex-col justify-center gap-1">
      <span className="flex items-center gap-1">
        <span
          className={cn('h-1 w-8 rounded-full', escondido ? 'bg-surface-strong' : 'bg-fg-muted')}
        />
        {modo === 'Optional' && <span className="h-1 w-4 rounded-full bg-surface-strong" />}
        {modo === 'Required' && (
          <span className="font-semibold text-caption text-fg leading-none">*</span>
        )}
      </span>
      <span
        className={cn(
          'h-4 w-full rounded-sm border',
          escondido ? 'border-dashed border-fg-disabled' : 'border-fg-muted bg-surface-raised',
        )}
      />
    </span>
  )
}
