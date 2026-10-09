import { type KeyboardEvent, useCallback, useRef, useState } from 'react'
import {
  MAX_CARD_DESCRIPTION_LENGTH,
  MAX_CARD_TITLE_LENGTH,
  type ReportDetailViewModel,
  type ReportStateCountViewModel,
  type SprintViewModel,
} from '@/contracts'
import {
  describeError,
  projectPriorityService,
  projectReportService,
  projectTeamService,
} from '@/data'
import { Button } from '@/shared/components/Button'
import { MarkdownEditor } from '@/shared/components/MarkdownEditor'
import { Modal } from '@/shared/components/Modal'
import { Select } from '@/shared/components/Select'
import { TextField } from '@/shared/components/TextField'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/** O valor do "Entra em" para o backlog: o resto sao identificadores de sprint. */
const BACKLOG = ''

/**
 * Criar um card do time: titulo, descricao, a coluna em que ele nasce e, se a pessoa
 * quiser, quem fica com ele e a prioridade.
 *
 * **Nada do lado de fora.** O card do time nao tem protocolo, link nem quem
 * relatou — o formulario so pergunta o que existe para ele.
 *
 * A coluna vem escolhida na primeira ativa, que e onde a API o poria sem escolha
 * nenhuma; trocar e um clique, e nao um campo obrigatorio a mais. Aberto pelo
 * "Criar" de uma coluna do quadro, vem escolhida aquela. Responsavel e prioridade
 * comecam vazios — o card nasce sem prioridade, como decidido —, e escolhidos aqui
 * poupam abrir o card logo depois so para isso. **Vao na propria criacao**: a API
 * aplica as regras de escolher pelo campo (so quem esta no time, so prioridade ativa)
 * e grava o mesmo historico e o mesmo aviso, numa transacao so — recusado um, o card
 * nao nasce, e o formulario fica para trocar a escolha.
 *
 * **Com as sprints ligadas, o dialogo diz onde o card entra** ("Entra em"): o backlog,
 * de fabrica, ou a sprint em andamento, quando veio do "Criar" de uma coluna do quadro
 * — e a pessoa pode trocar, inclusive por uma planejada. Sem isso, o card criado no
 * quadro ia para o backlog e sumia da frente de quem o criou.
 *
 * **Enter no titulo cria**, e Ctrl+Enter (⌘+Enter no Mac) cria de qualquer campo —
 * na descricao, o Enter sozinho quebra a linha.
 */
