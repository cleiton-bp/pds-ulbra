import { type KeyboardEvent, type ReactNode, useCallback, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  IdentityFormat,
  ReporterIdentityMode,
  ReportVisibility,
  WidgetSettingsViewModel,
} from '@/contracts'
import { WIDGET_TEXT_LIMITS } from '@/contracts'
import { projectKeyService, projectPublicStageService } from '@/data'
import { PREVIEW_OUTLINE } from '@/embed/previewOutline'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { Button } from '@/shared/components/Button'
import { CodeAddedMark, CodeEditor } from '@/shared/components/CodeEditor'
import { CopyButton } from '@/shared/components/CopyButton'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { IdentitySecretDialog } from '@/shared/components/IdentitySecret'
import { LanguageIcon, type ServerLanguage } from '@/shared/components/LanguageIcon'
import { MovedAnchors } from '@/shared/components/MovedAnchors'
import { NumberField } from '@/shared/components/NumberField'
import { type JourneyStage, PublicJourney } from '@/shared/components/PublicJourney'
import { SentConfirmation } from '@/shared/components/SentConfirmation'
import { Check, Hint, RadioGroup } from '@/shared/components/SettingsControls'
import { SettingsGroup } from '@/shared/components/SettingsGroup'
import { SettingsHeader } from '@/shared/components/SettingsHeader'
import { Skeleton } from '@/shared/components/Skeleton'
import { TemplateField } from '@/shared/components/TemplateField'
import { toast } from '@/shared/components/toastStore'
import { Desenho, DesenhoDoNivel, NIVEIS, nivelDe } from '@/shared/components/VisibilityLevels'
import { VoltarDeOndeVeio } from '@/shared/components/VoltarDeOndeVeio'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { useIdentitySettingsDraft, useWidgetSettingsDraft } from '@/shared/hooks/useSettingsDraft'
import { cn } from '@/shared/lib/cn'
import {
  changedFromDefaults,
  defaultsOf,
  IDENTITY_DEFAULTS,
  IDENTITY_TOKEN_MINUTES,
} from '@/shared/lib/factoryDefaults'
import type { CodeLanguage } from '@/shared/lib/highlight'
import { LOADER_URL } from '@/shared/lib/loader'
import {
  renderWidgetText,
  SUCCESS_VARIABLES,
  TRACKING_VARIABLES,
  type WidgetTextValues,
} from '@/shared/lib/widgetText'
import { useScreenGuide } from '@/shared/tour/guideStore'

/**
 * O que esta tela grava em Quem relata: o modo, a visibilidade e o que a identidade do
 * sistema pede — a chave, a validade do cracha e o que fazer sem ele. "Perguntar o nome"
 * foi para Formulário.
 */
const CAMPOS_DE_QUEM_RELATA = [
  'Mode',
  'Visibility',
  'IdentityPublicKey',
  'IdentityTokenMaxMinutes',
  'IdentityRequired',
] as const

/**
 * Os textos de depois do envio, que sao da ferramenta, por grupo, cada um com o nome do
 * "Mudou". E com esta lista que o grupo diz o que mudou e que o "Voltar ao padrão" dele
 * sabe o que trocar — so o campo dele, no rascunho da ferramenta.
 */
const TEXTOS = {
  confirmacao: [['SuccessMessage', 'Texto da confirmação']],
  topo: [['TrackingIntro', 'Texto do topo']],
  aviso: [['PublicNotice', 'Texto do aviso']],
} as const satisfies Record<string, ReadonlyArray<readonly [keyof WidgetSettingsViewModel, string]>>

/** O que esta tela grava na configuracao da ferramenta: so os tres textos. */
const TEXTOS_DA_FERRAMENTA = Object.values(TEXTOS).flatMap((campos) =>
  campos.map(([campo]) => campo),
) satisfies ReadonlyArray<keyof WidgetSettingsViewModel>

/**
 * Os campos que moravam aqui e mudaram de tela: a pergunta do nome foi para junto do
 * texto dela, em Formulário, e os limites foram para Domínios, junto do resto
 * da protecao do site. O sino ja mandou `identity#limites`; ele chega la.
 */
const MUDARAM_DE_TELA: Record<string, string> = {
  'perguntar-nome': 'form-texts',
  limites: 'domains',
  'limite-por-pessoa': 'domains',
  'limite-por-ip': 'domains',
  'limite-por-dominio': 'domains',
  'limite-do-projeto-hora': 'domains',
  'limite-do-projeto-dia': 'domains',
  'intervalo-minimo': 'domains',
}

/** O nome do acordeao desta tela: abrir um grupo fecha o outro. Ver `SettingsGroup`. */
const ACORDEAO = 'quem-relata'

type Grupo = 'reconhecimento' | 'visibilidade' | 'confirmacao' | 'topo' | 'aviso'

/** O que a previa mostra: o quadro depois de enviar, a pagina do link ou o formulario. */
type Aba = 'sistema' | 'acompanhamento' | 'formulario'

const ABAS: ReadonlyArray<{ value: Aba; label: string; dica: string }> = [
  {
    value: 'sistema',
    label: 'No sistema',
    dica: 'O que a pessoa lê logo depois de enviar, no quadro da ferramenta. Nome, tipo e protocolo são de exemplo.',
  },
  {
    value: 'acompanhamento',
    label: 'Acompanhamento',
    dica: 'A página que quem relatou abre pelo link: o topo e o andamento com as etapas deste projeto. Protocolo e datas são de exemplo.',
  },
  {
    value: 'formulario',
    label: 'Formulário',
    dica: 'O aviso como aparece no formulário, antes de a pessoa escrever.',
  },
]

/**
 * A aba que cada grupo leva a previa a mostrar. O Reconhecimento aparece na confirmacao
 * — o codigo para guardar, ou a frase do relato ligado a conta —; a visibilidade decide
 * o aviso do formulario.
 */
const ABA_DO_GRUPO: Record<Grupo, Aba> = {
  reconhecimento: 'sistema',
  visibilidade: 'formulario',
  confirmacao: 'sistema',
  topo: 'acompanhamento',
  aviso: 'formulario',
}

const UM_DIA = 24 * 60 * 60 * 1000

/**
 * Uma das tres formas de reconhecer quem relata. **Cada uma diz tres coisas: o que e, o
 * que destrava e o que custa** — quem escolhe precisa saber o que ganha e o que vai ter de
 * fazer, e descobrir o custo depois de salvar e descobrir tarde. So a escolhida mostra o
 * destrava e o custo: as tres de uma vez eram uma parede de texto antes do primeiro clique.
 */
interface Modo {
  valor: ReporterIdentityMode
  titulo: string
  /** O que esta escolhido, em palavras, no titulo do grupo fechado. */
  emPalavras: string
  resumo: string
  explicacao: string
  destrava: string
  custo: string
}

const MODOS: readonly Modo[] = [
  {
    valor: 'Protocol',
    titulo: 'Protocolo',
    emPalavras: 'Protocolo (ninguém é identificado)',
    resumo: 'Ninguém é identificado.',
    explicacao:
      'O relato é tratado como se qualquer pessoa o tivesse enviado. Quem escreveu guarda o link e volta por ele, e o link é a única prova de que o relato é dela.',
    destrava:
      'Não há lista pessoal, e isso não é falta: sem saber quem é, não há como dizer quais relatos são dela.',
    custo: 'Nada. É o que funciona colando um script numa página.',
  },
  {
    valor: 'PersonalCode',
    titulo: 'Código pessoal',
    emPalavras: 'Código pessoal (a pessoa guarda um código)',
    resumo: 'O sistema sorteia um código, e a pessoa guarda.',
    explicacao:
      'Algo como H7QK-3M2X-P9WD, no mesmo alfabeto do protocolo, sem 0, O, 1 e I, para ser lido em voz alta sem confusão. Navegador novo, outro aparelho: ela digita o código e reencontra os relatos dela.',
    destrava:
      'Lista pessoal, sem o cliente precisar ter login. O código soma ao link e não o substitui: perdê-lo custa a lista, não os relatos.',
    custo: 'Nada do seu lado. O custo é da pessoa, que tem mais uma coisa para guardar.',
  },
  {
    valor: 'InheritedIdentity',
    titulo: 'Identidade do seu sistema',
    emPalavras: 'Identidade do seu sistema (quem está na conta não digita nada)',
    resumo: 'Quem já está na conta do seu sistema não digita nada.',
    explicacao:
      'O seu servidor diz quem é o usuário num crachá curto dentro do script, assinado com a chave secreta deste projeto ou com um JWT, e nós só conferimos a assinatura, sem nunca chamar o seu sistema, guardando da pessoa só um hash.',
    destrava:
      'Lista pessoal sem a pessoa guardar nada, e o nome já preenchido. Quem não está na conta ainda relata, como protocolo, se você permitir.',
    custo: 'Uma rotina curta no seu servidor, com o passo a passo abaixo na linguagem dele.',
  },
]

/**
 * Quem e quem neste projeto, quem pode ver o que — e o que a pessoa le depois de enviar.
 *
 * **As duas perguntas moram na mesma tela porque a primeira decide a segunda.** Sem
 * identidade nao existe "o meu relato", e nao existe como o relator escolher aparecer.
 *
 * **Cinco grupos em acordeao, como em Formulário** (`SettingsGroup`): Reconhecimento,
 * Visibilidade, Confirmação, Topo do acompanhamento e Aviso público. Fechado, cada um ja
 * diz o que esta escolhido e o que mudou, com o proprio "Voltar ao padrão". A tela tinha
 * umas vinte linhas de explicacao antes do primeiro campo: agora cada escolha e um bloco
 * com desenho, so a escolhida diz o que destrava e o que custa, e o texto longo espera no
 * "Como funciona".
 *
 * **A previa, presa a direita, mostra onde cada texto aparece**, em tres abas: o quadro
 * logo depois de enviar, a pagina de acompanhamento com a jornada de verdade do projeto e
 * o formulario com o aviso. A aba acompanha o grupo aberto, ate a pessoa escolher uma;
 * abrir outro grupo devolve a conducao a ele.
 *
 * **Dois rascunhos, um Salvar.** O modo e a visibilidade sao de Quem relata; os textos,
 * da ferramenta. O Salvar do titulo grava os dois em sequencia, cada um com o registro
 * inteiro e so os campos daqui mudados (`useSettingsDraft`), e o "Voltar ao padrão" de
 * cada grupo mexe so no rascunho dele.
 */
