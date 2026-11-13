import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MAX_PROJECT_NAME_LENGTH, type ProjectTemplate } from '@/contracts'
import { describeError } from '@/data'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { pedirBoasVindas } from '@/features/projects/welcomeRequest'
import { Button } from '@/shared/components/Button'
import { HowItWorks } from '@/shared/components/HowItWorks'
import { MiniBoard, type MiniBoardColumn } from '@/shared/components/MiniBoard'
import { Modal } from '@/shared/components/Modal'
import { TextField } from '@/shared/components/TextField'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'
import { pedirOBalaoDoGuia } from '@/shared/tour/guideStore'

/** Uma coluna do quadro e a etapa que quem relatou ve enquanto o relato esta nela. */
interface Column {
  name: string
  stage: string
}

interface Template {
  value: ProjectTemplate
  name: string
  /** Para quem o modelo serve, numa frase: o nome sozinho diz pouco a quem nunca usou. */
  summary: string
  columns: readonly Column[]
  /** A coluna em que todo relato entra: a indicada nos tipos do modelo, ou a primeira. */
  entry: string
  /** Os tipos de relato que o projeto ganha, na ordem do formulario. */
  types: readonly string[]
  /** Onde o relato entra e o que o modelo tem de proprio, numa frase. */
  note: string
}

/** Os tipos de fabrica (`ReportTypeDefaults`), os de todo modelo menos o de Suporte. */
const TIPOS_DE_FABRICA = ['Defeito', 'Melhoria', 'Dúvida'] as const

/** O projeto de sempre: e o que vem marcado, e o que vale se a escolha se perder. */
const QUADRO_SIMPLES: Template = {
  value: 'SimpleBoard',
  name: 'Quadro simples',
  summary: 'Para começar sem complicação, com o trabalho em três colunas.',
  columns: [
    { name: 'A fazer', stage: 'Recebido' },
    { name: 'Fazendo', stage: 'Em desenvolvimento' },
    { name: 'Feito', stage: 'Concluído' },
  ],
  entry: 'A fazer',
  types: TIPOS_DE_FABRICA,
  note: 'Todo relato entra em A fazer.',
}

/**
 * Os modelos, na ordem da escolha, espelho de `Pds.Service/Projects/ProjectTemplates.cs`
 * (colunas, etapa publica de cada uma, tipos e coluna de entrada). Se um modelo mudar
 * la, muda aqui tambem: esta lista e o que a pessoa le antes de escolher.
 */
const TEMPLATES: readonly Template[] = [
  QUADRO_SIMPLES,
  {
    value: 'Support',
    name: 'Suporte',
    summary: 'Para atendimento, quando quem relata é um cliente esperando resposta.',
    columns: [
      { name: 'Novo', stage: 'Recebido' },
      { name: 'Em atendimento', stage: 'Em atendimento' },
      { name: 'Aguardando quem relatou', stage: 'Esperando você' },
      { name: 'Resolvido', stage: 'Resolvido' },
    ],
    entry: 'Novo',
    types: ['Problema', 'Dúvida', 'Pedido'],
    note: 'Todo relato entra em Novo, e Esperando você mostra à pessoa que a vez é dela.',
  },
  {
    value: 'Kanban',
    name: 'Kanban',
    summary: 'Para um fluxo contínuo, com uma fila de entrada e uma revisão antes de terminar.',
    columns: [
      { name: 'Backlog', stage: 'Recebido' },
      { name: 'A fazer', stage: 'Em análise' },
      { name: 'Fazendo', stage: 'Em desenvolvimento' },
      { name: 'Em revisão', stage: 'Em teste pela equipe' },
      { name: 'Feito', stage: 'Concluído' },
    ],
    entry: 'Backlog',
    types: TIPOS_DE_FABRICA,
    note: 'Todo relato entra no Backlog, e passar para A fazer já mostra à pessoa que o time leu.',
  },
  {
    value: 'Scrum',
    name: 'Scrum',
    summary: 'Para quem planeja o trabalho em sprints de duas semanas, com pontos em cada card.',
    columns: [
      { name: 'A fazer', stage: 'Recebido' },
      { name: 'Fazendo', stage: 'Em desenvolvimento' },
      { name: 'Em revisão', stage: 'Em teste pela equipe' },
      { name: 'Feito', stage: 'Concluído' },
    ],
    entry: 'A fazer',
    types: TIPOS_DE_FABRICA,
    note: 'O relato entra em A fazer e espera no backlog até o time puxá-lo para uma sprint.',
  },
]

