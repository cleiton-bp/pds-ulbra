import { useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type {
  ClosureTrigger,
  CycleSettingsViewModel,
  ProjectStateViewModel,
  SatisfactionStyle,
} from '@/contracts'
import { MAX_PUBLIC_DELAY_MINUTES } from '@/contracts'
import { projectStateService } from '@/data'
import { Dias, Marcar, useCycleDraft } from '@/features/cycle/cycleParts'
import type { ColunaSugerida } from '@/features/projectStates/ProjectStatesScreen'
import { Button } from '@/shared/components/Button'
import { HelpPopover } from '@/shared/components/HelpPopover'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { NumberField } from '@/shared/components/NumberField'
import { Select } from '@/shared/components/Select'
import { Field, Hint, Options, RadioGroup } from '@/shared/components/SettingsControls'
import { SettingsGroup } from '@/shared/components/SettingsGroup'
import { SettingsHeader } from '@/shared/components/SettingsHeader'
import { Skeleton } from '@/shared/components/Skeleton'
import type { EstadoDaVolta } from '@/shared/components/VoltarDeOndeVeio'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import type { ScrollToHashState } from '@/shared/hooks/useScrollToHash'
import { CYCLE_DEFAULTS, changedFromDefaults, defaultsOf } from '@/shared/lib/factoryDefaults'
import { guideTarget, useScreenGuide } from '@/shared/tour/guideStore'

type Campos = ReadonlyArray<readonly [keyof CycleSettingsViewModel, string]>

/**
 * Os grupos da tela, **na ordem do caminho do relato**, cada campo com o nome do "Mudou".
 * Cada campo mora num grupo so: e com esta lista que o grupo diz o que mudou e que o
 * "Voltar ao padrão" dele sabe o que trocar — e so isso, porque o rascunho e o mesmo de
 * Sprints e Colunas (`useCycleDraft`).
 */
const GRUPOS = {
  encerramento: [['ClosureTrigger', 'Como encerra']],
  reabertura: [
    ['AllowsReopen', 'Pode reabrir'],
    ['ReopenStatePublicId', 'Coluna de volta'],
    ['ReopenRequiresComment', 'Contar o que ainda acontece'],
  ],
  informacao: [
    ['InfoRequestEnabled', 'Pedir informação'],
    ['InfoRequestWarnDays', 'Dias até o aviso'],
    ['InfoRequestCloseDays', 'Dias até encerrar'],
  ],
  espera: [['PublicDelayMinutes', 'Tempo para desfazer']],
  nota: [
    ['SatisfactionEnabled', 'Pedir nota'],
    ['SatisfactionStyle', 'Tipo de nota'],
    ['SatisfactionRequired', 'Nota obrigatória'],
  ],
  arquivar: [['AllowsReportArchiving', 'Arquivar relato']],
  codigo: [['TrackingCodeCanAct', 'Código sozinho age']],
} as const satisfies Record<string, Campos>

type Grupo = keyof typeof GRUPOS

/**
 * O que esta tela grava: os campos de todos os grupos, e so eles. As regras do quadro
 * (dias da ultima coluna, prazo em destaque) estao em Colunas, e as sprints em Sprints.
 * O codigo sozinho entra mesmo escondido: o valor salvo dele viaja como veio.
 */
const CAMPOS_NA_TELA = Object.values(GRUPOS).flatMap((campos) =>
  campos.map(([campo]) => campo),
) satisfies ReadonlyArray<keyof CycleSettingsViewModel>

/** O nome do acordeao desta tela: abrir um grupo fecha o outro. Ver `SettingsGroup`. */
const ACORDEAO = 'ciclo'

const ESTILOS: Record<SatisfactionStyle, string> = {
  Stars: 'Estrelas',
  Number: 'Números de 1 a 5',
}

/**
 * **"O codigo sozinho tambem confirma e reabre" esta escondida, e nao removida.**
 * Desde 26/11/2026 confirmar e reabrir aceitam o codigo e o cracha sempre, porque o
 * retorno sobre o encerramento e de quem relatou por qualquer caminho. O que a regra
 * ainda decidiria e so responder a pergunta do time pelo codigo, que segue so pelo
 * link. Ate la o valor salvo segue intacto no rascunho, como o das regras sem tela.
 *
 * **Volta junto com `ActionsAcceptReporterCode`, no `ReportService` da API.** Ate
 * la a API ignora o valor salvo — ligar so esta constante desenharia um controle que
 * nao muda nada.
 */
const MOSTRAR_REGRA_DO_CODIGO = false

type Change = (patch: Partial<CycleSettingsViewModel>) => void

/**
 * Como o ciclo fecha neste projeto.
 *
 * **A tela mostra o que o produto ja sabe obedecer.** Todas as regras do ciclo
 * existem no banco e viajam inteiras a cada salvamento, mas so aparece aqui o que
 * muda alguma coisa — desenhar um controle que nao muda nada seria pior do que nao
 * ter o controle.
 *
 * **Seis assuntos, na ordem do caminho, e nenhum "Mais opções".** O "Mais opções" de
 * antes misturava a espera, a nota e o arquivar, e cada controle vinha embaixo de tres
 * camadas de texto. Agora cada grupo, fechado, ja diz o que esta escolhido e o que
 * mudou, com o proprio "Voltar ao padrão" (`SettingsGroup`); a dica e de uma linha, e a
 * explicacao longa espera no "Como funciona".
 *
 * **Sem previa ao lado.** O "Caminho do relato" que ficava a direita repetia em frases o
 * que os resumos dos grupos ja dizem, no lugar onde as outras telas mostram uma tela de
 * verdade (o formulario, o card, o acompanhamento): parecia previa, nao era, e confundia.
 * Os grupos, numa coluna so, bastam.
 *
 * **O rascunho manda de volta o que recebeu** (`useCycleDraft`). As regras do quadro
 * moram na tela de Colunas, e as sprints na tela de Sprints: estavam no fim desta
 * pagina, longe de quem as procurava — ninguem procura "ligar sprints" numa tela que
 * fala de encerramento.
 */
export function CycleSettingsScreen() {
  // O guia desta tela: o passo cuja parte nao estiver na tela sai quando o guia abre.
  useScreenGuide('encerramento', [
    {
      alvo: 'opcoes',
      titulo: 'As regras',
      texto: 'Cada grupo é uma regra do fim do relato, e abrir um grupo mostra as opções dele.',
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

  // So o que esta tela mexe. Ver `useCycleDraft`.
  const { draft, change, loading, failed, reload, saving, dirty, changeCount, salvar, descartar } =
    useCycleDraft(project.PublicId, CAMPOS_NA_TELA, 'Regras salvas.')

  // As colunas, para escolher o destino da reabertura. **Falhar aqui nao impede
  // configurar o resto**: so aquele campo fica indisponivel, e a tela diz por que.
  const colunas = useAsyncResource(
    useCallback(() => projectStateService.listProjectStates(project.PublicId), [project.PublicId]),
  )

  /** O que o grupo mudou do padrao, e o "Voltar ao padrão" so dos campos dele. */
  function padrao(grupo: Grupo) {
    return {
      changes: draft ? changedFromDefaults(draft, CYCLE_DEFAULTS, GRUPOS[grupo]) : [],
      onReset: () => change(defaultsOf(CYCLE_DEFAULTS, GRUPOS[grupo])),
    }
  }

  const voltaPara = draft ? destinoDaReabertura(draft.ReopenStatePublicId, colunas.data) : ''

  return (
    // Mais larga que as telas de lista: sem a previa ao lado, os grupos ficavam numa coluna
    // estreita, com o resto da tela vazio.
    <div className="max-w-220">
      <SettingsHeader
        title="Encerramento"
        description="Escolha como o time encerra um relato e o que quem relatou pode fazer depois de ler a resposta."
        ready={draft !== null}
        dirty={dirty}
        changeCount={changeCount}
        saving={saving}
        onSave={() => void salvar()}
        onDiscard={descartar}
      />

      {failed && (
        <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar as regras agora. Nada mudou: a falha foi ao consultar, e o projeto
            continua se comportando como estava.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}

      {draft && (
        <div className="flex flex-col gap-3" {...guideTarget('opcoes')}>
          <SettingsGroup
            name={ACORDEAO}
            id="encerramento"
            title="Como o time encerra"
            value={
              draft.ClosureTrigger === 'LastColumn'
                ? 'Ao mover o card para a última coluna'
                : 'Pelo botão Encerrar relato'
            }
            defaultOpen
            {...padrao('encerramento')}
          >
            <ClosureFields draft={draft} change={change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="grupo-reabertura"
            title="Reabrir o relato"
            value={describeReopen(draft, voltaPara)}
            {...padrao('reabertura')}
          >
            <ReopenFields
              draft={draft}
              change={change}
              projectPublicId={project.PublicId}
              colunas={colunas.data}
              colunasFalharam={colunas.failed}
              recarregarColunas={colunas.reload}
            />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="grupo-pedido-de-informacao"
            title="Pedir informação a quem relatou"
            value={
              draft.InfoRequestEnabled
                ? `Ligado, aviso em ${dias(draft.InfoRequestWarnDays)} e encerra em ${dias(
                    draft.InfoRequestWarnDays + draft.InfoRequestCloseDays,
                  )}`
                : 'Desligado'
            }
            {...padrao('informacao')}
          >
            <InfoRequestFields draft={draft} change={change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="grupo-espera"
            title="Tempo para desfazer"
            value={
              draft.PublicDelayMinutes === 0
                ? 'Sem espera, quem relatou vê na hora'
                : `Espera ${minutos(draft.PublicDelayMinutes)} antes de quem relatou ver`
            }
            {...padrao('espera')}
          >
            <DelayFields draft={draft} change={change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="grupo-nota"
            title="Nota de satisfação"
            value={describeRating(draft)}
            {...padrao('nota')}
          >
            <RatingFields draft={draft} change={change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="grupo-arquivar"
            title="Arquivar relato"
            value={
              draft.AllowsReportArchiving ? 'Ligado, o time pode arquivar relato' : 'Desligado'
            }
            {...padrao('arquivar')}
          >
            <Marcar
              marcado={draft.AllowsReportArchiving}
              id="arquivar-relato"
              titulo="Deixar o time arquivar relato"
              explicacao="Arquivar tira o card do Trabalho e, se o relato estiver aberto, encerra junto, pedindo como terminou e o motivo."
              aoTrocar={(AllowsReportArchiving) => change({ AllowsReportArchiving })}
            />
            <HowItWorks className="mt-4">
              <p>
                O card arquivado sai do quadro e continua guardado em Arquivados, na tela Trabalho.
              </p>
              <p>
                Como o relato aberto encerra junto, quem relatou recebe o motivo e ainda pode
                reabrir, se a reabertura estiver ligada.
              </p>
              <p>
                Os cards que o próprio time cria, sem vir de um relato, podem ser arquivados sempre,
                com ou sem esta opção.
              </p>
            </HowItWorks>
          </SettingsGroup>

          {MOSTRAR_REGRA_DO_CODIGO && (
            <SettingsGroup
              name={ACORDEAO}
              id="grupo-codigo"
              title="Quem chega sem o link"
              value={draft.TrackingCodeCanAct ? 'O código também age' : 'O código só lê'}
              {...padrao('codigo')}
            >
              <Marcar
                marcado={draft.TrackingCodeCanAct}
                titulo="O código sozinho também confirma e reabre"
                explicacao="Desmarcado, confirmar, reabrir e responder continuam exigindo o link."
                aoTrocar={(TrackingCodeCanAct) => change({ TrackingCodeCanAct })}
              />
              {/* Sem o modo, a regra nao tem quando acontecer — e dizer isso evita que
                  alguem a marque esperando um efeito que nao vem. */}
              <Hint>
                Só tem efeito quando o projeto usa código pessoal, na tela{' '}
                <strong className="font-medium text-fg">Privacidade</strong>.
              </Hint>
              <HowItWorks className="mt-4">
                <p>
                  No modo código pessoal, a pessoa reencontra os relatos dela digitando o código, e
                  chega ao relato sem o link que recebeu quando escreveu. Ler, ela lê. Esta regra
                  decide se ela também age.
                </p>
                <p>
                  A diferença importa porque o código é curto e a pessoa o guarda escrito; o link é
                  longo e ninguém o decora. Nos outros modos, chegar ao relato exige o link de
                  qualquer jeito.
                </p>
              </HowItWorks>
            </SettingsGroup>
          )}
        </div>
      )}
    </div>
  )
}

/** O destino padrao da reabertura, em palavras: a primeira coluna ativa do quadro. */
const PRIMEIRA_COLUNA = 'a primeira coluna do quadro'

/**
 * Para onde o relato reaberto volta, em palavras, como o resumo do grupo diz. Sem as
 * colunas (carregando ou com falha), "a coluna escolhida": o nome nao
 * esta na mao, mas a escolha salva continua valendo.
 */
function destinoDaReabertura(
  escolhida: string | null,
  colunas: ProjectStateViewModel[] | null,
): string {
  if (escolhida === null) return PRIMEIRA_COLUNA
  if (colunas === null) return 'a coluna escolhida'

  const coluna = colunas.find((item) => item.PublicId === escolhida)
  // Desativada ou apagada, a reabertura cai na primeira coluna: e o que acontece de fato.
  return coluna?.IsActive ? coluna.Name : PRIMEIRA_COLUNA
}

/**
 * A coluna que encerra o relato quando o projeto encerra pela ultima coluna: a ultima
 * ativa, na ordem do quadro. Nulo no projeto que encerra pelo botao, em que coluna
 * nenhuma encerra.
 */
function colunaQueEncerra(
  draft: CycleSettingsViewModel,
  colunas: ProjectStateViewModel[] | null,
): ProjectStateViewModel | null {
  if (draft.ClosureTrigger !== 'LastColumn' || colunas === null) return null
  const ativas = colunas.filter((coluna) => coluna.IsActive)
  return ativas.reduce<ProjectStateViewModel | null>(
    (ultima, coluna) => (ultima === null || coluna.Position > ultima.Position ? coluna : ultima),
    null,
  )
}

function describeReopen(draft: CycleSettingsViewModel, voltaPara: string) {
  if (!draft.AllowsReopen) return 'Desligado, quem relatou só pode confirmar que resolveu'
  const coluna = voltaPara === PRIMEIRA_COLUNA ? 'a primeira coluna' : voltaPara
  return `Ligado, e o card volta para ${coluna}${draft.ReopenRequiresComment ? '' : ', sem pedir texto'}`
}

function describeRating(draft: CycleSettingsViewModel) {
  if (!draft.SatisfactionEnabled) return 'Desligado'
  const estilo = draft.SatisfactionStyle === 'Stars' ? 'em estrelas' : 'em números de 1 a 5'
  return `Ligado, ${estilo}, ${draft.SatisfactionRequired ? 'obrigatória' : 'opcional'}`
}

/**
 * As duas formas de encerrar, em blocos com desenho.
 *
 * E o `RadioGroup` do painel, com radios de verdade: o teclado anda entre as opcoes com
 * as setas, o leitor de tela anuncia "1 de 2", e o navegador ja garante que so uma fica
 * marcada.
 */
function ClosureFields({ draft, change }: { draft: CycleSettingsViewModel; change: Change }) {
  return (
    <div>
      <RadioGroup<ClosureTrigger>
        label="Como o time encerra um relato"
        value={draft.ClosureTrigger}
        onChange={(ClosureTrigger) => change({ ClosureTrigger })}
        options={[
          {
            value: 'LastColumn',
            label: 'Ao mover para a última coluna',
            note: 'Levar o card até a última coluna do quadro encerra o relato.',
            drawing: <DesenhoUltimaColuna />,
            className: 'flex-1 basis-44 px-3 py-3',
          },
          {
            value: 'Button',
            label: 'Pelo botão Encerrar relato',
            note: 'Só o botão do card encerra, e o card fica na coluna onde está.',
            drawing: <DesenhoBotao />,
            className: 'flex-1 basis-44 px-3 py-3',
          },
        ]}
      />
      <Hint>
        Nos dois jeitos, o time escolhe como terminou e escreve um motivo, que é o que quem relatou
        lê.
      </Hint>
      <HowItWorks className="mt-3">
        <p>
          <strong className="font-medium text-fg">Ao mover para a última coluna:</strong> quando o
          card chega à última coluna ativa do quadro, o painel pede como terminou e o motivo, e
          tirar o card de lá desfaz o encerramento.
        </p>
        <p>
          <strong className="font-medium text-fg">Pelo botão Encerrar relato:</strong> mudar o card
          de coluna nunca encerra, o que serve para quadros em que a última coluna não quer dizer
          que acabou, como “Aguardando publicação”.
        </p>
        <p>
          O botão Encerrar relato aparece no card enquanto o relato estiver aberto, e quando o
          projeto encerra pela última coluna ele também leva o card até ela.
        </p>
      </HowItWorks>
    </div>
  )
}

/** O nome que o "?" da reabertura sugere para a coluna propria dos reabertos. */
const NOME_SUGERIDO = 'Reaberto'

function ReopenFields({
  draft,
  change,
  projectPublicId,
  colunas,
  colunasFalharam,
  recarregarColunas,
}: {
  draft: CycleSettingsViewModel
  change: Change
  projectPublicId: string
  colunas: ProjectStateViewModel[] | null
  colunasFalharam: boolean
  recarregarColunas: () => void
}) {
  const escolhida = draft.ReopenStatePublicId
  const encerra = colunaQueEncerra(draft, colunas)
  const escolheuAQueEncerra = encerra !== null && escolhida === encerra.PublicId

  const opcoes = [
    { value: '', label: 'A primeira coluna do quadro' },
    ...(colunas ?? [])
      .filter((coluna) => coluna.IsActive)
      .map((coluna) => ({
        value: coluna.PublicId,
        // A coluna que encerra vai marcada: o card reaberto que chega nela fica no meio dos
        // concluidos, parecendo que nunca voltou.
        label:
          coluna.PublicId === encerra?.PublicId ? `${coluna.Name} (encerra o relato)` : coluna.Name,
      })),
  ]
  // A escolha salva que nao esta na lista ainda aparece com um nome: sem isto a caixa
  // ficava em branco, muda, enquanto as colunas nao chegam ou quando elas falham.
  if (escolhida !== null && !opcoes.some((opcao) => opcao.value === escolhida)) {
    const desativada = colunas?.find((coluna) => coluna.PublicId === escolhida)
    opcoes.push({
      value: escolhida,
      label: colunasFalharam
        ? 'A coluna já escolhida'
        : colunas === null
          ? 'Carregando as colunas…'
          : `${desativada?.Name ?? 'Uma coluna apagada'} (vai para a primeira coluna)`,
    })
  }

  return (
    <div>
      <Marcar
        marcado={draft.AllowsReopen}
        id="reabrir"
        titulo="Quem relatou pode reabrir"
        explicacao="Se a pessoa responder “Não, ainda não”, o relato volta para o time, e desligado ela só pode confirmar que resolveu."
        aoTrocar={(AllowsReopen) => change({ AllowsReopen })}
      />

      {draft.AllowsReopen && (
        <div className="mt-3 flex flex-col gap-3 border-border border-l-2 pl-4">
          <div>
            {/* O rotulo mora fora do `Select` para levar o "?" ao lado: e nesse campo que
                quem configura pela primeira vez para sem saber o que escolher. */}
            <div className="mb-1.5 flex items-center gap-1.5">
              <label htmlFor="volta-para" className="text-detail text-fg-muted">
                Coluna para onde o card volta
              </label>
              <AjudaDaColunaDeVolta
                projectPublicId={projectPublicId}
                colunas={colunas}
                encerraPelaUltima={draft.ClosureTrigger === 'LastColumn'}
              />
            </div>
            <Select
              id="volta-para"
              className="max-w-80"
              value={escolhida ?? ''}
              disabled={colunasFalharam}
              onChange={(valor) => change({ ReopenStatePublicId: valor === '' ? null : valor })}
              options={opcoes}
              hint={
                colunasFalharam
                  ? 'Não deu para carregar as colunas agora, mas a coluna já escolhida continua valendo.'
                  : escolheuAQueEncerra
                    ? 'Esta é a coluna que encerra o relato, então o card reaberto ficaria no meio dos concluídos, e o melhor é escolher outra.'
                    : 'O card reaberto entra no topo desta coluna, para o time ver primeiro.'
              }
            />
            {colunasFalharam && (
              <Button size="sm" className="mt-2" onClick={recarregarColunas}>
                Tentar de novo
              </Button>
            )}
          </div>

          <Marcar
            marcado={draft.ReopenRequiresComment}
            id="contar-ao-reabrir"
            titulo="Pedir que a pessoa conte o que ainda acontece"
            explicacao="Para reabrir, ela escreve o que continua errado, e o texto fica no card para quem pegar o trabalho de novo."
            aoTrocar={(ReopenRequiresComment) => change({ ReopenRequiresComment })}
          />
        </div>
      )}

      <HowItWorks className="mt-4">
        <p>
          Depois de ler o motivo, quem relatou responde se resolveu: com “Sim, resolveu” o relato
          termina de vez, e com “Não, ainda não” ele reabre e o card volta para a coluna escolhida.
        </p>
        <p>
          Quem já respondeu “Sim, resolveu” não pode mais reabrir, e se o problema voltar, a pessoa
          faz um relato novo.
        </p>
        <p>
          Se a coluna escolhida for desativada ou apagada, o card reaberto vai para a primeira
          coluna do quadro.
        </p>
      </HowItWorks>
    </div>
  )
}

/**
 * O "?" da coluna da reabertura: sugere uma coluna so para os reabertos, ou uma que o time
 * ja usa, e leva a Colunas com o nome sugerido escrito e o caminho de volta no alto.
 *
 * **O aviso da ultima coluna so aparece quando vale.** A coluna nova entra no fim do
 * quadro, e no projeto que encerra pela ultima coluna ela passaria a encerrar os relatos:
 * quem seguiu a sugestao sem saber disso trocaria um problema por outro.
 */
function AjudaDaColunaDeVolta({
  projectPublicId,
  colunas,
  encerraPelaUltima,
}: {
  projectPublicId: string
  colunas: ProjectStateViewModel[] | null
  encerraPelaUltima: boolean
}) {
  const location = useLocation()
  const jaExiste = colunas?.find(
    (coluna) => coluna.IsActive && /^reabert/i.test(coluna.Name.trim()),
  )
  const estado: EstadoDaVolta & ScrollToHashState & ColunaSugerida = {
    voltarPara: `${location.pathname}${location.search}#grupo-reabertura`,
    rotuloDaVolta: 'Voltar para Encerramento',
    realce: true,
    nomeSugerido: NOME_SUGERIDO,
  }

  return (
    <HelpPopover
      label="Ajuda sobre a coluna da reabertura"
      title="Para onde mandar o card reaberto"
    >
      <p>
        Uma coluna só para os reabertos, como “{NOME_SUGERIDO}”, deixa claro para o time o que
        voltou, e todo card reaberto entra nela.
      </p>
      <p>
        Se preferir, use uma coluna que você já tem, como “A fazer” ou “Em desenvolvimento”, e o
        card reaberto entra no topo dela.
      </p>
      {jaExiste ? (
        <p className="text-fg">
          Você já tem a coluna “{jaExiste.Name}”, e é só escolher ela na lista.
        </p>
      ) : (
        <>
          {encerraPelaUltima && (
            <p className="text-fg">
              Como este projeto encerra na última coluna, depois de criar arraste a coluna nova para
              antes dela, porque toda coluna nova entra no fim do quadro.
            </p>
          )}
          <Link
            to={`/projects/${projectPublicId}/states#nova-coluna`}
            state={estado}
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 font-medium text-detail text-fg transition-colors hover:bg-surface-sunken"
          >
            Criar a coluna “{NOME_SUGERIDO}”
            <svg
              viewBox="0 0 12 12"
              className="size-3 flex-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M2 6h7.5m-3-3 3 3-3 3" />
            </svg>
          </Link>
          <p>
            Depois de criar, use o “Voltar para Encerramento” no alto da tela e escolha a coluna
            nesta lista.
          </p>
        </>
      )}
    </HelpPopover>
  )
}

function InfoRequestFields({ draft, change }: { draft: CycleSettingsViewModel; change: Change }) {
  return (
    <div>
      <Marcar
        marcado={draft.InfoRequestEnabled}
        id="pedir-informacao"
        titulo="O time pode pedir informação a quem relatou"
        explicacao="Em vez de encerrar, o time manda uma pergunta, e a pessoa responde na página de acompanhamento do relato."
        aoTrocar={(InfoRequestEnabled) => change({ InfoRequestEnabled })}
      />
      {/* A condicao vem antes dos prazos: descobrir depois, ao nao achar o botao no card,
          faz parecer defeito. O texto entre aspas e o da caixinha do formulario. */}
      <Hint className="mt-1 ml-6 text-caption">
        Só vale para quem marcou, no formulário, “Pode me perguntar algo sobre isto, se precisarem”.
      </Hint>

      {draft.InfoRequestEnabled && (
        <div className="mt-3 border-border border-l-2 pl-4">
          <Dias
            id="aviso"
            rotulo="Dias sem resposta até o aviso"
            valor={draft.InfoRequestWarnDays}
            aoTrocar={(InfoRequestWarnDays) => change({ InfoRequestWarnDays })}
            explicacao="Passado esse prazo, a página de acompanhamento avisa a pessoa que o relato vai ser encerrado."
          />

          <Dias
            id="encerrar"
            rotulo="Dias depois do aviso até encerrar"
            valor={draft.InfoRequestCloseDays}
            aoTrocar={(InfoRequestCloseDays) => change({ InfoRequestCloseDays })}
            explicacao={`Sem resposta até lá, o relato encerra sozinho como “Sem retorno”${
              draft.AllowsReopen ? ', e a pessoa ainda pode reabrir' : ''
            }.`}
          />

          <p className="text-caption text-fg leading-relaxed">
            No total, {dias(draft.InfoRequestWarnDays + draft.InfoRequestCloseDays)} entre a
            pergunta e o encerramento.
          </p>
        </div>
      )}

      <HowItWorks className="mt-4">
        <p>
          Use quando falta algo para entender o problema, como um passo a passo ou um print, em vez
          de encerrar como “Não será feito”.
        </p>
        <p>
          O botão Pedir informação aparece no card, ao lado de Encerrar relato, e quando a pessoa
          responde, a resposta chega ao card e os prazos param de contar.
        </p>
      </HowItWorks>
    </div>
  )
}

function DelayFields({ draft, change }: { draft: CycleSettingsViewModel; change: Change }) {
  return (
    <div>
      {/* `#mais-opcoes` era o "Mais opções", que comecava pela espera: o endereco
          antigo cai aqui. */}
      <div id="mais-opcoes" className="scroll-mt-6">
        <label htmlFor="espera" className="mb-1.5 block text-detail text-fg-muted">
          Esperar antes de quem relatou ver
        </label>
        <div className="mb-1.5 flex items-center gap-2">
          {/* Um `number` de verdade: o teclado do telefone abre numerico, as setas
              funcionam, e o navegador ja recusa letra. O `TextField` do painel e
              de texto, e aqui o que se digita e um numero de minutos. */}
          <NumberField
            id="espera"
            min={0}
            max={MAX_PUBLIC_DELAY_MINUTES}
            value={draft.PublicDelayMinutes}
            onChange={(texto) =>
              change({
                // Campo vazio vira zero, e nao `NaN`: apagar tudo para digitar
                // outro numero e o gesto comum, e `NaN` quebraria a comparacao
                // que decide se ha algo a salvar.
                PublicDelayMinutes: Number.parseInt(texto, 10) || 0,
              })
            }
          />
          <span className="text-detail text-fg-muted">minutos</span>
        </div>
        <p className="text-caption text-fg-muted leading-relaxed">
          {draft.PublicDelayMinutes === 0
            ? 'Com zero, quem relatou vê na hora cada mudança de coluna e cada encerramento.'
            : 'Nesse tempo quem relatou ainda não vê a mudança, e o time pode desfazer movendo o card de volta.'}
        </p>
      </div>

      <HowItWorks className="mt-4">
        <p>
          Serve para quando alguém arrasta um card para a coluna errada: dentro da espera, basta
          mover de volta e quem relatou nem fica sabendo.
        </p>
        <p>
          O botão Encerrar relato não espera, porque ali o time já escolheu como terminou e escreveu
          o motivo.
        </p>
      </HowItWorks>
    </div>
  )
}

function RatingFields({ draft, change }: { draft: CycleSettingsViewModel; change: Change }) {
  return (
    <div>
      <Marcar
        marcado={draft.SatisfactionEnabled}
        id="nota"
        titulo="Pedir uma nota quando a pessoa disser que resolveu"
        explicacao="Uma nota de 1 a 5 sobre o atendimento do time, e não sobre o produto."
        aoTrocar={(SatisfactionEnabled) => change({ SatisfactionEnabled })}
      />

      {draft.SatisfactionEnabled && (
        <div className="mt-3 flex flex-col gap-3 border-border border-l-2 pl-4">
          <Field id="estilo-da-nota" label="Como a nota aparece">
            <Options<SatisfactionStyle>
              label="Como a nota aparece"
              value={draft.SatisfactionStyle}
              onChange={(SatisfactionStyle) => change({ SatisfactionStyle })}
              options={(Object.keys(ESTILOS) as SatisfactionStyle[]).map((estilo) => ({
                value: estilo,
                label: ESTILOS[estilo],
              }))}
            />
          </Field>

          <Marcar
            marcado={draft.SatisfactionRequired}
            titulo="Exigir a nota para confirmar"
            explicacao="Mesmo assim a pessoa pode escolher “Prefiro não responder”, que não conta como nota."
            aoTrocar={(SatisfactionRequired) => change({ SatisfactionRequired })}
          />
        </div>
      )}

      <HowItWorks className="mt-4">
        <p>A nota aparece quando a pessoa responde “Sim, resolveu”, e quem reabre não dá nota.</p>
        <p>
          Mesmo obrigatória, a nota mantém o “Prefiro não responder”, porque sem essa saída muita
          gente marca qualquer nota só para seguir, e a média deixa de dizer alguma coisa.
        </p>
      </HowItWorks>
    </div>
  )
}

/** Tres colunas, o card entrando na ultima: mover ate la encerra. */
function DesenhoUltimaColuna() {
  return (
    <svg
      viewBox="0 0 64 36"
      className="h-9 w-16 text-fg-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="3" width="17" height="30" rx="2.5" />
      <rect x="23.5" y="3" width="17" height="30" rx="2.5" />
      <rect x="45" y="3" width="17" height="30" rx="2.5" className="text-accent" />
      <rect x="26.5" y="8" width="11" height="6" rx="1.2" />
      <path d="M38 11h8.5m-2.5-2.5 2.5 2.5-2.5 2.5" className="text-accent" />
      <rect x="48" y="18" width="11" height="6" rx="1.2" className="text-accent" />
    </svg>
  )
}

/** O card aberto com o botao de concluir: o botao encerra, e o card nao se move. */
function DesenhoBotao() {
  return (
    <svg
      viewBox="0 0 64 36"
      className="h-9 w-16 text-fg-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="6" y="3" width="52" height="30" rx="2.5" />
      <path d="M12 10h22M12 15h16" />
      <rect x="30" y="21" width="22" height="8" rx="4" className="text-accent" />
      <path d="m36.5 25 2 2 4-4" className="text-accent" />
    </svg>
  )
}

/** "1 minuto", "30 minutos". */
function minutos(valor: number) {
  return `${valor} ${valor === 1 ? 'minuto' : 'minutos'}`
}

/** "1 dia", "7 dias". */
function dias(valor: number) {
  return `${valor} ${valor === 1 ? 'dia' : 'dias'}`
}
