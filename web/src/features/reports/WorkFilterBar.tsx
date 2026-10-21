import * as Menu from '@radix-ui/react-dropdown-menu'
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  type ReportStateCountViewModel,
  type SprintViewModel,
  WITHOUT_STATE_FILTER,
} from '@/contracts'
import {
  projectLabelService,
  projectPriorityService,
  projectReportTypeService,
  projectTeamService,
  type ReportFilters,
  type ReportSort,
  type ReportSortField,
  TEAM_CARD_FILTER,
} from '@/data'
import type { ListFilters } from '@/features/reports/useWorkFilters'
import { reportTypeName } from '@/shared/components/ReportTypeGlyph'
import { SearchShortcutHint } from '@/shared/components/SearchShortcutHint'
import { cn } from '@/shared/lib/cn'

/** O card do time, no fim do menu de tipo: ele nao e um tipo de relato do projeto. */
const CARD_DO_TIME: Opcao[] = [{ value: TEAM_CARD_FILTER, label: 'Card do time' }]

/** As ordens do menu "Ordem": cada dado na direcao que responde a pergunta mais comum. */
const ORDENS: { sort: ReportSort; label: string }[] = [
  { sort: { field: 'created', dir: 'desc' }, label: 'Mais novos primeiro' },
  { sort: { field: 'created', dir: 'asc' }, label: 'Mais antigos primeiro' },
  { sort: { field: 'updated', dir: 'desc' }, label: 'Atualizados há pouco' },
  { sort: { field: 'due', dir: 'asc' }, label: 'Prazo mais perto' },
  { sort: { field: 'priority', dir: 'desc' }, label: 'Prioridade mais alta' },
  { sort: { field: 'number', dir: 'asc' }, label: 'Número' },
  { sort: { field: 'state', dir: 'asc' }, label: 'Coluna, na ordem do quadro' },
  { sort: { field: 'assignee', dir: 'asc' }, label: 'Responsável, de A a Z' },
]

/** O nome curto do dado, para o botao do menu dizer a ordem que vale. */
const CAMPO_CURTO: Record<ReportSortField, string> = {
  number: 'número',
  state: 'coluna',
  assignee: 'responsável',
  priority: 'prioridade',
  due: 'prazo',
  created: 'criado',
  updated: 'atualizado',
}

/** O que cabe do valor no botao do filtro; o nome inteiro vai no `title`. */
const CABE = 16

interface Opcao {
  value: string
  label: string
  /** O nome no botao, quando o da lista traz mais (a contagem da coluna). */
  curto?: string
}

/**
 * As opcoes de um menu, lidas **quando ele abre** — e de novo a cada vez: a tela de
 * Trabalho abre sem pagar tres leituras que talvez ninguem use, e a etiqueta criada
 * por outra pessoa aparece na proxima abertura.
 */
function useOpcoesAoAbrir(ler: () => Promise<Opcao[]>) {
  const [opcoes, setOpcoes] = useState<Opcao[] | 'falhou' | null>(null)
  const vez = useRef(0)
  const carregar = useCallback(() => {
    const minha = ++vez.current
    ler()
      .then((lista) => minha === vez.current && setOpcoes(lista))
      .catch(
        () =>
          minha === vez.current && setOpcoes((antes) => (Array.isArray(antes) ? antes : 'falhou')),
      )
  }, [ler])
  return [opcoes, carregar] as const
}

/**
 * O que so a lista tem na barra: as colunas, a sprint e a ordem. No quadro cada coluna
 * ja esta na tela, a sprint e a em andamento e a ordem e a que o time arrumou.
 */
export interface ListControls {
  filters: ListFilters
  onChange: (next: ListFilters) => void
  /** A contagem das colunas; nula enquanto le, ou quando falhou. */
  colunas: ReportStateCountViewModel[] | null
  colunasFalharam: boolean
  aoRecarregarColunas: () => void
  /**
   * As sprints do filtro, com as sprints ligadas: as que nao fecharam e, depois, as
   * concluidas. Nulo sem elas, ou enquanto le.
   */
  sprints: SprintViewModel[] | null
  ordem: ReportSort | null
  aoOrdenar: (ordem: ReportSort | null) => void
}