export function IdentityScreen() {
  // O guia desta tela: o passo cuja parte nao estiver na tela sai quando o guia abre.
  useScreenGuide('privacidade', [
    {
      alvo: 'opcoes',
      titulo: 'Privacidade',
      texto: 'Quem pode ver os relatos e se o nome de quem relatou aparece.',
    },
    {
      alvo: 'previa',
      titulo: 'Como aparece',
      texto: 'O formulário e a lista pública conforme o nível escolhido.',
    },
    {
      alvo: 'salvar',
      titulo: 'Salvar',
      texto: 'Nada muda até você salvar ou publicar, e dá para descartar.',
    },
    {
      alvo: 'guia',
      titulo: 'Guia por tela',
      texto: 'Cada tela tem o seu guia, sempre neste botão, com o nome dela.',
    },
  ])
  const project = useCurrentProject()
  const quemRelata = useIdentitySettingsDraft(project.PublicId, CAMPOS_DE_QUEM_RELATA)
  const textos = useWidgetSettingsDraft(project.PublicId, TEXTOS_DA_FERRAMENTA)

  // A chave publica do projeto, so para os exemplos do cracha: o `aud` e a linha do script.
  const chaves = useAsyncResource(
    useCallback(() => projectKeyService.listProjectKeys(project.PublicId), [project.PublicId]),
  )
  const chaveDoProjeto =
    chaves.data?.find((chave) => chave.Type === 'Public' && chave.IsActive)?.Value ?? ''

  const draft = quemRelata.draft
  const ferramenta = textos.draft
  const dirty = quemRelata.dirty || textos.dirty
  const saving = quemRelata.saving || textos.saving

  // A jornada de verdade, so para a previa: falhar aqui nao impede nada na tela.
  const jornada = useAsyncResource(
    useCallback(
      () => projectPublicStageService.listPublicStages(project.PublicId),
      [project.PublicId],
    ),
  )

  /** O grupo aberto: e ele que a previa mostra. */
  const [aberto, setAberto] = useState<Grupo | null>(null)
  /** A aba que a pessoa escolheu. Vence o grupo ate outro grupo abrir. */
  const [abaEscolhida, setAbaEscolhida] = useState<Aba | null>(null)
  const ativo = aberto
  const aba: Aba = abaEscolhida ?? (ativo ? ABA_DO_GRUPO[ativo] : 'sistema')

  /**
   * A combinacao que a regra nao permite — e que a tela **nao** desfaz sozinha.
   *
   * Ela so aparece vindo do que estava salvo: o projeto identificava, publicava
   * identificado, e alguem escolheu voltar ao protocolo. Trocar a visibilidade por conta
   * propria nesse instante mudaria quem pode ver os relatos sem ninguem ter pedido, e o
   * aviso e justamente para a escolha ser de quem configura.
   */
  const conflito =
    draft !== null && draft.Mode === 'Protocol' && draft.Visibility === 'PublicIdentified'

  /**
   * A identidade do sistema no JWT sem a chave publica: a API nao conferiria cracha
   * nenhum, e o modo gravado nao faria nada. E a unica coisa desta tela sem padrao de
   * fabrica.
   */
  const faltaChave =
    draft !== null &&
    draft.Mode === 'InheritedIdentity' &&
    draft.IdentityFormat === 'Jwt' &&
    (draft.IdentityPublicKey ?? '').trim().length === 0
  /** O HMAC escolhido numa instalacao sem a chave mestra: a API recusaria. */
  const hmacIndisponivel =
    draft !== null &&
    draft.Mode === 'InheritedIdentity' &&
    draft.IdentityFormat === 'Hmac' &&
    !draft.IsHmacAvailable
  const validadeInvalida = draft !== null && !validadeValida(draft.IdentityTokenMaxMinutes)
  const semComoSalvar = conflito || faltaChave || hmacIndisponivel || validadeInvalida

  async function salvar() {
    if (saving || semComoSalvar) return
    // Uma de cada vez: se a primeira falhar, a segunda nao vai, e o aviso e um so.
    if (quemRelata.dirty && !(await quemRelata.save())) return
    if (textos.dirty && !(await textos.save())) return
    toast.done('Privacidade: salvo.')
  }

  /** Liga o grupo a previa: aberto, ele escolhe a aba e realca a parte dele. */
  function acompanhar(grupo: Grupo) {
    return {
      onToggle: (abriu: boolean) => {
        setAberto((atual) => (abriu ? grupo : atual === grupo ? null : atual))
        // Abrir um grupo e um pedido claro de mudar de assunto: a previa volta a segui-lo.
        if (abriu) setAbaEscolhida(null)
      },
    }
  }

  // As datas de exemplo contam a partir de quando a tela abriu: fixas, para a linha do
  // tempo nao mudar sozinha enquanto a pessoa olha.
  const [hoje] = useState(() => Date.now())

  /**
   * A jornada do projeto como quem relatou ve, com o relato parado na segunda etapa — o
   * bastante para mostrar o que ja passou e o que vem. Sem etapa, a jornada vazia.
   */
  const naPrevia = useMemo(() => {
    if (!jornada.data) return null
    const ordenadas = [...jornada.data].sort((a, b) => a.Position - b.Position)
    const indiceAtual = Math.min(1, ordenadas.length - 1)
    const stages: JourneyStage[] = ordenadas.map((etapa, index) => ({
      id: etapa.PublicId,
      Label: etapa.Label,
      Description: etapa.Description,
      NextStep: etapa.NextStep,
      ReachedAt:
        index <= indiceAtual ? new Date(hoje - (indiceAtual - index) * UM_DIA).toISOString() : null,
    }))
    return { stages, atual: stages[indiceAtual]?.id ?? null }
  }, [jornada.data, hoje])

  // Os valores de exemplo da previa dos textos com variavel. A etapa e a de verdade.
  const exemplo = {
    primeiroNome: 'Ana',
    protocolo: 'K7P2-9XQ4',
    tipo: ferramenta?.Types[0]?.Name ?? 'Defeito',
    projeto: project.Name,
    etapa: naPrevia?.stages.find((passo) => passo.id === naPrevia.atual)?.Label ?? 'Em análise',
  }

  const falhou = quemRelata.failed || textos.failed

  return (
    <div className="max-w-6xl">
      {/* Vindo de outra tela pelo atalho (o "Mudar a privacidade" da Moderação), o caminho
          de volta fica no alto. */}
      <VoltarDeOndeVeio />
      <MovedAnchors moved={MUDARAM_DE_TELA} />

      <SettingsHeader
        title="Privacidade"
        description="Como a pessoa que relata é reconhecida, quem pode ver os relatos e o que ela lê depois de enviar."
        ready={draft !== null && ferramenta !== null}
        dirty={dirty}
        changeCount={quemRelata.changeCount + textos.changeCount}
        saving={saving}
        canSave={!semComoSalvar}
        onSave={() => void salvar()}
        onDiscard={() => {
          quemRelata.discard()
          textos.discard()
        }}
        note={
          conflito
            ? 'Escolha uma visibilidade que combine com o protocolo para salvar.'
            : faltaChave
              ? 'Cole a chave pública do seu sistema para salvar.'
              : hmacIndisponivel
                ? 'Escolha o JWT para salvar, porque a assinatura simples não está disponível aqui.'
                : validadeInvalida
                  ? `A validade do crachá precisa ficar entre ${IDENTITY_TOKEN_MINUTES.min} e ${IDENTITY_TOKEN_MINUTES.max} minutos.`
                  : undefined
        }
      />

      {falhou && (
        <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar a configuração agora. Nada mudou: a falha foi ao consultar, e o
            projeto continua se comportando como estava.
          </p>
          <Button
            onClick={() => {
              if (quemRelata.failed) quemRelata.reload()
              if (textos.failed) textos.reload()
            }}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {!falhou && (!draft || !ferramenta) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      )}

      {draft && ferramenta && (
        <EditorWithPreview
          previewEmFolha
          acaoNoCelular={
            dirty ? (
              <Button
                variant="primary"
                disabled={saving || semComoSalvar}
                onClick={() => void salvar()}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </Button>
            ) : null
          }
          preview={
            <Previa
              aba={aba}
              onAba={setAbaEscolhida}
              realce={ativo}
              dirty={dirty}
              ferramenta={ferramenta}
              modo={draft.Mode}
              visibilidade={draft.Visibility}
              exemplo={exemplo}
              jornada={naPrevia}
              jornadaFalhou={jornada.failed}
              recarregarJornada={jornada.reload}
            />
          }
        >
          {/* **Quem pode ver os relatos vem primeiro, e aberto**: e a escolha que da o nome a
              tela (Privacidade) e a que mais pesa para quem relata. O reconhecimento, mais
              tecnico, vem depois. */}
          <SettingsGroup
            name={ACORDEAO}
            id="visibilidade"
            title="Visibilidade"
            value={
              conflito ? (
                <span className="text-warn-fg">
                  {nivelDe(draft.Visibility).titulo}, que não combina com o protocolo
                </span>
              ) : (
                nivelDe(draft.Visibility).emPalavras
              )
            }
            changes={draft.Visibility !== DEFAULT_WIDGET_SETTINGS.Visibility ? ['Nível'] : []}
            onReset={() => quemRelata.change({ Visibility: DEFAULT_WIDGET_SETTINGS.Visibility })}
            defaultOpen
            {...acompanhar('visibilidade')}
          >
            <RadioGroup<ReportVisibility>
              label="Quem pode ver os relatos"
              value={draft.Visibility}
              onChange={(Visibility) => quemRelata.change({ Visibility })}
              options={NIVEIS.map((nivel) => {
                // A trava depende da outra pergunta da tela, e muda enquanto a pessoa
                // escolhe: o motivo vai na propria peca, porque cinza sem explicacao faz
                // quem configura concluir que o produto esta quebrado.
                const travado =
                  nivel.valor === 'PublicIdentified' &&
                  draft.Mode === 'Protocol' &&
                  draft.Visibility !== nivel.valor
                return {
                  value: nivel.valor,
                  label: nivel.titulo,
                  drawing: <DesenhoDoNivel nivel={nivel.valor} />,
                  note: travado ? 'Depende de um modo que identifique' : undefined,
                  disabled: travado,
                  className: 'min-w-24 flex-1 basis-0 text-center',
                }
              })}
            />
            <Escolha
              titulo={nivelDe(draft.Visibility).titulo}
              resumo={nivelDe(draft.Visibility).resumo}
              linhas={[
                ['Quem vê:', nivelDe(draft.Visibility).quemVe],
                ['Custo:', nivelDe(draft.Visibility).custo],
              ]}
            />

            {conflito && (
              <div className="mt-3 rounded-lg border border-warn-border bg-warn-surface p-3.5">
                <p className="text-caption text-warn-fg leading-relaxed">
                  <strong className="font-medium">
                    Este projeto publica identificado, e o protocolo não identifica ninguém.
                  </strong>{' '}
                  Escolha outro nível de visibilidade, ou volte para um modo que identifique. Não
                  mudamos por você: quem pode ver os relatos não deve mudar de lado por causa de um
                  clique em outra pergunta.
                </p>
              </div>
            )}

            {draft.Visibility !== 'Private' && (
              <Hint>
                Nada sai sozinho: o relato só aparece para fora depois que alguém do time o libera
                em Moderação.
              </Hint>
            )}
            {draft.Mode === 'Protocol' && !conflito && (
              <Hint>Público identificado pede um modo que identifique, em Reconhecimento.</Hint>
            )}

            <HowItWorks className="mt-3">
              {NIVEIS.map((nivel) => (
                <p key={nivel.valor}>
                  <strong className="font-medium text-fg">{nivel.titulo}.</strong>{' '}
                  {nivel.explicacao}
                </p>
              ))}
            </HowItWorks>
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="reconhecimento"
            title="Reconhecimento"
            value={modoDe(draft.Mode).emPalavras}
            changes={[
              ...(draft.Mode !== DEFAULT_WIDGET_SETTINGS.IdentityMode ? ['Modo'] : []),
              ...(draft.IdentityTokenMaxMinutes !== IDENTITY_DEFAULTS.IdentityTokenMaxMinutes
                ? ['Validade do crachá']
                : []),
              ...(draft.IdentityRequired !== IDENTITY_DEFAULTS.IdentityRequired
                ? ['Exigir o crachá']
                : []),
              ...(draft.IdentityFormat !== IDENTITY_DEFAULTS.IdentityFormat
                ? ['Formato da assinatura']
                : []),
            ]}
            // A chave fica: ela e do sistema do cliente, e nao uma escolha com padrao.
            onReset={() =>
              quemRelata.change({
                Mode: DEFAULT_WIDGET_SETTINGS.IdentityMode,
                ...IDENTITY_DEFAULTS,
                // Sem a chave mestra, o padrao possivel e o JWT: o HMAC travaria o salvar.
                IdentityFormat: draft.IsHmacAvailable ? IDENTITY_DEFAULTS.IdentityFormat : 'Jwt',
              })
            }
            {...acompanhar('reconhecimento')}
          >
            <RadioGroup<ReporterIdentityMode>
              label="Como a pessoa é reconhecida"
              value={draft.Mode}
              onChange={(Mode) => quemRelata.change({ Mode })}
              options={MODOS.map((modo) => ({
                value: modo.valor,
                label: modo.titulo,
                drawing: <DesenhoDoModo modo={modo.valor} />,
                className: 'min-w-24 flex-1 basis-0 text-center',
              }))}
            />
            <Escolha
              titulo={modoDe(draft.Mode).titulo}
              resumo={modoDe(draft.Mode).resumo}
              linhas={[
                ['Destrava:', modoDe(draft.Mode).destrava],
                ['Custo:', modoDe(draft.Mode).custo],
              ]}
            />
            {draft.Mode === 'InheritedIdentity' && (
              <ChaveDoSistema
                projectId={project.PublicId}
                formato={draft.IdentityFormat}
                onFormato={(IdentityFormat) => quemRelata.change({ IdentityFormat })}
                hmacDisponivel={draft.IsHmacAvailable}
                chave={draft.IdentityPublicKey ?? ''}
                onChave={(texto) =>
                  quemRelata.change({ IdentityPublicKey: texto.trim().length > 0 ? texto : null })
                }
                validade={draft.IdentityTokenMaxMinutes}
                onValidade={(IdentityTokenMaxMinutes) =>
                  quemRelata.change({ IdentityTokenMaxMinutes })
                }
                obrigatorio={draft.IdentityRequired}
                onObrigatorio={(IdentityRequired) => quemRelata.change({ IdentityRequired })}
                chaveDoProjeto={chaveDoProjeto}
              />
            )}
            <Hint>
              Trocar de modo não mexe no passado: relato que já entrou continua como entrou, e
              abrindo pelo link de sempre.
            </Hint>
            <HowItWorks className="mt-3">
              {MODOS.map((modo) => (
                <p key={modo.valor}>
                  <strong className="font-medium text-fg">{modo.titulo}.</strong> {modo.explicacao}
                </p>
              ))}
            </HowItWorks>
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="depois-de-enviar"
            title="Confirmação"
            value={`“${resumir(renderWidgetText(ferramenta.SuccessMessage, exemplo))}”`}
            changes={changedFromDefaults(ferramenta, DEFAULT_WIDGET_SETTINGS, TEXTOS.confirmacao)}
            onReset={() => textos.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, TEXTOS.confirmacao))}
            {...acompanhar('confirmacao')}
          >
            <TemplateField
              id="confirmacao"
              label="Confirmação, acima do protocolo"
              value={ferramenta.SuccessMessage}
              onChange={(SuccessMessage) => textos.change({ SuccessMessage })}
              maxLength={WIDGET_TEXT_LIMITS.SuccessMessage}
              variables={SUCCESS_VARIABLES}
              sample={exemplo}
            />
            <Hint>No quadro da ferramenta, logo depois de enviar, acima do protocolo.</Hint>
            <ComoFuncionamAsVariaveis />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="texto-do-acompanhamento"
            title="Topo do acompanhamento"
            value={`“${resumir(renderWidgetText(ferramenta.TrackingIntro, exemplo))}”`}
            changes={changedFromDefaults(ferramenta, DEFAULT_WIDGET_SETTINGS, TEXTOS.topo)}
            onReset={() => textos.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, TEXTOS.topo))}
            {...acompanhar('topo')}
          >
            {/* `#mais-opcoes` era o "Mais opções", que comecava pelo topo: o endereco
                antigo cai aqui. */}
            <div id="mais-opcoes" className="scroll-mt-6">
              <TemplateField
                id="topo-do-acompanhamento"
                label="Topo da página de acompanhamento"
                value={ferramenta.TrackingIntro}
                onChange={(TrackingIntro) => textos.change({ TrackingIntro })}
                maxLength={WIDGET_TEXT_LIMITS.TrackingIntro}
                variables={TRACKING_VARIABLES}
                sample={exemplo}
              />
            </div>
            <Hint>
              A primeira frase da página que quem relatou abre pelo link, acima do protocolo e do
              andamento.
            </Hint>
            <ComoFuncionamAsVariaveis />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="aviso-de-relato-publico"
            title="Aviso público"
            value={
              draft.Visibility === 'Private'
                ? 'Sem efeito: projeto privado'
                : `“${resumir(ferramenta.PublicNotice)}”`
            }
            changes={changedFromDefaults(ferramenta, DEFAULT_WIDGET_SETTINGS, TEXTOS.aviso)}
            onReset={() => textos.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, TEXTOS.aviso))}
            {...acompanhar('aviso')}
          >
            <TemplateField
              id="aviso-publico"
              label="Aviso de que o relato pode virar público"
              value={ferramenta.PublicNotice}
              onChange={(PublicNotice) => textos.change({ PublicNotice })}
              maxLength={WIDGET_TEXT_LIMITS.PublicNotice}
            />
            <Hint>
              {draft.Visibility === 'Private'
                ? 'Com o projeto privado, o formulário não mostra este aviso. Ele passa a aparecer quando a visibilidade for pública.'
                : 'No formulário, antes de a pessoa escrever. Depois dele vem uma frase sobre o nome, que muda com a visibilidade e não se edita.'}
            </Hint>
          </SettingsGroup>
        </EditorWithPreview>
      )}
    </div>
  )
}

