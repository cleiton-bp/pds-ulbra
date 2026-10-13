import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type CardColor,
  MAX_ACTIVE_REPORT_TYPES,
  type ProjectReportTypeViewModel,
  type ReportTypeIcon,
} from '@/contracts'
import {
  describeError,
  projectReportTypeService,
  projectStateService,
  projectWidgetSettingsService,
} from '@/data'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { TypeEditor } from '@/features/reportTypes/TypeEditor'
import {
  checkDraft,
  describeType,
  draftChanged,
  draftFrom,
  filledQuestions,
  previewTypeFrom,
  previewTypes,
  requestFrom,
  type TypeDraft,
} from '@/features/reportTypes/typeDraft'
import { Button } from '@/shared/components/Button'
import { CARD_COLOR_CLASSES } from '@/shared/components/CardChip'
import { ConfirmDialog } from '@/shared/components/ConfirmDialog'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { LeaveGuard } from '@/shared/components/LeaveGuard'
import { PreviewSection } from '@/shared/components/PreviewSection'
import { ReportTypeIconSvg } from '@/shared/components/ReportTypeGlyph'
import { Skeleton } from '@/shared/components/Skeleton'
import { SortableListItem } from '@/shared/components/SortableListItem'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useClosingItem } from '@/shared/hooks/useClosingItem'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { useListOrder } from '@/shared/hooks/useListOrder'
import { cn } from '@/shared/lib/cn'

/** O que `aberto` guarda quando o item aberto e o de criar, e nao o de um tipo. */
const NOVO = 'novo'

/** O nome do acordeao desta tela: um tipo aberto de cada vez. Ver `SettingsGroup`. */
const ACORDEAO = 'tipos'

/**
 * Os tipos de relato do projeto — o que quem relata escolhe no formulario, e o que
 * o formulario pergunta em cada um.
 *
 * **Os nomes sao do time**, como as prioridades: o projeto nasce com Defeito,
 * Melhoria e Duvida, e eles ja funcionam sem ninguem abrir esta tela. O time
 * renomeia, troca a cor e o desenho, reordena, cria outros ou desativa.
 *
 * **Duas colunas, como Formulário e Anexos** (`EditorWithPreview`): a lista a esquerda,
 * a previa presa a direita, ja aberta no tipo que se esta mudando — antes, o editor abria
 * no meio da lista e a previa ficava fechada no fim da pagina, longe das perguntas.
 *
 * **Cada tipo e um item de acordeao** (`name="tipos"`, como o `SettingsGroup`): fechado,
 * ele diz em palavras o que pede e onde entra; aberto, mostra o editor em blocos. Nao e o
 * `SettingsGroup` em si porque o cabecalho do tipo leva a alca, as setas e o Desativar —
 * botoes que nao podem morar dentro do `<summary>` —, e porque fechar com rascunho
 * pergunta antes, o que o acordeao do navegador nao sabe fazer sozinho.
 *
 * **Cada tipo e salvo no Salvar dele**, e nao por um Publicar da tela: e o jeito de
 * gravar desde sempre, e a linha embaixo do titulo diz isso. Por isso trocar de tipo, ou
 * fechar o aberto, com mudanca por salvar pergunta antes — e sair da tela tambem
 * (`LeaveGuard`).
 *
 * **Desativar, e nao apagar**: o tipo sai do formulario e continua nos relatos que ja
 * o tem, marcado. O ultimo ativo nao se desativa — o formulario ficaria sem o que
 * oferecer —, e a tela diz isso em vez de oferecer o botao.
 *
 * **Reordenar e otimista**, como nas colunas: a seta e o arrastar movem na hora, e a
 * lista volta se o servidor recusar.
 */