/**
 * Pede o nome e o jeito de trabalhar: o modelo traz as colunas, a jornada publica
 * ligada a elas e os tipos de relato prontos. O resto da configuracao mora nas telas
 * do projeto, e cada uma ja funciona com os padroes.
 *
 * **Uma lista, e o detalhe sob pedido.** Ja foi quatro cartoes com tres linhas cada, um
 * paragrafo de abertura, uma dica e um aviso; depois uma lista so com o nome e as colunas,
 * enxuta demais: quem nunca usou Kanban ou Scrum nao sabia qual escolher. Agora cada
 * modelo diz numa frase para quem serve, com as colunas embaixo, e "O que o modelo traz"
 * abre o detalhe do modelo marcado (a etapa que quem relatou ve em cada coluna, os tipos
 * de relato e onde o relato entra), trocando junto com a escolha.
 *
 * **Na tela larga, duas colunas e a previa sempre a vista**, como o Perfil: a coluna
 * estreita, com o nome e a lista, deixava o dialogo magro e alto. A esquerda o nome e os
 * modelos (so o nome e a frase); a direita o quadro do modelo marcado, desenhado com o
 * mesmo quadro de exemplo da tela de Colunas (`MiniBoard`): as colunas, onde o relato
 * entra, a que encerra e, embaixo de cada uma, o que quem relatou ve. No celular e na
 * janela estreita, uma coluna, com o detalhe sob pedido.
 *
 * O **quadro simples vem marcado**: quem so digita o nome e confirma recebe o projeto
 * de sempre. O modelo so vale aqui — depois, cada coisa se muda na propria tela, e a
 * linha embaixo da previa diz isso para ninguem travar na escolha.
 *
 * O nome repetido e conferido **duas vezes** de proposito: aqui contra a lista que
 * a tela ja tem, para a resposta ser imediata; e no servidor, que e quem decide —
 * duas abas criando o mesmo nome ao mesmo tempo so ele resolve.
 *
 * Ao confirmar vai para a **Instalacao**: e a proxima coisa a fazer — copiar a
 * chave publica e colar o script. A linha ao lado dos botoes avisa. Ja foi para as
 * chaves, com a secreta na frente e um aviso de perda ao sair; o primeiro minuto do
 * projeto ia numa chave que quase ninguem usa. A secreta agora nasce sob pedido, na
 * tela de chaves.
 */