/** A validade do cracha dentro do que a API aceita. */
function validadeValida(minutos: number): boolean {
  return (
    Number.isInteger(minutos) &&
    minutos >= IDENTITY_TOKEN_MINUTES.min &&
    minutos <= IDENTITY_TOKEN_MINUTES.max
  )
}

/**
 * O que a identidade do sistema pede do cliente, **como um passo a passo que muda com duas
 * escolhas**: como o sistema dele assina (a assinatura simples, HMAC, ou o JWT) e em que
 * linguagem o servidor dele roda. Os exemplos ja vem com a chave deste projeto e a validade
 * no lugar.
 *
 * **Cada passo e uma coisa so, na ordem em que se faz**: pegar a chave (a da identidade
 * mora em Chaves, com as outras), escrever o codigo, colocar no script, decidir as regras
 * do cracha e salvar. A validade fica nas regras, e nao no meio do codigo: ali ela parecia
 * parte do exemplo.
 *
 * **O codigo tem cara de editor** (`CodeEditor`), e as linguagens sao as abas dele, com o
 * desenho de cada uma: quem le reconhece a sua de relance e leva o trecho inteiro.
 */
/**
 * O codigo dos passos, no celular, de borda a borda do cartao: sai do recuo da coluna dos
 * numeros (32) e do respiro do grupo (16). Com os recuos, ele tinha uns 264px e rolava de
 * lado a cada linha; assim fica com quase a largura da tela.
 */
const CODIGO_NO_CELULAR =
  'max-sm:-ml-12 max-sm:-mr-4 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-none'

