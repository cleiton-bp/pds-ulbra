import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ReporterIdentityMode, ReportVisibility, WidgetSettingsViewModel } from '@/contracts'
import { WIDGET_TEXT_LIMITS } from '@/contracts'
import { projectKeyService, projectPublicStageService } from '@/data'
import { PREVIEW_OUTLINE } from '@/embed/previewOutline'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { ChaveDoSistema, validadeValida } from '@/features/identity/SystemIdentityGuide'
import { Button } from '@/shared/components/Button'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { MovedAnchors } from '@/shared/components/MovedAnchors'
import {
  LinkedAccountCard,
  PersonalCodeCard,
  SentConfirmation,
  SentDetails,
} from '@/shared/components/SentConfirmation'
import { Hint, RadioGroup } from '@/shared/components/SettingsControls'
import { SettingsGroup } from '@/shared/components/SettingsGroup'
import { SettingsHeader } from '@/shared/components/SettingsHeader'
import { Skeleton } from '@/shared/components/Skeleton'
import { TemplateField } from '@/shared/components/TemplateField'
import { toast } from '@/shared/components/toastStore'
import {
  Desenho,
  DesenhoDoNivel,
  NIVEIS,
  NIVEL_TRAVADO,
  nivelDe,
} from '@/shared/components/VisibilityLevels'
import { VoltarDeOndeVeio } from '@/shared/components/VoltarDeOndeVeio'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { useIdentitySettingsDraft, useWidgetSettingsDraft } from '@/shared/hooks/useSettingsDraft'
import { cn } from '@/shared/lib/cn'
import { EM_BREVE } from '@/shared/lib/emBreve'
import {
  changedFromDefaults,
  defaultsOf,
  IDENTITY_DEFAULTS,
  IDENTITY_TOKEN_MINUTES,
} from '@/shared/lib/factoryDefaults'
import {
  renderWidgetText,
  SUCCESS_VARIABLES,
  TRACKING_VARIABLES,
  type WidgetTextValues,
} from '@/shared/lib/widgetText'
import { useScreenGuide } from '@/shared/tour/guideStore'
import { useModerationInMenu } from '@/shared/tour/moderationInMenu'

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

/**
 * Uma das tres formas de reconhecer quem relata. **Cada uma diz o que e, o que muda para
 * quem relata e o que pede de voce**: quem escolhe precisa saber o que ganha e o que vai
 * ter de fazer antes de salvar. So a escolhida mostra as duas linhas: as tres de uma vez
 * eram uma parede de texto antes do primeiro clique.
 *
 * As frases usam o que a pessoa ve no formulario ("Ver os meus relatos", o codigo depois de
 * enviar, "Este relato ficou ligado à sua conta"), conferido no quadro e na API.
 */
interface Modo {
  valor: ReporterIdentityMode
  titulo: string
  /** O que esta escolhido, em palavras, no titulo do grupo fechado. */
  emPalavras: string
  /** Uma frase, no cartao da escolha. */
  resumo: string
  /** O texto longo, no "Como funciona". */
  explicacao: string
  /** O que muda para quem relata. */
  destrava: string
  /** O que pede de voce. */
  custo: string
}

const MODOS: readonly Modo[] = [
  {
    valor: 'Protocol',
    titulo: 'Protocolo',
    emPalavras: 'Protocolo, ninguém é identificado',
    resumo: 'Ninguém é identificado.',
    explicacao:
      'O relato chega sem nada que diga quem escreveu. Ao enviar, a pessoa recebe o protocolo e o link do relato, e só quem tem o link abre o relato.',
    destrava:
      'Acompanha cada relato pelo link que recebe ao enviar, sem uma lista dos relatos dela, porque nada diz quais são dela.',
    custo: 'Nada, funciona só com o script colado na página.',
  },
  {
    valor: 'PersonalCode',
    titulo: 'Código pessoal',
    emPalavras: 'Código pessoal, a pessoa guarda um código',
    resumo: 'A pessoa guarda um código.',
    explicacao:
      'O código, como H7QK-3M2X-P9WD, não usa 0, O, 1 e I, para ninguém confundir ao ler. Ele fica salvo no navegador, e em outro aparelho a pessoa digita o código em “Ver os meus relatos”. Perder o código só tira a lista, e cada relato continua abrindo pelo próprio link.',
    destrava:
      'Ao enviar, recebe um código que fica salvo no navegador, e vê todos os relatos dela em “Ver os meus relatos”, até em outro aparelho.',
    custo: 'Nada do seu lado, e a pessoa guarda mais um código.',
  },
  {
    valor: 'InheritedIdentity',
    titulo: 'Identidade do seu sistema',
    emPalavras: 'Identidade do seu sistema, quem está na conta não digita nada',
    resumo: 'Quem está na conta não digita nada.',
    explicacao:
      'O seu servidor assina quem está na conta num crachá curto, que vai no script da página. Nós só conferimos a assinatura, sem chamar o seu sistema, e da pessoa guardamos só uma versão embaralhada do id, nunca o id em si.',
    destrava:
      'O relato fica ligado à conta, o nome já vem preenchido, e “Ver os meus relatos” mostra os relatos dela sempre que ela entrar no seu sistema.',
    custo:
      'Uma rotina curta no seu servidor, que assina quem está na conta, com o passo a passo abaixo.',
  },
]

