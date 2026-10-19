import { type KeyboardEvent, type ReactNode, useCallback, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ReporterIdentityMode, ReportVisibility, WidgetSettingsViewModel } from '@/contracts'
import { WIDGET_TEXT_LIMITS } from '@/contracts'
import { projectKeyService, projectPublicStageService } from '@/data'
import { PREVIEW_OUTLINE } from '@/embed/previewOutline'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { HowItWorks } from '@/shared/components/HowItWorks'
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
import { LOADER_URL } from '@/shared/lib/loader'
import {
  renderWidgetText,
  SUCCESS_VARIABLES,
  TRACKING_VARIABLES,
  type WidgetTextValues,
} from '@/shared/lib/widgetText'

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
    emPalavras: 'Protocolo · ninguém é identificado',
    resumo: 'Ninguém é identificado.',
    explicacao:
      'O relato é tratado como se qualquer pessoa o tivesse enviado. Quem escreveu guarda o link e volta por ele — e o link é a única prova de que o relato é dela.',
    destrava:
      'Não há lista pessoal, e isso não é falta: sem saber quem é, não há como dizer quais relatos são dela.',
    custo: 'Nada. É o que funciona colando um script numa página.',
  },
  {
    valor: 'PersonalCode',
    titulo: 'Código pessoal',
    emPalavras: 'Código pessoal · a pessoa guarda um código',
    resumo: 'O sistema sorteia um código, e a pessoa guarda.',
    explicacao:
      'Algo como H7QK-3M2X-P9WD, no mesmo alfabeto do protocolo — sem 0, O, 1 e I, para ser lido em voz alta sem confusão. Navegador novo, outro aparelho: ela digita o código e reencontra os relatos dela.',
    destrava:
      'Lista pessoal, sem o cliente precisar ter login. O código soma ao link e não o substitui: perdê-lo custa a lista, não os relatos.',
    custo: 'Nada do seu lado. O custo é da pessoa, que tem mais uma coisa para guardar.',
  },
  {
    valor: 'InheritedIdentity',
    titulo: 'Identidade do seu sistema',
    emPalavras: 'Identidade do seu sistema · quem está na conta não digita nada',
    resumo: 'Quem já está na conta do seu sistema não digita nada.',
    explicacao:
      'O seu servidor diz quem é o usuário, assinando essa informação com uma chave que só ele tem — um crachá curto, dentro do script. Nós conferimos a assinatura com a chave pública que você cola aqui, sem nunca chamar o seu sistema, e guardamos da pessoa só um hash.',
    destrava:
      'Lista pessoal sem a pessoa guardar nada, e o nome já preenchido. Quem não está na conta ainda relata — como protocolo, se você permitir.',
    custo:
      'Uma rotina no seu servidor: gerar o crachá e colocá-lo no script. O passo a passo, com exemplos, está abaixo.',
  },
]

/**
 * Um dos tres niveis de visibilidade. **Diz quem ve, e nao so o nome do nivel**:
 * "Publico" e uma palavra que cada um entende de um jeito — e a diferenca entre "qualquer
 * pessoa" e "quem tem o link" e a diferenca entre um vazamento e um relato.
 */
interface Nivel {
  valor: ReportVisibility
  titulo: string
  emPalavras: string
  resumo: string
  explicacao: string
  quemVe: string
  custo: string
}