function ChaveDoSistema({
  projectId,
  formato,
  onFormato,
  hmacDisponivel,
  chave,
  onChave,
  validade,
  onValidade,
  obrigatorio,
  onObrigatorio,
  chaveDoProjeto,
}: {
  projectId: string
  formato: IdentityFormat
  onFormato: (formato: IdentityFormat) => void
  /** A instalacao tem a chave mestra do HMAC. */
  hmacDisponivel: boolean
  chave: string
  onChave: (chave: string) => void
  validade: number
  onValidade: (minutos: number) => void
  obrigatorio: boolean
  onObrigatorio: (obrigatorio: boolean) => void
  /** A chave publica do projeto, para os exemplos. Vazia enquanto nao carregou. */
  chaveDoProjeto: string
}) {
  const [linguagem, setLinguagem] = useLinguagemDoServidor()
  const [vendoAChave, setVendoAChave] = useState(false)
  const validadeInvalida = !validadeValida(validade)
  const aud = chaveDoProjeto || 'pk_…'
  const minutos = validadeInvalida ? IDENTITY_DEFAULTS.IdentityTokenMaxMinutes : validade
  const hmac = formato === 'Hmac'

  const exemplo = (
    <CodeEditor
      className={CODIGO_NO_CELULAR}
      ariaLabel="Linguagem do seu servidor"
      active={linguagem}
      onActiveChange={(id) => setLinguagem(id as Linguagem)}
      files={LINGUAGENS.map((item) => ({
        id: item.valor,
        name: item.arquivo,
        label: item.nome,
        language: item.realce,
        icon: <LanguageIcon language={item.valor} className="size-3.5" />,
        code: hmac ? exemploHmac(item.valor, minutos) : exemploJwt(item.valor, aud, minutos),
      }))}
    />
  )

  // O modelo da pagina na mesma linguagem do exemplo: trocar a aba de um troca a do outro.
  const pagina = (
    <CodeEditor
      className={CODIGO_NO_CELULAR}
      ariaLabel="Linguagem do modelo da página"
      active={linguagem}
      onActiveChange={(id) => setLinguagem(id as Linguagem)}
      files={LINGUAGENS.map((item) => ({
        id: item.valor,
        name: item.pagina,
        label: item.nome,
        language: 'html' as const,
        icon: <LanguageIcon language={item.valor} className="size-3.5" />,
        ...(hmac ? paginaHmac(item.valor, aud) : paginaJwt(item.valor, aud)),
      }))}
    />
  )

  const regras = (
    <>
      <CampoDaValidade valor={validade} invalida={validadeInvalida} onValor={onValidade} />
      <div id="sem-cracha" className="scroll-mt-6">
        <ExigirCracha obrigatorio={obrigatorio} onObrigatorio={onObrigatorio} />
      </div>
    </>
  )

  return (
    // No celular cada nivel aninhado perde um pouco do respiro: em 320, caixa, passo,
    // cartao e lista somados deixavam uns 114px para o texto.
    // No celular, uma secao separada por um fio, e nao mais uma caixa dentro do cartao: as
    // caixas aninhadas (o grupo, esta, os passos, o "Como usar") tiravam largura a cada
    // respiro, e o codigo ficava com uns 260px.
    <div className="mt-3 rounded-lg border border-border bg-surface p-4 max-sm:mt-4 max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:bg-transparent max-sm:px-0 max-sm:pt-4 max-sm:pb-0">
      <div className="mb-6 flex flex-col gap-2.5">
        <div className="font-medium text-detail text-fg">Como o seu sistema assina</div>
        <RadioGroup<IdentityFormat>
          label="Como o seu sistema assina"
          value={formato}
          onChange={onFormato}
          options={[
            {
              value: 'Hmac',
              label: 'Assinatura simples',
              note: hmacDisponivel ? 'uma linha, em qualquer linguagem' : 'indisponível aqui',
              drawing: <DesenhoDoFormato formato="Hmac" />,
              disabled: !hmacDisponivel && formato !== 'Hmac',
              className: 'min-w-36 flex-1 basis-0 text-center',
            },
            {
              value: 'Jwt',
              label: 'JWT',
              note: 'para quem já assina JWT',
              drawing: <DesenhoDoFormato formato="Jwt" />,
              className: 'min-w-36 flex-1 basis-0 text-center',
            },
          ]}
        />
        {!hmacDisponivel && (
          <p
            className={cn('text-caption leading-relaxed', hmac ? 'text-warn-fg' : 'text-fg-muted')}
          >
            {hmac
              ? 'Esta instalação não tem a chave mestra da assinatura simples, então escolha o JWT para salvar.'
              : 'A assinatura simples precisa da chave mestra na instalação (IDENTITY_HMAC_KEY), então aqui só o JWT está disponível.'}
          </p>
        )}
      </div>

      {hmac ? (
        <ol className="flex flex-col">
          <Passo numero={1} titulo="Pegue a chave da identidade">
            <p>
              Guarde no servidor do seu sistema, numa variável de ambiente como{' '}
              <code className="font-mono text-fg">RELATOFACIL_SECRET</code>, e nunca no código da
              página.
            </p>
            {/* Num dialogo, e nao indo para Chaves: quem esta no meio da configuracao, com
                mudancas por salvar, pega a chave sem sair daqui. */}
            <div>
              <Button size="sm" onClick={() => setVendoAChave(true)}>
                Ver a chave
              </Button>
            </div>
            <IdentitySecretDialog
              projectPublicId={projectId}
              open={vendoAChave}
              onOpenChange={setVendoAChave}
            />
          </Passo>

          <Passo numero={2} titulo="Assine quem está na conta, a cada página">
            <p>
              O seu servidor calcula o HMAC-SHA256 de{' '}
              <code className="font-mono text-fg">id.expira</code> com a chave, onde{' '}
              <code className="font-mono text-fg">expira</code> é o horário de vencer, em segundos.
            </p>
            <ComoUsar linguagem={linguagem} hmac />
            {exemplo}
          </Passo>

          <Passo numero={3} titulo="Coloque a assinatura no script que já está na página">
            <p>
              O script que você colou na Instalação continua onde está, e só ganha as linhas
              marcadas{' '}
              <span className="whitespace-nowrap">
                com <CodeAddedMark />.
              </span>
            </p>
            <p>
              Elas chamam a função do passo 2 a cada página e escrevem ali o id, a validade e a
              assinatura de quem está na conta, então você não cola valor nenhum nelas.
            </p>
            {pagina}
            <p>
              Para conferir, entre no seu sistema, clique com o botão direito na página, escolha
              Exibir código-fonte e procure{' '}
              <code className="font-mono text-fg">data-user-signature</code>, que deve trazer 64
              letras e números.
            </p>
            <p>Quem não está na conta fica sem a assinatura, e a chave nunca aparece na página.</p>
            <p>O nome é opcional e só preenche o campo do nome no formulário.</p>
            <UmScriptSo perda="a assinatura ficaria de fora" />
            <PaginaNoNavegador hmac />
          </Passo>

          <Passo id="validade-do-cracha" numero={4} titulo="Defina as regras do crachá">
            {regras}
          </Passo>

          <Passo numero={5} titulo="Salve e confira" ultimo>
            <SalvarEConferir />
          </Passo>
        </ol>
      ) : (
        <ol className="flex flex-col">
          <Passo numero={1} titulo="Crie o par de chaves">
            <GerarParDeChaves temChave={chave.trim().length > 0} onPublica={onChave} />
          </Passo>

          <Passo
            id="chave-publica"
            numero={2}
            titulo="Confira a chave pública"
            feito={chave.trim().length > 0}
          >
            <CampoDaChavePublica chave={chave} onChave={onChave} />
          </Passo>

          <Passo numero={3} titulo="Gere um crachá a cada página, para quem está na conta">
            <p>
              O crachá é um JWT ES256 assinado com a chave privada que você baixou (
              <code className="font-mono text-fg">relatofacil-privada.pem</code>), com o id do
              usuário em <code className="font-mono text-fg">sub</code>, o nome em{' '}
              <code className="font-mono text-fg">name</code> se quiser e a chave deste projeto em{' '}
              <code className="font-mono text-fg">aud</code>.
            </p>
            <ComoUsar linguagem={linguagem} hmac={false} />
            {exemplo}
            <p className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-warn-fg">
              Nunca use o token de login do usuário, porque o crachá serve só para relatar e vence
              em poucos minutos.
            </p>
          </Passo>

          <Passo numero={4} titulo="Coloque o crachá no script que já está na página">
            <p>
              O script que você colou na Instalação continua onde está, e só ganha as linhas
              marcadas{' '}
              <span className="whitespace-nowrap">
                com <CodeAddedMark />.
              </span>
            </p>
            <p>
              Elas chamam a função do passo 3 a cada página e escrevem ali o crachá de quem está na
              conta, então você não cola valor nenhum nelas.
            </p>
            {pagina}
            <p>
              Para conferir, entre no seu sistema, clique com o botão direito na página, escolha
              Exibir código-fonte e procure <code className="font-mono text-fg">data-identity</code>
              , que deve trazer um texto comprido começando com{' '}
              <code className="font-mono text-fg">eyJ</code>.
            </p>
            <p>
              Quem não está na conta fica sem o crachá, e a chave privada nunca aparece na página.
            </p>
            <UmScriptSo perda="o crachá ficaria de fora" />
            <PaginaNoNavegador hmac={false} />
          </Passo>

          <Passo id="validade-do-cracha" numero={5} titulo="Defina as regras do crachá">
            {regras}
          </Passo>

          <Passo numero={6} titulo="Salve e confira" ultimo>
            <SalvarEConferir />
          </Passo>
        </ol>
      )}
    </div>
  )
}

/** O desenho de cada formato: a chave da assinatura simples, e as chaves do JSON no JWT. */
function DesenhoDoFormato({ formato }: { formato: IdentityFormat }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {formato === 'Hmac' ? (
        <>
          <circle cx="8" cy="15" r="4" />
          <path d="m11 12 8-8M16 7l2 2M14.5 8.5l1.5 1.5" />
        </>
      ) : (
        <path d="M8 4c-2 0-2.5 1-2.5 3v2c0 1.5-.8 2.5-2 3 1.2.5 2 1.5 2 3v2c0 2 .5 3 2.5 3M16 4c2 0 2.5 1 2.5 3v2c0 1.5.8 2.5 2 3-1.2.5-2 1.5-2 3v2c0 2-.5 3-2.5 3" />
      )}
    </svg>
  )
}

/**
 * O par de chaves do JWT, criado **no navegador de quem configura** (Web Crypto, ECDSA
 * P-256, o mesmo dos comandos do terminal): a publica vai sozinha para o passo 2, e a
 * privada e baixada uma vez. **A privada nunca passa pelo nosso servidor**: e o que
 * garante que nem um vazamento nosso assina um cracha em nome de alguem.
 *
 * Ela fica so na memoria desta tela, e some ao sair: por isso o aviso de baixar agora.
 * Gerar outro par com uma chave ja colada pede confirmacao, porque troca a chave que o
 * servidor do cliente usa. Os comandos do terminal continuam, recolhidos, para quem
 * prefere gerar no proprio servidor.
 */
function GerarParDeChaves({
  temChave,
  onPublica,
}: {
  temChave: boolean
  onPublica: (chave: string) => void
}) {
  const [privada, setPrivada] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [falha, setFalha] = useState(false)
  const suportado = typeof window !== 'undefined' && window.crypto?.subtle !== undefined

  async function gerar() {
    setConfirmar(false)
    setGerando(true)
    setFalha(false)
    try {
      const par = await window.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      )
      const [pkcs8, spki] = await Promise.all([
        window.crypto.subtle.exportKey('pkcs8', par.privateKey),
        window.crypto.subtle.exportKey('spki', par.publicKey),
      ])
      setPrivada(emPem('PRIVATE KEY', pkcs8))
      onPublica(emPem('PUBLIC KEY', spki))
    } catch {
      setFalha(true)
    } finally {
      setGerando(false)
    }
  }

  return (
    <>
      {privada ? (
        <div className="flex animate-fade-in flex-col gap-2.5 rounded-lg border border-warn-border bg-warn-surface px-3.5 py-3">
          <p className="font-medium text-warn-fg">
            Baixe a chave privada agora, porque ela não fica salva aqui e não aparece de novo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => baixarPem(privada)}>
              Baixar relatofacil-privada.pem
            </Button>
            <CopyButton value={privada} label="Copiar a chave" size="sm" variant="warn" />
          </div>
          <p className="text-warn-fg">
            A pública já está no passo 2, então guarde a privada no servidor do seu sistema e salve
            esta tela.
          </p>
        </div>
      ) : (
        <p>
          Crie as duas chaves aqui mesmo, no seu navegador: a pública vai para o passo 2, e a
          privada você baixa, sem passar pelo nosso servidor.
        </p>
      )}

      {suportado && !confirmar && (
        <div>
          <Button
            size="sm"
            variant={privada ? 'ghost' : 'primary'}
            disabled={gerando}
            onClick={() => (temChave ? setConfirmar(true) : void gerar())}
          >
            {gerando ? 'Gerando…' : privada ? 'Gerar outro par' : 'Gerar o par de chaves'}
          </Button>
        </div>
      )}

      {confirmar && (
        <div className="flex animate-fade-in flex-wrap items-center gap-2 rounded-lg border border-warn-border bg-warn-surface px-3.5 py-2.5">
          <span className="min-w-0 flex-1 text-warn-fg">
            Gerar outro par troca a chave pública, e o seu servidor vai precisar da privada nova.
          </span>
          <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void gerar()}>
            Gerar outro par
          </Button>
        </div>
      )}

      {falha && (
        <p className="text-error-fg">
          Não deu para gerar aqui, então use os comandos abaixo no seu servidor.
        </p>
      )}

      <details className="group/terminal" open={!suportado || falha}>
        <summary className="cursor-pointer text-fg transition-colors hover:text-fg-muted pointer-coarse:-my-3 pointer-coarse:py-3">
          Prefere gerar no seu servidor?
        </summary>
        <div className="mt-2.5 flex flex-col gap-2.5">
          <p>Rode estes comandos uma vez só, e a privada fica só no seu servidor.</p>
          <CodeEditor
            className={CODIGO_NO_CELULAR}
            files={[
              { id: 'chaves', name: 'terminal', language: 'shell', code: COMANDOS_DAS_CHAVES },
            ]}
          />
        </div>
      </details>
    </>
  )
}

/** A chave em PEM: o base64 dos bytes, em linhas de 64, entre as linhas de comeco e fim. */
function emPem(rotulo: 'PRIVATE KEY' | 'PUBLIC KEY', bytes: ArrayBuffer): string {
  let binario = ''
  for (const byte of new Uint8Array(bytes)) binario += String.fromCharCode(byte)
  const linhas = btoa(binario).match(/.{1,64}/g) ?? []
  return `-----BEGIN ${rotulo}-----\n${linhas.join('\n')}\n-----END ${rotulo}-----\n`
}