/**
 * Quem e quem neste projeto, quem pode ver o que — e o que a pessoa le depois de enviar.
 *
 * **As duas perguntas moram na mesma tela porque a primeira decide a segunda.** Sem
 * identidade nao existe "o meu relato", e nao existe como o relator escolher aparecer.
 *
 * **Quatro grupos em acordeao, em duas partes** (`SettingsGroup`): Visibilidade e
 * Reconhecimento, que sao a privacidade; e, com titulo proprio, o que quem relatou le
 * depois de enviar (Confirmação e Topo do acompanhamento). Fechado, cada grupo ja diz o que
 * esta escolhido e o que mudou, com o proprio "Voltar ao padrão". Cada escolha e um bloco
 * com desenho, so a escolhida diz o que destrava e o que custa, e o texto longo espera no
 * "Como funciona".
 *
 * **O aviso do formulario mora na Visibilidade**, e so aparece com um nivel publico: e a
 * escolha que o liga. Num grupo proprio, ele dizia "Sem efeito" no projeto privado.
 *
 * **Sem previa ao lado.** As tres abas (o quadro depois de enviar, o acompanhamento e o
 * formulario) repetiam o que os campos e as frases ja dizem, e tiravam 40% da largura de
 * um passo a passo com codigo. Cada texto mostra o resultado embaixo do proprio campo.
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
      texto:
        'Quem pode ver os relatos e como a pessoa é reconhecida, e embaixo os textos que ela lê depois de enviar.',
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
  const abriuAoPublico = useModerationInMenu((estado) => estado.abriuAoPublico)
  const definirPublico = useModerationInMenu((estado) => estado.definir)
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

  // A jornada de verdade, so para a etapa do exemplo dos textos: falhar aqui nao impede nada.
  const jornada = useAsyncResource(
    useCallback(
      () => projectPublicStageService.listPublicStages(project.PublicId),
      [project.PublicId],
    ),
  )

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
    // O nivel antes e depois: de privado para publico, a Moderação entra no menu e se
    // apresenta; de volta ao privado, ela sai (ver `moderationInMenu`).
    const eraPublico =
      quemRelata.published !== null && quemRelata.published.Visibility !== 'Private'
    const ficaPublico = draft !== null && draft.Visibility !== 'Private'
    // Uma de cada vez: se a primeira falhar, a segunda nao vai, e o aviso e um so.
    if (quemRelata.dirty && !(await quemRelata.save())) return
    if (textos.dirty && !(await textos.save())) return
    toast.done('Privacidade: salvo.')
    if (ficaPublico && !eraPublico) abriuAoPublico(project.PublicId)
    else definirPublico(project.PublicId, ficaPublico)
  }

  /**
   * O texto de depois de enviar que esta aberto: so a Mensagem de confirmação e o Topo da
   * página de acompanhamento mostram a previa, na coluna da direita, e so enquanto estao
   * abertos. Nas escolhas de cima a previa nao mostrava nada que o proprio cartao nao diga.
   */
  const [textoAberto, setTextoAberto] = useState<TextoComPrevia | null>(null)
  /** O ultimo mostrado: a previa sai devagar com ele, em vez de sumir antes da coluna. */
  const [textoMostrado, setTextoMostrado] = useState<TextoComPrevia | null>(null)
  const fechando = useRef(0)
  useEffect(() => () => window.clearTimeout(fechando.current), [])
  function acompanharTexto(grupo: TextoComPrevia) {
    return {
      onToggle: (abriu: boolean) => {
        if (abriu) {
          // Abrir cancela o fechar que ainda espera: a coluna fica, e so troca o texto.
          window.clearTimeout(fechando.current)
          setTextoAberto(grupo)
          setTextoMostrado(grupo)
          return
        }
        // Fechar espera um instante: abrir o outro texto fecha este no mesmo clique, e a
        // coluna nao deve sair e voltar no meio da troca.
        fechando.current = window.setTimeout(
          () => setTextoAberto((atual) => (atual === grupo ? null : atual)),
          80,
        )
      },
    }
  }

  /** A etapa do exemplo: a segunda da jornada do projeto, onde um relato costuma estar. */
  const etapaDeExemplo = useMemo(() => {
    const ordenadas = [...(jornada.data ?? [])].sort((a, b) => a.Position - b.Position)
    return ordenadas[Math.min(1, ordenadas.length - 1)]?.Label ?? null
  }, [jornada.data])

  // Os valores de exemplo dos textos com variavel, embaixo de cada campo. A etapa e a de
  // verdade.
  const exemplo = {
    primeiroNome: 'Ana',
    protocolo: 'K7P2-9XQ4',
    tipo: ferramenta?.Types[0]?.Name ?? 'Defeito',
    projeto: project.Name,
    etapa: etapaDeExemplo ?? 'Em análise',
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
        description="Escolha quem pode ver os relatos, como a pessoa que relata é reconhecida e o que ela lê depois de enviar."
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
            ? 'Para salvar, escolha um nível que combine com o Protocolo.'
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
        <div className="flex flex-col gap-3">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}

      {draft && ferramenta && (
        <EditorWithPreview
          previewEmFolha
          previewOpen={textoAberto !== null}
          larguraDaPrevia={LARGURA_DA_PREVIA_DOS_TEXTOS}
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
            textoMostrado && (
              <PreviaDosTextos
                texto={textoMostrado}
                ferramenta={ferramenta}
                modo={draft.Mode}
                exemplo={exemplo}
                dirty={dirty}
              />
            )
          }
        >
          {/* Mais larga que as telas de lista quando a previa nao esta ao lado: os grupos
              ficavam numa coluna estreita, com o resto da tela vazio, e o codigo do passo a
              passo rolava de lado. Com a previa, a coluna encolhe para ela entrar. */}
          <div className="flex w-full max-w-220 flex-col gap-3">
            {/* **Quem pode ver os relatos vem primeiro, e aberto**: e a escolha que da o nome a
              tela (Privacidade) e a que mais pesa para quem relata. O reconhecimento, mais
              tecnico, vem depois. */}
            <SettingsGroup
              name={ACORDEAO}
              id="visibilidade"
              title="Quem pode ver os relatos"
              value={
                conflito ? (
                  <span className="text-warn-fg">
                    {nivelDe(draft.Visibility).titulo}, que não combina com o Protocolo
                  </span>
                ) : (
                  nivelDe(draft.Visibility).emPalavras
                )
              }
              changes={[
                ...(draft.Visibility !== DEFAULT_WIDGET_SETTINGS.Visibility ? ['Nível'] : []),
                ...changedFromDefaults(ferramenta, DEFAULT_WIDGET_SETTINGS, TEXTOS.aviso),
              ]}
              onReset={() => {
                quemRelata.change({ Visibility: DEFAULT_WIDGET_SETTINGS.Visibility })
                textos.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, TEXTOS.aviso))
              }}
              defaultOpen
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
                    note: travado ? NIVEL_TRAVADO : nivel.resumo,
                    disabled: travado,
                    className: 'min-w-24 flex-1 basis-0 text-center',
                  }
                })}
              />
              <Escolha
                linhas={[
                  ['Quem lê:', nivelDe(draft.Visibility).quemVe],
                  ['Para o time:', nivelDe(draft.Visibility).custo],
                ]}
              />

              {conflito && (
                <div className="mt-3 rounded-lg border border-warn-border bg-warn-surface p-3.5">
                  <p className="text-caption text-warn-fg leading-relaxed">
                    <strong className="font-medium">
                      O público identificado precisa saber quem relata, e o Protocolo não reconhece
                      ninguém.
                    </strong>{' '}
                    Escolha outro nível aqui, ou volte para Código pessoal ou Identidade do seu
                    sistema. A tela não troca sozinha, porque quem pode ver os relatos não deve
                    mudar por causa de outra escolha.
                  </p>
                </div>
              )}

              {draft.Visibility !== 'Private' && (
                <Hint>
                  Escolher um nível público não publica nada sozinho: cada relato espera alguém do
                  time liberar em Moderação.
                </Hint>
              )}
              {draft.Mode === 'Protocol' && !conflito && (
                <Hint>
                  O público identificado precisa de Código pessoal ou Identidade do seu sistema,
                  logo abaixo.
                </Hint>
              )}
              {/* Sem a pergunta do nome, a caixa de mostrar o nome nem aparece no formulario:
                o identificado ficaria igual ao anonimo, e ninguem descobriria por que. */}
              {draft.Visibility === 'PublicIdentified' && !draft.AsksForName && (
                <Hint className="text-warn-fg">
                  O formulário não pergunta o nome, então ninguém consegue mostrar o nome. Ligue a
                  pergunta em{' '}
                  <Link
                    to={`/projects/${project.PublicId}/form-texts#nome-de-quem-relata`}
                    className="font-medium underline underline-offset-4"
                  >
                    Textos e tema
                  </Link>
                  .
                </Hint>
              )}

              {/* O aviso do formulario so existe com um nivel publico: mora junto da escolha
                que o liga. O endereco do antigo grupo dele cai aqui. */}
              <div id="aviso-de-relato-publico" className="scroll-mt-6">
                {draft.Visibility === 'Private' ? (
                  <p id="aviso-publico" className="mt-2 text-detail text-fg-muted leading-relaxed">
                    Num nível público, o formulário mostra um aviso antes de a pessoa escrever, e o
                    texto dele aparece aqui.
                  </p>
                ) : (
                  <div className="mt-4">
                    <TemplateField
                      id="aviso-publico"
                      label="Aviso de que o relato pode virar público"
                      value={ferramenta.PublicNotice}
                      onChange={(PublicNotice) => textos.change({ PublicNotice })}
                      maxLength={WIDGET_TEXT_LIMITS.PublicNotice}
                    />
                    <Hint>
                      Aparece no formulário antes de a pessoa escrever, e logo depois vem uma frase
                      que muda com o nível e não se edita: “
                      {draft.Visibility === 'PublicIdentified'
                        ? 'O seu nome só aparece se você marcar abaixo.'
                        : 'O seu nome nunca aparece.'}
                      ”
                    </Hint>
                  </div>
                )}
              </div>

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
              title="Como a pessoa é reconhecida"
              value={modoDe(draft.Mode).emPalavras}
              changes={[
                ...(draft.Mode !== DEFAULT_WIDGET_SETTINGS.IdentityMode ? ['Modo'] : []),
                // As regras do cracha so contam com a identidade do sistema escolhida: fora
                // dela elas nem aparecem, e um "Mudou" do que nao se ve confundia.
                ...(draft.Mode !== 'InheritedIdentity'
                  ? []
                  : [
                      ...(draft.IdentityTokenMaxMinutes !==
                      IDENTITY_DEFAULTS.IdentityTokenMaxMinutes
                        ? ['Validade do crachá']
                        : []),
                      ...(draft.IdentityRequired !== IDENTITY_DEFAULTS.IdentityRequired
                        ? ['Só quem está na conta']
                        : []),
                      ...(draft.IdentityFormat !== IDENTITY_DEFAULTS.IdentityFormat
                        ? ['Formato da assinatura']
                        : []),
                    ]),
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
            >
              <RadioGroup<ReporterIdentityMode>
                label="Como a pessoa é reconhecida"
                value={draft.Mode}
                onChange={(Mode) => quemRelata.change({ Mode })}
                options={MODOS.map((modo) => {
                  // Ainda nao liberada: aparece como "Em breve", e so o projeto que ja a
                  // salvou continua podendo escolhe-la (ver `EM_BREVE`).
                  const emBreve = modoEmBreve(modo.valor, quemRelata.published?.Mode)
                  return {
                    value: modo.valor,
                    label: modo.titulo,
                    note: emBreve ? 'Em breve' : modo.resumo,
                    disabled: emBreve,
                    drawing: <DesenhoDoModo modo={modo.valor} />,
                    className: 'min-w-24 flex-1 basis-0 text-center',
                  }
                })}
              />
              <Escolha
                linhas={[
                  ['Para quem relata:', modoDe(draft.Mode).destrava],
                  ['Para você:', modoDe(draft.Mode).custo],
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
                Trocar o modo só vale para os próximos relatos, e os que já chegaram continuam
                abrindo pelo link de sempre.
              </Hint>
              <HowItWorks className="mt-3">
                {MODOS.map((modo) => (
                  <p key={modo.valor}>
                    <strong className="font-medium text-fg">
                      {modo.titulo}
                      {modoEmBreve(modo.valor, quemRelata.published?.Mode) ? ', em breve.' : '.'}
                    </strong>{' '}
                    {modo.explicacao}
                  </p>
                ))}
              </HowItWorks>
            </SettingsGroup>

            {/* **O que quem relatou le, com titulo proprio**: sao textos, e nao privacidade, e
              sem o titulo a tela parecia mudar de assunto no meio. */}
            <section aria-labelledby="textos-de-depois" className="mt-5 flex flex-col gap-3">
              <header>
                <h2 id="textos-de-depois" className="mb-1 font-semibold text-lead">
                  O que quem relatou lê
                </h2>
                <p className="text-detail text-fg-muted leading-relaxed">
                  Os textos de depois de enviar, no seu sistema e na página de acompanhamento.
                </p>
              </header>
              <SettingsGroup
                name={ACORDEAO}
                id="depois-de-enviar"
                title="Mensagem de confirmação"
                value={`“${resumir(renderWidgetText(ferramenta.SuccessMessage, exemplo))}”`}
                changes={changedFromDefaults(
                  ferramenta,
                  DEFAULT_WIDGET_SETTINGS,
                  TEXTOS.confirmacao,
                )}
                onReset={() =>
                  textos.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, TEXTOS.confirmacao))
                }
                {...acompanharTexto('confirmacao')}
              >
                <TemplateField
                  id="confirmacao"
                  label="Texto da confirmação"
                  value={ferramenta.SuccessMessage}
                  onChange={(SuccessMessage) => textos.change({ SuccessMessage })}
                  maxLength={WIDGET_TEXT_LIMITS.SuccessMessage}
                  variables={SUCCESS_VARIABLES}
                  sample={exemplo}
                />
                <Hint>
                  Aparece no formulário logo depois de enviar, abaixo de “Relato enviado” e acima do
                  protocolo.
                </Hint>
                <ComoFuncionamAsVariaveis />
              </SettingsGroup>

              <SettingsGroup
                name={ACORDEAO}
                id="texto-do-acompanhamento"
                title="Topo da página de acompanhamento"
                value={`“${resumir(renderWidgetText(ferramenta.TrackingIntro, exemplo))}”`}
                changes={changedFromDefaults(ferramenta, DEFAULT_WIDGET_SETTINGS, TEXTOS.topo)}
                onReset={() => textos.change(defaultsOf(DEFAULT_WIDGET_SETTINGS, TEXTOS.topo))}
                {...acompanharTexto('topo')}
              >
                {/* `#mais-opcoes` era o "Mais opções", que comecava pelo topo: o endereco
                  antigo cai aqui. */}
                <div id="mais-opcoes" className="scroll-mt-6">
                  <TemplateField
                    id="topo-do-acompanhamento"
                    label="Texto do topo"
                    value={ferramenta.TrackingIntro}
                    onChange={(TrackingIntro) => textos.change({ TrackingIntro })}
                    maxLength={WIDGET_TEXT_LIMITS.TrackingIntro}
                    variables={TRACKING_VARIABLES}
                    sample={exemplo}
                  />
                </div>
                <Hint>
                  A primeira frase da página que quem relatou abre pelo link, logo abaixo de “Seu
                  relato”.
                </Hint>
                <ComoFuncionamAsVariaveis />
              </SettingsGroup>
            </section>
          </div>
        </EditorWithPreview>
      )}
    </div>
  )
}

