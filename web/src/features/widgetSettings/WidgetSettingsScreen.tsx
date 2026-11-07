import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { WidgetSettingsViewModel } from '@/contracts'
import {
  AnimationFields,
  AppearanceFields,
  BUTTON_FIELDS,
  BUTTON_GROUPS,
  describeAnimation,
  describeAppearance,
  describeHiddenPages,
  describeMobile,
  describePosition,
  groupChanges,
  HiddenPagesFields,
  MobileFields,
  PositionFields,
  resetPatch,
} from '@/features/widgetSettings/AppearanceSection'
import { VisibilityPill } from '@/features/widgetSettings/ButtonGroup'
import { ColorSwatch } from '@/features/widgetSettings/ColorChoice'
import { Button } from '@/shared/components/Button'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { MovedAnchors } from '@/shared/components/MovedAnchors'
import { PreviewSection } from '@/shared/components/PreviewSection'
import { SettingsGroup } from '@/shared/components/SettingsGroup'
import { SettingsHeader } from '@/shared/components/SettingsHeader'
import { Skeleton } from '@/shared/components/Skeleton'
import type { PreviewDevice, PreviewHighlight } from '@/shared/components/WidgetPreview'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { useScriptInstalled } from '@/shared/hooks/useScriptInstalled'
import { useWidgetSettingsDraft } from '@/shared/hooks/useSettingsDraft'
import { cn } from '@/shared/lib/cn'
import { guideTarget, useScreenGuide } from '@/shared/tour/guideStore'

/**
 * Os campos que moravam aqui e mudaram de tela pelo assunto: os textos, as perguntas e
 * o tema do formulario para Formulário, e o que a pessoa le depois de enviar para Quem
 * relata, junto de quem pode ver. O endereco antigo leva ao lugar novo.
 */
const MUDARAM_DE_TELA: Record<string, string> = {
  tema: 'form-texts',
  textos: 'form-texts',
  'titulo-do-formulario': 'form-texts',
  'botao-enviar': 'form-texts',
  'texto-pergunta-titulo': 'form-texts',
  'exemplo-do-titulo': 'form-texts',
  'nome-do-seletor-de-tipo': 'form-texts',
  'nome-da-caixa': 'form-texts',
  'pergunta-do-nome': 'form-texts',
  'escolher-tipo': 'form-texts',
  'tipo-pre-marcado': 'form-texts',
  'modo-do-titulo': 'form-texts',
  confirmacao: 'identity',
  'topo-do-acompanhamento': 'identity',
  'aviso-publico': 'identity',
}

/**
 * O botão: **o botao, e so ele** — se aparece, como e, onde fica.
 *
 * **Um editor de duas colunas a partir de `lg`**: a esquerda, os assuntos num acordeao
 * (Aparência, Posição, Animação, No celular, Páginas escondidas), cada titulo com uma amostra do
 * que esta escolhido e o que mudou do padrao; a direita, a previa presa ao rolar. A
 * previa no meio da coluna fazia quem mexia na distancia ou no celular rolar para cima
 * e para baixo a cada mudanca. Abaixo de `lg`, uma coluna, com a previa no topo.
 *
 * **Os controles vem antes da previa no codigo**, e a previa so e desenhada no topo
 * (`order-first`): quem anda pelo Tab chega aos controles primeiro, e nao atravessa o
 * quadro da previa para comecar.
 *
 * **O liga e desliga e uma pilula no cabecalho**: o estado do botao no seu sistema e a
 * primeira coisa que a tela diz.
 *
 * **A previa e a ferramenta de verdade**: abre com o que esta publicado, muda com cada
 * escolha ainda nao publicada, e **sempre em Computador**; Celular e a pessoa que escolhe,
 * nas abas dela. Abrir "No celular" ja trocava a previa sozinho, e a pessoa via o aparelho
 * mudar sem ter pedido; agora o grupo diz onde ver. **Ela realca o
 * assunto em foco**: as guias da distancia com a Posição aberta, o contorno do botao
 * com a Aparência aberta.
 *
 * **Grava o registro inteiro com so os campos desta tela mudados** (`useSettingsDraft`):
 * os textos salvos em outra tela nao voltam ao que estavam quando esta abriu.
 */