export function NewCardDialog({
  projectPublicId,
  colunas,
  colunaInicial,
  tituloInicial,
  sprints = null,
  sprintInicial = null,
  aoCriar,
  aoCancelar,
}: {
  projectPublicId: string
  colunas: ReportStateCountViewModel[] | null
  /** A coluna ja escolhida; sem ela (ou se ela nao recebe mais), a primeira ativa. */
  colunaInicial?: string
  /** O titulo ja digitado no campo do topo da coluna, pelo "Mais detalhes". */
  tituloInicial?: string
  /** As sprints que ainda recebem card, com as sprints ligadas; nulo sem elas. */
  sprints?: SprintViewModel[] | null
  /** Onde o card entra de saida: uma sprint (o "Criar" da coluna do quadro) ou nulo, o backlog. */
  sprintInicial?: string | null
  aoCriar: (card: ReportDetailViewModel) => void
  aoCancelar: () => void
}) {
  const ativas = (colunas ?? []).filter(
    (coluna): coluna is ReportStateCountViewModel & { StatePublicId: string } =>
      coluna.StatePublicId !== null && coluna.IsActive,
  )
  // A concluida nao recebe card: a API recusaria.
  const abertas = (sprints ?? []).filter((sprint) => sprint.State !== 'Closed')

  const [titulo, setTitulo] = useState(tituloInicial ?? '')
  const [descricao, setDescricao] = useState('')
  const [coluna, setColuna] = useState(
    ativas.find((item) => item.StatePublicId === colunaInicial)?.StatePublicId ??
      ativas[0]?.StatePublicId ??
      '',
  )
  const [responsavel, setResponsavel] = useState('')
  const [prioridade, setPrioridade] = useState('')
  const [destino, setDestino] = useState(
    abertas.find((sprint) => sprint.PublicId === sprintInicial)?.PublicId ?? BACKLOG,
  )
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // O Enter do titulo e o Ctrl+Enter do dialogo chegam no mesmo toque: o estado ainda
  // nao mudou no segundo, e sem esta trava o card nascia duas vezes.
  const enviando = useRef(false)

  // As escolhas do time e das prioridades, lidas uma vez ao abrir: a falha so deixa o
  // campo com o "Sem" — criar o card continua de pe.
  const { data: time } = useAsyncResource(
    useCallback(() => projectTeamService.listMembers(projectPublicId), [projectPublicId]),
  )
  const { data: prioridades } = useAsyncResource(
    useCallback(() => projectPriorityService.listPriorities(projectPublicId), [projectPublicId]),
  )

  async function criar() {
    const texto = titulo.trim()
    if (texto.length === 0 || enviando.current) return

    enviando.current = true
    setCriando(true)
    setErro(null)

    let card: ReportDetailViewModel
    try {
      card = await projectReportService.createTeamCard(projectPublicId, {
        Title: texto,
        Description: descricao.trim().length > 0 ? descricao : null,
        StatePublicId: coluna || null,
        ...(sprints && destino !== BACKLOG ? { SprintPublicId: destino } : {}),
        ...(responsavel ? { AssigneeUserPublicId: responsavel } : {}),
        ...(prioridade ? { PriorityPublicId: prioridade } : {}),
      })
    } catch (falha) {
      // Fica tudo no formulario: quem escreveu tenta de novo sem reescrever — e, se a
      // recusa foi do responsavel ou da prioridade, troca a escolha e cria.
      setErro(describeError(falha))
      setCriando(false)
      enviando.current = false
      return
    }

    aoCriar(card)
  }

  // Ctrl+Enter, ou ⌘+Enter, de qualquer campo.
  const atalho = (evento: KeyboardEvent) => {
    if (evento.key !== 'Enter' || !(evento.ctrlKey || evento.metaKey)) return
    evento.preventDefault()
    void criar()
  }

  // Quem olha primeiro, e o resto em ordem de nome: "Eu" e a escolha mais comum.
  const pessoas = [...(time ?? [])].sort(
    (a, b) =>
      Number(b.IsYou) - Number(a.IsYou) ||
      (a.Name ?? a.Email ?? '').localeCompare(b.Name ?? b.Email ?? '', 'pt-BR'),
  )
  // A mais urgente em cima, como no filtro e no lote; "Sem prioridade" por ultimo.
  const prioridadesAtivas = [...(prioridades ?? [])]
    .filter((item) => item.IsActive)
    .sort((a, b) => b.Position - a.Position)

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto && !criando) aoCancelar()
      }}
      title="Novo card"
      description="Um card do próprio time, sem ninguém de fora: não tem protocolo, não aparece na página de acompanhamento nem na lista pública."
      width="w-[min(38rem,calc(100vw-2rem))]"
      footer={
        <>
          <span className="mr-auto hidden text-caption text-fg-muted sm:inline">
            Enter no título cria · Ctrl+Enter (⌘+Enter no Mac) cria de qualquer campo
          </span>
          <Button variant="quiet" disabled={criando} onClick={aoCancelar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={titulo.trim().length === 0 || criando}
            onClick={() => void criar()}
          >
            {criando ? 'Criando…' : 'Criar card'}
          </Button>
        </>
      }
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: so escuta o Ctrl+Enter que sobe dos campos */}
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto" onKeyDown={atalho}>
        <TextField
          label="Título"
          value={titulo}
          onChange={(valor) => {
            setTitulo(valor)
            if (erro) setErro(null)
          }}
          onSubmit={() => void criar()}
          maxLength={MAX_CARD_TITLE_LENGTH}
          placeholder="O que precisa ser feito"
          autoFocus
          disabled={criando}
          error={erro}
        />

        <MarkdownEditor
          label="Descrição"
          value={descricao}
          onChange={setDescricao}
          maxLength={MAX_CARD_DESCRIPTION_LENGTH}
          placeholder="Contexto, passos, o que é preciso para dar como feito."
          disabled={criando}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {ativas.length > 0 && (
            <Select
              label="Coluna"
              value={coluna}
              disabled={criando}
              onChange={setColuna}
              options={ativas.map((item) => ({
                value: item.StatePublicId,
                label: item.StateName ?? '',
              }))}
            />
          )}

          {sprints && (
            <Select
              label="Entra em"
              value={destino}
              disabled={criando}
              onChange={setDestino}
              options={[
                { value: BACKLOG, label: 'Backlog' },
                ...abertas.map((sprint) => ({
                  value: sprint.PublicId,
                  label:
                    sprint.State === 'Active'
                      ? `${sprint.Name} (em andamento)`
                      : `${sprint.Name} (planejada)`,
                })),
              ]}
            />
          )}

          <Select
            label="Responsável"
            value={responsavel}
            disabled={criando}
            onChange={setResponsavel}
            options={[
              { value: '', label: 'Sem responsável' },
              ...pessoas.map((pessoa) => ({
                value: pessoa.UserPublicId,
                label: `${pessoa.Name ?? pessoa.Email ?? 'Sem nome'}${pessoa.IsYou ? ' (você)' : ''}`,
              })),
            ]}
          />

          <Select
            label="Prioridade"
            value={prioridade}
            disabled={criando}
            onChange={setPrioridade}
            options={[
              ...prioridadesAtivas.map((item) => ({ value: item.PublicId, label: item.Name })),
              { value: '', label: 'Sem prioridade' },
            ]}
          />
        </div>
      </div>
    </Modal>
  )
}