/** Baixa a chave privada como arquivo, sem ela sair do navegador. */
function baixarPem(conteudo: string) {
  const endereco = URL.createObjectURL(new Blob([conteudo], { type: 'application/x-pem-file' }))
  const link = document.createElement('a')
  link.href = endereco
  link.download = 'relatofacil-privada.pem'
  link.click()
  setTimeout(() => URL.revokeObjectURL(endereco), 1000)
}

/** O campo da chave publica do JWT, com o aviso de que sem ela o modo nao salva. */
function CampoDaChavePublica({
  chave,
  onChave,
}: {
  chave: string
  onChave: (chave: string) => void
}) {
  const semChave = chave.trim().length === 0
  return (
    <>
      <label htmlFor="chave-do-sistema" className="sr-only">
        Chave pública do seu sistema
      </label>
      <textarea
        id="chave-do-sistema"
        value={chave}
        onChange={(event) => onChave(event.target.value)}
        rows={4}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={semChave || undefined}
        placeholder={'-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----'}
        className={cn(
          'w-full rounded-lg border bg-surface-raised px-3 py-2 font-mono text-caption text-fg leading-relaxed transition-colors duration-150 placeholder:text-fg-placeholder',
          semChave ? 'border-warn-border' : 'border-border',
        )}
      />
      <p className={semChave ? 'text-warn-fg' : undefined}>
        {semChave
          ? 'Gere o par no passo 1, ou cole aqui a sua chave pública, porque sem ela este modo não salva.'
          : 'A pública só confere a assinatura, e por isso pode ficar aqui, à vista.'}
      </p>
    </>
  )
}