const NIVEIS: readonly Nivel[] = [
  {
    valor: 'Private',
    titulo: 'Privado',
    emPalavras: 'Privado · só quem relatou e o time',
    resumo: 'Só quem relatou e o time.',
    explicacao:
      'Cada relato é alcançável por quem tem o link dele, e por mais ninguém. Não existe página que liste relato de terceiro, e o protocolo de uma pessoa não abre o relato de outra.',
    quemVe: 'Quem relatou, pelo link dele. E o time, no quadro.',
    custo: 'Nada. É o que o projeto já faz hoje.',
  },
  {
    valor: 'PublicAnonymous',
    titulo: 'Público anônimo',
    emPalavras: 'Público anônimo · qualquer pessoa lê, sem o autor',
    resumo: 'Qualquer pessoa lê, e ninguém sabe quem escreveu.',
    explicacao:
      'O relato fica visível para quem entrar, sem nada que aponte para o autor. Serve para mostrar o que está sendo corrigido sem cada um ter de perguntar.',
    quemVe: 'Qualquer pessoa, inclusive quem nunca relatou nada.',
    custo:
      'Alguém do time libera cada relato antes de ele aparecer. O texto livre é onde vem documento, número de pedido e print com dado de outra pessoa.',
  },
  {
    valor: 'PublicIdentified',
    titulo: 'Público identificado',
    emPalavras: 'Público identificado · o autor aparece se quiser',
    resumo: 'Qualquer pessoa lê, e quem relatou aparece se quiser.',
    explicacao:
      'O mesmo do anônimo, com uma diferença: quem escreveu pode escolher assinar o relato. Aparecer continua sendo decisão dela, e não do projeto.',
    quemVe: 'Qualquer pessoa. O nome só aparece no relato em que o próprio autor marcou.',
    custo:
      'A mesma liberação do anônimo, e um modo que identifique — no protocolo não há identidade para mostrar.',
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
 * o formulario com o aviso. A aba acompanha o grupo aberto ou em foco, ate a pessoa
 * escolher uma; abrir outro grupo devolve a conducao a ele.
 *
 * **Dois rascunhos, um Salvar.** O modo e a visibilidade sao de Quem relata; os textos,
 * da ferramenta. O Salvar do titulo grava os dois em sequencia, cada um com o registro
 * inteiro e so os campos daqui mudados (`useSettingsDraft`), e o "Voltar ao padrão" de
 * cada grupo mexe so no rascunho dele.
 */
export function IdentityScreen() {
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

  /** O grupo aberto e o grupo em que a pessoa esta: o segundo vence, na previa. */
  const [aberto, setAberto] = useState<Grupo | null>(null)
  const [emFoco, setEmFoco] = useState<Grupo | null>(null)
  /** A aba que a pessoa escolheu. Vence o grupo ate outro grupo abrir. */
  const [abaEscolhida, setAbaEscolhida] = useState<Aba | null>(null)
  const ativo = emFoco ?? aberto
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
   * A identidade do sistema sem a chave: a API nao conferiria cracha nenhum, e o modo
   * gravado nao faria nada. E a unica coisa desta tela sem padrao de fabrica.
   */
  const faltaChave =
    draft !== null &&
    draft.Mode === 'InheritedIdentity' &&
    (draft.IdentityPublicKey ?? '').trim().length === 0
  const validadeInvalida = draft !== null && !validadeValida(draft.IdentityTokenMaxMinutes)
  const semComoSalvar = conflito || faltaChave || validadeInvalida

  async function salvar() {
    if (saving || semComoSalvar) return
    // Uma de cada vez: se a primeira falhar, a segunda nao vai, e o aviso e um so.
    if (quemRelata.dirty && !(await quemRelata.save())) return
    if (textos.dirty && !(await textos.save())) return
    toast.done('Quem relata: salvo.')
  }

  /** Liga o grupo a previa: aberto e em foco escolhem a aba e realcam a parte dele. */
  function acompanhar(grupo: Grupo) {
    return {
      onToggle: (abriu: boolean) => {
        setAberto((atual) => (abriu ? grupo : atual === grupo ? null : atual))
        // Abrir um grupo e um pedido claro de mudar de assunto: a previa volta a segui-lo.
        if (abriu) setAbaEscolhida(null)
      },
      onFocusWithin: (dentro: boolean) =>
        setEmFoco((atual) => (dentro ? grupo : atual === grupo ? null : atual)),
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
      <MovedAnchors moved={MUDARAM_DE_TELA} />

      <SettingsHeader
        title="Quem relata"
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
            ]}
            // A chave fica: ela e do sistema do cliente, e nao uma escolha com padrao.
            onReset={() =>
              quemRelata.change({
                Mode: DEFAULT_WIDGET_SETTINGS.IdentityMode,
                ...IDENTITY_DEFAULTS,
              })
            }
            defaultOpen
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
            id="visibilidade"
            title="Visibilidade"
            value={
              conflito ? (
                <span className="text-warn-fg">
                  {nivelDe(draft.Visibility).titulo} · não combina com o protocolo
                </span>
              ) : (
                nivelDe(draft.Visibility).emPalavras
              )
            }
            changes={draft.Visibility !== DEFAULT_WIDGET_SETTINGS.Visibility ? ['Nível'] : []}
            onReset={() => quemRelata.change({ Visibility: DEFAULT_WIDGET_SETTINGS.Visibility })}
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
 * O que a identidade do sistema pede do cliente: a chave, a validade do cracha e o que
 * fazer sem ele — e, dobrado, como gerar o cracha no servidor dele.
 *
 * **A chave e a unica coisa aqui sem padrao**, e por isso trava o salvar: sem ela a API
 * nao confere cracha nenhum, e o modo gravado nao faria nada. A validade e o "sem cracha"
 * tem padrao de fabrica, como tudo o mais.
 */
function ChaveDoSistema({
  chave,
  onChave,
  validade,
  onValidade,
  obrigatorio,
  onObrigatorio,
  chaveDoProjeto,
}: {
  chave: string
  onChave: (chave: string) => void
  validade: number
  onValidade: (minutos: number) => void
  obrigatorio: boolean
  onObrigatorio: (obrigatorio: boolean) => void
  /** A chave publica do projeto, para os exemplos. Vazia enquanto nao carregou. */
  chaveDoProjeto: string
}) {
  const semChave = chave.trim().length === 0
  const validadeInvalida = !validadeValida(validade)

  return (
    <div className="mt-3 flex flex-col gap-5 rounded-lg border border-border bg-surface p-3.5">
      <div id="chave-publica" className="scroll-mt-6">
        <label htmlFor="chave-do-sistema" className="mb-1.5 block text-detail text-fg-muted">
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
        <p className="mt-1.5 text-caption text-fg-muted leading-relaxed">
          ECDSA P-256, em PEM ou em base64 numa linha.{' '}
          <strong className="font-medium text-fg">Só a pública</strong>: a privada fica no seu
          servidor e nunca sai dele.
          {semChave && ' Sem a chave, este modo não salva.'}
        </p>
      </div>

      <div id="validade-do-cracha" className="scroll-mt-6">
        <div className="mb-1.5 text-detail text-fg-muted">Validade máxima do crachá</div>
        <div className="flex items-center gap-2">
          <NumberField
            id="validade-do-cracha-minutos"
            min={IDENTITY_TOKEN_MINUTES.min}
            max={IDENTITY_TOKEN_MINUTES.max}
            value={validade}
            invalid={validadeInvalida}
            ariaLabel="Validade máxima do crachá, em minutos"
            // Campo vazio vira zero, que a conta recusa: apagar tudo para digitar outro
            // numero e o gesto comum, e `NaN` quebraria a comparacao do rascunho.
            onChange={(texto) => onValidade(Number.parseInt(texto, 10) || 0)}
          />
          <span className="text-detail text-fg-muted">minutos</span>
        </div>
        <p className="mt-1.5 text-caption text-fg-muted leading-relaxed">
          {validadeInvalida
            ? `Entre ${IDENTITY_TOKEN_MINUTES.min} e ${IDENTITY_TOKEN_MINUTES.max} minutos.`
            : 'Crachá que vale por mais tempo é recusado: ele é dedicado a relatar, e não o login do seu usuário. Se a sessão renovar sem recarregar a página, o site troca o atributo.'}
        </p>
      </div>

      <div id="sem-cracha" className="scroll-mt-6">
        <Check
          checked={obrigatorio}
          onChange={onObrigatorio}
          label="Exigir o crachá: sem ele, recusar o relato e pedir para entrar na conta"
        />
        <p className="mt-1.5 text-caption text-fg-muted leading-relaxed">
          {obrigatorio
            ? 'Quem não está na conta lê “entre na sua conta para relatar”, e nada entra sem crachá.'
            : 'Quem não está na conta ainda relata, como protocolo e sem lista pessoal. É o padrão.'}
        </p>
      </div>

      <ComoGerarOCracha
        chaveDoProjeto={chaveDoProjeto}
        validade={validadeInvalida ? IDENTITY_DEFAULTS.IdentityTokenMaxMinutes : validade}
      />
    </div>
  )
}

/**
 * Como o servidor do cliente gera o cracha, dobrado: as chaves, as claims, a linha do
 * script e um exemplo em duas linguagens, com a chave publica deste projeto ja no lugar.
 *
 * **E o unico lugar em que isto esta escrito**, e o criterio e o da tela inteira: quem le
 * monta a integracao sem saber o que e JWT antes de comecar.
 */
function ComoGerarOCracha({
  chaveDoProjeto,
  validade,
}: {
  chaveDoProjeto: string
  validade: number
}) {
  const aud = chaveDoProjeto || 'pk_…'
  const chaves =
    'openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out pds-privada.pem\nopenssl ec -in pds-privada.pem -pubout -out pds-publica.pem'
  const claims = `{\n  "sub": "<o id do usuário no seu sistema>",\n  "name": "Ana",\n  "aud": "${aud}",\n  "exp": <agora + até ${validade} min>\n}`
  const script = `<script\n  src="${LOADER_URL}"\n  data-key="${aud}"\n  data-identity="<o crachá que o seu servidor gerou>"\n  defer></script>`
  const js = `import { importPKCS8, SignJWT } from 'jose'\n\nconst privada = await importPKCS8(process.env.PDS_PRIVATE_KEY, 'ES256')\n\nexport function crachaDeRelato(usuario) {\n  return new SignJWT({ name: usuario.nome })\n    .setProtectedHeader({ alg: 'ES256' })\n    .setSubject(String(usuario.id))\n    .setAudience('${aud}')\n    .setIssuedAt()\n    .setExpirationTime('${validade}m')\n    .sign(privada)\n}`
  const cs = `using System.IdentityModel.Tokens.Jwt;\nusing System.Security.Claims;\nusing System.Security.Cryptography;\nusing Microsoft.IdentityModel.Tokens;\n\n// A chave privada importada UMA vez, ao subir, e nunca descartada: a biblioteca\n// guarda um provedor de assinatura por chave, e dispor o ECDsa quebraria a segunda chamada.\nstatic readonly ECDsa Chave = ImportarChave(File.ReadAllText("pds-privada.pem"));\n\nstatic ECDsa ImportarChave(string pem)\n{\n    var ecdsa = ECDsa.Create();\n    ecdsa.ImportFromPem(pem);\n    return ecdsa;\n}\n\nstatic string CrachaDeRelato(string usuarioId, string? nome)\n{\n    var claims = new List<Claim> { new("sub", usuarioId) };\n    if (nome is not null) claims.Add(new("name", nome));\n\n    var token = new JwtSecurityToken(\n        audience: "${aud}",\n        claims: claims,\n        expires: DateTime.UtcNow.AddMinutes(${validade}),\n        signingCredentials: new SigningCredentials(\n            new ECDsaSecurityKey(Chave), SecurityAlgorithms.EcdsaSha256));\n\n    return new JwtSecurityTokenHandler().WriteToken(token);\n}`

  return (
    <HowItWorks className="mt-1" label="Como gerar o crachá">
      <p>
        <strong className="font-medium text-fg">1. Gere um par de chaves</strong> no seu servidor e
        cole aqui só a pública (<code className="font-mono text-fg">pds-publica.pem</code>). A
        privada sai em PKCS#8, que é o formato que os exemplos abaixo leem:
      </p>
      <Bloco texto={chaves} />
      <p>
        <strong className="font-medium text-fg">
          2. A cada página, o seu servidor gera um crachá
        </strong>{' '}
        para quem está na conta: um JWT assinado com ES256 e estas claims. O{' '}
        <code className="font-mono text-fg">sub</code> é opaco para nós — guardamos só um hash dele;
        o <code className="font-mono text-fg">name</code> é opcional e só preenche o campo do nome;
        o <code className="font-mono text-fg">aud</code> é a chave pública deste projeto; o{' '}
        <code className="font-mono text-fg">exp</code> fica dentro da validade acima.
      </p>
      <Bloco texto={claims} />
      <p>
        <strong className="font-medium text-fg">3. Coloque o crachá no script</strong>, em{' '}
        <code className="font-mono text-fg">data-identity</code>. Quem não está na conta fica sem o
        atributo. O quadro lê o valor de agora a cada abertura: se a sessão renovar sem recarregar a
        página, troque o atributo.
      </p>
      <Bloco texto={script} />
      <p>
        <strong className="font-medium text-fg">Exemplos no servidor.</strong> Em Node, com{' '}
        <code className="font-mono text-fg">jose</code>:
      </p>
      <Bloco texto={js} />
      <p>
        Em C#, com <code className="font-mono text-fg">System.IdentityModel.Tokens.Jwt</code>:
      </p>
      <Bloco texto={cs} />
      <p>
        <strong className="font-medium text-fg">Nunca use o token de login do usuário.</strong> O
        crachá é dedicado a relatar: curto, com o <code className="font-mono text-fg">aud</code>{' '}
        deste projeto, e não abre nada no seu sistema. Quem o ler só consegue relatar em nome da
        pessoa, por alguns minutos.
      </p>
    </HowItWorks>
  )
}

/**
 * Um trecho para copiar inteiro. O botao fica numa linha propria, acima: por cima do
 * texto ele cobria o fim das linhas compridas, que rolam de lado.
 */
function Bloco({ texto }: { texto: string }) {
  return (
    <div className="rounded-lg bg-surface-sunken">
      <div className="flex justify-end px-2 pt-2">
        <CopyButton value={texto} label="Copiar bloco" size="sm" />
      </div>
      <pre className="overflow-x-auto px-3 pt-1 pb-3 font-mono text-caption text-fg leading-relaxed">
        {texto}
      </pre>
    </div>
  )
}

function modoDe(valor: ReporterIdentityMode): Modo {
  return MODOS.find((modo) => modo.valor === valor) ?? (MODOS[0] as Modo)
}

function nivelDe(valor: ReportVisibility): Nivel {
  return NIVEIS.find((nivel) => nivel.valor === valor) ?? (NIVEIS[0] as Nivel)
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
        {titulo} <span className="font-normal text-fg-muted">— {resumo}</span>
      </p>
      {linhas.map(([rotulo, texto]) => (
        <p key={rotulo} className="text-caption text-fg-muted leading-relaxed">
          <strong className="font-medium text-fg">{rotulo}</strong> {texto}
        </p>
      ))}
    </div>
  )
}

/** As variaveis e o padrao depois da barra, recolhidos: quem ja sabe nao rola por eles. */
function ComoFuncionamAsVariaveis() {
  return (
    <HowItWorks className="mt-3">
      <p>
        Os botões de “Inserir” põem uma variável onde está o cursor, e ela vira o valor de cada
        relato.
      </p>
      <p>
        Para escolher o que entra quando não há valor, escreva depois de uma barra:{' '}
        <code className="font-mono text-fg">{'{{primeiroNome|pessoa}}'}</code>.
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
      className="scroll-mt-6 rounded-xl border border-border bg-surface-raised p-5"
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
        className="mb-3 inline-flex rounded-lg border border-border bg-surface p-0.5"
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
                'flex h-7 items-center rounded-md px-2.5 text-detail transition-colors',
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

/** O traco dos desenhos das escolhas: a mesma espessura e a mesma cor nos seis. */
function Desenho({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 32 24"
      className="h-10 w-14 text-fg-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
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

/** Privado e um cadeado; publico, um olho — e o identificado, o olho e quem escreveu. */
function DesenhoDoNivel({ nivel }: { nivel: ReportVisibility }) {
  return (
    <Desenho>
      {nivel === 'Private' && (
        <>
          <rect x="10.5" y="11" width="11" height="9" rx="1.6" />
          <path d="M12.8 11V8.2a3.2 3.2 0 0 1 6.4 0V11" />
        </>
      )}
      {nivel === 'PublicAnonymous' && (
        <>
          <path d="M5 12s4-6 11-6 11 6 11 6-4 6-11 6S5 12 5 12Z" />
          <circle cx="16" cy="12" r="2.5" />
        </>
      )}
      {nivel === 'PublicIdentified' && (
        <>
          <path d="M2.5 12s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" />
          <circle cx="10.5" cy="12" r="2" />
          <circle cx="25" cy="8.5" r="2.5" />
          <path d="M20.5 18c0-3 2-4.6 4.5-4.6s4.5 1.6 4.5 4.6" />
        </>
      )}
    </Desenho>
  )
}
