import { useCallback, useEffect, useState } from 'react'
import type { ClosureTrigger, CycleSettingsViewModel, SatisfactionStyle } from '@/contracts'
import { MAX_INFO_REQUEST_DAYS, MAX_PUBLIC_DELAY_MINUTES } from '@/contracts'
import { describeError, projectCycleSettingsService, projectStateService } from '@/data'
import { Button } from '@/shared/components/Button'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'

/**
 * Como o ciclo fecha neste projeto.
 *
 * **A tela nasce com um campo, e vai crescer.** As treze regras do ciclo ja
 * existem no banco e viajam inteiras a cada salvamento, mas so aparece aqui o que
 * o produto ja sabe obedecer — desenhar um controle que nao muda nada seria pior
 * do que nao ter o controle.
 *
 * **O rascunho manda de volta o que recebeu.** O salvamento substitui as treze
 * regras de uma vez; uma tela que mandasse so o campo visivel apagaria as outras
 * doze. E e por isso que `saved` nunca e descartado: ele e a base de tudo que nao
 * esta na tela.
 */

/**
 * **"O código sozinho também confirma e reabre" está escondida, e não removida.**
 * Marcada, ela liga os botões para quem chega pela lista pessoal — mas confirmar,
 * reabrir e responder só aceitam o token do link, e quem chega pelo código não o
 * tem: o botão aparecia e a API recusava. Volta quando essas três rotas aceitarem
 * o código. Até lá o valor salvo segue intacto no rascunho, como o das regras sem
 * tela.
 */
const MOSTRAR_REGRA_DO_CODIGO = false