/**
 * Os filtros da tela de Trabalho: a busca, os atalhos ("Meus cards", "Vencidos" e "Em
 * aberto") e os menus de marcar — responsavel, etiqueta, prioridade e tipo. Valem para
 * a lista e para o quadro. A subtarefa nao aparece sozinha: o responsavel e a busca
 * trazem o pai dela, com a marca ("1 subtarefa sua", "na subtarefa"). **Dentro de um menu, ou; entre
 * filtros, e.** Na lista, tambem a coluna, a sprint e a ordem (`lista`).
 *
 * O filtro ligado aparece no proprio controle — o atalho pressionado, o menu **com o
 * valor escolhido** ("Etiqueta: pagamentos") — e no "Limpar filtros": filtro esquecido
 * nao some da vista, e quem volta a tela sabe qual e sem abrir menu por menu.
 *
 * **No celular, a busca e um botao "Filtros"**: os atalhos e os menus ocupavam meia
 * tela antes do primeiro card, e abrem so quando a pessoa pede.
 *
 * **Na tela larga, a vista tem o que mais se usa**: a busca, os atalhos, o responsavel
 * e a etiqueta. Prioridade, tipo, coluna e sprint esperam no "Mais filtros · n" — o
 * mesmo jeito do "Filtros" do celular —, e o que estiver ligado fica a vista mesmo com
 * ele fechado. A ordem e os arquivados ficam a direita, depois de um traco: mudam o
 * que se ve, mas nao sao filtro.
 *
 * **Cada menu ligado tem o seu "×"** (e o "Limpar" no pe do menu): tirar um filtro nao
 * pede limpar todos.
 */