export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const projects = useProjectsStore((state) => state.projects)
  const createProject = useProjectsStore((state) => state.create)
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [template, setTemplate] = useState<ProjectTemplate>('SimpleBoard')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const ids = useId()
  const escolhido = TEMPLATES.find((option) => option.value === template) ?? QUADRO_SIMPLES
  // A partir do `lg` cabem as duas colunas com o quadro de exemplo inteiro.
  const largo = useMediaQuery('(min-width: 64rem)')

  function reset() {
    setName('')
    setTemplate('SimpleBoard')
    setError(null)
    setSaving(false)
  }

  async function submit() {
    const trimmed = name.trim()

    if (!trimmed) {
      setError('Dê um nome ao projeto para continuar.')
      return
    }

    // So os da conta propria: o projeto novo nasce nela, e o nome so precisa ser
    // unico dentro da conta — o projeto de outra conta pode ter o mesmo nome.
    if (
      projects.some(
        (project) => project.IsAccountOwner && project.Name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      setError('Você já tem um projeto com esse nome, escolha outro para não confundir os dois.')
      return
    }

    setSaving(true)
    setError(null)

    // O primeiro projeto da conta abre com as boas-vindas. Conta so os da conta propria:
    // quem so participa do projeto de outra pessoa ainda nao montou nenhum.
    const primeiro = !projects.some((project) => project.IsAccountOwner)

    try {
      const created = await createProject(trimmed, template)

      onOpenChange(false)
      reset()

      // Para os primeiros passos, e nao para a Instalacao: e a mesma pagina que a raiz do
      // projeto abre, com os cinco passos, e a Instalacao e o detalhe dos tres primeiros.
      // La o balao aponta o "Guia da tela", em todo projeto novo (no primeiro, depois das
      // boas-vindas).
      if (primeiro) pedirBoasVindas(created.Project.PublicId)
      pedirOBalaoDoGuia('configurar')
      navigate(`/projects/${created.Project.PublicId}/configure`)
    } catch (failure) {
      setError(describeError(failure))
      setSaving(false)
    }
  }

  const campoNome = (
    <TextField
      label="Nome do projeto"
      value={name}
      onChange={(value) => {
        setName(value)
        if (error) setError(null)
      }}
      placeholder="Ex.: Loja Ativa"
      error={error}
      maxLength={MAX_PROJECT_NAME_LENGTH}
      autoFocus
      disabled={saving}
      onSubmit={submit}
    />
  )

  const listaDeModelos = (
    <fieldset className="mt-5" disabled={saving}>
      <legend className="mb-1 block text-detail text-fg-muted">Como o time trabalha</legend>

      {/* O radio de verdade fica escondido dentro da linha, que e o rotulo: o teclado
              anda pelas setas como em qualquer grupo de radios, e o anel de foco vai para
              a linha inteira (`has-[:focus-visible]`). A linha passa da coluna so o que o
              corpo do dialogo tem de folga (8 de cada lado): passando mais, o corpo rolava
              para o lado no toque e cortava os cantos e o anel de foco. */}
      <div className="-mx-2 flex flex-col">
        {TEMPLATES.map((option) => {
          const marcado = option.value === template
          const nome = `${ids}-${option.value}-nome`
          const detalhe = `${ids}-${option.value}-detalhe`

          return (
            <label
              key={option.value}
              className={cn(
                'flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 motion-reduce:transition-none',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-fg-muted has-[:focus-visible]:ring-inset',
                saving ? 'cursor-not-allowed' : 'cursor-pointer',
                marcado ? 'bg-surface-sunken' : 'hover:bg-surface',
              )}
            >
              <input
                type="radio"
                name={`${ids}-template`}
                value={option.value}
                checked={marcado}
                onChange={() => setTemplate(option.value)}
                aria-labelledby={nome}
                aria-describedby={detalhe}
                className="sr-only"
              />
              <Marcador marcado={marcado} />
              <span className="min-w-0 flex-1">
                <span
                  id={nome}
                  className={cn(
                    'block text-body transition-colors duration-150',
                    marcado ? 'font-medium text-fg' : 'text-fg',
                  )}
                >
                  {option.name}
                </span>
                <span
                  id={detalhe}
                  className="mt-0.5 block text-caption text-fg-muted leading-relaxed"
                >
                  {option.summary}
                  {/* Na tela larga as colunas estao no quadro ao lado; o leitor de tela ainda ouve. */}
                  <span className={largo ? 'sr-only' : 'mt-0.5 block text-fg-placeholder'}>
                    Colunas: {listar(option.columns.map((column) => column.name))}
                  </span>
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        // Esc ou o clique fora durante a criacao: o projeto ja esta a caminho, e fechar
        // agora limparia o formulario de um projeto que vai aparecer assim mesmo.
        if (!next && saving) return
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Novo projeto"
      width={largo ? 'w-[min(66rem,calc(100vw-2rem))]' : 'w-[min(36rem,calc(100vw-2rem))]'}
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      footer={
        <>
          {/* Onde o botao leva, dito ao lado dele e nao num paragrafo de abertura. */}
          <p className="basis-full self-center text-caption text-fg-muted sm:mr-auto sm:basis-auto">
            Em seguida, os primeiros passos.
          </p>
          <Button
            variant="quiet"
            onClick={() => {
              // O mesmo caminho do Esc: o dialogo continua montado, e reabrir depois de
              // cancelar nao pode trazer o nome nem o modelo de antes.
              reset()
              onOpenChange(false)
            }}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Criando…' : 'Criar projeto'}
          </Button>
        </>
      }
    >
      {largo ? (
        <div className="grid grid-cols-[minmax(0,21rem)_minmax(0,1fr)] gap-8">
          <div className="min-w-0">
            {campoNome}
            {listaDeModelos}
          </div>
          <PreviaDoModelo modelo={escolhido} />
        </div>
      ) : (
        <>
          {campoNome}
          {listaDeModelos}
          <HowItWorks label="O que o modelo traz" className="mt-4">
            {/* Troca junto com a escolha, entrando de novo, para ficar claro de qual modelo e. */}
            <div key={escolhido.value} className="flex animate-panel-in flex-col gap-2.5">
              <p className="text-fg">{escolhido.name}: o que quem relatou vê em cada coluna</p>
              <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1">
                {escolhido.columns.map((column) => (
                  <div key={column.name} className="contents">
                    <dt className="text-fg">{column.name}</dt>
                    <dd>{column.stage}</dd>
                  </div>
                ))}
              </dl>
              <p>Tipos de relato: {listar(escolhido.types)}.</p>
              <p>{escolhido.note}</p>
            </div>
          </HowItWorks>

          <p className="mt-3 text-caption text-fg-muted">Tudo se ajusta depois, em cada tela.</p>
        </>
      )}
    </Modal>
  )
}

/**
 * A previa do modelo marcado, na tela larga: o quadro como ele nasce, com a coluna de
 * entrada, a que encerra e, embaixo de cada coluna, o que quem relatou ve; depois os
 * tipos de relato e o que o modelo tem de proprio. Troca junto com a escolha, entrando de
 * novo, para ficar claro de qual modelo e.
 */
function PreviaDoModelo({ modelo }: { modelo: Template }) {
  const titulo = useId()
  const colunas: MiniBoardColumn[] = modelo.columns.map((column, posicao) => ({
    id: column.name,
    name: column.name,
    tags: [
      ...(column.name === modelo.entry ? ['Entrada'] : []),
      // A ultima coluna encerra o relato, pela regra de fabrica do ciclo.
      ...(posicao === modelo.columns.length - 1 ? ['Encerra'] : []),
    ],
    publicStage: column.stage,
  }))

  return (
    <section aria-labelledby={titulo} className="min-w-0 border-border border-l pl-8">
      <div key={modelo.value} className="animate-panel-in">
        <p className="text-caption text-fg-muted">O que o modelo traz</p>
        <h3 id={titulo} className="mt-0.5 font-semibold text-body text-fg">
          {modelo.name}
        </h3>
        {/* Uma legenda so, e nao "Quem relatou vê" repetido em cada coluna: com cinco colunas
            a frase ocupava duas linhas em todas e desalinhava os rodapes. */}
        <p className="mt-3 text-caption text-fg-muted">
          As colunas do time e, embaixo de cada uma, o que quem relatou vê.
        </p>
        <MiniBoard
          columns={colunas}
          card={{ title: 'Cupom não aplica' }}
          cardColumnId={modelo.entry}
          columnClassName="w-auto min-w-0 flex-1"
          stageLabel={false}
          // Palavra longa ("desenvolvimento") quebra com hifen, em vez de passar da coluna, e o
          // rodape de toda coluna tem a altura de duas linhas: os de uma linha e os de duas
          // comecavam em alturas diferentes. O nome da coluna quebra a linha, em vez de virar
          // "Aguardando quem r..." como no quadro de largura fixa.
          className="mt-2 hyphens-auto overflow-visible [&_h3]:whitespace-normal [&>li>p]:min-h-12"
        />
        <p className="mt-4 text-caption text-fg-muted">Tipos de relato</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {modelo.types.map((tipo) => (
            <li
              key={tipo}
              className="rounded-md border border-border bg-surface px-2 py-0.5 text-caption text-fg"
            >
              {tipo}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-detail text-fg-muted leading-relaxed">{modelo.note}</p>
      </div>
      <p className="mt-3 text-caption text-fg-muted">Tudo se ajusta depois, em cada tela.</p>
    </section>
  )
}

/**
 * O circulo do radio, desenhado aqui para acompanhar o resto do painel: o anel escurece
 * e o ponto cresce no marcado, em vez de o controle do navegador trocar de uma vez.
 */
function Marcador({ marcado }: { marcado: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 flex size-4 flex-none items-center justify-center rounded-full border transition-colors duration-150',
        marcado ? 'border-fg' : 'border-border-control',
      )}
    >
      <span
        className={cn(
          'size-2 rounded-full bg-fg transition-transform duration-150 ease-out motion-reduce:transition-none',
          marcado ? 'scale-100' : 'scale-0',
        )}
      />
    </span>
  )
}

/**
 * As colunas como se escreve uma lista: "A fazer, Fazendo e Feito". O ponto no meio
 * separava o nome das colunas como etiqueta, e a sprint do Scrum lia como uma quinta coluna.
 */
function listar(itens: readonly string[]): string {
  if (itens.length < 2) return itens[0] ?? ''
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}