export function CycleSettingsScreen() {
  const project = useCurrentProject()

  const {
    data: saved,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(
      () => projectCycleSettingsService.getCycleSettings(project.PublicId),
      [project.PublicId],
    ),
  )

  // As colunas, para escolher o destino da reabertura. **Falhar aqui não impede
  // configurar o resto**: só aquele campo fica indisponível, e a tela diz por quê.
  const { data: colunas } = useAsyncResource(
    useCallback(() => projectStateService.listProjectStates(project.PublicId), [project.PublicId]),
  )

  const [draft, setDraft] = useState<CycleSettingsViewModel | null>(null)
  const [published, setPublished] = useState<CycleSettingsViewModel | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPublished(saved)
    setDraft(saved)
  }, [saved])

  // Compara so o que a tela mexe. Comparar as treze diria "há mudança" para uma
  // diferença que ninguém pode ter feito, porque não há controle para ela.
  const CAMPOS_NA_TELA = [
    'ClosureTrigger',
    'PublicDelayMinutes',
    'AllowsReopen',
    'ReopenStatePublicId',
    'ReopenRequiresComment',
    'TrackingCodeCanAct',
    'SatisfactionEnabled',
    'SatisfactionStyle',
    'SatisfactionRequired',
    'InfoRequestEnabled',
    'InfoRequestWarnDays',
    'InfoRequestCloseDays',
  ] as const

  const dirty =
    draft !== null &&
    published !== null &&
    CAMPOS_NA_TELA.some((campo) => draft[campo] !== published[campo])

  async function salvar() {
    if (!draft || saving) return

    setSaving(true)

    try {
      const gravado = await projectCycleSettingsService.saveCycleSettings(project.PublicId, draft)
      setPublished(gravado)
      setDraft(gravado)
      toast.done('Regras salvas.')
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Ciclo</h1>
      <p className="mb-6 text-body text-fg-muted leading-relaxed">
        O que acontece quando o trabalho acaba: como o relato encerra, e o que quem escreveu lê
        sobre isso.
      </p>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar as regras agora. Nada mudou: a falha foi ao consultar, e o projeto
            continua se comportando como estava.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {draft && (
        <section>
          <h2 className="mb-1 font-medium text-fg text-lead">Quando o relato encerra</h2>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            Encerrar sempre pede um motivo, nos dois casos. É esse texto que quem relatou lê — o que
            muda aqui é só por onde o painel pergunta.
          </p>

          <div className="mb-5 flex flex-col gap-2.5">
            <Escolha
              valor="LastColumn"
              escolhido={draft.ClosureTrigger}
              titulo="Ao cair na última coluna"
              explicacao="Mover um relato para a última coluna ativa encerra, e o painel pede o desfecho e o motivo no mesmo gesto. Aposentar a última coluna passa a vez para a anterior."
              aoEscolher={(valor) => setDraft({ ...draft, ClosureTrigger: valor })}
            />

            <Escolha
              valor="Button"
              escolhido={draft.ClosureTrigger}
              titulo="Por um botão de concluir"
              explicacao="Nenhum movimento encerra. Existe um botão no relato aberto, e o relato fica onde está. Para quem termina em “Aguardando deploy” ou “Arquivado” — colunas que não querem dizer que acabou."
              aoEscolher={(valor) => setDraft({ ...draft, ClosureTrigger: valor })}
            />
          </div>

          <h2 className="mt-8 mb-1 font-medium text-fg text-lead">Antes de quem relatou ver</h2>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            Uma janela entre o time mover o relato e a pessoa lá fora ver o movimento. Serve para
            quem arrastou o card por engano ter tempo de corrigir —{' '}
            <strong className="font-medium text-fg">desfazer é mover de volta</strong>, e a tela do
            relato mostra até quando dá.
          </p>

          <label htmlFor="espera" className="mb-1.5 block text-detail text-fg-muted">
            Esperar antes de mostrar
          </label>
          <div className="mb-1.5 flex items-center gap-2">
            {/* Um `number` de verdade: o teclado do telefone abre numérico, as setas
                funcionam, e o navegador já recusa letra. O `TextField` do painel é
                de texto, e aqui o que se digita é um número de minutos. */}
            <input
              id="espera"
              type="number"
              min={0}
              max={MAX_PUBLIC_DELAY_MINUTES}
              value={draft.PublicDelayMinutes}
              onChange={(evento) =>
                setDraft({
                  ...draft,
                  // Campo vazio vira zero, e não `NaN`: apagar tudo para digitar
                  // outro número é o gesto comum, e `NaN` quebraria a comparação
                  // que decide se há algo a salvar.
                  PublicDelayMinutes: Number.parseInt(evento.target.value, 10) || 0,
                })
              }
              className="h-9 w-28 rounded-lg border border-border bg-surface-raised px-3 text-body text-fg"
            />
            <span className="text-detail text-fg-muted">minutos</span>
          </div>
          <p className="text-caption text-fg-muted leading-relaxed">
            {draft.PublicDelayMinutes === 0
              ? 'Zero: quem relatou vê o movimento na hora. É como funciona hoje.'
              : 'Depende de uma fila configurada nesta instalação. Sem ela, salvar é recusado com o motivo.'}
          </p>

          <h2 className="mt-8 mb-1 font-medium text-fg text-lead">Se a pessoa disser que não</h2>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            Quem relatou lê o motivo e responde: resolveu, ou não. Dizendo que não, o relato volta
            para a fila — e a jornada pública volta junto, porque foi ela que pediu.
          </p>

          <Marcar
            marcado={draft.AllowsReopen}
            titulo="Deixar quem relatou reabrir"
            explicacao="Desligado, a pessoa só pode confirmar. O relato encerrado não volta mais."
            aoTrocar={(valor) => setDraft({ ...draft, AllowsReopen: valor })}
          />

          {draft.AllowsReopen && (
            <div className="mt-3 border-border border-l-2 pl-4">
              <Select
                label="O relato reaberto volta para"
                className="mb-1.5 max-w-80"
                value={draft.ReopenStatePublicId ?? ''}
                onChange={(valor) =>
                  setDraft({ ...draft, ReopenStatePublicId: valor === '' ? null : valor })
                }
                options={[
                  { value: '', label: 'A primeira coluna da fila' },
                  ...(colunas ?? [])
                    .filter((coluna) => coluna.IsActive)
                    .map((coluna) => ({ value: coluna.PublicId, label: coluna.Name })),
                ]}
              />
              <p className="mb-3 text-caption text-fg-muted leading-relaxed">
                Uma coluna própria — “Reaberto” — ajuda a não perder de vista o que já voltou uma
                vez. Aposentar a coluna escolhida faz a reabertura cair na primeira da fila.
              </p>

              <Marcar
                marcado={draft.ReopenRequiresComment}
                titulo="Pedir que ela conte o que ainda está acontecendo"
                explicacao="O texto vai junto com o relato, e é o que ajuda quem for pegar o trabalho de novo."
                aoTrocar={(valor) => setDraft({ ...draft, ReopenRequiresComment: valor })}
              />
            </div>
          )}

          <h2 className="mt-8 mb-1 font-medium text-fg text-lead">Se disser que sim</h2>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            Quem confirma pode dar uma nota sobre como foi o atendimento.{' '}
            <strong className="font-medium text-fg">Quem reabre não dá nota</strong> — está dizendo
            que o trabalho não acabou, e avaliar serviço inacabado mede outra coisa.
          </p>

          <Marcar
            marcado={draft.SatisfactionEnabled}
            titulo="Pedir uma nota ao confirmar"
            explicacao="De 1 a 5, sobre o atendimento do relato — e não sobre o produto."
            aoTrocar={(valor) => setDraft({ ...draft, SatisfactionEnabled: valor })}
          />

          {draft.SatisfactionEnabled && (
            <div className="mt-3 border-border border-l-2 pl-4">
              <Select
                label="Como a nota aparece"
                className="mb-3 max-w-80"
                value={draft.SatisfactionStyle}
                onChange={(valor) =>
                  setDraft({ ...draft, SatisfactionStyle: valor as SatisfactionStyle })
                }
                options={[
                  { value: 'Stars', label: 'Estrelas' },
                  { value: 'Number', label: 'Números de 1 a 5' },
                ]}
              />

              <Marcar
                marcado={draft.SatisfactionRequired}
                titulo="Exigir a resposta para confirmar"
                explicacao="“Prefiro não responder” continua existindo, fora da escala: sem saída, a obrigação vira clique sem pensar e a média passa a medir o clique."
                aoTrocar={(valor) => setDraft({ ...draft, SatisfactionRequired: valor })}
              />
            </div>
          )}

          <h2 className="mt-8 mb-1 font-medium text-fg text-lead">Quando falta informação</h2>
          <p className="mb-4 text-detail text-fg-muted leading-relaxed">
            Nem todo relato que volta é recusado.{' '}
            <strong className="font-medium text-fg">“Não reproduzi” não é “não vamos fazer”</strong>{' '}
            — e chegando iguais do outro lado, a pessoa entende que acabou e para de responder.
            Devolver pedindo informação é a outra saída, e ela tem prazo.
          </p>

          <Marcar
            marcado={draft.InfoRequestEnabled}
            titulo="Deixar o time devolver o relato pedindo informação"
            explicacao="Só vale para quem aceitou responder dúvidas ao escrever — o relato de quem não aceitou não pode ser devolvido."
            aoTrocar={(valor) => setDraft({ ...draft, InfoRequestEnabled: valor })}
          />

          {draft.InfoRequestEnabled && (
            <div className="mt-3 border-border border-l-2 pl-4">
              <Dias
                id="aviso"
                rotulo="Avisar depois de"
                valor={draft.InfoRequestWarnDays}
                aoTrocar={(valor) => setDraft({ ...draft, InfoRequestWarnDays: valor })}
                explicacao="Passado esse prazo, a página de acompanhamento passa a dizer que o relato vai encerrar."
              />

              <Dias
                id="encerrar"
                rotulo="E encerrar mais"
                valor={draft.InfoRequestCloseDays}
                aoTrocar={(valor) => setDraft({ ...draft, InfoRequestCloseDays: valor })}
                explicacao="Depois do aviso. O relato encerra como “sem retorno” — e continua podendo ser reaberto por quem o escreveu."
              />

              <p className="text-caption text-fg-muted leading-relaxed">
                No total, {draft.InfoRequestWarnDays + draft.InfoRequestCloseDays} dias entre a
                pergunta e o encerramento.
              </p>
            </div>
          )}

          <div className="mt-8">
            <Button variant="primary" disabled={!dirty || saving} onClick={salvar}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>

          {MOSTRAR_REGRA_DO_CODIGO && (
            <>
              {/* O que ainda não está aqui, dito na tela em vez de descoberto depois.
              Uma tela de configuração que cala sobre o que não configura faz a
              pessoa procurar o controle que não existe. */}
              <h2 className="mt-8 mb-1 font-medium text-fg text-lead">Quem chega sem o link</h2>
              <p className="mb-4 text-detail text-fg-muted leading-relaxed">
                No modo <strong className="font-medium text-fg">código pessoal</strong>, a pessoa
                reencontra os relatos dela digitando o código — e chega ao relato sem o link que ela
                recebeu quando escreveu. Ler, ela lê. O que esta regra decide é se ela também{' '}
                <strong className="font-medium text-fg">age</strong>.
              </p>

              <Marcar
                marcado={draft.TrackingCodeCanAct}
                titulo="O código sozinho também confirma e reabre"
                explicacao="Desmarcado, quem chega pela lista lê o relato e as ações ficam desligadas — confirmar, reabrir e responder continuam exigindo o link. Marcado, o código basta para tudo. A diferença importa porque o código é curto e a pessoa o guarda escrito; o link é longo e ninguém o decora."
                aoTrocar={(marcado) => setDraft({ ...draft, TrackingCodeCanAct: marcado })}
              />

              {/* Sem o modo, a regra não tem quando acontecer — e dizer isso evita que
              alguém a marque esperando um efeito que não vem. */}
              <p className="mt-2.5 text-caption text-fg-muted leading-relaxed">
                Só tem efeito quando o projeto usa código pessoal, na tela de{' '}
                <strong className="font-medium text-fg">Identidade</strong>. Nos outros modos,
                chegar ao relato exige o link de qualquer jeito.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  )
}

/**
 * Um prazo em dias.
 *
 * Mesmo `number` de verdade da espera, e pelo mesmo motivo: teclado numérico no
 * telefone, setas funcionando, e letra recusada pelo navegador. O mínimo é **1** —
 * prazo zero encerraria o relato no mesmo instante em que a pergunta saiu.
 */
function Dias({
  id,
  rotulo,
  valor,
  explicacao,
  aoTrocar,
}: {
  id: string
  rotulo: string
  valor: number
  explicacao: string
  aoTrocar: (valor: number) => void
}) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1.5 block text-detail text-fg-muted">
        {rotulo}
      </label>
      <div className="mb-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={1}
          max={MAX_INFO_REQUEST_DAYS}
          value={valor}
          // Campo vazio vira 1, e não `NaN`: apagar tudo para digitar outro número
          // é o gesto comum, e `NaN` quebraria a comparação que decide se há o que
          // salvar. Um, e não zero, porque zero não é um prazo.
          onChange={(evento) => aoTrocar(Number.parseInt(evento.target.value, 10) || 1)}
          className="h-9 w-28 rounded-lg border border-border bg-surface-raised px-3 text-body text-fg"
        />
        <span className="text-detail text-fg-muted">dias</span>
      </div>
      <p className="text-caption text-fg-muted leading-relaxed">{explicacao}</p>
    </div>
  )
}

/**
 * Uma chave de liga-desliga com a explicação ao lado.
 *
 * O título diz o que acontece **quando ligado**, e nunca o nome da coluna do
 * banco: quem lê a tela decide sobre o comportamento, e não sobre o campo.
 */
function Marcar({
  marcado,
  titulo,
  explicacao,
  aoTrocar,
}: {
  marcado: boolean
  titulo: string
  explicacao: string
  aoTrocar: (marcado: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer gap-2.5">
      <input
        type="checkbox"
        checked={marcado}
        onChange={(evento) => aoTrocar(evento.target.checked)}
        className="mt-1 flex-none accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-detail text-fg">{titulo}</span>
        <span className="block text-caption text-fg-muted leading-relaxed">{explicacao}</span>
      </span>
    </label>
  )
}

/**
 * Uma das duas escolhas.
 *
 * É um `radio` de verdade, e não dois botões: o teclado anda entre as opções com
 * as setas, o leitor de tela anuncia "1 de 2", e o navegador já garante que só uma
 * fica marcada. Dois botões pareceriam iguais e não teriam nada disso.
 */
function Escolha({
  valor,
  escolhido,
  titulo,
  explicacao,
  aoEscolher,
}: {
  valor: ClosureTrigger
  escolhido: ClosureTrigger
  titulo: string
  explicacao: string
  aoEscolher: (valor: ClosureTrigger) => void
}) {
  const marcado = escolhido === valor

  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-xl border p-4',
        marcado ? 'border-accent bg-surface-raised' : 'border-border bg-surface',
      )}
    >
      <input
        type="radio"
        name="closure-trigger"
        value={valor}
        checked={marcado}
        onChange={() => aoEscolher(valor)}
        className="mt-0.5 flex-none accent-accent"
      />
      <span className="min-w-0">
        <span className="mb-0.5 block font-medium text-detail text-fg">{titulo}</span>
        <span className="block text-caption text-fg-muted leading-relaxed">{explicacao}</span>
      </span>
    </label>
  )
}
