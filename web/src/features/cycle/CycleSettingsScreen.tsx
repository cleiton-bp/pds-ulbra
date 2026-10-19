import { useCallback, useState } from 'react'
import type {
  ClosureTrigger,
  CycleSettingsViewModel,
  ProjectStateViewModel,
  SatisfactionStyle,
} from '@/contracts'
import { MAX_PUBLIC_DELAY_MINUTES } from '@/contracts'
import { projectStateService } from '@/data'
import { Dias, Marcar, useCycleDraft } from '@/features/cycle/cycleParts'
import { dias, minutos, type PathPart, ReportPath } from '@/features/cycle/ReportPath'
import { Button } from '@/shared/components/Button'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { NumberField } from '@/shared/components/NumberField'
import { Select } from '@/shared/components/Select'
import { Field, Hint, Options, RadioGroup } from '@/shared/components/SettingsControls'
import { SettingsGroup } from '@/shared/components/SettingsGroup'
import { SettingsHeader } from '@/shared/components/SettingsHeader'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { CYCLE_DEFAULTS, changedFromDefaults, defaultsOf } from '@/shared/lib/factoryDefaults'

type Campos = ReadonlyArray<readonly [keyof CycleSettingsViewModel, string]>

/**
 * Os grupos da tela, **na ordem do caminho do relato**, cada campo com o nome do "Mudou".
 * Cada campo mora num grupo so: e com esta lista que o grupo diz o que mudou e que o
 * "Voltar ao padrão" dele sabe o que trocar — e so isso, porque o rascunho e o mesmo de
 * Sprints e Colunas (`useCycleDraft`).
 */