export function WorkFilterBar({
  projectPublicId,
  filters,
  active,
  onChange,
  onClear,
  lista,
  arquivados = false,
  buscando = false,
  searchInputId,
  origemBloqueada = false,
  children,
  comoFunciona,
}: {
  projectPublicId: string
  filters: ReportFilters
  /** Quantos filtros estao ligados. */
  active: number
  onChange: (next: ReportFilters) => void
  onClear: () => void
  /** Os controles so da lista; sem eles, a barra do quadro. */
  lista?: ListControls
  /** Nos arquivados, "Vencidos" e "Em aberto" nao fazem sentido: saem, a menos que ligados. */
  arquivados?: boolean
  /** O resultado novo ainda nao chegou: o campo diz "Buscando…". */
  buscando?: boolean
  /** O id do campo de busca — o atalho "/" da tela o alcanca por ele. */
  searchInputId?: string
  /**
   * Ha card marcado com a origem bloqueada na tela: o atalho "Origem bloqueada"
   * aparece. Ligado, ele fica ate alguem desligar — mesmo sem card marcado, para o
   * filtro nunca sumir da vista enquanto esconde cards.
   */
  origemBloqueada?: boolean
  /** O que vem no fim da linha, depois da ordem: as raias do quadro e os arquivados. */
  children?: ReactNode
  /**
   * A ajuda recolhida ("Como funciona"), na mesma linha: aberta, desce para baixo da
   * barra inteira (`HELP_IN_BAR`), e o quadro continua com uma faixa so antes das colunas.
   */
  comoFunciona?: ReactNode
}) {
  const [aberta, setAberta] = useState(false)
  /** "Mais filtros", na tela larga: a prioridade, o tipo, a coluna e a sprint. */
  const [mais, setMais] = useState(false)

  const alternar = <K extends 'assignees' | 'labels' | 'priorities' | 'types'>(
    campo: K,
    valor: ReportFilters[K][number],
  ) => {
    const atuais = filters[campo] as string[]
    const proximos = atuais.includes(valor)
      ? atuais.filter((item) => item !== valor)
      : [...atuais, valor]
    onChange({ ...filters, [campo]: proximos })
  }

  const [pessoas, lerPessoas] = useOpcoesAoAbrir(
    useCallback(
      async () =>
        (await projectTeamService.listMembers(projectPublicId)).map((pessoa) => ({
          // Quem olha entra como "me": e o mesmo filtro do atalho "Meus cards".
          value: pessoa.IsYou ? 'me' : pessoa.UserPublicId,
          label: `${pessoa.Name ?? pessoa.Email ?? 'Sem nome'}${pessoa.IsYou ? ' (você)' : ''}`,
        })),
      [projectPublicId],
    ),
  )
  const [etiquetas, lerEtiquetas] = useOpcoesAoAbrir(
    useCallback(
      async () =>
        (await projectLabelService.listLabels(projectPublicId)).map((etiqueta) => ({
          value: etiqueta.PublicId,
          label: etiqueta.Name,
        })),
      [projectPublicId],
    ),
  )
  const [prioridades, lerPrioridades] = useOpcoesAoAbrir(
    useCallback(
      async () =>
        (await projectPriorityService.listPriorities(projectPublicId))
          // A aposentada so aparece se ja esta escolhida: nao se escolhe o que saiu de uso.
          .filter(
            (prioridade) => prioridade.IsActive || filters.priorities.includes(prioridade.PublicId),
          )
          // A mais urgente em cima, como no lote e no card novo.
          .sort((a, b) => b.Position - a.Position)
          .map((prioridade) => ({ value: prioridade.PublicId, label: prioridade.Name })),
      [projectPublicId, filters.priorities],
    ),
  )

  // Os tipos de relato do projeto: os ativos primeiro, na ordem da ferramenta, e os
  // desativados depois, marcados. **O desativado continua no menu**, ao contrario da
  // prioridade: ele sai da ferramenta, mas os relatos que ja o tem continuam no quadro,
  // e achar todos eles e justamente a pergunta de quem filtra.
  const [tipos, lerTipos] = useOpcoesAoAbrir(
    useCallback(async () => {
      const lista = await projectReportTypeService.listReportTypes(projectPublicId)
      return [
        ...lista.filter((tipo) => tipo.IsActive),
        ...lista.filter((tipo) => !tipo.IsActive),
      ].map((tipo) => ({ value: tipo.PublicId, label: reportTypeName(tipo) }))
    }, [projectPublicId]),
  )

  // **O valor que sumiu sai do filtro** — a etiqueta apagada, a pessoa que saiu do
  // time, a prioridade apagada. O filtro fica guardado na aba; sem isto, ele continuaria
  // ligado sobre algo que nao existe, e o menu nem o mostraria para desmarcar. As listas
  // sao lidas so quando o filtro tem algum valor desses — e e com elas que o botao diz o
  // nome do que esta marcado.
  const temPessoa = filters.assignees.some((valor) => valor !== 'me' && valor !== 'none')
  const temEtiqueta = filters.labels.length > 0
  const temPrioridade = filters.priorities.some((valor) => valor !== 'none')
  const temTipo = filters.types.some((valor) => valor !== TEAM_CARD_FILTER)
  useEffect(() => {
    if (temPessoa) lerPessoas()
  }, [temPessoa, lerPessoas])
  useEffect(() => {
    if (temEtiqueta) lerEtiquetas()
  }, [temEtiqueta, lerEtiquetas])
  useEffect(() => {
    if (temPrioridade) lerPrioridades()
  }, [temPrioridade, lerPrioridades])
  useEffect(() => {
    if (temTipo) lerTipos()
  }, [temTipo, lerTipos])
  useEffect(() => {
    const existe = (lista: Opcao[] | 'falhou' | null, valor: string) =>
      !Array.isArray(lista) ||
      valor === 'me' ||
      valor === 'none' ||
      lista.some((o) => o.value === valor)
    const assignees = filters.assignees.filter((valor) => existe(pessoas, valor))
    const labels = filters.labels.filter((valor) => existe(etiquetas, valor))
    const priorities = filters.priorities.filter((valor) => existe(prioridades, valor))
    const types = filters.types.filter(
      (valor) => valor === TEAM_CARD_FILTER || existe(tipos, valor),
    )
    if (
      assignees.length !== filters.assignees.length ||
      labels.length !== filters.labels.length ||
      priorities.length !== filters.priorities.length ||
      types.length !== filters.types.length
    )
      onChange({ ...filters, assignees, labels, priorities, types })
  }, [pessoas, etiquetas, prioridades, tipos, filters, onChange])

  // O mesmo para a coluna e a sprint da lista: a coluna apagada, a sprint apagada (a
  // concluida continua no filtro). A sprint que sumiu derrubaria a lista inteira (a API
  // recusa).
  const colunas = lista?.colunas ?? null
  const sprints = lista?.sprints ?? null
  const listaFiltros = lista?.filters
  const mudarLista = lista?.onChange
  useEffect(() => {
    if (!listaFiltros || !mudarLista) return
    const columns =
      colunas === null
        ? listaFiltros.columns
        : listaFiltros.columns.filter(
            (valor) =>
              valor === WITHOUT_STATE_FILTER ||
              colunas.some((coluna) => coluna.StatePublicId === valor),
          )
    const sprint =
      sprints === null ||
      listaFiltros.sprint === null ||
      listaFiltros.sprint === 'backlog' ||
      sprints.some((item) => item.PublicId === listaFiltros.sprint)
        ? listaFiltros.sprint
        : null
    if (columns.length !== listaFiltros.columns.length || sprint !== listaFiltros.sprint)
      mudarLista({ columns, sprint })
  }, [colunas, sprints, listaFiltros, mudarLista])

  // As colunas como opcoes: a aposentada so com card ou escolhida, e a contagem de cada
  // uma — o numero que antes ficava no seletor de coluna.
  const opcoesDeColuna: Opcao[] | 'falhou' | null =
    colunas === null
      ? lista?.colunasFalharam
        ? 'falhou'
        : null
      : colunas
          .filter(
            (item) =>
              item.IsActive ||
              item.Total > 0 ||
              listaFiltros?.columns.includes(item.StatePublicId ?? WITHOUT_STATE_FILTER),
          )
          .map((item) => {
            // A linha sem coluna nao tem identificador: o valor que a rota espera para
            // ela e uma palavra, e nao um GUID.
            const nome = item.StateName ?? 'Sem coluna'
            const curto = item.IsActive ? nome : `${nome} (desativada)`
            return {
              value: item.StatePublicId ?? WITHOUT_STATE_FILTER,
              label: `${curto} · ${item.Total}`,
              curto,
            }
          })

  const mostrarVencidos = !arquivados || filters.overdue
  const mostrarAbertos = !arquivados || filters.open
  // No celular, quantos estao ligados fora da busca: e o que o botao "Filtros" diz.
  const ligadosForaDaBusca = active - (filters.search.trim() ? 1 : 0)

  // Os que moram no "Mais filtros", e quantos deles estao ligados.
  const comColuna = !!lista && !arquivados
  const comSprint = !!lista?.sprints && !arquivados
  const colunaLigada = comColuna && (lista?.filters.columns.length ?? 0) > 0
  const sprintLigada = comSprint && !!lista?.filters.sprint
  const ligadosEmMais =
    (filters.priorities.length > 0 ? 1 : 0) +
    (filters.types.length > 0 ? 1 : 0) +
    (colunaLigada ? 1 : 0) +
    (sprintLigada ? 1 : 0)
  // No celular, tudo abre pelo "Filtros"; na tela larga, o que esta a vista fica sempre.
  const aVista = aberta ? 'contents' : 'hidden sm:contents'
  // O de "Mais filtros" aparece com ele aberto — ou ligado: filtro ligado nao some da vista.
  const emMais = (ligado: boolean) =>
    cn(aberta ? 'contents' : 'hidden', mais || ligado ? 'sm:contents' : 'sm:hidden')

  return (
    <search className="mt-3 mb-3 flex flex-wrap items-center gap-2" aria-label="Filtrar cards">
      <label className="relative flex min-w-0 flex-[1_1_12rem] sm:max-w-80">
        <span className="sr-only">Buscar cards</span>
        {buscando ? (
          <svg
            viewBox="0 0 16 16"
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 animate-spin text-fg-muted motion-reduce:animate-none"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 16 16"
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-fg-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
        )}
        <input
          id={searchInputId}
          type="search"
          value={filters.search}
          onChange={(evento) => onChange({ ...filters, search: evento.target.value })}
          placeholder="Título, texto, #número ou protocolo"
          title="Busca no título, no texto, no #número e no protocolo — atalho: /"
          aria-keyshortcuts={searchInputId ? '/' : undefined}
          maxLength={200}
          className="peer h-8 w-full rounded-lg border border-border bg-surface-raised pr-20 pl-8 text-detail text-fg placeholder:text-fg-placeholder"
        />
        <SearchShortcutHint visible={!!searchInputId && !buscando && filters.search === ''} />
        {/* "Buscando…" dentro do campo, e nao num aviso: e onde a pessoa esta olhando. */}
        <span
          role="status"
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-2.5 text-caption text-fg-muted"
        >
          {buscando ? 'Buscando…' : ''}
        </span>
      </label>

      {/* No celular, os filtros abrem por aqui. Na tela larga, os mais usados ficam na linha. */}
      <button
        type="button"
        aria-expanded={aberta}
        onClick={() => setAberta((valor) => !valor)}
        className={cn(
          CONTROLE,
          'sm:hidden',
          ligadosForaDaBusca > 0 ? CONTROLE_LIGADO : CONTROLE_DESLIGADO,
        )}
      >
        {ligadosForaDaBusca > 0 ? `Filtros · ${ligadosForaDaBusca}` : 'Filtros'}
      </button>

      <div className={aVista}>
        <Atalho
          pressionado={filters.assignees.includes('me')}
          aoAlternar={() => alternar('assignees', 'me')}
        >
          Meus cards
        </Atalho>
        {mostrarVencidos && (
          <Atalho
            pressionado={filters.overdue}
            aoAlternar={() => onChange({ ...filters, overdue: !filters.overdue })}
          >
            Vencidos
          </Atalho>
        )}
        {mostrarAbertos && (
          <Atalho
            pressionado={filters.open}
            aoAlternar={() => onChange({ ...filters, open: !filters.open })}
            title="Esconde o que terminou: o relato encerrado e o card na última coluna"
          >
            Em aberto
          </Atalho>
        )}

        {(origemBloqueada || filters.blockedOrigin) && (
          <Atalho
            pressionado={filters.blockedOrigin}
            aoAlternar={() => onChange({ ...filters, blockedOrigin: !filters.blockedOrigin })}
            title="Só os relatos que vieram de um domínio bloqueado e ninguém decidiu manter"
          >
            Origem bloqueada
          </Atalho>
        )}

        <MenuDeMarcar
          rotulo="Responsável"
          escolhidos={filters.assignees}
          fixas={[{ value: 'none', label: 'Sem responsável' }]}
          conhecidas={{ me: 'você' }}
          opcoes={pessoas}
          aoAbrir={lerPessoas}
          aoAlternar={(valor) => alternar('assignees', valor)}
          aoLimpar={() => onChange({ ...filters, assignees: [] })}
        />
        <MenuDeMarcar
          rotulo="Etiqueta"
          escolhidos={filters.labels}
          opcoes={etiquetas}
          aoAbrir={lerEtiquetas}
          aoAlternar={(valor) => alternar('labels', valor)}
          aoLimpar={() => onChange({ ...filters, labels: [] })}
          vazio="O projeto ainda não tem etiquetas."
        />

        {/* So na tela larga: no celular, o "Filtros" ja abriu tudo. */}
        <button
          type="button"
          aria-expanded={mais}
          onClick={() => setMais((valor) => !valor)}
          className={cn(
            CONTROLE,
            'hidden sm:flex',
            ligadosEmMais > 0 ? CONTROLE_LIGADO : CONTROLE_DESLIGADO,
          )}
        >
          {ligadosEmMais > 0 ? `Mais filtros · ${ligadosEmMais}` : 'Mais filtros'}
          <Seta />
        </button>
      </div>

      {/* Nos arquivados, nao: a contagem das colunas e a da tela de Trabalho. */}
      {lista && comColuna && (
        <div className={emMais(colunaLigada)}>
          <MenuDeMarcar
            rotulo="Coluna"
            escolhidos={lista.filters.columns}
            opcoes={opcoesDeColuna}
            aoAbrir={() => {
              if (lista.colunasFalharam) lista.aoRecarregarColunas()
            }}
            aoAlternar={(valor) =>
              lista.onChange({
                ...lista.filters,
                columns: lista.filters.columns.includes(valor)
                  ? lista.filters.columns.filter((item) => item !== valor)
                  : [...lista.filters.columns, valor],
              })
            }
            aoLimpar={() => lista.onChange({ ...lista.filters, columns: [] })}
            falha="Não deu para carregar as colunas agora."
            aoTentarDeNovo={lista.aoRecarregarColunas}
          />
        </div>
      )}
      <div className={emMais(filters.priorities.length > 0)}>
        <MenuDeMarcar
          rotulo="Prioridade"
          escolhidos={filters.priorities}
          fixasNoFim={[{ value: 'none', label: 'Sem prioridade' }]}
          opcoes={prioridades}
          aoAbrir={lerPrioridades}
          aoAlternar={(valor) => alternar('priorities', valor)}
          aoLimpar={() => onChange({ ...filters, priorities: [] })}
        />
      </div>
      <div className={emMais(filters.types.length > 0)}>
        <MenuDeMarcar
          rotulo="Tipo"
          escolhidos={filters.types}
          fixasNoFim={CARD_DO_TIME}
          opcoes={tipos}
          aoAbrir={lerTipos}
          aoAlternar={(valor) => alternar('types', valor)}
          aoLimpar={() => onChange({ ...filters, types: [] })}
        />
      </div>
      {lista?.sprints && comSprint && (
        <div className={emMais(sprintLigada)}>
          <MenuDeSprint
            sprints={lista.sprints}
            escolhida={lista.filters.sprint}
            aoEscolher={(sprint) => lista.onChange({ ...lista.filters, sprint })}
          />
        </div>
      )}

      {active > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="h-8 rounded-lg px-2 text-detail text-fg-muted underline-offset-2 hover:text-fg hover:underline"
        >
          Limpar filtros
          <span className="sr-only"> ({active === 1 ? '1 ligado' : `${active} ligados`})</span>
        </button>
      )}

      {comoFunciona}

      {(lista || children) && (
        <FilterBarEnd>
          {lista && (
            <div className={aVista}>
              <MenuDeOrdem ordem={lista.ordem} aoOrdenar={lista.aoOrdenar} />
            </div>
          )}
          {children}
        </FilterBarEnd>
      )}
    </search>
  )
}