/** A validade maxima do cracha, que os exemplos ja usam. */
function CampoDaValidade({
  valor,
  invalida,
  onValor,
}: {
  valor: number
  invalida: boolean
  onValor: (minutos: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-raised px-3.5 py-3">
      <div className="min-w-0">
        <label
          htmlFor="validade-do-cracha-minutos"
          className="block font-medium text-detail text-fg"
        >
          Validade máxima do crachá
        </label>
        <p className={cn('mt-0.5', invalida && 'text-error-fg')}>
          {invalida
            ? `Use entre ${IDENTITY_TOKEN_MINUTES.min} e ${IDENTITY_TOKEN_MINUTES.max} minutos.`
            : 'Crachá que vale mais que isso é recusado, e o exemplo já usa este valor.'}
        </p>
      </div>
      <NumberField
        id="validade-do-cracha-minutos"
        min={IDENTITY_TOKEN_MINUTES.min}
        max={IDENTITY_TOKEN_MINUTES.max}
        value={valor}
        invalid={invalida}
        unit="min"
        ariaLabel="Validade máxima do crachá, em minutos"
        // Campo vazio vira zero, que a conta recusa: apagar tudo para digitar outro
        // numero e o gesto comum, e `NaN` quebraria a comparacao do rascunho.
        onChange={(texto) => onValor(Number.parseInt(texto, 10) || 0)}
      />
    </div>
  )
}

/** O "exigir o cracha", o mesmo nos dois formatos. */
function ExigirCracha({
  obrigatorio,
  onObrigatorio,
}: {
  obrigatorio: boolean
  onObrigatorio: (obrigatorio: boolean) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3.5 py-3">
      <Check
        checked={obrigatorio}
        onChange={onObrigatorio}
        label="Exigir o crachá: sem ele, recusar o relato e pedir para entrar na conta"
      />
      <p className="mt-1 pl-6">
        {obrigatorio
          ? 'Quem não está na conta lê “entre na sua conta para relatar”, e nada entra sem crachá.'
          : 'Quem não está na conta ainda relata, como protocolo e sem lista pessoal, que é o padrão.'}
      </p>
    </div>
  )
}

function SalvarEConferir() {
  return (
    <p>
      Clique em Salvar no alto da tela, entre no seu sistema com um usuário e abra o formulário, que
      deve mostrar “Ver os meus relatos”.
    </p>
  )
}

/**
 * A linguagem do servidor, lembrada neste navegador: quem configura volta a tela e
 * encontra a dele aberta. Sem armazenamento, comeca no Node e vale para esta visita.
 */
const LINGUAGEM_GUARDADA = 'pds.web.linguagem-do-servidor.v1'

function useLinguagemDoServidor(): [Linguagem, (linguagem: Linguagem) => void] {
  const [linguagem, setLinguagem] = useState<Linguagem>(() => {
    try {
      const guardada = localStorage.getItem(LINGUAGEM_GUARDADA)
      return LINGUAGENS.some((item) => item.valor === guardada) ? (guardada as Linguagem) : 'node'
    } catch {
      return 'node'
    }
  })

  function escolher(proxima: Linguagem) {
    setLinguagem(proxima)
    try {
      localStorage.setItem(LINGUAGEM_GUARDADA, proxima)
    } catch {
      // Sem armazenamento, a escolha vale ate sair da tela.
    }
  }

  return [linguagem, escolher]
}

/** As linguagens dos exemplos de servidor, na ordem das abas, com o arquivo de cada uma. */
type Linguagem = ServerLanguage

const LINGUAGENS: readonly {
  valor: Linguagem
  nome: string
  arquivo: string
  /** O modelo da pagina, onde o script da Instalacao ganha o cracha. */
  pagina: string
  realce: CodeLanguage
}[] = [
  { valor: 'node', nome: 'Node', arquivo: 'cracha.js', pagina: 'pagina.ejs', realce: 'js' },
  { valor: 'php', nome: 'PHP', arquivo: 'cracha.php', pagina: 'pagina.php', realce: 'php' },
  {
    valor: 'python',
    nome: 'Python',
    arquivo: 'cracha.py',
    pagina: 'pagina.html',
    realce: 'python',
  },
  { valor: 'csharp', nome: 'C#', arquivo: 'Relato.cs', pagina: 'Pagina.cshtml', realce: 'csharp' },
  { valor: 'java', nome: 'Java', arquivo: 'Relato.java', pagina: 'pagina.html', realce: 'java' },
  { valor: 'go', nome: 'Go', arquivo: 'cracha.go', pagina: 'pagina.html', realce: 'go' },
]

const COMANDOS_DAS_CHAVES =
  'openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out relatofacil-privada.pem\nopenssl ec -in relatofacil-privada.pem -pubout -out relatofacil-publica.pem'

/**
 * O modelo da pagina com o script da Instalacao e as linhas que a identidade acrescenta:
 * a primeira linha diz de onde vem o valor, e as novas chamam a funcao do passo anterior,
 * escrevem o resultado no script e somem para quem nao esta na conta. **O valor nunca e
 * colado por quem configura**: e o servidor que escreve, a cada pagina.
 */
function comScript(
  topo: readonly string[],
  novas: readonly string[],
  aud: string,
): { code: string; added: number[] } {
  const linhas = [
    ...topo,
    '<script',
    `  src="${LOADER_URL}"`,
    `  data-key="${aud}"`,
    ...novas.map((linha) => `  ${linha}`),
    '  defer></script>',
  ]
  // As novas vem depois do topo, do `<script`, do `src` e do `data-key`.
  const antes = topo.length + 3
  return { code: linhas.join('\n'), added: novas.map((_, indice) => antes + indice + 1) }
}

/** A assinatura simples na pagina, no modelo mais comum de cada linguagem. */
function paginaHmac(linguagem: Linguagem, aud: string) {
  switch (linguagem) {
    case 'node':
      return comScript(
        [
          '<%# cracha = crachaDeRelato(usuario), vindo da rota do Express,',
          '    ou null para quem não está na conta %>',
        ],
        [
          '<% if (cracha) { %>',
          '  data-user-id="<%= cracha.id %>"',
          '  data-user-name="<%= cracha.nome %>"',
          '  data-user-expires="<%= cracha.expira %>"',
          '  data-user-signature="<%= cracha.assinatura %>"',
          '<% } %>',
        ],
        aud,
      )
    case 'php':
      return comScript(
        ['<?php /* $usuario é quem está na conta,', '         ou null para quem não está */ ?>'],
        [
          '<?php if ($usuario): $cracha = crachaDeRelato($usuario); ?>',
          `  data-user-id="<?= htmlspecialchars($cracha['id']) ?>"`,
          `  data-user-name="<?= htmlspecialchars($cracha['nome'] ?? '') ?>"`,
          `  data-user-expires="<?= $cracha['expira'] ?>"`,
          `  data-user-signature="<?= $cracha['assinatura'] ?>"`,
          '<?php endif; ?>',
        ],
        aud,
      )
    case 'python':
      return comScript(
        [
          '{# cracha = cracha_de_relato(usuario), vindo da view #}',
          '{# ou None para quem não está na conta #}',
        ],
        [
          '{% if cracha %}',
          '  data-user-id="{{ cracha.id }}"',
          '  {% if cracha.nome %}data-user-name="{{ cracha.nome }}"{% endif %}',
          '  data-user-expires="{{ cracha.expira }}"',
          '  data-user-signature="{{ cracha.assinatura }}"',
          '{% endif %}',
        ],
        aud,
      )
    case 'csharp':
      return comScript(
        [
          '@* Model.Cracha = Relato.CrachaDeRelato(...), ou null para quem não está',
          '   na conta, e aí os valores ficam vazios *@',
        ],
        [
          'data-user-id="@Model.Cracha?.Id"',
          'data-user-expires="@Model.Cracha?.Expira"',
          'data-user-signature="@Model.Cracha?.Assinatura"',
        ],
        aud,
      )
    case 'java':
      return comScript(
        [
          '<!--/* cracha = Relato.crachaDeRelato(...), no model do controller,',
          '     ou null para quem não está na conta */-->',
        ],
        [
          `th:data-user-id="\${cracha?.id()}"`,
          `th:data-user-expires="\${cracha?.expira()}"`,
          `th:data-user-signature="\${cracha?.assinatura()}"`,
        ],
        aud,
      )
    case 'go':
      return comScript(
        [
          '{{/* .Cracha = CrachaDeRelato(...), vindo do handler,',
          '     ou nil para quem não está na conta */}}',
        ],
        [
          '{{with .Cracha}}',
          '  data-user-id="{{.ID}}"',
          '  data-user-expires="{{.Expira}}"',
          '  data-user-signature="{{.Assinatura}}"',
          '{{end}}',
        ],
        aud,
      )
  }
}

/** O crachá JWT na pagina, no modelo mais comum de cada linguagem. */
function paginaJwt(linguagem: Linguagem, aud: string) {
  switch (linguagem) {
    case 'node':
      return comScript(
        [
          '<%# cracha = await crachaDeRelato(usuario), vindo da rota do Express,',
          '    ou null para quem não está na conta %>',
        ],
        ['<% if (cracha) { %>', '  data-identity="<%= cracha %>"', '<% } %>'],
        aud,
      )
    case 'php':
      return comScript(
        ['<?php /* $usuario é quem está na conta,', '         ou null para quem não está */ ?>'],
        [
          '<?php if ($usuario): ?>',
          '  data-identity="<?= crachaDeRelato($usuario) ?>"',
          '<?php endif; ?>',
        ],
        aud,
      )
    case 'python':
      return comScript(
        [
          '{# cracha = cracha_de_relato(usuario), vindo da view #}',
          '{# ou None para quem não está na conta #}',
        ],
        ['{% if cracha %}', '  data-identity="{{ cracha }}"', '{% endif %}'],
        aud,
      )
    case 'csharp':
      return comScript(
        [
          '@* Model.Cracha = Relato.CrachaDeRelato(...), ou null para quem não está',
          '   na conta, e aí o valor fica vazio *@',
        ],
        ['data-identity="@Model.Cracha"'],
        aud,
      )
    case 'java':
      return comScript(
        [
          '<!--/* cracha = Relato.crachaDeRelato(...), no model do controller,',
          '     ou null para quem não está na conta */-->',
        ],
        [`th:data-identity="\${cracha}"`],
        aud,
      )
    case 'go':
      return comScript(
        [
          '{{/* .Cracha = CrachaDeRelato(...), vindo do handler,',
          '     ou vazio para quem não está na conta */}}',
        ],
        ['{{if .Cracha}}', '  data-identity="{{.Cracha}}"', '{{end}}'],
        aud,
      )
  }
}

/**
 * A assinatura simples em cada linguagem: HMAC-SHA256 de `id.expira`, em hexadecimal, com
 * a chave secreta lida do ambiente. E a mesma conta que a API confere.
 */
function exemploHmac(linguagem: Linguagem, minutos: number): string {
  switch (linguagem) {
    case 'node':
      return `import { createHmac } from 'node:crypto'\n\nexport function crachaDeRelato(usuario) {\n  const id = String(usuario.id)\n  const expira = Math.floor(Date.now() / 1000) + ${minutos} * 60\n  const assinatura = createHmac('sha256', process.env.RELATOFACIL_SECRET)\n    .update(\`\${id}.\${expira}\`)\n    .digest('hex')\n  return { id, nome: usuario.nome, expira, assinatura }\n}`
    case 'php':
      return `<?php\nfunction crachaDeRelato($usuario): array\n{\n    $id = (string) $usuario->id;\n    $expira = time() + ${minutos} * 60;\n    $assinatura = hash_hmac('sha256', $id . '.' . $expira, getenv('RELATOFACIL_SECRET'));\n\n    return ['id' => $id, 'nome' => $usuario->nome, 'expira' => $expira, 'assinatura' => $assinatura];\n}`
    case 'python':
      return `import hashlib\nimport hmac\nimport os\nimport time\n\n\ndef cracha_de_relato(usuario):\n    id = str(usuario.id)\n    expira = int(time.time()) + ${minutos} * 60\n    assinatura = hmac.new(\n        os.environ["RELATOFACIL_SECRET"].encode(),\n        f"{id}.{expira}".encode(),\n        hashlib.sha256,\n    ).hexdigest()\n    return {"id": id, "nome": usuario.nome, "expira": expira, "assinatura": assinatura}`
    case 'csharp':
      return `using System.Security.Cryptography;\nusing System.Text;\n\npublic static class Relato\n{\n    public static (string Id, long Expira, string Assinatura) CrachaDeRelato(string usuarioId)\n    {\n        var expira = DateTimeOffset.UtcNow.AddMinutes(${minutos}).ToUnixTimeSeconds();\n        var segredo = Encoding.UTF8.GetBytes(Environment.GetEnvironmentVariable("RELATOFACIL_SECRET")!);\n        var assinatura = Convert.ToHexString(\n            HMACSHA256.HashData(segredo, Encoding.UTF8.GetBytes($"{usuarioId}.{expira}"))).ToLowerInvariant();\n        return (usuarioId, expira, assinatura);\n    }\n}`
    case 'java':
      return `package com.seusistema; // troque pelo pacote do seu sistema\n\nimport java.nio.charset.StandardCharsets;\nimport java.security.GeneralSecurityException;\nimport java.util.HexFormat;\nimport javax.crypto.Mac;\nimport javax.crypto.spec.SecretKeySpec;\n\npublic class Relato {\n    public record Cracha(String id, long expira, String assinatura) {}\n\n    public static Cracha crachaDeRelato(String usuarioId) {\n        long expira = System.currentTimeMillis() / 1000 + ${minutos} * 60;\n        try {\n            Mac mac = Mac.getInstance("HmacSHA256");\n            mac.init(new SecretKeySpec(\n                System.getenv("RELATOFACIL_SECRET").getBytes(StandardCharsets.UTF_8), "HmacSHA256"));\n            String assinatura = HexFormat.of().formatHex(\n                mac.doFinal((usuarioId + "." + expira).getBytes(StandardCharsets.UTF_8)));\n            return new Cracha(usuarioId, expira, assinatura);\n        } catch (GeneralSecurityException erro) {\n            throw new IllegalStateException(erro);\n        }\n    }\n}`
    case 'go':
      return `package main // troque pelo pacote do seu sistema, se for outro\n\nimport (\n\t"crypto/hmac"\n\t"crypto/sha256"\n\t"encoding/hex"\n\t"fmt"\n\t"os"\n\t"time"\n)\n\ntype Cracha struct {\n\tID         string\n\tExpira     int64\n\tAssinatura string\n}\n\nfunc CrachaDeRelato(usuarioID string) *Cracha {\n\texpira := time.Now().Add(${minutos} * time.Minute).Unix()\n\tmac := hmac.New(sha256.New, []byte(os.Getenv("RELATOFACIL_SECRET")))\n\tmac.Write([]byte(fmt.Sprintf("%s.%d", usuarioID, expira)))\n\treturn &Cracha{ID: usuarioID, Expira: expira, Assinatura: hex.EncodeToString(mac.Sum(nil))}\n}`
  }
}

/** O JWT ES256 em cada linguagem, com a biblioteca mais comum dela. */
function exemploJwt(linguagem: Linguagem, aud: string, minutos: number): string {
  switch (linguagem) {
    case 'node':
      return `// npm install jose\nimport { readFileSync } from 'node:fs'\nimport { importPKCS8, SignJWT } from 'jose'\n\nconst privada = await importPKCS8(readFileSync('relatofacil-privada.pem', 'utf8'), 'ES256')\n\nexport function crachaDeRelato(usuario) {\n  return new SignJWT({ name: usuario.nome })\n    .setProtectedHeader({ alg: 'ES256' })\n    .setSubject(String(usuario.id))\n    .setAudience('${aud}')\n    .setIssuedAt()\n    .setExpirationTime('${minutos}m')\n    .sign(privada)\n}`
    case 'php':
      return `<?php\n// composer require firebase/php-jwt\nuse Firebase\\JWT\\JWT;\n\nfunction crachaDeRelato($usuario): string\n{\n    // a chave fica uma pasta acima desta, fora da pasta pública do site\n    $privada = file_get_contents(__DIR__ . '/../relatofacil-privada.pem');\n\n    return JWT::encode([\n        'sub' => (string) $usuario->id,\n        'name' => $usuario->nome,\n        'aud' => '${aud}',\n        'iat' => time(),\n        'exp' => time() + ${minutos} * 60,\n    ], $privada, 'ES256');\n}`
    case 'python':
      return `# pip install "pyjwt[crypto]"\nimport time\n\nimport jwt\n\nwith open("relatofacil-privada.pem") as arquivo:\n    PRIVADA = arquivo.read()\n\n\ndef cracha_de_relato(usuario):\n    agora = int(time.time())\n    return jwt.encode(\n        {\n            "sub": str(usuario.id),\n            "name": usuario.nome,\n            "aud": "${aud}",\n            "iat": agora,\n            "exp": agora + ${minutos} * 60,\n        },\n        PRIVADA,\n        algorithm="ES256",\n    )`
    case 'csharp':
      return `// dotnet add package System.IdentityModel.Tokens.Jwt\nusing System.IdentityModel.Tokens.Jwt;\nusing System.Security.Claims;\nusing System.Security.Cryptography;\nusing Microsoft.IdentityModel.Tokens;\n\npublic static class Relato\n{\n    // A chave privada importada UMA vez, ao subir, e nunca descartada: a biblioteca\n    // guarda um provedor de assinatura por chave, e dispor o ECDsa quebraria a segunda chamada.\n    static readonly ECDsa Chave = ImportarChave(System.IO.File.ReadAllText("relatofacil-privada.pem"));\n\n    static ECDsa ImportarChave(string pem)\n    {\n        var ecdsa = ECDsa.Create();\n        ecdsa.ImportFromPem(pem);\n        return ecdsa;\n    }\n\n    public static string CrachaDeRelato(string usuarioId, string? nome)\n    {\n        var claims = new List<Claim> { new("sub", usuarioId) };\n        if (nome is not null) claims.Add(new("name", nome));\n\n        var token = new JwtSecurityToken(\n            audience: "${aud}",\n            claims: claims,\n            expires: DateTime.UtcNow.AddMinutes(${minutos}),\n            signingCredentials: new SigningCredentials(\n                new ECDsaSecurityKey(Chave), SecurityAlgorithms.EcdsaSha256));\n\n        return new JwtSecurityTokenHandler().WriteToken(token);\n    }\n}`
    case 'java':
      return `package com.seusistema; // troque pelo pacote do seu sistema\n\n// pom.xml: jjwt-api, jjwt-impl e jjwt-jackson (io.jsonwebtoken), versão 0.12.6\nimport io.jsonwebtoken.Jwts;\nimport java.nio.file.Files;\nimport java.nio.file.Path;\nimport java.security.KeyFactory;\nimport java.security.PrivateKey;\nimport java.security.spec.PKCS8EncodedKeySpec;\nimport java.time.Instant;\nimport java.util.Base64;\nimport java.util.Date;\n\npublic class Relato {\n    // A chave privada lida uma vez só, na primeira vez que a classe é usada.\n    private static final PrivateKey PRIVADA = lerPrivada();\n\n    private static PrivateKey lerPrivada() {\n        try {\n            String pem = Files.readString(Path.of("relatofacil-privada.pem"))\n                .replaceAll("-----(BEGIN|END) PRIVATE KEY-----", "")\n                .replaceAll("\\\\s", "");\n            return KeyFactory.getInstance("EC")\n                .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(pem)));\n        } catch (Exception erro) {\n            throw new IllegalStateException("Não deu para ler relatofacil-privada.pem", erro);\n        }\n    }\n\n    public static String crachaDeRelato(String usuarioId, String nome) {\n        Instant agora = Instant.now();\n        return Jwts.builder()\n            .subject(usuarioId)\n            .claim("name", nome)\n            .audience().add("${aud}").and()\n            .issuedAt(Date.from(agora))\n            .expiration(Date.from(agora.plusSeconds(${minutos} * 60)))\n            .signWith(PRIVADA, Jwts.SIG.ES256)\n            .compact();\n    }\n}`
    case 'go':
      return `package main // troque pelo pacote do seu sistema, se for outro\n\n// go get github.com/golang-jwt/jwt/v5\nimport (\n\t"os"\n\t"time"\n\n\t"github.com/golang-jwt/jwt/v5"\n)\n\nfunc CrachaDeRelato(usuarioID, nome string) (string, error) {\n\tpem, err := os.ReadFile("relatofacil-privada.pem")\n\tif err != nil {\n\t\treturn "", err\n\t}\n\tprivada, err := jwt.ParseECPrivateKeyFromPEM(pem)\n\tif err != nil {\n\t\treturn "", err\n\t}\n\tagora := time.Now()\n\treturn jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{\n\t\t"sub":  usuarioID,\n\t\t"name": nome,\n\t\t"aud":  "${aud}",\n\t\t"iat":  agora.Unix(),\n\t\t"exp":  agora.Add(${minutos} * time.Minute).Unix(),\n\t}).SignedString(privada)\n}`
  }
}

/**
 * O que fazer com o exemplo na linguagem escolhida: instalar a biblioteca (no JWT), criar
 * o arquivo, o que trocar nele e onde chamar a funcao. **Muda junto com a aba do editor**,
 * e cada comando vem pronto para copiar: quem configura muitas vezes nao programa nessa
 * linguagem, e o arquivo sozinho nao diz onde ele entra.
 */
function ComoUsar({ linguagem, hmac }: { linguagem: Linguagem; hmac: boolean }) {
  const item =
    LINGUAGENS.find((opcao) => opcao.valor === linguagem) ??
    (LINGUAGENS[0] as (typeof LINGUAGENS)[number])
  return (
    <section
      aria-label={`Como usar em ${item.nome}`}
      className="rounded-lg border border-border bg-surface px-4 py-3 max-sm:px-3"
    >
      <p className="flex items-center gap-2 font-medium text-fg">
        <LanguageIcon language={linguagem} className="size-4" />
        Como usar em {item.nome}
      </p>
      <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 marker:font-medium marker:text-fg max-sm:pl-4">
        {passosDeUso(linguagem, hmac, item.arquivo).map((passo, indice) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a lista de cada linguagem e fixa
          <li key={indice} className="pl-1">
            {passo}
          </li>
        ))}
      </ol>
    </section>
  )
}