const GRUPOS = {
  encerramento: [['ClosureTrigger', 'Quando encerra']],
  reabertura: [
    ['AllowsReopen', 'Deixar reabrir'],
    ['ReopenStatePublicId', 'Coluna da reabertura'],
    ['ReopenRequiresComment', 'Pedir o que acontece'],
  ],
  informacao: [
    ['InfoRequestEnabled', 'Pedir informação'],
    ['InfoRequestWarnDays', 'Prazo do aviso'],
    ['InfoRequestCloseDays', 'Prazo do encerramento'],
  ],
  espera: [['PublicDelayMinutes', 'Espera antes de mostrar']],
  nota: [
    ['SatisfactionEnabled', 'Nota ao confirmar'],
    ['SatisfactionStyle', 'Como a nota aparece'],
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

/** A parte do caminho que cada grupo muda: e ela que o diagrama contorna. */
const PARTE_NO_CAMINHO: Record<Grupo, PathPart> = {
  encerramento: 'close',
  reabertura: 'reopen',
  informacao: 'info',
  espera: 'wait',
  nota: 'confirm',
  arquivar: 'archive',
  codigo: 'read',
}

const ESTILOS: Record<SatisfactionStyle, string> = {
  Stars: 'Estrelas',
  Number: 'Números de 1 a 5',
}

/**
 * **"O codigo sozinho tambem confirma e reabre" esta escondida, e nao removida.**
 * Marcada, ela liga os botoes para quem chega pela lista pessoal — mas confirmar,
 * reabrir e responder so aceitam o token do link, e quem chega pelo codigo nao o
 * tem: o botao aparecia e a API recusava. Volta quando essas tres rotas aceitarem
 * o codigo. Ate la o valor salvo segue intacto no rascunho, como o das regras sem
 * tela.
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
 * **A direita, o caminho do relato gerado do rascunho** (`ReportPath`), contornando a
 * parte que o grupo aberto ou em foco muda: quem configura ve o que a regra faz com o
 * relato, e nao so o nome dela.
 *
 * **O rascunho manda de volta o que recebeu** (`useCycleDraft`). As regras do quadro
 * moram na tela de Colunas, e as sprints na tela de Sprints: estavam no fim desta
 * pagina, longe de quem as procurava — ninguem procura "ligar sprints" numa tela que
 * fala de encerramento.
 */
export function CycleSettingsScreen() {
  const project = useCurrentProject()

  // So o que esta tela mexe. Ver `useCycleDraft`.
  const { draft, change, loading, failed, reload, saving, dirty, changeCount, salvar, descartar } =
    useCycleDraft(project.PublicId, CAMPOS_NA_TELA, 'Regras salvas.')

  // As colunas, para escolher o destino da reabertura. **Falhar aqui nao impede
  // configurar o resto**: so aquele campo fica indisponivel, e a tela diz por que.
  const colunas = useAsyncResource(
    useCallback(() => projectStateService.listProjectStates(project.PublicId), [project.PublicId]),
  )

  /** O grupo aberto e o grupo em que a pessoa esta: o segundo vence, no caminho. */
  const [aberto, setAberto] = useState<Grupo | null>(null)
  const [emFoco, setEmFoco] = useState<Grupo | null>(null)
  const grupoRealcado = emFoco ?? aberto

  /** Liga o grupo ao caminho: aberto e em foco contornam a parte dele. */
  function acompanhar(grupo: Grupo) {
    return {
      onToggle: (abriu: boolean) =>
        setAberto((atual) => (abriu ? grupo : atual === grupo ? null : atual)),
      onFocusWithin: (dentro: boolean) =>
        setEmFoco((atual) => (dentro ? grupo : atual === grupo ? null : atual)),
    }
  }

  /** O que o grupo mudou do padrao, e o "Voltar ao padrão" so dos campos dele. */
  function padrao(grupo: Grupo) {
    return {
      changes: draft ? changedFromDefaults(draft, CYCLE_DEFAULTS, GRUPOS[grupo]) : [],
      onReset: () => change(defaultsOf(CYCLE_DEFAULTS, GRUPOS[grupo])),
    }
  }

  const voltaPara = draft ? destinoDaReabertura(draft.ReopenStatePublicId, colunas.data) : ''

  return (
    <div className="max-w-6xl">
      <SettingsHeader
        title="Ciclo"
        description="Como um relato termina, quando quem relatou pode reabrir e quando o time pode pedir mais informação."
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
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      )}

      {draft && (
        <EditorWithPreview
          preview={
            <ReportPath
              draft={draft}
              reopenColumn={voltaPara}
              dirty={dirty}
              highlight={grupoRealcado ? PARTE_NO_CAMINHO[grupoRealcado] : null}
            />
          }
        >
          <SettingsGroup
            name={ACORDEAO}
            id="encerramento"
            title="Encerramento"
            value={draft.ClosureTrigger === 'LastColumn' ? 'Na última coluna' : 'Por um botão'}
            defaultOpen
            {...padrao('encerramento')}
            {...acompanhar('encerramento')}
          >
            <ClosureFields draft={draft} change={change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="grupo-reabertura"
            title="Reabertura"
            value={describeReopen(draft, voltaPara)}
            {...padrao('reabertura')}
            {...acompanhar('reabertura')}
          >
            <ReopenFields
              draft={draft}
              change={change}
              colunas={colunas.data}
              colunasFalharam={colunas.failed}
              recarregarColunas={colunas.reload}
            />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="grupo-pedido-de-informacao"
            title="Pedido de informação"
            value={
              draft.InfoRequestEnabled
                ? `${draft.InfoRequestWarnDays} + ${draft.InfoRequestCloseDays} dias`
                : 'Desligado'
            }
            {...padrao('informacao')}
            {...acompanhar('informacao')}
          >
            <InfoRequestFields draft={draft} change={change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="grupo-espera"
            title="Antes de mostrar"
            value={
              draft.PublicDelayMinutes === 0
                ? 'Na hora'
                : `Espera ${minutos(draft.PublicDelayMinutes)}`
            }
            {...padrao('espera')}
            {...acompanhar('espera')}
          >
            <DelayFields draft={draft} change={change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="grupo-nota"
            title="Nota ao confirmar"
            value={describeRating(draft)}
            {...padrao('nota')}
            {...acompanhar('nota')}
          >
            <RatingFields draft={draft} change={change} />
          </SettingsGroup>

          <SettingsGroup
            name={ACORDEAO}
            id="grupo-arquivar"
            title="Arquivar relato"
            value={draft.AllowsReportArchiving ? 'Permitido' : 'Não permitido'}
            {...padrao('arquivar')}
            {...acompanhar('arquivar')}
          >
            <Marcar
              marcado={draft.AllowsReportArchiving}
              id="arquivar-relato"
              titulo="Deixar o time arquivar relato"
              explicacao="O relato aberto encerra junto, com desfecho e motivo."
              aoTrocar={(AllowsReportArchiving) => change({ AllowsReportArchiving })}
            />
            <HowItWorks className="mt-4">
              <p>
                Arquivar tira o relato do Trabalho; se ele estiver aberto, encerra junto, com
                desfecho e motivo, para ninguém ficar sem retorno.
              </p>
              <p>
                Quem relatou lê o motivo e pode reabrir. O card do time se arquiva sempre, com ou
                sem esta regra.
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
              {...acompanhar('codigo')}
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
                <strong className="font-medium text-fg">Quem relata</strong>.
              </Hint>
              <HowItWorks className="mt-4">
                <p>
                  No modo código pessoal, a pessoa reencontra os relatos dela digitando o código — e
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
        </EditorWithPreview>
      )}
    </div>
  )
}

/**
 * Para onde o relato reaberto volta, em palavras — o mesmo texto no resumo do grupo e no
 * caminho. Sem as colunas (carregando ou com falha), "a coluna escolhida": o nome nao
 * esta na mao, mas a escolha salva continua valendo.
 */
function destinoDaReabertura(
  escolhida: string | null,
  colunas: ProjectStateViewModel[] | null,
): string {
  if (escolhida === null) return 'a primeira coluna da fila'
  if (colunas === null) return 'a coluna escolhida'

  const coluna = colunas.find((item) => item.PublicId === escolhida)
  // Desativada ou apagada, a reabertura cai na primeira da fila: e o que acontece de fato.
  return coluna?.IsActive ? coluna.Name : 'a primeira coluna da fila'
}

function describeReopen(draft: CycleSettingsViewModel, voltaPara: string) {
  if (!draft.AllowsReopen) return 'Não pode'
  const coluna = voltaPara === 'a primeira coluna da fila' ? 'a primeira coluna' : voltaPara
  return `Pode · volta para ${coluna}${draft.ReopenRequiresComment ? '' : ' · sem pedir texto'}`
}

function describeRating(draft: CycleSettingsViewModel) {
  if (!draft.SatisfactionEnabled) return 'Não pede'
  const estilo = draft.SatisfactionStyle === 'Stars' ? 'Estrelas' : 'Números'
  return `${estilo} · ${draft.SatisfactionRequired ? 'obrigatória' : 'opcional'}`
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
        label="Quando o relato encerra"
        value={draft.ClosureTrigger}
        onChange={(ClosureTrigger) => change({ ClosureTrigger })}
        options={[
          {
            value: 'LastColumn',
            label: 'Ao cair na última coluna',
            note: 'Mover para lá encerra.',
            drawing: <DesenhoUltimaColuna />,
            className: 'flex-1 basis-44 px-3 py-3',
          },
          {
            value: 'Button',
            label: 'Por um botão de concluir',
            note: 'O relato fica onde está.',
            drawing: <DesenhoBotao />,
            className: 'flex-1 basis-44 px-3 py-3',
          },
        ]}
      />
      <Hint>Encerrar sempre pede um motivo, e é ele que quem relatou lê.</Hint>
      <HowItWorks className="mt-3">
        <p>
          <strong className="font-medium text-fg">Na última coluna:</strong> mover um relato para a
          última coluna ativa encerra, e o painel pede o desfecho e o motivo no mesmo gesto.
          Desativar a última coluna passa a vez para a anterior.
        </p>
        <p>
          <strong className="font-medium text-fg">Por um botão:</strong> nenhum movimento encerra.
          Existe um botão no relato aberto, e o relato fica onde está. Para quem termina em
          “Aguardando deploy” ou “Arquivado” — colunas que não querem dizer que acabou.
        </p>
      </HowItWorks>
    </div>
  )
}

function ReopenFields({
  draft,
  change,
  colunas,
  colunasFalharam,
  recarregarColunas,
}: {
  draft: CycleSettingsViewModel
  change: Change
  colunas: ProjectStateViewModel[] | null
  colunasFalharam: boolean
  recarregarColunas: () => void
}) {
  const escolhida = draft.ReopenStatePublicId

  const opcoes = [
    { value: '', label: 'A primeira coluna da fila' },
    ...(colunas ?? [])
      .filter((coluna) => coluna.IsActive)
      .map((coluna) => ({ value: coluna.PublicId, label: coluna.Name })),
  ]
  // A escolha salva que nao esta na lista ainda aparece com um nome: sem isto a caixa
  // ficava em branco — muda — enquanto as colunas nao chegam ou quando elas falham.
  if (escolhida !== null && !opcoes.some((opcao) => opcao.value === escolhida)) {
    const desativada = colunas?.find((coluna) => coluna.PublicId === escolhida)
    opcoes.push({
      value: escolhida,
      label: colunasFalharam
        ? 'A coluna já escolhida'
        : colunas === null
          ? 'Carregando as colunas…'
          : `${desativada?.Name ?? 'Uma coluna apagada'} (cai na primeira da fila)`,
    })
  }

  return (
    <div>
      <Marcar
        marcado={draft.AllowsReopen}
        id="reabrir"
        titulo="Deixar quem relatou reabrir"
        explicacao="Desligado, a pessoa só pode confirmar; o relato encerrado não volta mais."
        aoTrocar={(AllowsReopen) => change({ AllowsReopen })}
      />

      {draft.AllowsReopen && (
        <div className="mt-3 flex flex-col gap-3 border-border border-l-2 pl-4">
          <div>
            <Select
              id="volta-para"
              label="O relato reaberto volta para"
              className="max-w-80"
              value={escolhida ?? ''}
              disabled={colunasFalharam}
              onChange={(valor) => change({ ReopenStatePublicId: valor === '' ? null : valor })}
              options={opcoes}
              hint={
                colunasFalharam
                  ? 'Não deu para carregar as colunas, então não dá para trocar agora. A escolha salva continua valendo.'
                  : 'Uma coluna “Reaberto” ajuda a ver o que já voltou uma vez.'
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
            titulo="Pedir que ela conte o que ainda está acontecendo"
            explicacao="O texto vai junto, para quem pegar o trabalho de novo."
            aoTrocar={(ReopenRequiresComment) => change({ ReopenRequiresComment })}
          />
        </div>
      )}

      <HowItWorks className="mt-4">
        <p>
          Quem relatou lê o motivo e responde se resolveu. Dizendo que não, o relato volta para a
          fila, na coluna escolhida.
        </p>
        <p>
          Uma coluna própria — “Reaberto” — ajuda a não perder de vista o que já voltou uma vez.
          Desativar a coluna escolhida faz a reabertura cair na primeira da fila.
        </p>
      </HowItWorks>
    </div>
  )
}

function InfoRequestFields({ draft, change }: { draft: CycleSettingsViewModel; change: Change }) {
  return (
    <div>
      <Marcar
        marcado={draft.InfoRequestEnabled}
        id="pedir-informacao"
        titulo="Deixar o time devolver o relato pedindo informação"
        explicacao="Só para quem aceitou responder dúvidas ao escrever."
        aoTrocar={(InfoRequestEnabled) => change({ InfoRequestEnabled })}
      />

      {draft.InfoRequestEnabled && (
        <div className="mt-3 border-border border-l-2 pl-4">
          <Dias
            id="aviso"
            rotulo="Avisar depois de"
            valor={draft.InfoRequestWarnDays}
            aoTrocar={(InfoRequestWarnDays) => change({ InfoRequestWarnDays })}
            explicacao="O acompanhamento passa a dizer que o relato vai encerrar."
          />

          <Dias
            id="encerrar"
            rotulo="E encerrar mais"
            valor={draft.InfoRequestCloseDays}
            aoTrocar={(InfoRequestCloseDays) => change({ InfoRequestCloseDays })}
            explicacao="Depois do aviso, encerra como “sem retorno”."
          />

          <p className="text-caption text-fg leading-relaxed">
            No total, {dias(draft.InfoRequestWarnDays + draft.InfoRequestCloseDays)} entre a
            pergunta e o encerramento.
          </p>
        </div>
      )}

      <HowItWorks className="mt-4">
        <p>
          “Não reproduzi” não é “não vamos fazer”: o time devolve o relato com uma pergunta, e quem
          relatou tem um prazo para responder.
        </p>
        <p>O relato de quem não aceitou responder dúvidas ao escrever não pode ser devolvido.</p>
        <p>
          Encerrado como “sem retorno”, o relato continua podendo ser reaberto por quem o escreveu.
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
          Esperar antes de mostrar
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
            ? 'Zero: quem relatou vê o movimento na hora. É como funciona hoje.'
            : 'Depende de uma fila configurada nesta instalação. Sem ela, salvar é recusado com o motivo.'}
        </p>
      </div>

      <HowItWorks className="mt-4">
        <p>
          Tempo para desfazer um movimento por engano antes de quem relatou ver: desfazer é mover de
          volta.
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
        titulo="Pedir uma nota ao confirmar"
        explicacao="De 1 a 5, sobre o atendimento do relato — e não sobre o produto."
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
            titulo="Exigir a resposta para confirmar"
            explicacao="“Prefiro não responder” continua existindo, fora da escala."
            aoTrocar={(SatisfactionRequired) => change({ SatisfactionRequired })}
          />
        </div>
      )}

      <HowItWorks className="mt-4">
        <p>Quem confirma que resolveu pode dar uma nota ao atendimento. Quem reabre não dá nota.</p>
        <p>
          A nota obrigatória mantém o “Prefiro não responder”: sem saída, a obrigação vira clique
          sem pensar e a média passa a medir o clique.
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