/**
 * O fim da barra, a direita e depois de um traco: o que muda o que se ve sem ser filtro
 * — a ordem, as raias, os arquivados. **O mesmo lugar na lista, no quadro e no
 * backlog**: quem procura os arquivados nao procura em cada vista.
 */
export function FilterBarEnd({ children }: { children: ReactNode }) {
  return (
    <div className="ml-auto flex flex-none items-center gap-2 sm:border-border sm:border-l sm:pl-3">
      {children}
    </div>
  )
}

/**
 * As classes do "Como funciona" dentro da barra: fechado, e mais um item da linha;
 * aberto, desce para uma linha propria embaixo de tudo — a explicacao nao espreme os
 * filtros.
 */
export const HELP_IN_BAR = 'flex-none open:order-last open:basis-full'

/** A dica do atalho "/" mora nos componentes compartilhados: o hub de projetos tambem a usa. */
export { SearchShortcutHint }

const CONTROLE =
  'flex h-8 flex-none animate-fade-in items-center gap-1.5 rounded-lg border px-3 text-detail transition-all duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100'
/**
 * O filtro ligado com um realce suave — o tom do destaque por tras, e a borda dele —, e
 * nao com a cor do botao principal: cinco filtros ligados pareciam cinco botoes de
 * "Salvar", e o "Novo card" perdia o lugar de acao principal da tela.
 */