const c = (texto: string) => <code className="font-mono text-fg wrap-anywhere">{texto}</code>

/** Um comando de terminal com o copiar ao lado. */
function Comando({ valor }: { valor: string }) {
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-2">
      <code className="rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-fg wrap-anywhere">
        {valor}
      </code>
      <CopyButton
        value={valor}
        size="sm"
        variant="secondary"
        label="Copiar o comando"
        // `max-sm:pointer-coarse:h-auto`: no toque o `Button` fixa 44 depois do `max-sm:`.
        className="max-sm:h-auto max-sm:min-h-11 max-sm:max-w-full max-sm:py-2 max-sm:pointer-coarse:h-auto"
      />
    </span>
  )
}

const DEPENDENCIAS_DO_JJWT = ['jjwt-api', 'jjwt-impl', 'jjwt-jackson']
  .map(
    (artefato, indice) =>
      `<dependency>\n  <groupId>io.jsonwebtoken</groupId>\n  <artifactId>${artefato}</artifactId>\n  <version>0.12.6</version>${indice > 0 ? '\n  <scope>runtime</scope>' : ''}\n</dependency>`,
  )
  .join('\n')

/** Os passos de cada linguagem, uma frase cada. */
function passosDeUso(linguagem: Linguagem, hmac: boolean, arquivo: string): ReactNode[] {
  const instalar = (comando: string) =>
    hmac ? null : (
      <>
        Instale a biblioteca no seu servidor.
        <Comando valor={comando} />
      </>
    )
  const criar = <>Crie o arquivo {c(arquivo)} no seu servidor, com o código abaixo.</>
  const chave = hmac ? (
    <>O código lê a chave de {c('RELATOFACIL_SECRET')}, a variável de ambiente do passo 1.</>
  ) : (
    <>
      Deixe o {c('relatofacil-privada.pem')} na pasta principal do sistema, de onde ele roda, e
      nunca numa pasta que o site publica.
    </>
  )
  const passos: ReactNode[] = []
  switch (linguagem) {
    case 'node':
      passos.push(instalar('npm install jose'), criar, chave)
      passos.push(
        <>
          Na rota que monta a página, chame{' '}
          {c(hmac ? 'crachaDeRelato(usuario)' : 'await crachaDeRelato(usuario)')} para quem está na
          conta e mande o resultado para a página como {c('cracha')}.
        </>,
      )
      break
    case 'php':
      passos.push(instalar('composer require firebase/php-jwt'), criar)
      passos.push(
        hmac ? (
          chave
        ) : (
          <>
            Deixe o {c('relatofacil-privada.pem')} uma pasta acima do {c(arquivo)}, fora da pasta
            pública do site, porque ali ninguém consegue baixá-lo.
          </>
        ),
      )
      passos.push(
        hmac ? (
          <>No começo da página, inclua o arquivo com {c("require 'cracha.php';")}.</>
        ) : (
          <>
            No começo da página, inclua o Composer e o arquivo com{' '}
            {c("require 'vendor/autoload.php';")} e {c("require 'cracha.php';")}, se o sistema ainda
            não carrega o Composer.
          </>
        ),
      )
      break
    case 'python':
      passos.push(instalar('pip install "pyjwt[crypto]"'), criar, chave)
      passos.push(
        <>
          Na view que monta a página, importe com {c('from cracha import cracha_de_relato')} e mande{' '}
          {c('cracha_de_relato(usuario)')} para a página como {c('cracha')}.
        </>,
      )
      break
    case 'csharp':
      passos.push(instalar('dotnet add package System.IdentityModel.Tokens.Jwt'), criar, chave)
      passos.push(
        <>
          Na página ou no controller, guarde{' '}
          {c(hmac ? 'Relato.CrachaDeRelato(id)' : 'Relato.CrachaDeRelato(id, nome)')} em{' '}
          {c('Cracha')} para quem está na conta.
        </>,
      )
      break
    case 'java':
      passos.push(
        hmac ? null : (
          <>
            Acrescente ao seu {c('pom.xml')} as três dependências do jjwt.
            <span className="mt-1.5 flex">
              <CopyButton
                value={DEPENDENCIAS_DO_JJWT}
                size="sm"
                variant="secondary"
                label="Copiar as dependências"
              />
            </span>
          </>
        ),
        <>Crie o arquivo {c(arquivo)} na pasta do seu pacote, com o código abaixo.</>,
        <>Troque a primeira linha, {c('package com.seusistema;')}, pelo pacote do seu sistema.</>,
        chave,
        <>
          No controller, mande{' '}
          {c(hmac ? 'Relato.crachaDeRelato(id)' : 'Relato.crachaDeRelato(id, nome)')} para a página
          com {c('model.addAttribute("cracha", ...)')}.
        </>,
      )
      break
    case 'go':
      passos.push(
        instalar('go get github.com/golang-jwt/jwt/v5'),
        criar,
        <>Se o seu pacote não for o {c('main')}, troque a primeira linha pelo nome dele.</>,
        chave,
        <>
          No handler, mande {c(hmac ? 'CrachaDeRelato(id)' : 'CrachaDeRelato(id, nome)')} para a
          página como {c('Cracha')}
          {hmac ? '.' : ', e trate o erro que ela pode devolver.'}
        </>,
      )
      break
  }
  return passos.filter((passo) => passo !== null)
}

/**
 * A pagina montada no navegador (React, Vue, Angular) nao tem modelo no servidor: ela pede
 * o cracha a propria API e escreve no script pelo JavaScript. Funciona porque o carregador
 * le o script **a cada abertura** do formulario, e nao so ao carregar.
 */
function PaginaNoNavegador({ hmac }: { hmac: boolean }) {
  return (
    <details>
      {/* No toque o resumo ganha 12 em cima e embaixo sem mover nada: numa linha so, o
          alvo tinha 20. */}
      <summary className="cursor-pointer text-fg transition-colors hover:text-fg-muted pointer-coarse:-my-3 pointer-coarse:py-3">
        A sua página é montada no navegador, com React, Vue ou Angular?
      </summary>
      <div className="mt-2.5 flex flex-col gap-2.5">
        <p>
          Peça o {hmac ? 'resultado da função' : 'crachá'} à sua API depois do login e escreva no
          script pelo JavaScript, porque o formulário lê o script a cada vez que abre.
        </p>
        <CodeEditor
          className={CODIGO_NO_CELULAR}
          files={[
            {
              id: 'navegador',
              name: 'relato.js',
              language: 'js',
              code: hmac ? NAVEGADOR_HMAC : NAVEGADOR_JWT,
            },
          ]}
        />
      </div>
    </details>
  )
}

const NAVEGADOR_JWT = `// depois do login, e de novo antes de o crachá vencer
const script = document.querySelector('script[data-key]')
const resposta = await fetch('/api/cracha-de-relato') // a sua rota, que chama a função do passo 3
script.dataset.identity = await resposta.text()

// ao sair da conta
delete script.dataset.identity`

const NAVEGADOR_HMAC = `// depois do login, e de novo antes de vencer
const script = document.querySelector('script[data-key]')
const resposta = await fetch('/api/cracha-de-relato') // a sua rota, que chama a função do passo 2
const cracha = await resposta.json() // { id, nome, expira, assinatura }
script.dataset.userId = cracha.id
script.dataset.userName = cracha.nome ?? ''
script.dataset.userExpires = String(cracha.expira)
script.dataset.userSignature = cracha.assinatura

// ao sair da conta
for (const campo of ['userId', 'userName', 'userExpires', 'userSignature']) {
  delete script.dataset[campo]
}`

/**
 * O aviso de nao colar um segundo script: com duas copias na pagina, so a primeira vale
 * (ver `start` no carregador), e o que foi na segunda fica de fora sem erro nenhum. Quem
 * configura muitas vezes nao e tecnico, e colar o trecho inteiro de novo e o engano comum.
 */
function UmScriptSo({ perda }: { perda: string }) {
  return (
    <p className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-warn-fg">
      Não cole um segundo script na página, porque só o primeiro vale e {perda}.
    </p>
  )
}

/**
 * Um passo numerado: o numero num circulo, a linha ate o passo de baixo e o conteudo ao
 * lado. **So o passo da chave publica sabe se esta feito** (`feito`), porque e o unico
 * que mora aqui; os outros acontecem no sistema do cliente, e um "feito" neles seria
 * palpite.
 */
function Passo({
  id,
  numero,
  titulo,
  feito,
  ultimo = false,
  children,
}: {
  id?: string
  numero: number
  titulo: string
  /** Verdadeiro mostra o certo no lugar do numero. Ausente, o passo nao tem como saber. */
  feito?: boolean
  ultimo?: boolean
  children: ReactNode
}) {
  return (
    <li id={id} className="flex scroll-mt-6 gap-3 max-sm:gap-2">
      <div className="flex flex-none flex-col items-center">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-6 items-center justify-center rounded-full border font-medium text-caption transition-colors duration-200',
            feito ? 'border-transparent bg-accent text-accent-fg' : 'border-border text-fg',
          )}
        >
          {feito ? (
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
              <path
                d="m3.5 8.5 3 3 6-7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            numero
          )}
        </span>
        {!ultimo && <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col gap-2.5', !ultimo && 'pb-6')}>
        <h4 className="pt-0.5 font-medium text-detail text-fg">
          <span className="sr-only">
            Passo {numero}
            {feito ? ', feito' : ''}:{' '}
          </span>
          {titulo}
        </h4>
        <div className="flex flex-col gap-2.5 text-caption text-fg-muted leading-relaxed">
          {children}
        </div>
      </div>
    </li>
  )
}

function modoDe(valor: ReporterIdentityMode): Modo {
  return MODOS.find((modo) => modo.valor === valor) ?? (MODOS[0] as Modo)
}

/** Uma amostra de uma linha do texto, para o titulo do grupo fechado. */
function resumir(texto: string, limite = 70): string {
  const limpo = texto.trim().replace(/\s+/g, ' ')
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo
}