export function WidgetSettingsScreen() {
  const project = useCurrentProject()
  const sistemaManda = useScriptInstalled(project)
  const { draft, change, loading, failed, reload, saving, dirty, changeCount, save, discard } =
    useWidgetSettingsDraft(
      project.PublicId,
      BUTTON_FIELDS,
      'Publicado. Quem abrir o seu sistema agora já vê assim.',
    )

  // Sempre em Computador ao abrir; a pessoa troca nas abas da previa.
  const [aparelho, setAparelho] = useState<PreviewDevice>('computer')
  const [posicaoAberta, setPosicaoAberta] = useState(false)
  /** A Aparência abre aberta (`defaultOpen`): e o contorno do botao que a previa mostra. */
  const [aparenciaAberta, setAparenciaAberta] = useState(true)

  const realce: PreviewHighlight | null = posicaoAberta
    ? 'distance'
    : aparenciaAberta
      ? 'button'
      : null

  // O guia desta tela, depois que a configuracao chega.
  useScreenGuide(
    'botao',
    draft
      ? [
          {
            alvo: 'estado',
            titulo: 'Ligado ou desligado',
            texto: 'Ligue ou desligue o botão no seu sistema sem mexer no código.',
          },
          {
            alvo: 'manter',
            titulo: 'Botão de fábrica',
            texto: 'Se o botão de fábrica já serve, publique ele como está.',
          },
          {
            alvo: 'opcoes',
            titulo: 'Como ele é',
            texto: 'Cor, texto, posição, animação e celular, cada grupo com o que muda no botão.',
          },
          {
            alvo: 'previa',
            titulo: 'A prévia',
            texto: 'Veja o botão como fica no seu sistema, no computador ou no celular.',
          },
          {
            alvo: 'salvar',
            titulo: 'Publicar',
            texto: 'Nada muda no seu sistema até você publicar, e dá para descartar.',
          },
          {
            alvo: 'guia',
            titulo: 'Guia por tela',
            texto: 'Cada tela tem o seu guia, sempre neste botão, com o nome dela.',
          },
        ]
      : null,
  )

  return (
    <div className="max-w-6xl">
      <MovedAnchors moved={MUDARAM_DE_TELA} />

      {/* O publicar mora no titulo, preso no topo ao rolar; sair com o que nao foi
          publicado pergunta antes. */}
      <SettingsHeader
        title="O botão"
        description="O botão que abre o formulário de relato no seu sistema: se aparece, como é e onde fica."
        status={
          draft && (
            <VisibilityPill
              id="mostrar-no-site"
              enabled={draft.IsEnabled}
              waitingScript={sistemaManda === false}
              onChange={(IsEnabled) => change({ IsEnabled })}
            />
          )
        }
        ready={draft !== null}
        dirty={dirty}
        changeCount={changeCount}
        saving={saving}
        onSave={() => void save()}
        onDiscard={discard}
        publishes
      />

      {failed && (
        <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
            Não deu para carregar a configuração agora. O botão no seu sistema não foi afetado: ele
            continua com o que já estava publicado.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && <LoadingForm />}

      {draft && (
        <>
          {/* Quem gostou do botao de fabrica tambem decide: publicar como esta marca o
              passo dos primeiros passos, que antes so contava quando algo mudava. */}
          {!draft.Published && !dirty && (
            <div
              className="mb-4 flex animate-fade-in flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5"
              {...guideTarget('manter')}
            >
              <p className="text-detail text-fg-muted">
                Se o botão de fábrica já serve, é só mantê-lo como está.
              </p>
              <Button size="sm" disabled={saving} onClick={() => void save()}>
                Manter este botão
              </Button>
            </div>
          )}

          {!draft.IsEnabled && (
            <p className="mb-4 rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-detail text-warn-fg leading-relaxed">
              Enquanto estiver desligado, ninguém no seu sistema consegue relatar nada. Desligar
              tira o botão na próxima visita, sem editar o código; os relatos que já chegaram
              continuam onde estão.
            </p>
          )}

          {/* Os grupos a esquerda e a previa presa a direita (`EditorWithPreview`). */}
          <EditorWithPreview
            preview={
              <PreviewSection
                id="previa"
                settings={draft}
                dirty={dirty}
                device={aparelho}
                onDeviceChange={setAparelho}
                highlight={realce}
                hint="Como fica no seu sistema. Clique no botão para abrir o formulário."
              />
            }
            // No celular, a previa abre numa folha pelo "Ver prévia", e o Publicar fica ao
            // lado dele quando ha mudanca (no titulo, ele saia da vista ao rolar).
            previewEmFolha
            folhaAlta
            acaoNoCelular={
              dirty ? (
                <Button variant="primary" disabled={saving} onClick={() => void save()}>
                  {saving ? 'Publicando…' : 'Publicar'}
                </Button>
              ) : null
            }
          >
            <ButtonGroups
              draft={draft}
              change={change}
              onPositionToggle={setPosicaoAberta}
              onAppearanceToggle={setAparenciaAberta}
            />

            <p className="mt-2 text-detail text-fg-muted leading-relaxed">
              O que o formulário pergunta fica em{' '}
              <Link to="../report-types" className="text-fg underline underline-offset-4">
                Tipos de relato
              </Link>
              ; os textos e o tema dele, em{' '}
              <Link to="../form-texts" className="text-fg underline underline-offset-4">
                Textos e tema
              </Link>
              ; o que a pessoa lê depois de enviar, em{' '}
              <Link to="../identity" className="text-fg underline underline-offset-4">
                Privacidade
              </Link>
              .
            </p>
          </EditorWithPreview>
        </>
      )}
    </div>
  )
}

/** O nome do acordeao desta tela: abrir um grupo fecha o outro. Ver `SettingsGroup`. */
const ACORDEAO = 'botao'

/**
 * Os assuntos, no acordeao. A Aparência abre sozinha: e o que a pessoa ajusta na
 * primeira hora. A Animação e a do formulario, e mora aqui porque sai do botao.
 */
function ButtonGroups({
  draft,
  change,
  onPositionToggle,
  onAppearanceToggle,
}: {
  draft: WidgetSettingsViewModel
  change: (patch: Partial<WidgetSettingsViewModel>) => void
  onPositionToggle: (open: boolean) => void
  onAppearanceToggle: (open: boolean) => void
}) {
  const { appearance, position, animation, mobile, hiddenPages } = BUTTON_GROUPS

  return (
    <>
      <SettingsGroup
        name={ACORDEAO}
        id="aparencia"
        title="Aparência"
        value={
          <>
            <ColorSwatch
              color={draft.AccentColor}
              className="mr-1.5 size-2.5 rounded-sm align-baseline"
            />
            {describeAppearance(draft)}
          </>
        }
        changes={groupChanges(draft, appearance)}
        onReset={() => change(resetPatch(draft, appearance))}
        onToggle={onAppearanceToggle}
        defaultOpen
      >
        <AppearanceFields draft={draft} change={change} />
      </SettingsGroup>

      <SettingsGroup
        name={ACORDEAO}
        id="posicao"
        title="Posição"
        value={describePosition(draft)}
        changes={groupChanges(draft, position)}
        onReset={() => change(resetPatch(draft, position))}
        onToggle={onPositionToggle}
      >
        <PositionFields draft={draft} change={change} />
      </SettingsGroup>

      <SettingsGroup
        name={ACORDEAO}
        id="animacao"
        title="Animação"
        value={describeAnimation(draft)}
        changes={groupChanges(draft, animation)}
        onReset={() => change(resetPatch(draft, animation))}
      >
        <AnimationFields draft={draft} change={change} />
      </SettingsGroup>

      <SettingsGroup
        name={ACORDEAO}
        id="celular"
        title="No celular"
        value={describeMobile(draft)}
        changes={groupChanges(draft, mobile)}
        onReset={() => change(resetPatch(draft, mobile))}
      >
        <MobileFields draft={draft} change={change} />
        {/* A previa nao troca de aparelho sozinha: diz onde ver o efeito daqui. */}
        <p className="mt-3 text-detail text-fg-muted">
          Escolha Celular na prévia para ver como fica.
        </p>
      </SettingsGroup>

      <SettingsGroup
        name={ACORDEAO}
        id="paginas"
        title="Páginas escondidas"
        value={describeHiddenPages(draft)}
        changes={groupChanges(draft, hiddenPages)}
        onReset={() => change(resetPatch(draft, hiddenPages))}
      >
        <HiddenPagesFields draft={draft} change={change} />
      </SettingsGroup>
    </>
  )
}

function LoadingForm() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {['h-72', 'h-96'].map((height) => (
        <Skeleton key={height} className={cn('w-full rounded-xl', height)} />
      ))}
    </div>
  )
}