export const ACTIVE_FILTER_CLASS = 'border-accent bg-accent/8 text-fg hover:bg-accent/12'
const CONTROLE_LIGADO = ACTIVE_FILTER_CLASS
const CONTROLE_DESLIGADO =
  'border-border bg-surface text-fg-muted hover:bg-surface-sunken hover:text-fg'

/** Um atalho de um clique: aparece pressionado enquanto vale. */
function Atalho({
  pressionado,
  aoAlternar,
  title,
  children,
}: {
  pressionado: boolean
  aoAlternar: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressionado}
      onClick={aoAlternar}
      title={title}
      className={cn(CONTROLE, pressionado ? CONTROLE_LIGADO : CONTROLE_DESLIGADO)}
    >
      {children}
    </button>
  )
}

/** O valor cortado no que cabe no botao. */
const cabe = (texto: string) => (texto.length > CABE ? `${texto.slice(0, CABE - 1)}…` : texto)

/** A seta do botao de menu. */
function Seta() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="m3 4.5 3 3 3-3" />
    </svg>
  )
}

/** A marca de um item escolhido, no lugar da caixa ou do circulo. */
function Marca({ marcada, redonda = false }: { marcada: boolean; redonda?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-4 flex-none items-center justify-center border transition-colors duration-150',
        redonda ? 'rounded-full' : 'rounded',
        marcada ? 'border-accent bg-accent text-accent-fg' : 'border-border',
      )}
    >
      {/* O visto fica sempre no lugar e cresce ao marcar: trocar o `svg` inteiro
          faria a marca pular de vazia para cheia. */}
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className={cn(
          'size-3 transition-transform duration-150 ease-out motion-reduce:transition-none',
          marcada ? 'scale-100' : 'scale-0',
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M2.5 6.3 4.8 8.6 9.5 3.9" />
      </svg>
    </span>
  )
}