export function ReportTypesScreen() {
  const project = useCurrentProject()
  const base = useId()
  const idResumo = (publicId: string) => `${base}-resumo-${publicId}`
  const idAtivo = (publicId: string) => `${base}-ativo-${publicId}`
  const idNovo = `${base}-novo`
  const idNomeDoNovo = `${base}-nome-novo`
  const idLotado = `${base}-lotado`

  const {
    data: loaded,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(
      () => projectReportTypeService.listReportTypes(project.PublicId),
      [project.PublicId],
    ),
  )

  // Copia local para criar, gravar e mover sem o esqueleto voltar, como nas colunas.
  const [types, setTypes] = useState<ProjectReportTypeViewModel[] | null>(null)
  useEffect(() => setTypes(loaded), [loaded])

  // As colunas, para a escolha de onde o relato entra. **Falhar aqui nao impede mexer
  // nos tipos**: o editor so nao oferece a troca, e a coluna fica como esta.
  const { data: colunas, failed: colunasFalharam } = useAsyncResource(
    useCallback(() => projectStateService.listProjectStates(project.PublicId), [project.PublicId]),
  )

  /** O tipo aberto (`PublicId`, ou `NOVO`) e o rascunho dele, como esta escrito agora. */
  const [aberto, setAberto] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<TypeDraft | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // O item que acabou de fechar continua desenhado ate o fim do movimento.
  const { closing: fechando, markClosing } = useClosingItem<TypeDraft>()

  /** A troca que espera a confirmacao: abrir outro tipo (`destino`), ou fechar (`null`). */
  const [troca, setTroca] = useState<{ destino: string | null } | null>(null)

  // Reordenar e otimista: a seta e o arrastar movem na hora, e a lista volta se o
  // servidor recusar.
  const ordem = useListOrder({
    items: types,
    setItems: setTypes,
    idOf: (type) => type.PublicId,
    save: (Order) => projectReportTypeService.reorderReportTypes(project.PublicId, { Order }),
    focusFallback: idResumo,
  })

  const [retiring, setRetiring] = useState<ProjectReportTypeViewModel | null>(null)

  const ativos = types?.filter((type) => type.IsActive).length ?? 0
  const tipoAberto =
    aberto !== null && aberto !== NOVO ? types?.find((type) => type.PublicId === aberto) : undefined
  const sujo = aberto !== null && rascunho !== null && draftChanged(rascunho, tipoAberto)
  const podeSalvar = rascunho !== null && !checkDraft(rascunho).incompleto

  // A previa: o formulario de verdade com os tipos desta lista, e o tipo aberto como
  // esta escrito agora — antes de salvar. A configuracao da ferramenta so da o resto
  // (textos, cor); falhando, a de fabrica serve, porque e ilustracao.
  const { data: ferramenta } = useAsyncResource(
    useCallback(
      () => projectWidgetSettingsService.getWidgetSettings(project.PublicId),
      [project.PublicId],
    ),
  )
  const naPrevia = useMemo(() => {
    const tipoNaPrevia = aberto !== null && rascunho ? previewTypeFrom(rascunho, aberto) : null
    return {
      ...(ferramenta ?? DEFAULT_WIDGET_SETTINGS),
      Types: previewTypes(types, tipoNaPrevia),
      // O formulario abre no tipo aberto: e o que se esta mudando. Sem nenhum aberto, no
      // pre-marcado de Formulario — e o que quem relata ve primeiro; sem pre-marcado
      // (nulo), o widget cai no primeiro ativo, como no sistema do cliente.
      DefaultReportType: aberto ?? ferramenta?.DefaultReportType ?? null,
    }
  }, [ferramenta, types, aberto, rascunho])

  /** O foco vai para `id` depois do proximo desenho: o alvo so existe depois dele. */
  function devolverFoco(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  /** Abre `destino` (ou fecha tudo, com `null`) sem perguntar: quem pergunta e `pedirTroca`. */
  function irPara(destino: string | null) {
    if (aberto !== null && aberto !== NOVO && rascunho) markClosing(aberto, rascunho)
    setErro(null)
    setAberto(destino)
    setRascunho(
      destino === null
        ? null
        : draftFrom(
            destino === NOVO ? undefined : types?.find((type) => type.PublicId === destino),
          ),
    )
  }

  /**
   * Abrir outro tipo, ou fechar o aberto. **Com mudanca por salvar, pergunta antes**: o
   * rascunho de um tipo so vive enquanto ele esta aberto.
   */
  function pedirTroca(destino: string | null) {
    if (destino === aberto) return
    if (sujo) setTroca({ destino })
    else irPara(destino)
  }

  function confirmarTroca() {
    if (!troca) return
    const { destino } = troca
    const anterior = aberto
    irPara(destino)
    // A pergunta fechou: o foco vai para onde a pessoa ia — o nome do tipo novo, o
    // resumo do tipo que ela abriu, ou o do que ela fechou.
    if (destino === NOVO) devolverFoco(idNomeDoNovo)
    else if (destino !== null) devolverFoco(idResumo(destino))
    else if (anterior === NOVO) devolverFoco(idNovo)
    else if (anterior !== null) devolverFoco(idResumo(anterior))
  }

  /** Cancelar e desistir de proposito: fecha sem perguntar, e o foco volta a quem abriu. */
  function cancelar() {
    const alvo = aberto
    irPara(null)
    if (alvo === NOVO) devolverFoco(idNovo)
    else if (alvo) devolverFoco(idResumo(alvo))
  }

  const trocar = (salvo: ProjectReportTypeViewModel) =>
    setTypes((lista) =>
      (lista ?? []).map((item) => (item.PublicId === salvo.PublicId ? salvo : item)),
    )

  async function salvar() {
    if (aberto === null || !rascunho || salvando || checkDraft(rascunho).incompleto) return

    setSalvando(true)
    setErro(null)

    try {
      if (aberto === NOVO) {
        const criado = await projectReportTypeService.addReportType(
          project.PublicId,
          requestFrom(rascunho),
        )
        // Entra no fim, que e onde a API o colocou.
        setTypes((lista) => [...(lista ?? []), criado])
        toast.done(`“${criado.Name}” criado. Ele já aparece no formulário.`)
        irPara(null)
        // O decimo ativo troca o "Novo tipo" pela explicacao: o foco vai para ela, e nao
        // para um botao que deixou de existir.
        devolverFoco(criado.IsActive && ativos + 1 >= MAX_ACTIVE_REPORT_TYPES ? idLotado : idNovo)
        return
      }

      const salvo = await projectReportTypeService.updateReportType(
        project.PublicId,
        aberto,
        requestFrom(rascunho),
      )
      trocar(salvo)
      toast.done('Tipo de relato salvo.')
      irPara(null)
      devolverFoco(idResumo(salvo.PublicId))
    } catch (failure) {
      // Nome repetido, coluna desativada, dez ativos: e do editor, que e onde se corrige.
      setErro(describeError(failure))
    } finally {
      setSalvando(false)
    }
  }

  async function setActive(type: ProjectReportTypeViewModel, active: boolean) {
    try {
      trocar(
        active
          ? await projectReportTypeService.activateReportType(project.PublicId, type.PublicId)
          : await projectReportTypeService.deactivateReportType(project.PublicId, type.PublicId),
      )
      toast.done(active ? 'Tipo de volta ao formulário.' : 'Tipo desativado.')
      // "Desativar" e "Reativar" sao o mesmo lugar do cabecalho: o foco fica nele.
      devolverFoco(idAtivo(type.PublicId))
    } catch (failure) {
      // O ultimo ativo, ou dez ativos ao reativar: a mensagem da API diz o que fazer.
      toast.error(describeError(failure))
    }
  }

  /** O editor do item aberto: o mesmo para o tipo salvo e para o novo. */
  function editor(publicId: string) {
    if (aberto === publicId && rascunho) {
      return (
        <TypeEditor
          draft={rascunho}
          onChange={(mudar) => setRascunho((atual) => (atual ? mudar(atual) : atual))}
          isNew={publicId === NOVO}
          nameId={publicId === NOVO ? idNomeDoNovo : undefined}
          colunas={colunas}
          colunasFalharam={colunasFalharam}
          salvando={salvando}
          erro={erro}
          onSalvar={() => void salvar()}
          onCancelar={cancelar}
        />
      )
    }
    if (fechando?.id === publicId) {
      // So o desenho, para o movimento de fechar: nada aqui responde.
      return (
        <div inert>
          <TypeEditor
            draft={fechando.value}
            onChange={() => {}}
            isNew={false}
            colunas={colunas}
            colunasFalharam={colunasFalharam}
            salvando={false}
            erro={null}
            onSalvar={() => {}}
            onCancelar={() => {}}
          />
        </div>
      )
    }
    return null
  }

  /** O nome e o resumo do cabecalho: os do rascunho, no tipo aberto. */
  function cabecalho(type: ProjectReportTypeViewModel) {
    const emEdicao = aberto === type.PublicId && rascunho ? rascunho : null
    return {
      nome: emEdicao?.nome.trim() || type.Name,
      cor: emEdicao?.cor ?? type.Color,
      desenho: emEdicao?.desenho ?? type.Icon,
      resumo: describeType(
        emEdicao
          ? {
              perguntas: filledQuestions(emEdicao).length,
              caixa: emEdicao.caixa,
              coluna: emEdicao.coluna,
              ativo: type.IsActive,
            }
          : {
              perguntas: type.Questions.length,
              caixa: type.ShowsTextBox,
              coluna: type.InitialStatePublicId,
              ativo: type.IsActive,
            },
        colunas,
      ),
    }
  }

  const nomeDoAberto = tipoAberto?.Name ?? (rascunho?.nome.trim() || 'Novo tipo')

  return (
    <div className="max-w-6xl">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Tipos de relato</h1>
      <p className="mb-8 text-fg-muted text-body">
        O que quem relata escolhe no formulário, e o que cada tipo pergunta. Cada tipo é salvo ao
        clicar em Salvar.
      </p>

      <EditorWithPreview
        preview={
          types !== null ? (
            <PreviewSection
              settings={naPrevia}
              dirty={sujo}
              startOpen
              hint="O formulário com os tipos ativos, na ordem da lista, aberto no tipo que você está mudando — como está escrito agora."
            />
          ) : loading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : null
        }
      >
        <section id="tipos" className="scroll-mt-6">
          <h2 className="mb-1 font-semibold text-lead">
            Na ordem do formulário{' '}
            {types !== null && (
              <span className="font-normal text-fg-muted tabular-nums">
                ({ativos} de {MAX_ACTIVE_REPORT_TYPES})
              </span>
            )}
          </h2>
          <p className="mb-2 text-detail text-fg-muted leading-relaxed">
            A ordem é a dos botões no formulário, e muda na hora.
          </p>

          <HowItWorks>
            <p>
              O primeiro tipo ativo vem marcado quando o formulário abre — a menos que você escolha
              outro em{' '}
              <Link
                to="../form-texts#tipo-pre-marcado"
                className="text-fg underline underline-offset-4"
              >
                Formulário
              </Link>
              .
            </p>
            <p>
              Para mudar a ordem, arraste pela alça à esquerda ou use as setas. Clique num tipo para
              abrir: um de cada vez, e o que você mudou só vale no Salvar dele.
            </p>
            <p>
              Desativar tira o tipo do formulário sem mexer nos relatos que já o têm. Até{' '}
              {MAX_ACTIVE_REPORT_TYPES} ativos: mais do que isso deixa de ser escolha e vira lista
              para ler.
            </p>
          </HowItWorks>

          {failed && (
            <div className="rounded-xl border border-border bg-surface-raised p-5">
              <p className="mb-3.5 text-fg-muted text-body leading-relaxed">
                Não deu para carregar os tipos de relato agora. A falha foi ao consultar: o
                formulário no seu sistema continua como estava.
              </p>
              <Button onClick={reload}>Tentar de novo</Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col gap-2">
              {['w-24', 'w-32', 'w-20'].map((width) => (
                <div
                  key={width}
                  className="flex h-16 items-center rounded-xl border border-border bg-surface-raised px-4"
                >
                  <Skeleton className={`h-3 ${width}`} />
                </div>
              ))}
            </div>
          )}

          {types !== null && (types.length > 0 || aberto === NOVO) && (
            <ul className="mb-4 flex flex-col gap-2">
              {types.map((type, index) => {
                const { nome, cor, desenho, resumo } = cabecalho(type)
                const estaAberto = aberto === type.PublicId
                return (
                  <SortableListItem
                    key={type.PublicId}
                    accordion={ACORDEAO}
                    summaryId={idResumo(type.PublicId)}
                    open={estaAberto}
                    onRequestToggle={() => pedirTroca(estaAberto ? null : type.PublicId)}
                    icon={<TypeIcon color={cor} icon={desenho} inactive={!type.IsActive} />}
                    name={nome}
                    summary={resumo}
                    inactive={!type.IsActive}
                    unsaved={estaAberto && sujo}
                    order={ordem.itemProps(index, type.Name)}
                    actions={
                      type.IsActive && ativos <= 1 ? (
                        // O ultimo ativo: o formulario ficaria sem tipo para oferecer. Em
                        // vez de um botao que so recusa, a razao escrita.
                        <span className="text-caption text-fg-muted">Único ativo</span>
                      ) : type.IsActive ? (
                        <Button
                          id={idAtivo(type.PublicId)}
                          size="sm"
                          variant="ghost"
                          aria-label={`Desativar ${type.Name}`}
                          onClick={() => setRetiring(type)}
                        >
                          Desativar
                        </Button>
                      ) : ativos >= MAX_ACTIVE_REPORT_TYPES ? (
                        // Com dez ativos, reativar seria recusado: a razao escrita, como no
                        // "Novo tipo", em vez de um botao que so da erro.
                        <span className="text-caption text-fg-muted">
                          Já há {MAX_ACTIVE_REPORT_TYPES} ativos
                        </span>
                      ) : (
                        <Button
                          id={idAtivo(type.PublicId)}
                          size="sm"
                          variant="ghost"
                          aria-label={`Reativar ${type.Name}`}
                          onClick={() => void setActive(type, true)}
                        >
                          Reativar
                        </Button>
                      )
                    }
                  >
                    {editor(type.PublicId)}
                  </SortableListItem>
                )
              })}

              {aberto === NOVO && rascunho && (
                <SortableListItem
                  accordion={ACORDEAO}
                  summaryId={idResumo(NOVO)}
                  open
                  onRequestToggle={() => pedirTroca(null)}
                  icon={<TypeIcon color={rascunho.cor} icon={rascunho.desenho} />}
                  name={rascunho.nome.trim() || 'Novo tipo'}
                  summary={describeType(
                    {
                      perguntas: filledQuestions(rascunho).length,
                      caixa: rascunho.caixa,
                      coluna: rascunho.coluna,
                      ativo: true,
                    },
                    colunas,
                  )}
                  isNew
                  unsaved={sujo}
                >
                  {editor(NOVO)}
                </SortableListItem>
              )}
            </ul>
          )}

          {types !== null &&
            aberto !== NOVO &&
            (ativos >= MAX_ACTIVE_REPORT_TYPES ? (
              // Com dez ativos, criar seria recusado. A razao fica escrita, e o caminho junto.
              <p
                id={idLotado}
                tabIndex={-1}
                className="rounded-xl border border-border border-dashed px-4 py-3 text-detail text-fg-muted leading-relaxed outline-none"
              >
                O formulário já tem {MAX_ACTIVE_REPORT_TYPES} tipos ativos, o máximo: mais do que
                isso deixa de ser escolha e vira lista para ler. Desative um para criar outro.
              </p>
            ) : (
              <Button id={idNovo} onClick={() => pedirTroca(NOVO)}>
                Novo tipo de relato
              </Button>
            ))}
        </section>
      </EditorWithPreview>

      <ConfirmDialog
        open={retiring !== null}
        onOpenChange={(open) => {
          if (!open) setRetiring(null)
        }}
        title={retiring ? `Desativar “${retiring.Name}”` : 'Desativar tipo de relato'}
        description="Ele sai do formulário, mas continua nos relatos que já o têm — marcado como desativado — e no filtro de tipo do Trabalho. Dá para trazer de volta quando quiser."
        confirmLabel="Desativar"
        onConfirm={() => (retiring ? setActive(retiring, false) : undefined)}
      />

      <ConfirmDialog
        open={troca !== null}
        onOpenChange={(open) => {
          if (!open) setTroca(null)
        }}
        title={`Descartar o que mudou em “${nomeDoAberto}”?`}
        description="As mudanças deste tipo ainda não foram salvas e vão se perder. Para guardar, volte e clique em Salvar."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        primary="cancel"
        onConfirm={confirmarTroca}
      />

      <LeaveGuard when={sujo} onSave={podeSalvar ? () => void salvar() : undefined} />
    </div>
  )
}

/** O desenho do tipo no cabecalho do item, na cor dele; o desativado, apagado. */
function TypeIcon({
  color,
  icon,
  inactive = false,
}: {
  color: CardColor
  icon: ReportTypeIcon
  inactive?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 flex-none items-center justify-center rounded-md border',
        CARD_COLOR_CLASSES[color],
        inactive && 'opacity-60',
      )}
    >
      <ReportTypeIconSvg icon={icon} className="size-3.5" />
    </span>
  )
}