/**
 * O que a escolha marcada destrava, custa ou mostra — so a dela. **Fala quando muda**
 * (`aria-live`): quem escolhe pelas setas ouve o que a nova escolha traz sem ter de sair
 * do grupo de escolhas para procurar.
 */
function Escolha({
  titulo,
  resumo,
  linhas,
}: {
  titulo: string
  resumo: string
  linhas: ReadonlyArray<[string, string]>
}) {
  return (
    <div aria-live="polite" className="mt-3 rounded-lg border border-border bg-surface p-3.5">
      <p className="mb-1 font-medium text-detail text-fg">
        {titulo} <span className="font-normal text-fg-muted">({resumo})</span>
      </p>
      {linhas.map(([rotulo, texto]) => (
        <p key={rotulo} className="text-caption text-fg-muted leading-relaxed">
          <strong className="font-medium text-fg">{rotulo}</strong> {texto}
        </p>
      ))}
    </div>
  )
}

/** As variaveis e o que entra quando falta, recolhidos: quem ja sabe nao rola por eles. */
function ComoFuncionamAsVariaveis() {
  return (
    <HowItWorks className="mt-3">
      <p>
        Os botões de “Inserir” põem a variável onde está o cursor, como um bloco que sai inteiro, e
        ela vira o valor de cada relato.
      </p>
      <p>
        Com o primeiro nome no texto, aparece um campo para escolher o que entra quando a pessoa não
        disse o nome.
      </p>
    </HowItWorks>
  )
}

/**
 * A previa, presa a direita: **onde cada texto aparece**, em tres abas. A previa do
 * formulario nunca envia, e sem estas abas a confirmacao e o acompanhamento so seriam
 * vistos depois de um relato de verdade.
 *
 * **Abas, e nao escolhas de configuracao**: trocar so muda o que se ve aqui. A parte do
 * grupo ativo aparece contornada, como em Formulário.
 */
function Previa({
  aba,
  onAba,
  realce,
  dirty,
  ferramenta,
  modo,
  visibilidade,
  exemplo,
  jornada,
  jornadaFalhou,
  recarregarJornada,
}: {
  aba: Aba
  onAba: (aba: Aba) => void
  realce: Grupo | null
  dirty: boolean
  ferramenta: WidgetSettingsViewModel
  modo: ReporterIdentityMode
  visibilidade: ReportVisibility
  exemplo: WidgetTextValues & { protocolo: string }
  jornada: { stages: JourneyStage[]; atual: string | null } | null
  jornadaFalhou: boolean
  recarregarJornada: () => void
}) {
  const ids = useId()
  const atual = ABAS.find((item) => item.value === aba) ?? ABAS[0]

  function aoTeclar(event: KeyboardEvent<HTMLDivElement>) {
    const indice = ABAS.findIndex((item) => item.value === aba)
    const destino =
      event.key === 'ArrowRight'
        ? ABAS[(indice + 1) % ABAS.length]
        : event.key === 'ArrowLeft'
          ? ABAS[(indice - 1 + ABAS.length) % ABAS.length]
          : event.key === 'Home'
            ? ABAS[0]
            : event.key === 'End'
              ? ABAS[ABAS.length - 1]
              : undefined
    if (!destino) return
    event.preventDefault()
    onAba(destino.value)
    document.getElementById(`${ids}-${destino.value}`)?.focus()
  }

  return (
    <section
      id="previa"
      className="@container scroll-mt-6 rounded-xl border border-border bg-surface-raised p-5"
    >
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-fg text-lead">Prévia</h2>
        <span className="flex-none text-caption text-fg-muted">
          {dirty ? 'ainda não salvo' : 'igual ao que quem relata vê'}
        </span>
      </header>
      <p className="mb-4 text-detail text-fg-muted leading-relaxed">{atual?.dica}</p>

      <div
        role="tablist"
        aria-label="O que a prévia mostra"
        onKeyDown={aoTeclar}
        className="mb-3 inline-flex rounded-lg border border-border bg-surface p-0.5 @max-xs:grid @max-xs:w-full @max-xs:grid-cols-3"
      >
        {ABAS.map(({ value, label }) => {
          const escolhida = aba === value
          return (
            <button
              key={value}
              id={`${ids}-${value}`}
              type="button"
              role="tab"
              aria-selected={escolhida}
              aria-controls={`${ids}-painel`}
              tabIndex={escolhida ? 0 : -1}
              onClick={() => onAba(value)}
              className={cn(
                // No toque, 40 de altura em toda largura (no 768 a previa e larga e a aba
                // ficava com 28), como as abas de aparelho da previa do formulario.
                'flex h-7 items-center rounded-md px-2.5 text-detail transition-colors pointer-coarse:min-h-10',
                // Com a previa estreita (celular, ou a coluna ao lado das opcoes no 1024):
                // tres partes iguais, e o nome comprido hifeniza em vez de passar do cartao.
                '@max-xs:h-auto @max-xs:min-h-10 @max-xs:justify-center @max-xs:px-1 @max-xs:py-1 @max-xs:text-center @max-xs:hyphens-auto',
                escolhida ? 'bg-surface-sunken font-medium text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div id={`${ids}-painel`} role="tabpanel" aria-labelledby={`${ids}-${aba}`}>
        {aba === 'sistema' && (
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
            <div className={cn('flex flex-col gap-4', realce === 'confirmacao' && PREVIEW_OUTLINE)}>
              <SentConfirmation
                message={ferramenta.SuccessMessage}
                values={exemplo}
                trackingCode={exemplo.protocolo}
              />
            </div>
            {/* O que o modo acrescenta a confirmacao: o codigo para guardar, ou a frase do
                relato ligado a conta. No protocolo, nada — o link e a unica volta. */}
            {modo === 'PersonalCode' && (
              <div
                className={cn(
                  'rounded-lg border border-border bg-surface-raised p-4',
                  realce === 'reconhecimento' && PREVIEW_OUTLINE,
                )}
              >
                <p className="mb-1.5 text-detail text-fg-muted">O seu código</p>
                <p className="font-mono text-fg text-lead tracking-wide">H7QK-3M2X-P9WD</p>
              </div>
            )}
            {modo === 'InheritedIdentity' && (
              <p
                className={cn(
                  'text-caption text-fg-muted leading-normal',
                  realce === 'reconhecimento' && PREVIEW_OUTLINE,
                )}
              >
                Este relato ficou ligado a você: ele aparece em “Ver os meus relatos” sempre que
                você estiver na sua conta neste site.
              </p>
            )}
          </div>
        )}

        {aba === 'acompanhamento' && (
          <div className="rounded-lg border border-border bg-surface p-5">
            <p className="mb-1.5 font-semibold text-fg text-lead">Seu relato</p>
            <p className={cn('mb-5 text-body text-fg-muted', realce === 'topo' && PREVIEW_OUTLINE)}>
              {renderWidgetText(ferramenta.TrackingIntro, exemplo)}
            </p>
            {jornada ? (
              <PublicJourney stages={jornada.stages} currentId={jornada.atual} />
            ) : jornadaFalhou ? (
              <div className="rounded-lg border border-border border-dashed p-4">
                <p className="mb-3 text-detail text-fg-muted leading-relaxed">
                  Não deu para carregar o andamento deste projeto agora. O topo acima já é o de
                  verdade.
                </p>
                <Button size="sm" onClick={recarregarJornada}>
                  Tentar de novo
                </Button>
              </div>
            ) : (
              <Skeleton className="h-40 w-full rounded-xl" />
            )}
            <p className="mt-3 text-caption text-fg-muted">
              As etapas são as de{' '}
              <Link to="../public-stages" className="text-fg underline underline-offset-4">
                Andamento público
              </Link>
              .
            </p>
          </div>
        )}

        {aba === 'formulario' && (
          <FormularioComAviso
            ferramenta={ferramenta}
            visibilidade={visibilidade}
            realce={realce === 'aviso' || realce === 'visibilidade'}
          />
        )}
      </div>
    </section>
  )
}

/**
 * O comeco do formulario, desenhado aqui, com o aviso como o quadro mostra: **o texto do
 * projeto e a frase do nome, que vem da visibilidade e nao se edita** (`EmbedApp`). O
 * resto do formulario e so forma — quem muda o formulario e a tela Formulário.
 *
 * **Com o projeto privado, o aviso nao aparece**, e a previa diz isso em vez de mostrar
 * um aviso que ninguem vai ler.
 */
function FormularioComAviso({
  ferramenta,
  visibilidade,
  realce,
}: {
  ferramenta: WidgetSettingsViewModel
  visibilidade: ReportVisibility
  realce: boolean
}) {
  const publico = visibilidade !== 'Private'

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <p className="font-semibold text-fg text-lead">{ferramenta.Title}</p>

      {publico ? (
        <>
          <span className="-mt-1 self-start font-medium text-detail text-fg underline underline-offset-4">
            Ver o que já foi relatado
          </span>
          <p
            data-testid="aviso-no-formulario"
            className={cn(
              'rounded-lg border border-border border-dashed bg-surface px-3 py-2 text-detail text-fg-muted leading-normal',
              realce && PREVIEW_OUTLINE,
            )}
          >
            {ferramenta.PublicNotice}
            {visibilidade === 'PublicIdentified'
              ? ' O seu nome só aparece se você marcar abaixo.'
              : ' O seu nome nunca aparece.'}
          </p>
        </>
      ) : (
        <p
          className={cn(
            'rounded-lg bg-surface-sunken px-3 py-2 text-detail text-fg-muted leading-normal',
            realce && PREVIEW_OUTLINE,
          )}
        >
          Sem aviso: com o projeto privado, o formulário não mostra este texto. Ele aparece aqui
          quando a visibilidade for pública.
        </p>
      )}

      {/* O resto do formulario, so a forma: o que importa aqui e onde o aviso fica. */}
      <div aria-hidden className="flex flex-col gap-2.5">
        <div className="flex gap-2">
          <span className="h-7 w-20 rounded-lg border border-border" />
          <span className="h-7 w-24 rounded-lg border border-border" />
        </div>
        <span className="h-2 w-1/3 rounded-full bg-surface-strong" />
        <span className="h-20 w-full rounded-lg border border-border bg-surface-raised" />
        <span className="mt-1 flex h-8 items-center justify-center rounded-lg bg-accent text-accent-fg text-detail">
          {ferramenta.SubmitLabel}
        </span>
      </div>
    </div>
  )
}

/** O protocolo e um bilhete, o codigo pessoal uma chave, a identidade uma pessoa conferida. */
function DesenhoDoModo({ modo }: { modo: ReporterIdentityMode }) {
  return (
    <Desenho>
      {modo === 'Protocol' && (
        <>
          <path d="M5 6h22v4a2 2 0 0 0 0 4v4H5v-4a2 2 0 0 0 0-4Z" />
          <path d="M11 12h10" strokeDasharray="2 2" />
        </>
      )}
      {modo === 'PersonalCode' && (
        <>
          <circle cx="10" cy="12" r="4" />
          <path d="M14 12h13M23 12v3M26 12v3" />
        </>
      )}
      {modo === 'InheritedIdentity' && (
        <>
          <circle cx="13" cy="8.5" r="3.5" />
          <path d="M6 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5" />
          <circle cx="24" cy="15" r="4" />
          <path d="m22.2 15 1.3 1.3 2.4-2.6" />
        </>
      )}
    </Desenho>
  )
}