const ITEM =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body text-fg outline-none data-[highlighted]:bg-surface-sunken'
const MOLDURA =
  'z-dialog max-h-80 w-64 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-xl border border-border bg-surface-raised p-1.5 data-[state=closed]:animate-menu-out data-[state=open]:animate-menu-in'

/**
 * Um menu de marcar: escolher um nao fecha o menu, para marcar outro em seguida. O
 * gatilho diz **o que** esta marcado — "Etiqueta: pagamentos", "Etiqueta: pagamentos
 * +1" — e e assim que o filtro ligado fica a vista. Enquanto o nome nao chegou, diz
 * quantos.
 */
function MenuDeMarcar({
  rotulo,
  escolhidos,
  fixas = [],
  fixasNoFim = [],
  conhecidas = {},
  opcoes,
  aoAbrir,
  aoAlternar,
  vazio,
  falha = 'Não deu para carregar as opções agora.',
  aoTentarDeNovo,
  aoLimpar,
}: {
  rotulo: string
  escolhidos: string[]
  /** As que existem sempre, antes das do projeto: "Sem responsavel". */
  fixas?: Opcao[]
  /** As que existem sempre, depois das do projeto: "Sem prioridade". */
  fixasNoFim?: Opcao[]
  /** Nomes que o botao sabe sem ler a lista: o "me" e "voce". */
  conhecidas?: Record<string, string>
  /** Nulo enquanto le; "falhou" quando a leitura falhou. */
  opcoes: Opcao[] | 'falhou' | null
  aoAbrir?: () => void
  aoAlternar: (valor: string) => void
  vazio?: string
  falha?: string
  /** O "Tentar de novo" dentro do menu, quando a leitura falhou. */
  aoTentarDeNovo?: () => void
  /** Desmarca todos deste menu: o "×" ao lado e o "Limpar" no pe. */
  aoLimpar: () => void
}) {
  const todas = [...fixas, ...(Array.isArray(opcoes) ? opcoes : []), ...fixasNoFim]
  const nomeDe = (valor: string) => {
    const achada = todas.find((opcao) => opcao.value === valor)
    return achada ? (achada.curto ?? achada.label) : conhecidas[valor]
  }
  const nomes = escolhidos.map(nomeDe)
  const partes = nomes
  const ligado = partes.length > 0
  const conhecidosTodos = nomes.every((nome) => nome !== undefined)

  // "Etiqueta: pagamentos +1"; sem o nome ainda, "Etiqueta · 2".
  const resumo =
    !ligado || !conhecidosTodos
      ? null
      : `${cabe(partes[0] ?? '')}${partes.length > 1 ? ` +${partes.length - 1}` : ''}`
  const inteiro = conhecidosTodos ? partes.join(', ') : ''

  return (
    <ComTirar rotulo={rotulo} ligado={ligado} aoTirar={aoLimpar}>
      <Menu.Root onOpenChange={(aberto) => aberto && aoAbrir?.()}>
        <Menu.Trigger
          className={cn(
            CONTROLE,
            ligado ? cn(CONTROLE_LIGADO, 'rounded-r-none') : CONTROLE_DESLIGADO,
          )}
          title={inteiro ? `${rotulo}: ${inteiro}` : undefined}
          aria-label={
            !ligado
              ? rotulo
              : inteiro
                ? `${rotulo}: ${inteiro}`
                : `${rotulo}, ${partes.length} ${partes.length === 1 ? 'escolhido' : 'escolhidos'}`
          }
        >
          {resumo ? (
            <span className="max-w-48 truncate">
              {rotulo}: {resumo}
            </span>
          ) : (
            <>
              {rotulo}
              {ligado && <span className="tabular-nums">· {partes.length}</span>}
            </>
          )}
          <Seta />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="start" sideOffset={6} className={MOLDURA}>
            {todas.map((opcao) => (
              <Menu.CheckboxItem
                key={opcao.value}
                checked={escolhidos.includes(opcao.value)}
                onSelect={(evento) => evento.preventDefault()}
                onCheckedChange={() => aoAlternar(opcao.value)}
                className={ITEM}
              >
                <Marca marcada={escolhidos.includes(opcao.value)} />
                <span className="min-w-0 truncate">{opcao.label}</span>
              </Menu.CheckboxItem>
            ))}
            {opcoes === null && aoAbrir && (
              <p className="px-2.5 py-2 text-detail text-fg-muted">Carregando…</p>
            )}
            {opcoes === 'falhou' && (
              <div className="px-2.5 py-2 text-detail text-fg-muted">
                {falha}
                {aoTentarDeNovo && (
                  <Menu.Item
                    onSelect={(evento) => {
                      evento.preventDefault()
                      aoTentarDeNovo()
                    }}
                    className="mt-1 cursor-pointer rounded font-medium text-fg underline outline-none data-[highlighted]:bg-surface-sunken"
                  >
                    Tentar de novo
                  </Menu.Item>
                )}
              </div>
            )}
            {Array.isArray(opcoes) &&
              opcoes.length === 0 &&
              fixas.length === 0 &&
              fixasNoFim.length === 0 &&
              vazio && <p className="px-2.5 py-2 text-detail text-fg-muted">{vazio}</p>}
            {ligado && <LimparNoMenu aoLimpar={aoLimpar} />}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </ComTirar>
  )
}