/**
 * O modo ainda nao liberado (`EM_BREVE`): a Identidade do seu sistema, para o projeto que nao
 * a salvou. Quem ja a usa continua podendo escolhe-la, e o que esta salvo nao muda sozinho.
 */
function modoEmBreve(valor: ReporterIdentityMode, salvo: ReporterIdentityMode | undefined) {
  return valor === 'InheritedIdentity' && EM_BREVE.identidadeDoSistema && salvo !== valor
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
function Escolha({ linhas }: { linhas: ReadonlyArray<[string, string]> }) {
  return (
    <div
      aria-live="polite"
      className="mt-3 flex flex-col gap-1 rounded-lg border border-border bg-surface p-3.5"
    >
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

/** Os textos de depois de enviar que mostram a previa ao lado. */
type TextoComPrevia = 'confirmacao' | 'topo'

/**
 * A largura da coluna da previa dos textos: o formulario logo depois de enviar, com o
 * cartao do codigo e o do protocolo, cabe sem quebrar o botao de copiar.
 */
const LARGURA_DA_PREVIA_DOS_TEXTOS = 416

/**
 * A previa dos textos de depois de enviar, **no lugar de sempre**: a coluna da direita, presa
 * ao rolar, com o mesmo desenho das outras previas (o titulo, o estado e uma frase). Ela so
 * existe com a Mensagem de confirmação ou o Topo da página de acompanhamento aberto, e a
 * troca de um para o outro entra devagar (`animate-materializa`).
 */
function PreviaDosTextos({
  texto,
  ferramenta,
  modo,
  exemplo,
  dirty,
}: {
  texto: TextoComPrevia
  ferramenta: WidgetSettingsViewModel
  modo: ReporterIdentityMode
  exemplo: WidgetTextValues & { protocolo: string }
  dirty: boolean
}) {
  return (
    <section
      id="previa"
      aria-labelledby="previa-titulo"
      className="scroll-mt-6 rounded-xl border border-border bg-surface-raised p-4"
    >
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id="previa-titulo" className="font-semibold text-fg text-lead">
          Prévia
        </h2>
        <span className="flex-none text-caption text-fg-muted">
          {dirty ? 'ainda não salvo' : 'igual ao que quem relata vê'}
        </span>
      </header>
      <p className="mb-3 text-detail text-fg-muted leading-relaxed">
        {texto === 'confirmacao'
          ? 'O formulário logo depois de enviar, com a parte que você está mudando contornada.'
          : 'A página que quem relatou abre pelo link, com a parte que você está mudando contornada.'}
      </p>
      <div
        key={texto}
        className="flex animate-materializa flex-col gap-4 rounded-lg border border-border bg-surface p-4"
      >
        {texto === 'confirmacao' ? (
          <ConfirmacaoNaPrevia ferramenta={ferramenta} modo={modo} exemplo={exemplo} />
        ) : (
          <TopoNaPrevia ferramenta={ferramenta} exemplo={exemplo} />
        )}
      </div>
    </section>
  )
}

/**
 * O formulario logo depois de enviar, com as mesmas pecas dele: o "Relato enviado" com a
 * mensagem, o que o modo acrescenta (o codigo para guardar ou a conta ligada) e o protocolo.
 */
function ConfirmacaoNaPrevia({
  ferramenta,
  modo,
  exemplo,
}: {
  ferramenta: WidgetSettingsViewModel
  modo: ReporterIdentityMode
  exemplo: WidgetTextValues & { protocolo: string }
}) {
  return (
    <>
      <div className={PREVIEW_OUTLINE}>
        <SentConfirmation message={ferramenta.SuccessMessage} values={exemplo} preview />
      </div>
      {modo === 'PersonalCode' && (
        <PersonalCodeCard code="H7QK-3M2X-P9WD" savedHere onDownload={() => {}} />
      )}
      {modo === 'InheritedIdentity' && <LinkedAccountCard />}
      <SentDetails
        trackingCode={exemplo.protocolo}
        trackingLink={null}
        onlyWayBack={modo === 'Protocol'}
      />
    </>
  )
}

/** O alto da pagina de acompanhamento: o titulo, a frase do projeto e o protocolo. */
function TopoNaPrevia({
  ferramenta,
  exemplo,
}: {
  ferramenta: WidgetSettingsViewModel
  exemplo: WidgetTextValues & { protocolo: string }
}) {
  return (
    <div>
      <p className="mb-1.5 font-semibold text-fg text-lead">Seu relato</p>
      <p className={cn('mb-4 text-body text-fg-muted', PREVIEW_OUTLINE)}>
        {renderWidgetText(ferramenta.TrackingIntro, exemplo)}
      </p>
      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="mb-1 text-caption text-fg-muted">Protocolo</div>
        <p className="font-mono text-fg text-lead tracking-wide">{exemplo.protocolo}</p>
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