/**
 * O "×" colado ao gatilho do menu ligado: tira so aquele filtro, sem abrir o menu e sem
 * levar os outros junto, como o "Limpar filtros" faz.
 */
function ComTirar({
  rotulo,
  ligado,
  aoTirar,
  children,
}: {
  rotulo: string
  ligado: boolean
  aoTirar: () => void
  children: ReactNode
}) {
  // A mesma moldura ligado ou nao: trocar o embrulho remontaria o menu, e marcar o
  // primeiro valor o fecharia — dentro de um menu se marca mais de um.
  return (
    <span className="flex flex-none">
      {children}
      {ligado && (
        <button
          type="button"
          aria-label={`Tirar o filtro ${rotulo}`}
          title={`Tirar o filtro ${rotulo}`}
          onClick={aoTirar}
          className={cn(CONTROLE, CONTROLE_LIGADO, 'rounded-l-none border-l-0 px-2')}
        >
          <span aria-hidden>×</span>
        </button>
      )}
    </span>
  )
}

/** O "Limpar" no pe do menu ligado: desmarca tudo dele, e o menu fecha. */
function LimparNoMenu({ aoLimpar }: { aoLimpar: () => void }) {
  return (
    <>
      <Menu.Separator className="my-1 h-px bg-border" />
      <Menu.Item onSelect={aoLimpar} className={cn(ITEM, 'text-detail text-fg-muted')}>
        Limpar
      </Menu.Item>
    </>
  )
}

/**
 * A sprint, na lista com as sprints ligadas: uma so de cada vez — o backlog, a em
 * andamento, uma planejada ou uma concluida. E o recorte das listas do Backlog: a
 * sprint, e o backlog sem o que terminou.
 *
 * **As concluidas vem num grupo proprio**, depois das abertas, da mais recente para a
 * mais antiga: o que o time entregou numa sprint que ja fechou continua a um clique.
 */
function MenuDeSprint({
  sprints,
  escolhida,
  aoEscolher,
}: {
  sprints: SprintViewModel[]
  escolhida: string | null
  aoEscolher: (sprint: string | null) => void
}) {
  const rotuloDasConcluidas = useId()
  const opcoes: Opcao[] = [
    { value: '', label: 'Todas', curto: '' },
    { value: 'backlog', label: 'Backlog' },
    ...sprints
      .filter((sprint) => sprint.State !== 'Closed')
      .map((sprint) => ({
        value: sprint.PublicId,
        label: `${sprint.Name} (${sprint.State === 'Active' ? 'em andamento' : 'planejada'})`,
        curto: sprint.Name,
      })),
  ]
  // Na ordem em que chegam: a API ja as manda da mais recente para a mais antiga.
  const concluidas: Opcao[] = sprints
    .filter((sprint) => sprint.State === 'Closed')
    .map((sprint) => ({ value: sprint.PublicId, label: sprint.Name }))
  const atual = [...opcoes, ...concluidas].find((opcao) => opcao.value === (escolhida ?? ''))
  const nome = escolhida ? (atual?.curto ?? atual?.label ?? '') : ''

  return (
    <ComTirar rotulo="Sprint" ligado={!!escolhida} aoTirar={() => aoEscolher(null)}>
      <Menu.Root>
        <Menu.Trigger
          className={cn(
            CONTROLE,
            escolhida ? cn(CONTROLE_LIGADO, 'rounded-r-none') : CONTROLE_DESLIGADO,
          )}
          aria-label={nome ? `Sprint: ${nome}` : 'Sprint'}
          title={nome ? `Sprint: ${nome}` : undefined}
        >
          <span className="max-w-48 truncate">{nome ? `Sprint: ${cabe(nome)}` : 'Sprint'}</span>
          <Seta />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content align="start" sideOffset={6} className={MOLDURA}>
            <Menu.RadioGroup
              value={escolhida ?? ''}
              onValueChange={(valor) => aoEscolher(valor === '' ? null : valor)}
            >
              {opcoes.map((opcao) => (
                <Menu.RadioItem key={opcao.value} value={opcao.value} className={ITEM}>
                  <Marca marcada={(escolhida ?? '') === opcao.value} redonda />
                  <span className="min-w-0 truncate">{opcao.label}</span>
                </Menu.RadioItem>
              ))}
              {concluidas.length > 0 && (
                <>
                  <Menu.Separator className="my-1 h-px bg-border" />
                  {/* O nome e rotulo do grupo, e nao item: o leitor de tela o anuncia
                    ao entrar nele, e as setas pulam o rotulo. */}
                  <Menu.Group aria-labelledby={rotuloDasConcluidas}>
                    <Menu.Label
                      id={rotuloDasConcluidas}
                      className="px-2.5 pt-1 pb-1 text-caption text-fg-muted"
                    >
                      Concluídas
                    </Menu.Label>
                    {concluidas.map((opcao) => (
                      <Menu.RadioItem key={opcao.value} value={opcao.value} className={ITEM}>
                        <Marca marcada={escolhida === opcao.value} redonda />
                        <span className="min-w-0 truncate">{opcao.label}</span>
                      </Menu.RadioItem>
                    ))}
                  </Menu.Group>
                </>
              )}
            </Menu.RadioGroup>
            {escolhida && <LimparNoMenu aoLimpar={() => aoEscolher(null)} />}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </ComTirar>
  )
}

/**
 * A ordem da tabela, tambem por menu: no celular e na tela estreita os cabecalhos de
 * prazo e prioridade saem, e a ordem continua ao alcance. **Nao e filtro**: nao conta
 * no "Limpar filtros", e nao esconde card nenhum.
 */
function MenuDeOrdem({
  ordem,
  aoOrdenar,
}: {
  ordem: ReportSort | null
  aoOrdenar: (ordem: ReportSort | null) => void
}) {
  const vigente: ReportSort = ordem ?? { field: 'created', dir: 'desc' }
  const chave = (sort: ReportSort) => `${sort.field}.${sort.dir}`
  const listada = ORDENS.find((item) => chave(item.sort) === chave(vigente))
  const nome = ordem === null ? null : (listada?.label ?? CAMPO_CURTO[vigente.field])

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(CONTROLE, CONTROLE_DESLIGADO)}
        aria-label={`Ordem: ${listada?.label ?? CAMPO_CURTO[vigente.field]}`}
      >
        <span className="max-w-48 truncate">{nome ? `Ordem: ${cabe(nome)}` : 'Ordem'}</span>
        <Seta />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={6} className={MOLDURA}>
          <Menu.RadioGroup
            value={chave(vigente)}
            onValueChange={(valor) => {
              const achada = ORDENS.find((item) => chave(item.sort) === valor)
              if (!achada) return
              // O "mais novos primeiro" e a ordem de sempre, e nao fica guardado.
              aoOrdenar(
                achada.sort.field === 'created' && achada.sort.dir === 'desc' ? null : achada.sort,
              )
            }}
          >
            {ORDENS.map((item) => (
              <Menu.RadioItem key={chave(item.sort)} value={chave(item.sort)} className={ITEM}>
                <Marca marcada={chave(item.sort) === chave(vigente)} redonda />
                <span className="min-w-0 truncate">{item.label}</span>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
